import { parse } from "node-html-parser";
import { DISCLAIMER_MARKER } from "./render";

export interface ValidationIssue {
  level: "error" | "warning";
  check: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  checks: string[];
  sizeBytes: number;
  browser?: { ran: boolean; mobileOverflow?: boolean; consoleErrors?: string[]; note?: string };
}

const SECRET_ENV_VARS = [
  "GOOGLE_PLACES_API_KEY",
  "ANTHROPIC_API_KEY",
  "VERCEL_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "SMTP_PASSWORD",
  "AUTH_SECRET",
  "DATABASE_URL",
  "ADMIN_PASSWORD_HASH",
];

/** Validação estática: estrutura, SEO básico, links, responsividade declarada, segredos e marcações proibidas. */
export function validateHtml(html: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  const checks: string[] = [];
  const err = (check: string, message: string) => issues.push({ level: "error", check, message });
  const warn = (check: string, message: string) => issues.push({ level: "warning", check, message });
  const sizeBytes = Buffer.byteLength(html, "utf8");

  let root;
  try {
    root = parse(html, { comment: false });
  } catch (e) {
    return { ok: false, issues: [{ level: "error", check: "parse", message: `HTML inválido: ${(e as Error).message}` }], checks: ["parse"], sizeBytes };
  }

  checks.push("estrutura");
  if (!/^<!doctype html>/i.test(html.trim())) err("estrutura", "Falta <!doctype html>.");
  if (root.querySelector("html")?.getAttribute("lang") !== "pt-BR") warn("estrutura", "Atributo lang diferente de pt-BR.");
  if (!root.querySelector("meta[charset]")) err("estrutura", "Falta meta charset.");

  checks.push("seo");
  const title = root.querySelector("title")?.text.trim() ?? "";
  if (title.length < 10) err("seo", "Título ausente ou muito curto.");
  if (title.length > 70) warn("seo", "Título com mais de 70 caracteres.");
  const desc = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  if (desc.length < 50) err("seo", "Meta description ausente ou curta.");
  const h1s = root.querySelectorAll("h1");
  if (h1s.length !== 1) err("seo", `Esperado exatamente 1 <h1>, encontrado ${h1s.length}.`);

  checks.push("responsividade");
  const viewport = root.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
  if (!viewport.includes("width=device-width")) err("responsividade", "Meta viewport ausente.");
  if (!/@media\s*\(max-width/i.test(html)) warn("responsividade", "Nenhuma media query para telas pequenas.");

  checks.push("demonstracao");
  if (!root.querySelector(`[${DISCLAIMER_MARKER}]`)) err("demonstracao", "Aviso de proposta não oficial ausente.");
  if (!/noindex/i.test(root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "")) err("demonstracao", "Demonstração deve ter meta robots noindex.");

  checks.push("links");
  const ids = new Set(root.querySelectorAll("[id]").map((n) => n.getAttribute("id")));
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    if (!href) {
      err("links", `Link sem href: "${a.text.trim().slice(0, 40)}"`);
      continue;
    }
    if (href.startsWith("#")) {
      if (href.length > 1 && !ids.has(href.slice(1))) err("links", `Âncora inexistente: ${href}`);
    } else if (href.startsWith("tel:")) {
      if (!/^tel:\+?\d{8,15}$/.test(href)) err("links", `Telefone inválido: ${href}`);
    } else if (href.startsWith("mailto:")) {
      if (!/^mailto:[^@\s]+@[^@\s]+$/.test(href.split("?")[0])) err("links", `E-mail inválido: ${href}`);
    } else {
      try {
        const u = new URL(href);
        if (!["https:", "http:"].includes(u.protocol)) err("links", `Protocolo não permitido: ${href}`);
        if (u.protocol === "http:" && !u.hostname.startsWith("localhost")) warn("links", `Link sem HTTPS: ${href}`);
        if (a.getAttribute("target") === "_blank" && !(a.getAttribute("rel") ?? "").includes("noopener")) warn("links", `Link externo sem rel=noopener: ${href}`);
      } catch {
        err("links", `URL inválida: ${href}`);
      }
    }
  }

  checks.push("acessibilidade");
  for (const img of root.querySelectorAll("img")) if (!img.getAttribute("alt")) warn("acessibilidade", "Imagem sem texto alternativo.");

  checks.push("conteudo");
  const text = root.querySelector("body")?.text ?? "";
  if (/\bundefined\b|\bnull\b|\[object Object\]|\{\{|\}\}|NaN/.test(text)) err("conteudo", "Texto com valores não preenchidos (undefined/null/{{ }}).");
  if (/lorem ipsum/i.test(text)) err("conteudo", "Texto de preenchimento (lorem ipsum).");

  checks.push("segredos");
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8 && html.includes(value)) err("segredos", `O HTML contém o valor de ${name}!`);
  }
  if (/sk-ant-|AIza[0-9A-Za-z_-]{20,}|EAA[A-Za-z0-9]{20,}/.test(html)) err("segredos", "Possível chave de API no HTML.");

  checks.push("tamanho");
  if (sizeBytes > 300_000) err("tamanho", `HTML muito grande (${Math.round(sizeBytes / 1024)} KB).`);

  checks.push("scripts");
  for (const s of root.querySelectorAll("script")) {
    if (s.getAttribute("type") !== "application/ld+json") err("scripts", "Scripts executáveis não são permitidos nas demonstrações.");
  }

  return { ok: !issues.some((i) => i.level === "error"), issues, checks, sizeBytes };
}

/**
 * Teste opcional em navegador real (Chromium headless): renderiza em 375px e 1280px,
 * verifica rolagem horizontal e erros de console. Se o navegador não estiver disponível,
 * o teste é marcado como não executado (não falha a validação).
 */
export async function browserCheck(html: string): Promise<NonNullable<ValidationReport["browser"]>> {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return { ran: false, note: "playwright-core não instalado" };
  }
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
  } catch (e) {
    return { ran: false, note: `Navegador indisponível: ${(e as Error).message.split("\n")[0].slice(0, 160)}` };
  }
  try {
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 375, height: 800 }, javaScriptEnabled: false });
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    // Bloqueia qualquer requisição externa durante o teste.
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.setViewportSize({ width: 1280, height: 800 });
    await context.close();
    return { ran: true, mobileOverflow, consoleErrors };
  } finally {
    await browser.close();
  }
}

export async function validateSite(html: string, opts: { browser: boolean }): Promise<ValidationReport> {
  const report = validateHtml(html);
  if (opts.browser) {
    const b = await browserCheck(html);
    report.browser = b;
    report.checks.push("navegador");
    if (b.ran && b.mobileOverflow) report.issues.push({ level: "error", check: "navegador", message: "Rolagem horizontal em tela de celular (375px)." });
    if (b.ran && b.consoleErrors?.length) report.issues.push({ level: "warning", check: "navegador", message: `Erros no console: ${b.consoleErrors.slice(0, 3).join(" | ")}` });
    report.ok = !report.issues.some((i) => i.level === "error");
  }
  return report;
}
