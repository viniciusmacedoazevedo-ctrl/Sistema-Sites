import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser } from "./auth";

type Handler<C> = (req: Request, ctx: C & { user: string }) => Promise<Response | unknown>;

/** Envolve rotas de API: exige sessão válida (defesa em profundidade) e padroniza erros. */
export function api<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>) {
  return async (req: Request, ctx: C) => {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    try {
      const result = await handler(req, { ...ctx, user });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: "Dados inválidos", issues: e.issues }, { status: 400 });
      console.error("[api]", e);
      return NextResponse.json({ error: (e as Error).message ?? "Erro interno" }, { status: 500 });
    }
  };
}

export async function json(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
