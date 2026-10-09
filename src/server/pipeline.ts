import type { Company, Job, Prisma, Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { contactHash, normalizeBrPhone, normalizeName, slugify, shortHash } from "@/lib/normalize";
import { getSettings, type Settings } from "@/lib/settings";
import type { AiClient } from "./ai";
import { generateSiteContent, siteContentSchema, type CompanyFacts } from "./content/site-content";
import { assertBudget, recordCost } from "./costs";
import { advanceCrm, logEvent } from "./crm";
import { getDeps } from "./deps";
import type { RawPlace } from "./discovery/types";
import { BudgetExceededError, PermanentError, SkipJobError, WaitingConfigError } from "./errors";
import { composeMessage, emailFooter } from "./messaging/compose";
import { evaluateEligibility, type EligibilityResult } from "./messaging/eligibility";
import { optOutUrl } from "./messaging/tokens";
import type { PresenceResult } from "./presence";
import { completeJob, enqueue, enqueueMany, rescheduleJob } from "./queue";
import { parseConfig, type RunConfig } from "./runs";
import { meetsCriteria, scoreCompany } from "./scoring";
import { renderSite } from "./sitegen/render";
import { validateSite } from "./sitegen/validate";

/**
 * Etapas da automação. Cada handler é idempotente: pode ser executado de novo após uma
 * queda sem duplicar efeitos (chaves de idempotência, transições de status atômicas).
 */

interface Ctx {
  job: Job;
  run: Run | null;
  cfg: RunConfig | null;
  settings: Settings;
}

type Handler = (ctx: Ctx) => Promise<Prisma.InputJsonValue | void | "RESCHEDULED">;

const MAX_PAGES_PER_QUERY = 3;
const PRESENCE_CACHE_DAYS = 7;

function payload<T>(job: Job): T {
  return job.payload as unknown as T;
}

function isSim(ctx: Ctx) {
  return ctx.run?.mode === "SIMULATION";
}

async function runCompanyCount(runId: string) {
  return prisma.runCompany.count({ where: { runId } });
}

function key(ctx: Ctx, type: string, suffix: string) {
  return `${ctx.run?.id ?? "global"}:${type}:${suffix}`;
}

// ---------------------------------------------------------------- 1. Descoberta
interface DiscoverPayload {
  niche: string;
  searchTerm: string;
  city: string;
  neighborhood?: string;
  state?: string;
  country: string;
  queryIndex: number;
  page: number;
  pageToken?: string;
}

const discover: Handler = async (ctx) => {
  const p = payload<DiscoverPayload>(ctx.job);
  const run = ctx.run!;
  const cfg = ctx.cfg!;
  if ((await runCompanyCount(run.id)) >= cfg.maxCompanies) return { skipped: "Quantidade máxima de empresas atingida" };

  const sim = isSim(ctx);
  const adapter = getDeps().discovery(sim);
  if (!sim) await assertBudget({ runId: run.id, runLimitUsd: cfg.runSpendLimitUsd, key: "google_places:text_search", estimatedUnits: 1 }, ctx.settings);

  const page = await adapter.search({ ...p });
  if (page.billableRequests > 0) await recordCost({ runId: run.id, key: "google_places:text_search", units: page.billableRequests, settings: ctx.settings });

  await enqueue({
    type: "NORMALIZE",
    runId: run.id,
    idempotencyKey: key(ctx, "NORMALIZE", `${p.queryIndex}:${p.page}`),
    payload: { niche: p.niche, places: page.places } as unknown as Prisma.InputJsonValue,
    priority: 20,
  });

  const projected = (await runCompanyCount(run.id)) + page.places.length;
  if (page.nextPageToken && p.page + 1 < MAX_PAGES_PER_QUERY && projected < cfg.maxCompanies) {
    await enqueue({
      type: "DISCOVER",
      runId: run.id,
      idempotencyKey: key(ctx, "DISCOVER", `${p.queryIndex}:${p.page + 1}`),
      payload: { ...p, page: p.page + 1, pageToken: page.nextPageToken } as unknown as Prisma.InputJsonValue,
      priority: 10,
      maxAttempts: 4,
      runAt: new Date(Date.now() + 2000),
    });
  }
  return { found: page.places.length, page: p.page, hasMore: !!page.nextPageToken };
};

// ---------------------------------------------------------------- 2. Normalização e deduplicação
export async function upsertPlace(place: RawPlace, niche: string, settings: Settings, simulated: boolean): Promise<{ company: Company; created: boolean }> {
  const phone = normalizeBrPhone(place.phone);
  const normalizedName = normalizeName(place.name);
  const data = {
    sourceUrl: place.sourceUrl ?? null,
    attribution: place.attribution,
    name: place.name,
    normalizedName,
    category: place.category ?? null,
    address: place.address ?? null,
    neighborhood: place.neighborhood ?? null,
    city: place.city ?? null,
    state: place.state ?? null,
    country: place.country ?? null,
    phone: place.phone ?? null,
    phoneNormalized: phone?.e164 ?? null,
    phoneIsMobile: phone?.isMobile ?? false,
    website: place.website ?? null,
    businessStatus: place.businessStatus ?? null,
    openingHours: place.openingHours ?? undefined,
    ratingCount: place.ratingCount ?? null,
    collectedAt: new Date(),
    dataExpiresAt: new Date(Date.now() + settings.placesDataRetentionDays * 86_400_000),
    verificationStatus: phone ? "TELEFONE_NORMALIZADO" : "SEM_TELEFONE_VALIDO",
  };

  let existing = await prisma.company.findUnique({ where: { source_sourceId: { source: place.source, sourceId: place.sourceId } } });
  if (!existing && phone) existing = await prisma.company.findFirst({ where: { phoneNormalized: phone.e164, isSimulated: simulated } });
  if (!existing && place.city) existing = await prisma.company.findFirst({ where: { normalizedName, city: place.city, isSimulated: simulated } });

  if (existing) {
    const company = await prisma.company.update({ where: { id: existing.id }, data: { ...data, niche: existing.niche ?? niche } });
    return { company, created: false };
  }
  try {
    const company = await prisma.company.create({ data: { ...data, source: place.source, sourceId: place.sourceId, niche, isSimulated: simulated } });
    return { company, created: true };
  } catch (e) {
    // Corrida com outro worker: o registro já foi criado.
    const company = await prisma.company.findUnique({ where: { source_sourceId: { source: place.source, sourceId: place.sourceId } } });
    if (company) return { company, created: false };
    throw e;
  }
}

const normalize: Handler = async (ctx) => {
  const { niche, places } = payload<{ niche: string; places: RawPlace[] }>(ctx.job);
  const run = ctx.run!;
  const cfg = ctx.cfg!;
  let created = 0;
  let duplicates = 0;
  let linked = 0;
  let suppressed = 0;
  for (const place of places) {
    if ((await runCompanyCount(run.id)) >= cfg.maxCompanies) break;
    const phone = normalizeBrPhone(place.phone);
    if (phone && (await prisma.suppression.findUnique({ where: { valueHash: contactHash(phone.e164) } }))) {
      suppressed++;
      continue;
    }
    const { company, created: isNew } = await upsertPlace(place, niche, ctx.settings, isSim(ctx));
    if (isNew) created++;
    else duplicates++;
    const res = await prisma.runCompany.createMany({ data: [{ runId: run.id, companyId: company.id }], skipDuplicates: true });
    if (res.count === 0) continue;
    linked++;
    await enqueue({ type: "CHECK_PRESENCE", runId: run.id, companyId: company.id, idempotencyKey: key(ctx, "CHECK_PRESENCE", company.id), priority: 30 });
  }
  return { received: places.length, created, duplicates, linked, suppressed };
};

// ---------------------------------------------------------------- 3. Presença digital
const checkPresenceHandler: Handler = async (ctx) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! } });
  const details = company.presenceDetails as unknown as PresenceResult | null;
  const fresh = details?.checkedAt && Date.now() - new Date(details.checkedAt).getTime() < PRESENCE_CACHE_DAYS * 86_400_000;
  let result: PresenceResult;
  if (company.presenceStatus !== "PENDING" && fresh && details) {
    result = details;
  } else {
    result = await getDeps().presence(company.website, isSim(ctx) || company.isSimulated);
    await prisma.company.update({
      where: { id: company.id },
      data: { presenceStatus: result.status, presenceDetails: result as unknown as Prisma.InputJsonValue },
    });
  }
  await enqueue({ type: "SCORE", runId: ctx.run!.id, companyId: company.id, idempotencyKey: key(ctx, "SCORE", company.id), priority: 40 });
  return { status: result.status, cached: result === details };
};

