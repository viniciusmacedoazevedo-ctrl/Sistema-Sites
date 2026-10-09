import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { deleteSite, publishSiteNow, rebuildSite, unpublishSite } from "@/server/data-ops";

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = api<Ctx>(async (_req, { params, user }) => {
  const { id, action } = await params;
  switch (action) {
    case "unpublish":
      await unpublishSite(id, "manual", user);
      return { ok: true };
    case "publish":
      return { url: await publishSiteNow(id, user) };
    case "rebuild":
      return { report: await rebuildSite(id, user) };
    case "delete":
      await deleteSite(id, user);
      return { ok: true };
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }
});
