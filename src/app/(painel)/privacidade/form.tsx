"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SuppressionForm() {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/suppressions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact, reason: reason || undefined }) });
        setMsg(res.ok ? "Adicionado à lista de bloqueio." : ((await res.json()).error ?? "Erro"));
        if (res.ok) {
          setContact("");
          setReason("");
          router.refresh();
        }
      }}
    >
      <input className="input max-w-xs" placeholder="Telefone ou e-mail" value={contact} onChange={(e) => setContact(e.target.value)} required />
      <input className="input max-w-xs" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-primary">Bloquear contato</button>
      {msg && <span className="self-center text-xs text-slate-400">{msg}</span>}
    </form>
  );
}