// ---------------------------------------------------------------- 4. Pontuação
const score: Handler = async (ctx) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! } });
  const presence: Pick<PresenceResult, "status" | "socialOnly" | "issues"> = (c.presenceDetails as unknown as PresenceResult | null) ?? {
    status: c.presenceStatus as PresenceResult["status"],
    issues: [],
  };
  const r = scoreCompany({
    niche: c.niche,
    presence: { status: presence.status as PresenceResult["status"], socialOnly: presence.socialOnly, issues: presence.issues },
    hasPhone: !!c.phoneNormalized,
    phoneIsMobile: c.phoneIsMobile,
    hasEmail: !!c.email,
    hasAddress: !!c.address,
    hasOpeningHours: Array.isArray(c.openingHours) && c.openingHours.length > 0,
    ratingCount: c.ratingCount,
    businessStatus: c.businessStatus,
  });
  await prisma.company.update({ where: { id: c.id }, data: { score: r.score, scoreReasons: r.reasons as unknown as Prisma.InputJsonValue } });
  await advanceCrm(c.id, "ANALISADO");
  return { score: r.score, excluded: r.excluded };
};

// ---------------------------------------------------------------- Coordenação
const runAdvance: Handler = async (ctx) => {
  const run = ctx.run!;
  const cfg = ctx.cfg!;
  const open = await prisma.job.count({ where: { runId: run.id, id: { not: ctx.job.id }, status: { in: ["PENDING", "RUNNING"] } } });
  if (open > 0) {
    await rescheduleJob(ctx.job, 3000);
    return "RESCHEDULED";
  }

  if (run.stage === "DISCOVERY") {
    const links = await prisma.runCompany.findMany({ where: { runId: run.id }, include: { company: true } });
    const ranked = links
      .map((l) => l.company)
      .filter((c) => !["CONTATO_REALIZADO", "RESPONDEU", "INTERESSADO", "NEGOCIACAO", "CLIENTE", "SEM_INTERESSE", "NAO_CONTATAR"].includes(c.crmStatus))
      .filter((c) => meetsCriteria(c, cfg.criteria).ok)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, cfg.maxSites);
    for (const c of ranked) {
      await prisma.runCompany.update({ where: { runId_companyId: { runId: run.id, companyId: c.id } }, data: { selected: true } });
    }
    await enqueueMany(ranked.map((c) => ({ type: "GENERATE_CONTENT", runId: run.id, companyId: c.id, idempotencyKey: key(ctx, "GENERATE_CONTENT", c.id), priority: 50 })));
    await prisma.run.update({ where: { id: run.id }, data: { stage: "PRODUCTION" } });
    await rescheduleJob(ctx.job, 1000);
    return "RESCHEDULED";
  }

  if (run.stage === "PRODUCTION") {
    await prisma.run.update({ where: { id: run.id }, data: { stage: "REPORT" } });
    await enqueue({ type: "FINALIZE", runId: run.id, idempotencyKey: key(ctx, "FINALIZE", "1"), priority: 5 });
  }
  return { stage: run.stage };
};

