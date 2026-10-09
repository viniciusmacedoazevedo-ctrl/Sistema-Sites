"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/components/client";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/automacao", label: "Iniciar automação" },
  { href: "/execucoes", label: "Execuções" },
  { href: "/empresas", label: "Empresas / CRM" },
  { href: "/sites", label: "Demonstrações" },
  { href: "/mensagens", label: "Mensagens" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/privacidade", label: "Privacidade e bloqueios" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-700 bg-ink-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button className="btn-secondary !px-3 !py-1.5" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
          ☰
        </button>
      </div>
      <aside className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-700 bg-ink-950 p-4 lg:block`}>
        <div className="mb-8 hidden lg:block">
          <Brand />
        </div>
        <nav className="space-y-1" onClick={() => setOpen(false)}>
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${active(i.href) ? "bg-blue-600/15 text-blue-200 ring-1 ring-inset ring-blue-500/30" : "text-slate-400 hover:bg-ink-800 hover:text-white"}`}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <LogoutButton />
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-sm font-black text-white">SH</span>
      <span className="font-bold text-white">
        SiteHunter <span className="text-blue-400">AI</span>
      </span>
    </Link>
  );
}
