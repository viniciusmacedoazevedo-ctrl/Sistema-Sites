import Link from "next/link";
import { tone } from "@/lib/labels";

const TONES = {
  green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  blue: "bg-blue-500/10 text-blue-300 ring-blue-500/30",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  red: "bg-red-500/10 text-red-300 ring-red-500/30",
  slate: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
};

export function Badge({ status, label, toneOverride }: { status: string; label?: string; toneOverride?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[toneOverride ?? tone(status)]}`}>{label ?? status}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href, accent }: { label: string; value: React.ReactNode; hint?: string; href?: string; accent?: "blue" | "green" | "amber" | "red" }) {
  const color = { blue: "text-blue-300", green: "text-emerald-300", amber: "text-amber-300", red: "text-red-300" }[accent ?? "blue"];
  const body = (
    <div className="card h-full p-4 transition hover:border-blue-500/40">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Card({ title, children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-ink-600 p-8 text-center text-sm text-slate-400">{children}</div>;
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function usd(n: number | null | undefined) {
  if (n === null || n === undefined) return "preço a verificar";
  const digits = n === 0 || n >= 1 ? 2 : 4;
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function dt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "error"; children: React.ReactNode }) {
  const cls = { info: "border-blue-800/60 bg-blue-950/40 text-blue-200", warn: "border-amber-800/60 bg-amber-950/30 text-amber-200", error: "border-red-800/60 bg-red-950/30 text-red-200" }[kind];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