// ---------------------------------------------------------------- 5. Conteúdo
function factsOf(c: Company): CompanyFacts {
  return {
    id: c.id,
    name: c.name,
    niche: c.niche,
    category: c.category,
    city: c.city,
    neighborhood: c.neighborhood,
    state: c.state,
    hasPhone: !!c.phoneNormalized,
    hasAddress: !!c.address,
    openingHours: Array.isArray(c.openingHours) ? (c.openingHours as string[]) : null,
  };
}

/** Retorna o cliente de IA se o uso estiver permitido e dentro do orçamento; senão null (template). */
async function aiIfAllowed(ctx: Ctx, estInputTokens: number, estOutputTokens: number): Promise<{ ai: AiClient | null; note: string | null }> {
  if (isSim(ctx) || !ctx.cfg?.useAi || !ctx.settings.useAi) return { ai: null, note: null };
  const ai = getDeps().ai();
  if (!ai) return { ai: null, note: "ANTHROPIC_API_KEY não configurada — usado template." };
  try {
    await assertBudget({ runId: ctx.run!.id, runLimitUsd: ctx.cfg.runSpendLimitUsd, key: "anthropic:input_mtok", estimatedUnits: estInputTokens / 1e6 }, ctx.settings);
    await assertBudget({ runId: ctx.run!.id, runLimitUsd: ctx.cfg.runSpendLimitUsd, key: "anthropic:output_mtok", estimatedUnits: estOutputTokens / 1e6 }, ctx.settings);
    return { ai, note: null };
  } catch (e) {
    if (e instanceof BudgetExceededError || e instanceof WaitingConfigError) return { ai: null, note: `IA não usada: ${e.message} Usado template (sem custo).` };
    throw e;
  }
}

async function recordAiCost(ctx: Ctx, inputTokens: number, outputTokens: number) {
  if (inputTokens > 0) await recordCost({ runId: ctx.run?.id ?? null, key: "anthropic:input_mtok", units: inputTokens / 1e6, settings: ctx.settings });
  if (outputTokens > 0) await recordCost({ runId: ctx.run?.id ?? null, key: "anthropic:output_mtok", units: outputTokens / 1e6, settings: ctx.settings });
}

