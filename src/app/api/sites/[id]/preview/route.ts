import { prisma } from "@/lib/db";
import { api } from "@/server/api";

type Ctx = { params: Promise<{ id: string }> };

/** Prévia privada (inclui sites simulados e não publicados). */
export const GET = api<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const site = await prisma.demoSite.findUnique({ where: { id }, select: { html: true } });
  if (!site?.html) return new Response("Prévia indisponível", { status: 404 });
  return new Response(site.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; frame-ancestors 'self'; sandbox allow-popups",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
});
