"use client";

import { useState } from "react";

export function OptOutButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Feito. Você não receberá novos contatos.</p>;
  return (
    <button
      className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/optout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token }) });
        setState(res.ok ? "done" : "error");
      }}
    >
      {state === "error" ? "Erro — tente novamente" : "Confirmar descadastro e remoção"}
    </button>
  );
}