const generateContent: Handler = async (ctx) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! }, include: { site: true } });
  if (c.doNotContact) throw new SkipJobError("Empresa marcada como não contatar.");
  const previous = c.site?.content ? siteContentSchema.safeParse(c.site.content) : null;
  let content = previous?.success ? previous.data : null;
  let source = c.site?.contentSource ?? null;
  let warning: string | null = null;
  // Reaproveita conteúdo já gerado (evita chamadas repetidas de IA).
  if (!content) {
    const { ai, note } = await aiIfAllowed(ctx, 1500, 900);
    const r = await generateSiteContent(factsOf(c), ai);
    await recordAiCost(ctx, r.inputTokens, r.outputTokens);
    content = r.content;
    source = r.source;
    warning = [note, r.warning].filter(Boolean).join(" ") || null;
  }
  const slug = c.site?.slug ?? `${slugify(c.name.replace(/\[.*?\]/g, ""), 36)}-${shortHash(c.id, 6)}`;
  await prisma.demoSite.upsert({
    where: { companyId: c.id },
    create: { companyId: c.id, slug, status: "GENERATING", content: content as unknown as Prisma.InputJsonValue, contentSource: source, error: warning },
    update: { content: content as unknown as Prisma.InputJsonValue, contentSource: source, error: warning },
  });
  await enqueue({ type: "BUILD_SITE", runId: ctx.run!.id, companyId: c.id, idempotencyKey: key(ctx, "BUILD_SITE", c.id), priority: 50 });
  return { source, warning };
};

// ---------------------------------------------------------------- 6. Criação do site
export function renderForCompany(c: Company, content: ReturnType<typeof siteContentSchema.parse>, settings: Settings) {
  return renderSite({
    companyId: c.id,
    name: c.name,
    niche: c.niche,
    city: c.city,
    state: c.state,
    address: c.address,
    phoneE164: c.phoneNormalized,
    phoneIsMobile: c.phoneIsMobile,
    openingHours: Array.isArray(c.openingHours) ? (c.openingHours as string[]) : null,
    mapsUrl: c.sourceUrl,
    attribution: c.attribution,
    content,
    whatsappButton: settings.demoWhatsappButton,
    senderName: settings.senderName,
    senderCompany: settings.senderCompany,
    removalUrl: optOutUrl(env.publicBaseUrl, c.id),
  });
}

const buildSite: Handler = async (ctx) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! }, include: { site: true } });
  if (!c.site?.content) throw new PermanentError("Conteúdo do site ausente.");
  const { html, template } = renderForCompany(c, siteContentSchema.parse(c.site.content), ctx.settings);
  // Não altera um site já publicado sem passar novamente por validação e publicação.
  await prisma.demoSite.update({ where: { id: c.site.id }, data: { html, template, status: c.site.status === "PUBLISHED" ? "PUBLISHED" : "GENERATED" } });
  await advanceCrm(c.id, "DEMO_GERADA");
  await enqueue({ type: "VALIDATE_SITE", runId: ctx.run!.id, companyId: c.id, idempotencyKey: key(ctx, "VALIDATE_SITE", c.id), priority: 50 });
  return { template, bytes: html.length };
};

// ---------------------------------------------------------------- 7. Validação
const validateSiteHandler: Handler = async (ctx) => {
  const site = await prisma.demoSite.findUniqueOrThrow({ where: { companyId: ctx.job.companyId! } });
  if (!site.html) throw new PermanentError("HTML ausente.");
  const report = await validateSite(site.html, { browser: ctx.settings.browserValidation && getDeps().browserValidation });
  await prisma.demoSite.update({
    where: { id: site.id },
    data: { validation: report as unknown as Prisma.InputJsonValue, status: report.ok ? (site.status === "PUBLISHED" ? "PUBLISHED" : "VALIDATED") : "INVALID" },
  });
  if (!report.ok) throw new PermanentError(`Site reprovado na validação: ${report.issues.filter((i) => i.level === "error").map((i) => i.message).join("; ")}`);
  await enqueue({ type: "PUBLISH_SITE", runId: ctx.run!.id, companyId: site.companyId, idempotencyKey: key(ctx, "PUBLISH_SITE", site.companyId), priority: 50 });
  return { ok: true, warnings: report.issues.length, browser: report.browser?.ran ?? false };
};

