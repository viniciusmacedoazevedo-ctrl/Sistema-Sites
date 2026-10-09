import Link from "next/link";
import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CHANNEL_LABEL, MESSAGE_STATUS_LABEL } from "@/lib/labels";
import { formatBrPhone } from "@/lib/normalize";
import { getSettings } from "@/lib/settings";
import { ActionButton } from "@/components/client";
import { Badge, Card, Empty, Notice, PageHeader, dt } from "@/components/ui";
import { ConsentForm, CopyButton, EditBody } from "./widgets";

export const metadata = { title: "Mensagens" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const where = status && status in MESSAGE_STATUS_LABEL ? { status: status as MessageStatus } : {};
  const settings = await getSettings();
  const [messages, counts, consents] = await Promise.all([
    prisma.message.findMany({ where, orderBy: { updatedAt: "desc" }, take: 150, include: { company: { select: { id: true, name: true, phoneNormalized: true, phoneIsMobile: true, isSimulated: true } } } }),
    prisma.message.groupBy({ by: ["status"], _count: true }),
    prisma.consent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const countOf = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const sentToday = await prisma.message.groupBy({ by: ["channel"], where: { sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, _count: true });

  return (
    <>
      <PageHeader
        title="Mensagens"
        subtitle={`Envio automático: ${settings.autoSendEnabled ? "ATIVO" : "desativado"} · Limites diários: WhatsApp ${settings.channelDailyLimits.WHATSAPP}, e-mail ${settings.channelDailyLimits.EMAIL} · Hoje: ${sentToday.map((s) => `${CHANNEL_LABEL[s.channel]} ${s._count}`).join(", ") || "nenhum envio"}`}
      />
      <div className="mb-4">
        <Notice>
          Envios automáticos usam apenas canais oficiais e só ocorrem com opt-in registrado (WhatsApp) ou base legal confirmada com descadastro (e-mail). Um telefone público <strong>não</strong> autoriza mensagens promocionais. Para os demais, use o rascunho e o contato manual.
        </Notice>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/mensagens" className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!status ? "bg-blue-600 text-white ring-blue-500" : "text-slate-300 ring-ink-600"}`}>Todas</Link>
        {Object.entries(MESSAGE_STATUS_LABEL).map(([k, v]) => (
          <Link key={k} href={`/mensagens?status=${k}`} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${status === k ? "bg-blue-600 text-white ring-blue-500" : "text-slate-300 ring-ink-600"}`}>
            {v} <span className="opacity-60">{countOf[k] ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        {messages.length === 0 && <Empty>Nenhuma mensagem.</Empty>}
        {messages.map((m) => {
          const editable = ["DRAFT", "BLOCKED", "WAITING_CONFIG"].includes(m.status);
          const manualWa = m.company.phoneIsMobile && m.company.phoneNormalized && editable && !m.company.isSimulated ? `https://wa.me/${m.company.phoneNormalized.replace(/\D/g, "")}?text=${encodeURIComponent(m.body)}` : null;
          return (
            <Card key={m.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link href={`/empresas/${m.company.id}`} className="font-semibold text-white hover:text-blue-300">{m.company.name}</Link>
                <Badge status={m.status} label={MESSAGE_STATUS_LABEL[m.status]} />
                <span className="text-xs text-slate-400">{CHANNEL_LABEL[m.channel]}{m.recipient ? ` → ${m.channel === "WHATSAPP" ? formatBrPhone(m.recipient) : m.recipient}` : ""} · texto: {m.bodySource} · {dt(m.updatedAt)}</span>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-850 p-3 font-sans text-sm text-slate-200">{m.body}</pre>
              {m.blockReason && <p className="mt-2 text-sm text-amber-300">Motivo: {m.blockReason}</p>}
              {m.alternative && <p className="mt-1 text-xs text-slate-400">Alternativa de contato: {m.alternative}</p>}
              {m.consentBasis && <p className="mt-1 text-xs text-emerald-300">Base do contato: {m.consentBasis}</p>}
              {m.error && <p className="mt-1 text-xs text-red-300">{m.error}</p>}
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <CopyButton text={m.body} />
                {editable && <EditBody id={m.id} body={m.body} />}
                {manualWa && <a className="btn-secondary !px-2.5 !py-1 !text-xs" href={manualWa} target="_blank" rel="noreferrer">Abrir no meu WhatsApp (envio manual)</a>}
                {editable && <ActionButton small url={`/api/messages/${m.id}/release`} label="Reavaliar e liberar envio" />}
                {editable && !m.company.isSimulated && <ActionButton small url={`/api/messages/${m.id}/mark-sent`} label="Marcar como enviada manualmente" />}
                {m.status === "NEEDS_VERIFICATION" && (
                  <>
                    <ActionButton small url={`/api/messages/${m.id}/mark-sent`} label="Confirmei: foi enviada" />
                    <ActionButton small url={`/api/messages/${m.id}/not-sent`} label="Confirmei: NÃO foi enviada (reenfileirar)" confirm="Tem certeza de que verificou no provedor que a mensagem não foi entregue?" />
                  </>
                )}
                {(editable || m.status === "QUEUED") && <ActionButton small url={`/api/messages/${m.id}/cancel`} label="Cancelar" variant="danger" />}
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Opt-ins registrados (autorização de contato)" className="mt-8">
        <p className="mb-4 text-sm text-slate-400">Registre aqui apenas autorizações reais e comprováveis (ex.: a empresa pediu contato, respondeu sua mensagem, preencheu formulário). Sem isso, o WhatsApp automático fica bloqueado.</p>
        <ConsentForm />
        {consents.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Canal</th><th>Contato</th><th>Base</th><th>Evidência</th><th>Registrado</th><th></th></tr></thead>
              <tbody>
                {consents.map((c) => (
                  <tr key={c.id}>
                    <td>{CHANNEL_LABEL[c.channel]}</td>
                    <td>{c.channel === "WHATSAPP" ? formatBrPhone(c.contact) : c.contact}</td>
                    <td className="text-slate-300">{c.basis}</td>
                    <td className="text-xs text-slate-400">{c.evidence ?? "—"}</td>
                    <td className="text-xs text-slate-500">{dt(c.createdAt)}</td>
                    <td>{c.revokedAt ? <Badge status="CANCELED" label="Revogado" /> : <ActionButton small url={`/api/consents/${c.id}`} method="DELETE" label="Revogar" confirm="Revogar este opt-in?" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
