import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { contactHash } from "@/lib/normalize";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import { decodePasswordHash, isLoginThrottled, registerLoginFailure, verifyCredentials } from "@/server/auth";
import { deleteCompany, optOutCompany } from "@/server/data-ops";
import { optOutToken, verifyOptOutToken } from "@/server/messaging/tokens";
import { validSignature } from "@/server/messaging/webhook";
import { resetDb, useDeps } from "./helpers";

describe("autenticação", () => {
  beforeEach(resetDb);

  it("valida usuário e senha (hash puro ou base64)", async () => {
    const hash = bcrypt.hashSync("senha-super-forte", 4);
    process.env.ADMIN_USERNAME = "vinicius";
    process.env.ADMIN_PASSWORD_HASH = Buffer.from(hash).toString("base64");
    expect(decodePasswordHash(process.env.ADMIN_PASSWORD_HASH)).toBe(hash);
    expect(await verifyCredentials("vinicius", "senha-super-forte")).toBe(true);
    expect(await verifyCredentials("vinicius", "errada")).toBe(false);
    expect(await verifyCredentials("outro", "senha-super-forte")).toBe(false);
    process.env.ADMIN_PASSWORD_HASH = hash;
    expect(await verifyCredentials("vinicius", "senha-super-forte")).toBe(true);
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(await verifyCredentials("vinicius", "senha-super-forte")).toBe(false);
  });

  it("sessão assinada não pode ser forjada", async () => {
    const token = await createSessionToken("vinicius");
    expect(await verifySessionToken(token)).toBe("vinicius");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySessionToken("abc.def.ghi")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("bloqueia força bruta após várias tentativas", async () => {
    for (let i = 0; i < 8; i++) await registerLoginFailure("1.2.3.4");
    expect(await isLoginThrottled("1.2.3.4")).toBe(true);
    expect(await isLoginThrottled("5.6.7.8")).toBe(false);
  });
});

describe("privacidade e exclusão de dados", () => {
  beforeEach(async () => {
    await resetDb();
    useDeps({});
  });

  async function company() {
    const c = await prisma.company.create({ data: { source: "t", sourceId: "1", name: "Empresa X", normalizedName: "empresa x", phoneNormalized: "+5519987654321", phoneIsMobile: true, email: "contato@x.com.br" } });
    await prisma.message.create({ data: { companyId: c.id, channel: "WHATSAPP", body: "oi", idempotencyKey: `${c.id}:initial`, status: "DRAFT" } });
    await prisma.contactEvent.create({ data: { companyId: c.id, type: "NOTA" } });
    await prisma.demoSite.create({ data: { companyId: c.id, slug: "empresa-x-1", status: "PUBLISHED", publisher: "internal", html: "<html></html>" } });
    return c;
  }

  it("exclusão remove todos os dados e mantém apenas hash na supressão", async () => {
    const c = await company();
    await deleteCompany(c.id, { keepSuppressed: true, actor: "teste" });
    expect(await prisma.company.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
    expect(await prisma.demoSite.count()).toBe(0);
    expect(await prisma.contactEvent.count()).toBe(0);
    const s = await prisma.suppression.findMany();
    expect(s.map((x) => x.valueHash).sort()).toEqual([contactHash("+5519987654321"), contactHash("contato@x.com.br")].sort());
    expect(JSON.stringify(s)).not.toContain("987654321");
    expect(await prisma.auditLog.count({ where: { action: "empresa.excluida" } })).toBe(1);
  });

  it("descadastro bloqueia contato, cancela mensagens e despublica a demonstração", async () => {
    const c = await company();
    const token = optOutToken(c.id);
    expect(verifyOptOutToken(token)).toBe(c.id);
    expect(verifyOptOutToken(`${c.id}.assinaturafalsa`)).toBeNull();
    await optOutCompany(verifyOptOutToken(token)!, "teste");
    const after = await prisma.company.findUniqueOrThrow({ where: { id: c.id }, include: { site: true, messages: true } });
    expect(after.doNotContact).toBe(true);
    expect(after.crmStatus).toBe("NAO_CONTATAR");
    expect(after.site?.status).toBe("UNPUBLISHED");
    expect(after.messages[0].status).toBe("CANCELED");
  });
});

describe("webhook do WhatsApp", () => {
  it("aceita somente payloads assinados com o App Secret", () => {
    const body = '{"entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "segredo").update(body).digest("hex");
    expect(validSignature(body, sig, "segredo")).toBe(true);
    expect(validSignature(body, sig, "outro")).toBe(false);
    expect(validSignature(body + " ", sig, "segredo")).toBe(false);
    expect(validSignature(body, null, "segredo")).toBe(false);
    expect(validSignature(body, sig, undefined)).toBe(false);
  });
});
