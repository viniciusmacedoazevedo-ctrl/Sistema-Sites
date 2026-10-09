import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Verificação responsável de presença digital:
 *  - no máximo 1 requisição à página inicial (+ robots.txt), com timeout curto;
 *  - User-Agent identificado; respeita "Disallow: /" para o nosso agente ou "*";
 *  - bloqueia IPs privados (proteção contra SSRF);
 *  - nunca conclui "não tem site" com certeza: informa "não identificado nas fontes consultadas".
 */

export type PresenceStatus = "FUNCTIONAL" | "PROBLEMS" | "NOT_FOUND" | "INCONCLUSIVE";

export interface PresenceResult {
  status: PresenceStatus;
  summary: string;
  checkedUrl?: string;
  finalUrl?: string;
  httpStatus?: number;
  responseMs?: number;
  https?: boolean;
  socialOnly?: boolean;
  issues: string[];
  checkedAt: string;
}

const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "linktr.ee",
  "wa.me",
  "api.whatsapp.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "ifood.com.br",
  "beacons.ai",
  "bio.link",
];

const USER_AGENT = "SiteHunterBot/1.0 (verificacao de presenca digital; contato pelo site do operador)";

export function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:127.") || v6.startsWith("::ffff:10.") || v6.startsWith("::ffff:192.168.");
}

export async function assertPublicHost(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protocolo não permitido");
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Host interno não permitido");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) throw new Error("Endereço privado não permitido");
}

export interface PresenceDeps {
  fetchImpl?: typeof fetch;
  assertHost?: (url: URL) => Promise<void>;
  timeoutMs?: number;
}