// ---------------------------------------------------------------- 8. Publicação
const publishSite: Handler = async (ctx) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! }, include: { site: true } });
  const site = c.site!;
  const next = () => enqueue({ type: "GENERATE_MESSAGE", runId: ctx.run!.id, companyId: c.id, idempotencyKey: key(ctx, "GENERATE_MESSAGE", c.id), priority: 60 });

  if (isSim(ctx) || c.isSimulated) {
    await prisma.demoSite.update({ where: { id: site.id }, data: { status: "SIMULATED", publisher: "simulacao", publicUrl: null } });
    await next();
    return { simulated: true };
  }
  if (!["VALIDATED", "PUBLISHED", "PUBLISH_FAILED", "PUBLISHING"].includes(site.status)) throw new PermanentError(`Site não validado (status ${site.status}).`);

  const publisherId = ctx.settings.publisher;
  if (site.status !== "PUBLISHED") {
    const published = await prisma.demoSite.count({ where: { status: "PUBLISHED" } });
    if (published >= ctx.settings.maxPublishedSites) {
      await prisma.run.update({ where: { id: ctx.run!.id }, data: { notice: `Limite de ${ctx.settings.maxPublishedSites} demonstrações publicadas atingido. Despublique sites antigos ou aumente o limite.` } });
      throw new SkipJobError("Limite de demonstrações publicadas atingido.");
    }
  }
  const costKey = publisherId === "vercel" ? "vercel:deployment" : "internal:publish";
  await assertBudget({ runId: ctx.run!.id, runLimitUsd: ctx.cfg!.runSpendLimitUsd, key: costKey, estimatedUnits: 1 }, ctx.settings);

  await prisma.demoSite.update({ where: { id: site.id }, data: { status: "PUBLISHING", publisher: publisherId } });
  const publisher = getDeps().publisher(publisherId);
  let result;
  try {
    result = await publisher.publish({ slug: site.slug, html: site.html! });
  } catch (e) {
    await prisma.demoSite.update({ where: { id: site.id }, data: { status: "PUBLISH_FAILED", error: (e as Error).message } });
    throw e;
  }
  await recordCost({ runId: ctx.run!.id, key: costKey, units: 1, settings: ctx.settings });
  await prisma.demoSite.update({ where: { id: site.id }, data: { status: "PUBLISHED", publicUrl: result.publicUrl, providerRef: result.providerRef, publishedAt: site.publishedAt ?? new Date(), unpublishedAt: null, error: null } });

  // Só considera publicado depois de confirmar que o link responde.
  const live = await getDeps().verifyUrl(result.publicUrl);
  if (!live.ok) {
    await prisma.demoSite.update({ where: { id: site.id }, data: { status: "PUBLISH_FAILED", error: `Link não confirmou publicação (${live.detail}).` } });
    throw new Error(`Publicação não confirmada em ${result.publicUrl}: ${live.detail}`);
  }
  await advanceCrm(c.id, "DEMO_PUBLICADA");
  await logEvent(c.id, "DEMO_PUBLICADA", result.publicUrl);
  await next();
  return { url: result.publicUrl };
};

// ---------------------------------------------------------------- 9. Mensagem
const generateMessage: Handler = async (ctx) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! }, include: { site: true } });
  const idem = `${c.id}:initial`;
  const existing = await prisma.message.findUnique({ where: { idempotencyKey: idem } });
  if (existing && !["DRAFT", "BLOCKED", "WAITING_CONFIG", "SIMULATED", "CANCELED"].includes(existing.status)) {
    return { skipped: `Abordagem inicial já existe (${existing.status}).` };
  }
  const demoUrl = c.site?.status === "PUBLISHED" ? c.site.publicUrl : null;
  const presence = c.presenceDetails as unknown as PresenceResult | null;
  const { ai, note } = await aiIfAllowed(ctx, 700, 400);
  const r = await composeMessage(
    {
      companyId: c.id,
      name: c.name,
      niche: c.niche,
      city: c.city,
      presenceStatus: c.presenceStatus,
      socialOnly: !!presence?.socialOnly,
      demoUrl,
      senderName: ctx.settings.senderName,
      senderCompany: ctx.settings.senderCompany,
    },
    ai,
  );
  await recordAiCost(ctx, r.inputTokens, r.outputTokens);
  const data = {
    runId: ctx.run?.id ?? null,
    channel: "MANUAL" as const,
    body: r.body,
    bodySource: r.source,
    subject: `Uma ideia de site para a ${c.name}`,
    status: "DRAFT" as const,
    error: [note, r.warning].filter(Boolean).join(" ") || null,
  };
  await prisma.message.upsert({ where: { idempotencyKey: idem }, create: { ...data, companyId: c.id, idempotencyKey: idem }, update: data });
  await advanceCrm(c.id, "CONTATO_PREPARADO");
  await enqueue({ type: "CHECK_ELIGIBILITY", runId: ctx.run!.id, companyId: c.id, idempotencyKey: key(ctx, "CHECK_ELIGIBILITY", c.id), priority: 60 });
  return { source: r.source };
};

