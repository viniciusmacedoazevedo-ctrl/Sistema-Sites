import { prisma } from "@/lib/db";
import { verifyOptOutToken } from "@/server/messaging/tokens";
import { OptOutButton } from "./button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Descadastro", robots: { index: false } };

/** Página pública: a empresa pode pedir para não ser mais contatada e remover a demonstração. */
export default async function OptOutPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const companyId = t ? verifyOptOutToken(t) : null;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, doNotContact: true } }) : null;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-slate-800">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h1 className="text-xl font-bold">Não receber mais contatos</h1>
        {!company ? (
          <p className="mt-3 text-sm text-slate-600">Link inválido ou já utilizado. Se precisar, responda diretamente a mensagem recebida pedindo a remoção.</p>
        ) : company.doNotContact ? (
          <p className="mt-3 text-sm text-slate-600">Pronto: <strong>{company.name}</strong> não receberá novos contatos e a demonstração foi removida.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Ao confirmar, <strong>{company.name}</strong> não receberá novas mensagens e a demonstração de site criada como proposta será retirada do ar.
            </p>
            <OptOutButton token={t!} />
          </>
        )}
      </div>
    </main>
  );
}
