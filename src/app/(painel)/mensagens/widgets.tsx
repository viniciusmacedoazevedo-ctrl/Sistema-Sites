"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn-secondary !px-2.5 !py-1 !text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? "Copiado!" : "Copiar texto"}
    </button>
  );
}

export function EditBody({ id, body }: { id: string; body: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(body);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => setOpen(true)}>Editar</button>;
  return (
    <div className="mt-2 w-full space-y-2">
      <textarea className="input min-h-40" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex gap-2">
        <button
          className="btn-primary !px-3 !py-1 !text-xs"
          onClick={async () => {
            const res = await fetch(`/api/messages/${id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: value }) });
            if (!res.ok) return setErr((await res.json()).error);
            setOpen(false);
            router.refresh();
          }}
        >
          Salvar
        </button>
        <button className="btn-secondary !px-3 !py-1 !text-xs" onClick={() => setOpen(false)}>Fechar</button>
        {err && <span className="text-xs text-red-300">{err}</span>}
      </div>
    </div>
  );
}

export function ConsentForm() {
  const router = useRouter();
  const [channel, setChannel] = useState("WHATSAPP");
  const [contact, setContact] = useState("");
  const [basis, setBasis] = useState("");
  const [evidence, setEvidence] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/consents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, contact, basis, evidence: evidence || undefined }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setMsg(body.error ?? "Erro");
        setContact("");
        setBasis("");
        setEvidence("");
        setMsg("Opt-in registrado.");
        router.refresh();
      }}
    >
      <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
        <option value="WHATSAPP">WhatsApp</option>
        <option value="EMAIL">E-mail</option>
      </select>
      <input className="input" placeholder={channel === "WHATSAPP" ? "(11) 98765-4321" : "contato@empresa.com"} value={contact} onChange={(e) => setContact(e.target.value)} required />
      <input className="input" placeholder="Como autorizou (ex.: respondeu pedindo informações)" value={basis} onChange={(e) => setBasis(e.target.value)} required minLength={5} />
      <input className="input" placeholder="Evidência (opcional)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="btn-primary">Registrar opt-in</button>
        {msg && <span className="text-xs text-slate-400">{msg}</span>}
      </div>
    </form>
  );
}
