import { prisma } from "@/lib/db";
import { contactHash } from "@/lib/normalize";
import { audit } from "./audit";
import { getDeps } from "./deps";
import { logEvent } from "./crm";
import { retryJobs } from "./queue";

const DISCOVERY_TYPES = ["DISCOVER", "NORMALIZE", "CHECK_PRESENCE", "SCORE"];

/** Despublica uma demonstração (remove do provedor externo quando houver). */
export async function unpublishSite(siteId: string, reason: string, actor = "sistema") {
  const site = await prisma.demoSite.findUniqueOrThrow({ where: { id: siteId } });
  if (site.publisher && site.publisher !== "simulacao" && site.status === "PUBLISHED") {
    await getDeps().publisher(site.publisher).unpublish({ slug: site.slug, providerRef: site.providerRef });
  }
  await prisma.demoSite.update({ where: { id: siteId }, data: { status: "UNPUBLISHED", unpublishedAt: new Date() } });
  await audit("site.despublicado", { actor, entity: "DemoSite", entityId: siteId, details: { reason } });
}

/** Adiciona contatos à lista de supressão (armazenando somente hash). */
export async function suppressContacts(values: (string | null | undefined)[], reason: string, label?: string) {
  for (const v of values) {
    if (!v) continue;
    await prisma.suppression.upsert({ where: { valueHash: contactHash(v) }, create: { valueHash: contactHash(v), reason, label: label ?? null }, update: {} });
  }
}

/** Descadastro / pedido de remoção vindo da própria empresa. */
export async function optOutCompany(companyId: string, source: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId }, include: { site: true } });
  if (!c) return false;
  await suppressContacts([c.phoneNormalized, c.email], `descadastro (${source})`, c.name.slice(0, 3) + "…");
  await prisma.company.update({ where: { id: c.id }, data: { doNotContact: true, crmStatus: "NAO_CONTATAR", nextAction: "Não contatar (descadastro solicitado).", lastActivityAt: new Date() } });
  await prisma.message.updateMany({ where: { companyId: c.id, status: { in: ["QUEUED", "DRAFT", "WAITING_CONFIG", "BLOCKED"] } }, data: { status: "CANCELED", blockReason: "Descadastro solicitado" } });
  if (c.site && c.site.status === "PUBLISHED") await unpublishSite(c.site.id, "descadastro").catch((e) => console.error(e));
  await logEvent(c.id, "DESCADASTRO", source);
  await audit("empresa.descadastro", { entity: "Company", entityId: c.id, details: { source } });
  return true;
}

/**
 * Exclui todos os dados de uma empresa (site, mensagens, histórico).
 * Opcionalmente mantém o contato na lista de supressão (apenas hash) para não recontatar.
 */
export async function deleteCompany(companyId: string, opts: { keepSuppressed: boolean; actor: string }) {
  const c = await prisma.company.findUnique({ where: { id: companyId }, include: { site: true } });
  if (!c) return false;
  if (c.site && c.site.status === "PUBLISHED") await unpublishSite(c.site.id, "exclusão de dados", opts.actor);
  if (opts.keepSuppressed) await suppressContacts([c.phoneNormalized, c.email], "excluída a pedido — não recontatar");
  if (c.phoneNormalized) await prisma.consent.deleteMany({ where: { contact: c.phoneNormalized } });
  if (c.email) await prisma.consent.deleteMany({ where: { contact: c.email } });
  await prisma.job.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await audit("empresa.excluida", { actor: opts.actor, entity: "Company", entityId: companyId, details: { keepSuppressed: opts.keepSuppressed } });
  return true;
}