// ---------------------------------------------------------------- 10. Elegibilidade
function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function evaluateForCompany(c: Company, channel: "WHATSAPP" | "EMAIL", mode: "SIMULATION" | "REAL", settings: Settings, excludeMessageId?: string): Promise<EligibilityResult> {
  const recipient = channel === "WHATSAPP" ? c.phoneNormalized : c.email;
  const deps = getDeps();
  const [suppressed, consent, contacted, sentToday] = await Promise.all([
    recipient ? prisma.suppression.findUnique({ where: { valueHash: contactHash(recipient) } }) : null,
    recipient ? prisma.consent.findUnique({ where: { channel_contact: { channel, contact: recipient } } }) : null,
    recipient
      ? prisma.message.count({ where: { recipient, channel, status: { in: ["SENDING", "SENT", "DELIVERED", "READ", "NEEDS_VERIFICATION"] }, ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}) } })
      : 0,
    prisma.message.count({ where: { channel, sentAt: { gte: startOfDay() } } }),
  ]);
  return evaluateEligibility({
    mode,
    channel,
    autoSendEnabled: settings.autoSendEnabled,
    company: { isSimulated: c.isSimulated, doNotContact: c.doNotContact, phoneNormalized: c.phoneNormalized, phoneIsMobile: c.phoneIsMobile, email: c.email, sourceUrl: c.sourceUrl },
    recipientSuppressed: !!suppressed,
    consent,
    alreadyContactedRecipient: contacted > 0,
    sentTodayOnChannel: sentToday,
    dailyLimit: settings.channelDailyLimits[channel],
    channelConfigured: channel === "WHATSAPP" ? deps.whatsapp.configured : deps.email.configured,
    whatsappTemplateConfigured: !!settings.whatsappTemplateName,
    emailLegalBasisConfirmed: settings.emailLegalBasisConfirmed,
    hasOptOutLink: !!env.publicBaseUrl,
  });
}

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

const checkEligibility: Handler = async (ctx) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id: ctx.job.companyId! } });
  const msg = await prisma.message.findUnique({ where: { idempotencyKey: `${c.id}:initial` } });
  if (!msg) throw new PermanentError("Mensagem não encontrada.");
  if (!["DRAFT", "BLOCKED", "WAITING_CONFIG", "SIMULATED"].includes(msg.status)) return { skipped: msg.status };

  const channels = ctx.cfg!.channels;
  const mode = ctx.run!.mode;
  let chosen: { channel: "WHATSAPP" | "EMAIL"; r: EligibilityResult } | null = null;
  const evaluations: { channel: string; decision: string; reason: string }[] = [];
  for (const channel of channels) {
    const r = await evaluateForCompany(c, channel, mode, ctx.settings, msg.id);
    evaluations.push({ channel, decision: r.decision, reason: r.reason });
    if (["SEND", "SIMULATE", "DEFER"].includes(r.decision)) {
      chosen = { channel, r };
      break;
    }
    if (!chosen) chosen = { channel, r };
  }

  if (!chosen) {
    const alt = [c.phoneNormalized ? `Telefone: ${c.phoneNormalized}` : null, c.sourceUrl].filter(Boolean).join(" · ") || null;
    await prisma.message.update({ where: { id: msg.id }, data: { channel: "MANUAL", status: "DRAFT", blockReason: "Nenhum canal automático habilitado nesta execução.", alternative: alt } });
    await advanceCrm(c.id, "CONTATO_PREPARADO", "Enviar a mensagem manualmente (nenhum canal automático habilitado).");
    return { evaluations };
  }

  const { channel, r } = chosen;
  let footer = "";
  if (channel === "EMAIL") footer = `\n\n${emailFooter({ ...ctx.settings, optOutUrl: optOutUrl(env.publicBaseUrl, c.id) })}`;
  const body = channel === "EMAIL" && !msg.body.includes("Descadastre-se") && !msg.body.includes("DESCADASTRAR") ? msg.body + footer : msg.body;
  const status = r.decision === "SEND" || r.decision === "DEFER" ? "QUEUED" : r.decision === "SIMULATE" ? "SIMULATED" : r.decision === "WAITING_CONFIG" ? "WAITING_CONFIG" : "BLOCKED";
  await prisma.message.update({
    where: { id: msg.id },
    data: { channel, recipient: r.recipient, body, status, blockReason: r.decision === "SEND" ? null : r.reason, alternative: r.alternative, consentBasis: r.consentBasis },
  });

  if (status === "QUEUED") {
    await enqueue({
      type: "SEND_MESSAGE",
      runId: ctx.run!.id,
      companyId: c.id,
      idempotencyKey: `${msg.id}:SEND`,
      priority: 70,
      maxAttempts: 4,
      runAt: r.decision === "DEFER" ? tomorrowMorning() : new Date(),
    });
    await advanceCrm(c.id, "CONTATO_PREPARADO", "Mensagem na fila de envio automático.");
  } else if (status === "SIMULATED") {
    await advanceCrm(c.id, "CONTATO_PREPARADO", "[Simulação] Mensagem gerada; nenhum envio real.");
  } else {
    await advanceCrm(c.id, "CONTATO_PREPARADO", r.alternative ? `Envio automático bloqueado: ${r.reason} Alternativa: ${r.alternative}` : `Envio automático bloqueado: ${r.reason}`);
  }
  return { evaluations, decision: r.decision };
};

