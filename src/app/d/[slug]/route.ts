import { prisma } from "@/lib/db";

/** Rota pública das demonstrações publicadas (publicação interna). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return new Response("Não encontrado", { status: 404 });
  const site = await prisma.demoSite.findUnique({ where: { slug }, select: { html: true, status: true, publisher: true } });
  if (!site) return new Response("Não encontrado", { status: 404 });
  if (site.status !== "PUBLISHED" || site.publisher !== "internal" || !site.html) {
    return new Response("<!doctype html><meta charset=utf-8><title>Demonstração removida</title><p style='font-family:sans-serif;padding:2rem'>Esta demonstração não está mais disponível.</p>", {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }
  return new Response(site.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
