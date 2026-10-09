import { NextResponse } from "next/server";
import { z } from "zod";
import { api, json } from "@/server/api";
import { cancelMessage, confirmNotSent, markManuallySent, releaseMessage, updateMessageBody } from "@/server/message-ops";

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = api<Ctx>(async (req, { params, user }) => {
  const { id, action } = await params;
  switch (action) {
    case "release":
      return releaseMessage(id, user);
    case "mark-sent":
      await markManuallySent(id, user);
      return { ok: true };
    case "not-sent":
      await confirmNotSent(id, user);
      return { ok: true };
    case "cancel":
      await cancelMessage(id, user);
      return { ok: true };
    case "edit": {
      const { body } = z.object({ body: z.string().min(20).max(2000) }).parse(await json(req));
      await updateMessageBody(id, body, user);
      return { ok: true };
    }
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }
});
