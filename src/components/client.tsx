"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** Botão que chama uma rota de API e atualiza a página. */
export function ActionButton({
  url,
  method = "POST",
  body,
  label,
  confirm,
  variant = "secondary",
  redirectTo,
  small,
}: {
  url: string;
  method?: string;
  body?: unknown;
  label: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "danger";
  redirectTo?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={`btn-${variant} ${small ? "!px-2.5 !py-1 !text-xs" : ""}`}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
            if (!res.ok) {
              setError((await res.json().catch(() => ({}))).error ?? `Erro ${res.status}`);
              return;
            }
            if (redirectTo) router.push(redirectTo);
            router.refresh();
          });
        }}
      >
        {pending ? "Aguarde..." : label}
      </button>
      {error && <span className="mt-1 max-w-xs text-xs text-red-300">{error}</span>}
    </span>
  );
}

/** Atualiza os dados da página periodicamente enquanto `active` for verdadeiro. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return active ? (
    <span className="inline-flex items-center gap-2 text-xs text-blue-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
      Atualizando em tempo real
    </span>
  ) : null;
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-ink-800 hover:text-white"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      Sair
    </button>
  );
}
