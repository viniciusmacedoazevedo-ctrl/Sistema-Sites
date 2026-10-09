"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CRM_LABEL } from "@/lib/labels";

export function CompanyEditor({ id, initial }: { id: string; initial: { crmStatus: string; notes: string; nextAction: string; email: string } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, email: v.email || null, notes: v.notes || null, nextAction: v.nextAction || null, note: note || undefined }),
    });
    setBusy(false);
    if (!res.ok) return setMsg((await res.json().catch(() => ({}))).error ?? "Erro ao salvar");
    setNote("");
    setMsg("Salvo.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Status da oportunidade</label>
        <select className="input" value={v.crmStatus} onChange={(e) => setV({ ...v, crmStatus: e.target.value })}>
          {Object.entries(CRM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {v.crmStatus === "NAO_CONTATAR" && <p className="mt-1 text-xs text-amber-300">Ao salvar, os contatos entram na lista de bloqueio e a demonstração é despublicada.</p>}
      </div>
      <div>
        <label className="label">E-mail comercial (se conhecido e público)</label>
        <input className="input" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="contato@empresa.com.br" />
      </div>
      <div>
        <label className="label">Próxima ação</label>
        <input className="input" value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} />
      </div>
      <div>
        <label className="label">Observações</label>
        <textarea className="input min-h-24" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </div>
      <div>
        <label className="label">Registrar interação no histórico</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: liguei, pediu proposta por e-mail" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