async function robotsAllows(base: URL, deps: Required<PresenceDeps>): Promise<boolean> {
  try {
    const res = await deps.fetchImpl(new URL("/robots.txt", base), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok) return true;
    const text = (await res.text()).slice(0, 50_000);
    let applies = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.split("#")[0].trim();
      const [k, ...rest] = line.split(":");
      const key = k?.toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") applies = value === "*" || value.toLowerCase().includes("sitehunterbot");
      else if (applies && key === "disallow" && value === "/") return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function checkPresence(website: string | null | undefined, depsIn: PresenceDeps = {}): Promise<PresenceResult> {
  const deps: Required<PresenceDeps> = {
    fetchImpl: depsIn.fetchImpl ?? fetch,
    assertHost: depsIn.assertHost ?? assertPublicHost,
    timeoutMs: depsIn.timeoutMs ?? 10_000,
  };
  const checkedAt = new Date().toISOString();

  if (!website) {
    return {
      status: "NOT_FOUND",
      summary: "Nenhum site informado nas fontes consultadas. Isso não garante que a empresa não tenha site.",
      issues: [],
      checkedAt,
    };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return { status: "INCONCLUSIVE", summary: "Endereço de site informado é inválido.", checkedUrl: website, issues: ["URL inválida"], checkedAt };
  }

  if (isSocialUrl(url.href)) {
    return {
      status: "NOT_FOUND",
      summary: "A fonte informa apenas uma rede social/link de perfil, não um site próprio.",
      checkedUrl: url.href,
      socialOnly: true,
      issues: ["Presença apenas em rede social"],
      checkedAt,
    };
  }

  try {
    await deps.assertHost(url);
  } catch (e) {
    return { status: "INCONCLUSIVE", summary: `Não foi possível verificar com segurança: ${(e as Error).message}.`, checkedUrl: url.href, issues: [], checkedAt };
  }

  if (!(await robotsAllows(url, deps))) {
    return { status: "INCONCLUSIVE", summary: "O site pede para não ser acessado por robôs (robots.txt). Verificação não realizada.", checkedUrl: url.href, issues: [], checkedAt };
  }

  const started = Date.now();
  let res: Response;
  let finalHref = url.href;
  try {
    // Redirecionamentos seguidos manualmente para validar cada destino (anti-SSRF).
    let current = url;
    for (let hop = 0; ; hop++) {
      res = await deps.fetchImpl(current, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= 5) throw new Error("Redirecionamentos demais");
        current = new URL(location, current);
        if (isSocialUrl(current.href)) {
          return { status: "NOT_FOUND", summary: "O endereço redireciona para uma rede social.", checkedUrl: url.href, finalUrl: current.href, socialOnly: true, issues: ["Presença apenas em rede social"], checkedAt };
        }
        await deps.assertHost(current);
        continue;
      }
      finalHref = current.href;
      break;
    }
  } catch (e) {
    const msg = (e as Error).message ?? "erro";
    const isTimeout = /timeout|aborted/i.test(msg);
    return {
      status: "PROBLEMS",
      summary: isTimeout ? "O site informado não respondeu dentro do tempo limite." : "O site informado não pôde ser acessado (erro de conexão/DNS/certificado).",
      checkedUrl: url.href,
      issues: [isTimeout ? "Tempo de resposta excedido" : `Falha de acesso: ${msg.slice(0, 120)}`],
      checkedAt,
    };
  }
  const responseMs = Date.now() - started;
  const finalUrl = finalHref;
  const issues: string[] = [];
  const https = finalUrl.startsWith("https://");

  if (res.status >= 500) issues.push(`Erro do servidor (HTTP ${res.status})`);
  else if (res.status === 404 || res.status === 410) issues.push(`Página não encontrada (HTTP ${res.status})`);
  else if (res.status === 401 || res.status === 403) {
    return { status: "INCONCLUSIVE", summary: `O site bloqueou a verificação (HTTP ${res.status}).`, checkedUrl: url.href, finalUrl, httpStatus: res.status, responseMs, https, issues: [], checkedAt };
  } else if (res.status >= 400) issues.push(`Erro HTTP ${res.status}`);

  if (res.ok) {
    const html = (await res.text()).slice(0, 400_000);
    if (!https) issues.push("Sem HTTPS (conexão não segura)");
    if (responseMs > 5000) issues.push(`Carregamento lento (${(responseMs / 1000).toFixed(1)}s)`);
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push("Sem meta viewport (provavelmente não adaptado a celular)");
    if (!/<title>[^<]{3,}<\/title>/i.test(html)) issues.push("Sem título de página");
    if (html.replace(/<[^>]+>/g, "").trim().length < 200) issues.push("Pouco conteúdo na página inicial");
    if (/(domain|domínio)\s+(is\s+)?(for sale|à venda|parked|estacionado)|godaddy\.com\/park|sedoparking/i.test(html)) issues.push("Parece domínio estacionado/à venda");
    if (isSocialUrl(finalUrl)) {
      return { status: "NOT_FOUND", summary: "O endereço redireciona para uma rede social.", checkedUrl: url.href, finalUrl, httpStatus: res.status, responseMs, https, socialOnly: true, issues: ["Presença apenas em rede social"], checkedAt };
    }
  }

  const status: PresenceStatus = issues.length === 0 ? "FUNCTIONAL" : "PROBLEMS";
  return {
    status,
    summary: status === "FUNCTIONAL" ? "Site acessível, sem problemas básicos detectados na página inicial." : `Site identificado com possíveis problemas: ${issues.join("; ")}.`,
    checkedUrl: url.href,
    finalUrl,
    httpStatus: res.status,
    responseMs,
    https,
    issues,
    checkedAt,
  };
}

/** Versão sem rede para o modo simulação (baseada no endereço fictício). */
export function simulatePresence(website: string | null | undefined): PresenceResult {
  const checkedAt = new Date().toISOString();
  if (!website) return { status: "NOT_FOUND", summary: "[Simulação] Nenhum site informado.", issues: [], checkedAt };
  if (isSocialUrl(website)) return { status: "NOT_FOUND", summary: "[Simulação] Apenas rede social.", socialOnly: true, issues: ["Presença apenas em rede social"], checkedUrl: website, checkedAt };
  if (website.includes("quebrado")) return { status: "PROBLEMS", summary: "[Simulação] Site com problemas.", issues: ["Sem HTTPS (conexão não segura)", "Sem meta viewport (provavelmente não adaptado a celular)"], checkedUrl: website, https: false, checkedAt };
  return { status: "FUNCTIONAL", summary: "[Simulação] Site funcional.", issues: [], checkedUrl: website, https: true, checkedAt };
}