/** Recoloca na fila as tarefas que falharam/aguardavam configuração e reabre a execução. */
export async function retryRun(runId: string, actor: string) {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
  if (run.status === "CANCELED") throw new Error("Execução cancelada não pode ser retomada.");
  const pendingTypes = await prisma.job.findMany({
    where: { runId, status: { in: ["WAITING_CONFIG", "WAITING_AUTH", "FAILED"] } },
    select: { type: true },
  });
  const count = await retryJobs({ runId });
  if (count === 0) return 0;
  const needsDiscovery = pendingTypes.some((j) => DISCOVERY_TYPES.includes(j.type));
  const reopen = run.stage === "DONE" || run.stage === "REPORT";
  await prisma.$transaction([
    prisma.run.update({
      where: { id: runId },
      data: {
        status: "RUNNING",
        finishedAt: null,
        error: null,
        ...(reopen ? { stage: needsDiscovery ? ("DISCOVERY" as const) : ("PRODUCTION" as const) } : {}),
      },
    }),
    prisma.job.deleteMany({ where: { runId, type: "FINALIZE" } }),
    prisma.job.updateMany({ where: { runId, type: "RUN_ADVANCE" }, data: { status: "PENDING", runAt: new Date(), finishedAt: null, lockedAt: null, lockedBy: null } }),
  ]);
  await audit("execucao.reprocessada", { actor, entity: "Run", entityId: runId, details: { jobs: count } });
  return count;
}

/** Re-renderiza o site com o conteúdo atual (sem IA, sem custo), valida e republica se estava publicado. */
export async function rebuildSite(siteId: string, actor: string) {
  const { renderForCompany } = await import("./pipeline");
  const { siteContentSchema } = await import("./content/site-content");
  const { validateSite } = await import("./sitegen/validate");
  const { getSettings } = await import("@/lib/settings");
  const settings = await getSettings();
  const site = await prisma.demoSite.findUniqueOrThrow({ where: { id: siteId }, include: { company: true } });
  const { html, template } = renderForCompany(site.company, siteContentSchema.parse(site.content), settings);
  const report = await validateSite(html, { browser: settings.browserValidation && getDeps().browserValidation });
  const wasPublished = site.status === "PUBLISHED";
  await prisma.demoSite.update({ where: { id: siteId }, data: { html, template, validation: report as object, status: report.ok ? (wasPublished ? "PUBLISHED" : "VALIDATED") : "INVALID" } });
  if (report.ok && wasPublished && site.publisher && site.publisher !== "internal") await publishSiteNow(siteId, actor);
  await audit("site.regenerado", { actor, entity: "DemoSite", entityId: siteId, details: { ok: report.ok } });
  return report;
}

/** Publica (ou republica) imediatamente uma demonstração validada de uma empresa real. */
export async function publishSiteNow(siteId: string, actor: string) {
  const { getSettings } = await import("@/lib/settings");
  const settings = await getSettings();
  const site = await prisma.demoSite.findUniqueOrThrow({ where: { id: siteId }, include: { company: true } });
  if (site.company.isSimulated) throw new Error("Demonstrações de empresas fictícias (simulação) não podem ser publicadas.");
  if (site.company.doNotContact) throw new Error("Empresa marcada como não contatar.");
  if (!site.html || !["VALIDATED", "PUBLISHED", "UNPUBLISHED", "PUBLISH_FAILED"].includes(site.status)) throw new Error("O site precisa estar validado antes de publicar.");
  const deps = getDeps();
  const publisherId = settings.publisher;
  const result = await deps.publisher(publisherId).publish({ slug: site.slug, html: site.html });
  await prisma.demoSite.update({ where: { id: siteId }, data: { status: "PUBLISHED", publisher: publisherId, publicUrl: result.publicUrl, providerRef: result.providerRef, publishedAt: new Date(), unpublishedAt: null, error: null } });
  const live = await deps.verifyUrl(result.publicUrl);
  if (!live.ok) {
    await prisma.demoSite.update({ where: { id: siteId }, data: { status: "PUBLISH_FAILED", error: `Link não confirmou publicação (${live.detail}).` } });
    throw new Error(`Publicação não confirmada: ${live.detail}`);
  }
  await audit("site.publicado", { actor, entity: "DemoSite", entityId: siteId, details: { url: result.publicUrl } });
  return result.publicUrl;
}

export async function deleteSite(siteId: string, actor: string) {
  const site = await prisma.demoSite.findUniqueOrThrow({ where: { id: siteId } });
  if (site.status === "PUBLISHED") await unpublishSite(siteId, "exclusão", actor);
  await prisma.demoSite.delete({ where: { id: siteId } });
  await audit("site.excluido", { actor, entity: "DemoSite", entityId: siteId });
}
