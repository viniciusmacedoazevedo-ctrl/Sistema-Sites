import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CHANNEL_LABEL, CRM_LABEL, MESSAGE_STATUS_LABEL, PRESENCE_LABEL, SITE_STATUS_LABEL } from "@/lib/labels";
import { resolveNiche } from "@/lib/niches";
import { formatBrPhone } from "@/lib/normalize";
import { ActionButton } from "@/components/client";
import { Badge, Card, Notice, PageHeader, dt } from "@/components/ui";
import type { PresenceResult } from "@/server/presence";
import type { ScoreReason } from "@/server/scoring";
import { CompanyEditor } from "./editor";

export const metadata = { title: "Empresa" };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.company.findUnique({
    where: { id },
    include: { site: true, messages: { orderBy: { createdAt: "desc" } }, events: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!c) notFound();
  const reasons = (c.scoreReasons as ScoreReason[] | null) ?? [];
  const presence = c.presenceDetails as PresenceResult | null;
  const hours = Array.isArray(c.openingHours) ? (c.openingHours as string[]) : [];

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.category, c.city, c.state].filter(Boolean).join(" · ")}
        actions={
          <>
            <ActionButton url={`/api/companies/${c.id}?manterBloqueio=1`} method="DELETE" label="Excluir dados" variant="danger" redirectTo="/empresas" confirm="Excluir todos os dados desta empresa (site, mensagens, histórico)? O contato ficará na lista de bloqueio (apenas hash) para não ser recontatado." />
          </>
        }
      />
      {c.isSimulated && <div className="mb-4"><Notice kind="warn">Registro FICTÍCIO criado pelo modo simulação. Nunca será contatado.</Notice></div>}
      {c.doNotContact && <div className="mb-4"><Notice kind="error">Esta empresa está marcada como &quot;não contatar&quot;.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Dados comerciais">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field k="Nicho" v={c.niche ? resolveNiche(c.niche).label : "—"} />
              <Field k="Telefone" v={c.phoneNormalized ? `${formatBrPhone(c.phoneNormalized)}${c.phoneIsMobile ? " (celular)" : " (fixo)"}` : (c.phone ?? "—")} />
              <Field k="Endereço" v={c.address ?? "—"} />
              <Field k="E-mail" v={c.email ?? "—"} />
              <Field k="Site informado pela fonte" v={c.website ?? "nenhum"} />
              <Field k="Situação na fonte" v={c.businessStatus ?? "—"} />
              <Field k="Fonte" v={`${c.attribution ?? c.source}`} />
              <Field k="Coletado em" v={`${dt(c.collectedAt)} · expira ${dt(c.dataExpiresAt)}`} />
              <Field k="Verificação" v={c.verificationStatus} />
              <Field k="Perfil público" v={c.sourceUrl ? <a className="text-blue-300 hover:underline" href={c.sourceUrl} target="_blank" rel="noreferrer">abrir no mapa</a> : "—"} />
            </dl>
            {hours.length > 0 && <p className="mt-3 text-xs text-slate-400">Horários informados: {hours.join(" · ")}</p>}
          </Card>

          <Card title={`Pontuação de oportunidade: ${c.score ?? "—"}`}>
            {reasons.length ? (
              <ul className="space-y-1.5 text-sm">
                {reasons.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`w-10 shrink-0 text-right font-semibold tabular-nums ${r.points > 0 ? "text-emerald-300" : "text-slate-500"}`}>+{r.points}</span>
                    <span className="text-slate-300">{r.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Ainda não pontuada.</p>
            )}
          </Card>

          <Card title="Presença digital">
            <div className="mb-2"><Badge status={c.presenceStatus} label={PRESENCE_LABEL[c.presenceStatus]} /></div>
            {presence && (
              <div className="space-y-1 text-sm text-slate-300">
                <p>{presence.summary}</p>
                {presence.issues?.length > 0 && <ul className="list-inside list-disc text-slate-400">{presence.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
                <p className="text-xs text-slate-500">Verificado em {dt(presence.checkedAt)}{presence.httpStatus ? ` · HTTP ${presence.httpStatus}` : ""}{presence.responseMs ? ` · ${presence.responseMs} ms` : ""}</p>
              </div>
            )}
          </Card>

          <Card title="Mensagens">
            {c.messages.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma mensagem gerada.</p>
            ) : (
              c.messages.map((m) => (
                <div key={m.id} className="mb-4 rounded-xl border border-ink-700 p-4 last:mb-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge status={m.status} label={MESSAGE_STATUS_LABEL[m.status]} />
                    <span className="text-xs text-slate-400">{CHANNEL_LABEL[m.channel]} · {m.bodySource}</span>
                    {m.sentAt && <span className="text-xs text-slate-500">enviada {dt(m.sentAt)}</span>}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200">{m.body}</pre>
                  {m.blockReason && <p className="mt-2 text-xs text-amber-300">Motivo: {m.blockReason}</p>}
                  {m.alternative && <p className="mt-1 text-xs text-slate-400">Alternativa: {m.alternative}</p>}
                  {m.error && <p className="mt-1 text-xs text-red-300">{m.error}</p>}
                  <Link href="/mensagens" className="mt-2 inline-block text-xs text-blue-300 hover:underline">Gerenciar em Mensagens</Link>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="CRM">
            <div className="mb-3"><Badge status={c.crmStatus} label={CRM_LABEL[c.crmStatus]} /></div>
            {c.nextAction && <p className="mb-3 text-sm text-slate-300"><span className="text-slate-500">Próxima ação:</span> {c.nextAction}</p>}
            <CompanyEditor id={c.id} initial={{ crmStatus: c.crmStatus, notes: c.notes ?? "", nextAction: c.nextAction ?? "", email: c.email ?? "" }} />
          </Card>

          <Card title="Demonstração">
            {c.site ? (
              <div className="space-y-2 text-sm">
                <Badge status={c.site.status} label={SITE_STATUS_LABEL[c.site.status]} />
                {c.site.publicUrl && c.site.status === "PUBLISHED" && <p><a className="break-all text-blue-300 hover:underline" href={c.site.publicUrl} target="_blank" rel="noreferrer">{c.site.publicUrl}</a></p>}
                <p className="text-slate-400">Template: {c.site.template ?? "—"} · Texto: {c.site.contentSource ?? "—"}</p>
                <Link href={`/sites/${c.site.id}`} className="btn-secondary">Ver prévia e validação</Link>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhuma demonstração gerada.</p>
            )}
          </Card>

          <Card title="Histórico">
            {c.events.length === 0 ? (
              <p className="text-sm text-slate-400">Sem eventos.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {c.events.map((e) => (
                  <li key={e.id} className="border-l-2 border-blue-600/50 pl-3">
                    <p className="text-xs text-slate-500">{dt(e.createdAt)} · {e.type.replaceAll("_", " ").toLowerCase()}{e.channel ? ` · ${e.channel}` : ""}</p>
                    {e.content && <p className="line-clamp-3 text-slate-300">{e.content}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="break-words text-slate-200">{v}</dd>
    </div>
  );
}
