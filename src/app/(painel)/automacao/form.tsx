"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface EstimateLine {
  item: string;
  units: number;
  unitLabel: string;
  unitPrice: number | null;
  cost: number | null;
  note: string;
}

export function AutomationForm({
  niches,
  defaults,
  integrations,
}: {
  niches: { id: string; label: string }[];
  defaults: { runSpendLimitUsd: number; dailySpendLimitUsd: number; autoSendEnabled: boolean; useAi: boolean };
  integrations: Record<string, boolean>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"SIMULATION" | "REAL">("SIMULATION");
  const [country, setCountry] = useState("BR");
  const [state, setState] = useState("");
  const [regions, setRegions] = useState([{ city: "", neighborhood: "" }]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [maxCompanies, setMaxCompanies] = useState(40);
  const [maxSites, setMaxSites] = useState(10);
  const [runLimit, setRunLimit] = useState(defaults.runSpendLimitUsd);
  const [channels, setChannels] = useState<string[]>(["WHATSAPP"]);
  const [useAi, setUseAi] = useState(defaults.useAi);
  const [minScore, setMinScore] = useState(50);
  const [requirePhone, setRequirePhone] = useState(true);
  const [includeFunctional, setIncludeFunctional] = useState(false);
  const [estimate, setEstimate] = useState<{ lines: EstimateLine[]; total: number; unknown: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allNiches = [...selected, ...custom.split(",").map((s) => s.trim()).filter((s) => s.length >= 2)];

  function config() {
    return {
      mode,
      country,
      state,
      regions: regions.filter((r) => r.city.trim().length >= 2),
      niches: allNiches,
      maxCompanies,
      maxSites,
      runSpendLimitUsd: runLimit,
      channels,
      useAi,
      criteria: { minScore, requirePhone, includeFunctionalSites: includeFunctional },
    };
  }

  async function call(url: string) {
    setError(null);
    setBusy(true);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config()) });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.issues ? body.issues.map((i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join(" · ") : (body.error ?? "Erro"));
      return null;
    }
    return body;
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const missingReal = mode === "REAL" && !integrations.google_places;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Modo de execução</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["SIMULATION", "Simulação", "Percorre o fluxo inteiro com empresas fictícias. Não publica, não envia e não gasta."],
                ["REAL", "Execução real", "Busca empresas reais, publica demonstrações e envia apenas mensagens autorizadas."],
              ] as const
            ).map(([v, t, d]) => (
              <label key={v} className={`cursor-pointer rounded-xl border p-4 transition ${mode === v ? (v === "REAL" ? "border-blue-500 bg-blue-950/40" : "border-amber-500/60 bg-amber-950/20") : "border-ink-600 hover:border-ink-600/80"}`}>
                <input type="radio" name="mode" className="sr-only" checked={mode === v} onChange={() => setMode(v)} />
                <p className="font-semibold text-white">{t}</p>
                <p className="mt-1 text-xs text-slate-400">{d}</p>
              </label>
            ))}
          </div>
          {missingReal && (
            <p className="mt-3 rounded-lg bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
              GOOGLE_PLACES_API_KEY não está configurada — a descoberta ficará &quot;aguardando configuração&quot;. Veja <Link href="/configuracoes" className="underline">Configurações</Link>.
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Regiões</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">País (código)</label>
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
            </div>
            <div>
              <label className="label">Estado (UF)</label>
              <input className="input" value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="SP" maxLength={20} />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {regions.map((r, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="label">Cidade</label>
                  <input className="input" value={r.city} placeholder="Campinas" onChange={(e) => setRegions(regions.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="label">Bairro ou região (opcional)</label>
                  <input className="input" value={r.neighborhood} placeholder="Cambuí" onChange={(e) => setRegions(regions.map((x, j) => (j === i ? { ...x, neighborhood: e.target.value } : x)))} />
                </div>
                <div className="flex items-end">
                  {regions.length > 1 && (
                    <button type="button" className="btn-secondary" onClick={() => setRegions(regions.filter((_, j) => j !== i))}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
            ))}
            {regions.length < 10 && (
              <button type="button" className="btn-secondary" onClick={() => setRegions([...regions, { city: "", neighborhood: "" }])}>
                + Adicionar região
              </button>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Nichos de mercado</h2>
          <div className="flex flex-wrap gap-2">
            {niches.map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={() => setSelected(toggle(selected, n.id))}
                className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition ${selected.includes(n.id) ? "bg-blue-600 text-white ring-blue-500" : "bg-ink-800 text-slate-300 ring-ink-600 hover:ring-blue-500/50"}`}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <label className="label">Outros nichos (separados por vírgula)</label>
            <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="pet shop, vidraçaria" />
          </div>
          <p className="mt-2 text-xs text-slate-500">{allNiches.length} nicho(s) × {regions.filter((r) => r.city.trim()).length} região(ões) = {allNiches.length * regions.filter((r) => r.city.trim()).length} busca(s)</p>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Quantidades, critérios e canais</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Máx. de empresas</label>
              <input type="number" min={1} max={500} className="input" value={maxCompanies} onChange={(e) => setMaxCompanies(Number(e.target.value))} />
              <p className="mt-1 text-xs text-slate-500">É um máximo, não uma garantia.</p>
            </div>
            <div>
              <label className="label">Máx. de sites a gerar</label>
              <input type="number" min={0} max={200} className="input" value={maxSites} onChange={(e) => setMaxSites(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Limite de gasto da execução (US$)</label>
              <input type="number" min={0} step={0.1} className="input" value={runLimit} onChange={(e) => setRunLimit(Number(e.target.value))} />
              <p className="mt-1 text-xs text-slate-500">Limite diário: US$ {defaults.dailySpendLimitUsd.toFixed(2)} (em Configurações)</p>
            </div>
            <div>
              <label className="label">Pontuação mínima</label>
              <input type="number" min={0} max={100} className="input" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:mt-6">
              <input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} /> Exigir telefone válido
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:mt-6">
              <input type="checkbox" checked={includeFunctional} onChange={(e) => setIncludeFunctional(e.target.checked)} /> Incluir quem já tem site funcional
            </label>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={channels.includes("WHATSAPP")} onChange={() => setChannels(toggle(channels, "WHATSAPP"))} /> Canal WhatsApp (oficial)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={channels.includes("EMAIL")} onChange={() => setChannels(toggle(channels, "EMAIL"))} /> Canal e-mail
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Usar IA nos textos
            </label>
          </div>
          {!defaults.autoSendEnabled && <p className="mt-3 text-xs text-amber-300">Envio automático desativado em Configurações: mensagens serão salvas como rascunho.</p>}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Estimativa de custos</h2>
          {estimate ? (
            <div className="space-y-2 text-sm">
              {estimate.lines.map((l) => (
                <div key={l.item} className="flex justify-between gap-3 border-b border-ink-800 pb-2">
                  <div>
                    <p className="text-slate-200">{l.item}</p>
                    <p className="text-xs text-slate-500">{l.note}</p>
                  </div>
                  <p className={`whitespace-nowrap tabular-nums ${l.cost === null ? "text-amber-300" : "text-slate-300"}`}>{l.cost === null ? "preço a verificar" : `US$ ${l.cost.toFixed(4)}`}</p>
                </div>
              ))}
              <p className="flex justify-between pt-1 font-semibold text-white">
                <span>Total máximo estimado</span>
                <span>US$ {estimate.total.toFixed(4)}{estimate.unknown ? " + itens a verificar" : ""}</span>
              </p>
              {estimate.unknown && <p className="text-xs text-amber-300">Configure os preços em Configurações → Custos. Operações com preço desconhecido ficam bloqueadas por segurança.</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Calcule antes de iniciar para ver o pior caso.</p>
          )}
          <button type="button" className="btn-secondary mt-4 w-full" disabled={busy} onClick={async () => setEstimate(await call("/api/runs/estimate"))}>
            Calcular estimativa
          </button>
        </section>
        {error && <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button
          type="button"
          className={`btn-primary w-full !py-4 !text-base ${mode === "SIMULATION" ? "!bg-amber-600 hover:!bg-amber-500" : ""}`}
          disabled={busy || allNiches.length === 0 || !regions.some((r) => r.city.trim().length >= 2)}
          onClick={async () => {
            if (mode === "REAL" && !window.confirm("Iniciar execução REAL? Empresas reais serão consultadas, demonstrações publicadas e mensagens autorizadas poderão ser enviadas.")) return;
            const r = await call("/api/runs");
            if (r?.id) router.push(`/execucoes/${r.id}`);
          }}
        >
          {mode === "SIMULATION" ? "INICIAR SIMULAÇÃO" : "INICIAR AUTOMAÇÃO"}
        </button>
        <p className="text-center text-xs text-slate-500">O processamento acontece no worker em segundo plano.</p>
      </aside>
    </div>
  );
}
