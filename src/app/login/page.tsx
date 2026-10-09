"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    setLoading(false);
    if (res.ok) {
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Falha no login");
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-8">
      <div className="mb-2 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-lg font-black text-white">SH</div>
        <div>
          <h1 className="text-lg font-bold text-white">SiteHunter AI</h1>
          <p className="text-xs text-slate-400">Acesso privado</p>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="username">Usuário</label>
        <input id="username" name="username" className="input" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {error && <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
      <button className="btn-primary w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(800px_400px_at_50%_0%,rgba(37,99,235,0.18),transparent)] px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