// ---------------------------------------------------------------- 11. Envio
const sendMessage: Handler = async (ctx) => {
  const msg = await prisma.message.findUnique({ where: { idempotencyKey: `${ctx.job.companyId}:initial` }, include: { company: { include: { site: true } } } });
  if (!msg) throw new PermanentError("Mensagem não encontrada.");
  if (["SENT", "DELIVERED", "READ"].includes(msg.status)) return { already: msg.status };
  if (msg.status === "SENDING") {
    // Uma tentativa anterior foi interrompida durante o envio: não reenviar sem verificação.
    await prisma.message.update({ where: { id: msg.id }, data: { status: "NEEDS_VERIFICATION", error: "Envio interrompido sem confirmação. Verifique no provedor antes de reenviar." } });
    return { needsVerification: true };
  }
  if (msg.status !== "QUEUED") return { skipped: msg.status };
  const channel = msg.channel as "WHATSAPP" | "EMAIL";

  // Reavalia regras no momento do envio (descadastro/limites podem ter mudado).
  const r = await evaluateForCompany(msg.company, channel, ctx.run?.mode ?? "REAL", ctx.settings, msg.id);
  if (r.decision === "DEFER") {
    await prisma.job.update({ where: { id: ctx.job.id }, data: { status: "PENDING", runAt: tomorrowMorning(), attempts: { decrement: 1 }, lockedAt: null, lockedBy: null } });
    return "RESCHEDULED";
  }
  if (r.decision !== "SEND") {
    await prisma.message.update({ where: { id: msg.id }, data: { status: r.decision === "WAITING_CONFIG" ? "WAITING_CONFIG" : r.decision === "SIMULATE" ? "SIMULATED" : "BLOCKED", blockReason: r.reason } });
    return { blocked: r.reason };
  }

  const costKey = channel === "WHATSAPP" ? "whatsapp:template_message" : "smtp:email";
  await assertBudget({ runId: ctx.run?.id ?? null, runLimitUsd: ctx.cfg?.runSpendLimitUsd ?? null, key: costKey, estimatedUnits: 1 }, ctx.settings);

  // Transição atômica QUEUED → SENDING: garante um único envio mesmo com vários workers.
  const locked = await prisma.message.updateMany({ where: { id: msg.id, status: "QUEUED" }, data: { status: "SENDING", attempts: { increment: 1 } } });
  if (locked.count === 0) return { skipped: "Outra tarefa já está enviando." };

  const deps = getDeps();
  try {
    let sent;
    if (channel === "WHATSAPP") {
      const lastInbound = await prisma.contactEvent.findFirst({ where: { companyId: msg.companyId, type: "RESPOSTA_RECEBIDA", channel: "WHATSAPP" }, orderBy: { createdAt: "desc" } });
      const inWindow = lastInbound && Date.now() - lastInbound.createdAt.getTime() < 24 * 3600_000;
      const demoUrl = msg.company.site?.status === "PUBLISHED" ? msg.company.site.publicUrl : null;
      sent = await deps.whatsapp.send(
        inWindow
          ? { to: msg.recipient!, text: msg.body }
          : { to: msg.recipient!, template: { name: ctx.settings.whatsappTemplateName, language: ctx.settings.whatsappTemplateLanguage, params: [msg.company.name, demoUrl ?? "(link sob solicitação)"] } },
      );
    } else {
      sent = await deps.email.send({ to: msg.recipient!, subject: msg.subject ?? `Uma ideia de site para a ${msg.company.name}`, text: msg.body, listUnsubscribe: optOutUrl(env.publicBaseUrl, msg.companyId), idempotencyKey: msg.idempotencyKey });
    }
    await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", providerMessageId: sent.providerMessageId, sentAt: new Date(), error: null } });
  } catch (e) {
    const err = e as Error;
    if (e instanceof WaitingConfigError) {
      await prisma.message.update({ where: { id: msg.id }, data: { status: "WAITING_CONFIG", error: err.message } });
      throw e;
    }
    if (e instanceof PermanentError) {
      await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", error: err.message } });
      throw e;
    }
    if (/429/.test(err.message)) {
      // Rejeição explícita por limite: a mensagem não foi aceita, pode tentar de novo depois.
      await prisma.message.update({ where: { id: msg.id }, data: { status: "QUEUED", error: err.message } });
      throw e;
    }
    // Timeout/erro de rede: não sabemos se foi entregue. Não reenviar automaticamente.
    await prisma.message.update({ where: { id: msg.id }, data: { status: "NEEDS_VERIFICATION", error: `Resultado incerto: ${err.message}` } });
    return { needsVerification: true };
  }
  await recordCost({ runId: ctx.run?.id ?? null, key: costKey, units: 1, settings: ctx.settings });
  await logEvent(msg.companyId, "MENSAGEM_ENVIADA", msg.body, channel);
  await advanceCrm(msg.companyId, "CONTATO_REALIZADO", "Aguardar resposta; acompanhar em 3 dias úteis.");
  return { sent: true };
};

