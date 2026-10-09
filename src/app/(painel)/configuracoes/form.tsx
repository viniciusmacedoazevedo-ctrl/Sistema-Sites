"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/settings";

interface PriceMeta {
  key: string;
  label: string;
  unit: string;
  url: string;
  note: string;
}

export function SettingsForm({ initial, catalog }: { initial: Settings; catalog: PriceMeta[] }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: body.issues ? body.issues.map((i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join(" · ") : body.error });
    setS(body);
    setMsg({ ok: true, text: "Configurações salvas." });
    router.refresh();
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Identificação do remetente</h2>
        <Field label="Seu nome (usado nas mensagens)"><input className="input" value={s.senderName} onChange={(e) => set("senderName", e.target.value)} /></Field>
        <Field label="Sua empresa (opcional)"><input className="input" value={s.senderCompany} onChange={(e) => set("senderCompany", e.target.value)} /></Field>
        <Field label="Contato para pedidos de remoção (e-mail/telefone)"><input className="input" value={s.senderContact} onChange={(e) => set("senderContact", e.target.value)} /></Field>
        <Field label="Endereço/identificação no rodapé de e-mails"><input className="input" value={s.senderAddress} onChange={(e) => set("senderAddress", e.target.value)} /></Field>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Envio de mensagens</h2>
        <Toggle checked={s.autoSendEnabled} onChange={(v) => set("autoSendEnabled", v)} label="Ativar envio automático (somente contatos elegíveis)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite diário WhatsApp"><input type="number" className="input" value={s.channelDailyLimits.WHATSAPP} onChange={(e) => set("channelDailyLimits", { ...s.channelDailyLimits, WHATSAPP: num(e.target.value) })} /></Field>
          <Field label="Limite diário e-mail"><input type="number" className="input" value={s.channelDailyLimits.EMAIL} onChange={(e) => set("channelDailyLimits", { ...s.channelDailyLimits, EMAIL: num(e.target.value) })} /></Field>
        </div>
        <Field label="Nome do modelo (template) aprovado no WhatsApp">
          <input className="input" value={s.whatsappTemplateName} onChange={(e) => set("whatsappTemplateName", e.target.value)} placeholder="demo_site_v1" />
          <p className="mt-1 text-xs text-slate-500">O template deve ter 2 variáveis no corpo: {"{{1}}"} nome da empresa e {"{{2}}"} link da demonstração.</p>
        </Field>
        <Field label="Idioma do template"><input className="input" value={s.whatsappTemplateLanguage} onChange={(e) => set("whatsappTemplateLanguage", e.target.value)} /></Field>
        <Toggle
          checked={s.emailLegalBasisConfirmed}
          onChange={(v) => set("emailLegalBasisConfirmed", v)}
          label="Confirmo que avaliei a base legal (LGPD) para e-mails comerciais B2B a endereços corporativos públicos, com identificação e descadastro em toda mensagem."
        />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Limites de gastos</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite diário (US$)"><input type="number" step="0.1" className="input" value={s.dailySpendLimitUsd} onChange={(e) => set("dailySpendLimitUsd", num(e.target.value))} /></Field>
          <Field label="Limite padrão por execução (US$)"><input type="number" step="0.1" className="input" value={s.defaultRunSpendLimitUsd} onChange={(e) => set("defaultRunSpendLimitUsd", num(e.target.value))} /></Field>
        </div>
        <Toggle checked={s.blockUnknownPrices} onChange={(v) => set("blockUnknownPrices", v)} label="Bloquear operações pagas cujo preço não foi configurado (recomendado)" />
        <Toggle checked={s.useAi} onChange={(v) => set("useAi", v)} label="Permitir IA para textos (se desligado, usa templates sem custo)" />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Demonstrações e dados</h2>
        <Field label="Publicação">
          <select className="input" value={s.publisher} onChange={(e) => set("publisher", e.target.value as Settings["publisher"])}>
            <option value="internal">Servidor próprio (/d/&lt;slug&gt;) — sem custo extra</option>
            <option value="vercel">Vercel (um projeto por demonstração)</option>
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Máx. publicadas"><input type="number" className="input" value={s.maxPublishedSites} onChange={(e) => set("maxPublishedSites", num(e.target.value))} /></Field>
          <Field label="Retenção demos (dias)"><input type="number" className="input" value={s.demoRetentionDays} onChange={(e) => set("demoRetentionDays", num(e.target.value))} /></Field>
          <Field label="Retenção dados fonte (dias)"><input type="number" className="input" value={s.placesDataRetentionDays} onChange={(e) => set("placesDataRetentionDays", num(e.target.value))} /></Field>
        </div>
        <Toggle checked={s.demoWhatsappButton} onChange={(v) => set("demoWhatsappButton", v)} label="Mostrar botão de WhatsApp nas demonstrações (apenas número celular informado pela fonte)" />
        <Toggle checked={s.browserValidation} onChange={(v) => set("browserValidation", v)} label="Validar responsividade em navegador (Chromium) quando disponível" />
      </section>

      <section className="card space-y-3 p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Custos — preços unitários</h2>
        <p className="text-xs text-slate-400">Consulte sempre a página oficial de preços. Deixe em branco se não souber: a operação ficará bloqueada até você preencher (quando o bloqueio estiver ativo).</p>
        <div className="grid gap-3 md:grid-cols-2">
          {catalog.map((p) => (
            <div key={p.key} className="rounded-xl border border-ink-700 p-3">
              <label className="label">{p.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  className="input"
                  value={s.prices[p.key] ?? ""}
                  placeholder="preço a verificar"
                  onChange={(e) => set("prices", { ...s.prices, [p.key]: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <span className="whitespace-nowrap text-xs text-slate-500">{p.unit}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.note} {p.url && <a className="text-blue-300 underline" href={p.url} target="_blank" rel="noreferrer">tabela oficial</a>}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 lg:col-span-2">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar configurações"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