// ---------------------------------------------------------------- 12–13. CRM e relatório
export async function buildRunReport(runId: string) {
  const [links, selected, sites, messages, jobs, costs] = await Promise.all([
    prisma.runCompany.findMany({ where: { runId }, include: { company: { select: { presenceStatus: true, score: true } } } }),
    prisma.runCompany.count({ where: { runId, selected: true } }),
    prisma.demoSite.groupBy({ by: ["status"], where: { company: { runs: { some: { runId, selected: true } } } }, _count: true }),
    prisma.message.groupBy({ by: ["status"], where: { runId }, _count: true }),
    prisma.job.groupBy({ by: ["status"], where: { runId }, _count: true }),
    prisma.costEntry.groupBy({ by: ["provider"], where: { runId }, _sum: { estimatedCost: true, units: true } }),
  ]);
  const presence: Record<string, number> = {};
  for (const l of links) presence[l.company.presenceStatus] = (presence[l.company.presenceStatus] ?? 0) + 1;
  const toMap = (rows: { status: string; _count: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count]));
  return {
    companiesFound: links.length,
    presence,
    selected,
    sites: toMap(sites),
    messages: toMap(messages),
    jobs: toMap(jobs),
    costs: costs.map((c) => ({ provider: c.provider, cost: c._sum.estimatedCost ?? 0, units: c._sum.units ?? 0 })),
    totalCost: costs.reduce((s, c) => s + (c._sum.estimatedCost ?? 0), 0),
    generatedAt: new Date().toISOString(),
  };
}

const finalize: Handler = async (ctx) => {
  const report = await buildRunReport(ctx.run!.id);
  const problems = (report.jobs.FAILED ?? 0) + (report.jobs.WAITING_CONFIG ?? 0);
  await prisma.run.update({
    where: { id: ctx.run!.id },
    data: { report: report as unknown as Prisma.InputJsonValue, status: "COMPLETED", stage: "DONE", finishedAt: new Date(), error: problems ? `${problems} tarefa(s) falharam ou aguardam configuração — veja o histórico.` : null },
  });
  return report as unknown as Prisma.InputJsonValue;
};

// ---------------------------------------------------------------- Manutenção (retenção de dados)
export async function maintenance(settings: Settings) {
  const now = new Date();
  // Dados de fontes externas vencidos e sem relacionamento comercial são removidos.
  const expired = await prisma.company.deleteMany({
    where: { dataExpiresAt: { lt: now }, crmStatus: { in: ["NOVO_LEAD", "ANALISADO"] }, site: null },
  });
  // Demonstrações antigas sem interesse são despublicadas.
  const cutoff = new Date(now.getTime() - settings.demoRetentionDays * 86_400_000);
  const oldSites = await prisma.demoSite.findMany({
    where: { status: "PUBLISHED", publishedAt: { lt: cutoff }, company: { crmStatus: { notIn: ["INTERESSADO", "NEGOCIACAO", "CLIENTE"] } } },
    select: { id: true },
  });
  const { unpublishSite } = await import("./data-ops");
  for (const s of oldSites) await unpublishSite(s.id, "retenção automática").catch((e) => console.error("[manutenção]", e));
  return { expiredCompanies: expired.count, unpublished: oldSites.length };
}

export const HANDLERS: Record<string, Handler> = {
  DISCOVER: discover,
  NORMALIZE: normalize,
  CHECK_PRESENCE: checkPresenceHandler,
  SCORE: score,
  RUN_ADVANCE: runAdvance,
  GENERATE_CONTENT: generateContent,
  BUILD_SITE: buildSite,
  VALIDATE_SITE: validateSiteHandler,
  PUBLISH_SITE: publishSite,
  GENERATE_MESSAGE: generateMessage,
  CHECK_ELIGIBILITY: checkEligibility,
  SEND_MESSAGE: sendMessage,
  FINALIZE: finalize,
  MAINTENANCE: async (ctx) => maintenance(ctx.settings),
};

export const JOB_TIMEOUT_MS: Record<string, number> = {
  DISCOVER: 60_000,
  CHECK_PRESENCE: 45_000,
  GENERATE_CONTENT: 180_000,
  VALIDATE_SITE: 90_000,
  PUBLISH_SITE: 240_000,
  GENERATE_MESSAGE: 120_000,
  SEND_MESSAGE: 60_000,
};

/** Executa uma tarefa já capturada. Retorna o status final para logs. */
export async function processJob(job: Job): Promise<"done" | "rescheduled"> {
  const run = job.runId ? await prisma.run.findUnique({ where: { id: job.runId } }) : null;
  if (job.runId && !run) throw new PermanentError("Execução removida.");
  const ctx: Ctx = { job, run, cfg: run ? parseConfig(run) : null, settings: await getSettings() };
  const handler = HANDLERS[job.type];
  if (!handler) throw new PermanentError(`Tipo de tarefa desconhecido: ${job.type}`);
  const result = await handler(ctx);
  if (result === "RESCHEDULED") return "rescheduled";
  await completeJob(job, (result ?? undefined) as Prisma.InputJsonValue | undefined);
  return "done";
}
