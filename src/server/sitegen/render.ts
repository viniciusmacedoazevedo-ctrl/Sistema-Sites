import { resolveNiche } from "@/lib/niches";
import { escapeHtml as e, formatBrPhone, shortHash } from "@/lib/normalize";
import type { SiteContent } from "../content/site-content";
import { icon } from "./icons";

export const TEMPLATES = ["aurora", "split", "bold"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

export interface RenderInput {
  companyId: string;
  name: string;
  niche: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phoneE164: string | null;
  phoneIsMobile: boolean;
  openingHours: string[] | null;
  mapsUrl: string | null;
  attribution: string | null;
  content: SiteContent;
  whatsappButton: boolean;
  senderName: string;
  senderCompany: string;
  removalUrl: string | null;
  template?: TemplateId;
}

export const DISCLAIMER_MARKER = "data-demo-disclaimer";

export function chooseTemplate(companyId: string, niche: string | null): TemplateId {
  return TEMPLATES[parseInt(shortHash(`${companyId}|${niche}`, 6), 16) % TEMPLATES.length];
}

function initials(name: string): string {
  const words = name.replace(/\[.*?\]/g, "").trim().split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2)).toUpperCase();
}

export function renderSite(input: RenderInput): { html: string; template: TemplateId } {
  const niche = resolveNiche(input.niche ?? "servicos-locais");
  const template = input.template ?? chooseTemplate(input.companyId, input.niche);
  const palette = niche.palettes[parseInt(shortHash(input.companyId, 4), 16) % niche.palettes.length];
  const c = input.content;
  const name = e(input.name);
  const phoneDigits = input.phoneE164?.replace(/\D/g, "") ?? null;
  const phonePretty = input.phoneE164 ? e(formatBrPhone(input.phoneE164)) : null;
  const waHref =
    input.whatsappButton && input.phoneIsMobile && phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Olá! Gostaria de mais informações sobre a ${input.name}.`)}`
      : null;
  const primaryHref = waHref ?? (phoneDigits ? `tel:+${phoneDigits}` : "#contato");
  const primaryLabel = waHref ? "Chamar no WhatsApp" : phoneDigits ? "Ligar agora" : e(c.ctaText);
  const sender = [input.senderName, input.senderCompany].filter(Boolean).map(e).join(" · ");
  const mono = e(initials(input.name));

  const services = c.services
    .map(
      (s) => `<article class="card">
        <div class="ic">${icon(niche.icon)}</div>
        <h3>${e(s.name)}</h3>
        <p>${e(s.description)}</p>
      </article>`,
    )
    .join("");

  const benefits = c.benefits
    .map((b) => `<li><span class="tick">${icon("check", 18)}</span><div><strong>${e(b.title)}</strong><p>${e(b.description)}</p></div></li>`)
    .join("");

  const gallery = niche.gallery
    ? `<section class="section" id="galeria" aria-labelledby="galeria-t">
      <div class="wrap">
        <h2 id="galeria-t">Galeria</h2>
        <p class="lead">Espaço reservado para fotos reais da ${name} (a serem enviadas pela empresa).</p>
        <div class="gallery">${[1, 2, 3, 4]
          .map((i) => `<figure class="ph ph${i}" role="img" aria-label="Espaço para foto ${i} — a confirmar">${icon("image", 32)}<figcaption>Foto a confirmar</figcaption></figure>`)
          .join("")}</div>
      </div>
    </section>`
    : "";

  const hours = input.openingHours?.length
    ? `<div class="info"><div class="ic">${icon("clock")}</div><div><h3>Horário de funcionamento</h3><ul class="hours">${input.openingHours.map((h) => `<li>${e(h)}</li>`).join("")}</ul><small>Conforme informado publicamente; sujeito a confirmação.</small></div></div>`
    : `<div class="info"><div class="ic">${icon("clock")}</div><div><h3>Horário de funcionamento</h3><p class="tbc">A confirmar com a empresa.</p></div></div>`;

  const address = input.address
    ? `<div class="info"><div class="ic">${icon("pin")}</div><div><h3>Endereço</h3><p>${e(input.address)}</p>${
        input.mapsUrl ? `<a class="link" href="${e(input.mapsUrl)}" target="_blank" rel="noopener noreferrer">Ver no mapa</a>` : ""
      }</div></div>`
    : `<div class="info"><div class="ic">${icon("pin")}</div><div><h3>Endereço</h3><p class="tbc">A confirmar com a empresa.</p></div></div>`;

  const phoneBlock = phonePretty
    ? `<div class="info"><div class="ic">${icon("phone")}</div><div><h3>Telefone</h3><p><a class="link" href="tel:+${phoneDigits}">${phonePretty}</a></p></div></div>`
    : `<div class="info"><div class="ic">${icon("phone")}</div><div><h3>Telefone</h3><p class="tbc">A confirmar com a empresa.</p></div></div>`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.name,
    ...(input.address ? { address: input.address } : {}),
    ...(input.phoneE164 ? { telephone: input.phoneE164 } : {}),
    ...(input.city ? { areaServed: input.city } : {}),
  }).replace(/</g, "\\u003c");

  const heroArt = `<div class="art" aria-hidden="true"><div class="blob"></div><div class="badge">${icon(niche.icon, 56)}</div></div>`;

  const hero =
    template === "split"
      ? `<section class="hero split"><div class="wrap grid2"><div><p class="eyebrow">${e(niche.label)}${input.city ? ` · ${e(input.city)}` : ""}</p><h1>${e(c.heroTitle)}</h1><p class="sub">${e(c.heroSubtitle)}</p><div class="actions"><a class="btn" href="${e(primaryHref)}"${waHref ? ' target="_blank" rel="noopener noreferrer"' : ""}>${primaryLabel}</a><a class="btn ghost" href="#servicos">Ver serviços</a></div></div>${heroArt}</div></section>`
      : template === "bold"
        ? `<section class="hero bold"><div class="wrap"><p class="eyebrow">${e(niche.label)}${input.city ? ` · ${e(input.city)}` : ""}</p><h1>${e(c.heroTitle)}</h1><p class="sub">${e(c.heroSubtitle)}</p><div class="actions"><a class="btn" href="${e(primaryHref)}"${waHref ? ' target="_blank" rel="noopener noreferrer"' : ""}>${primaryLabel}</a><a class="btn ghost" href="#contato">${e(c.ctaText)}</a></div></div></section>`
        : `<section class="hero aurora"><div class="wrap center"><div class="badge sm">${icon(niche.icon, 36)}</div><p class="eyebrow">${e(niche.label)}${input.city ? ` · ${e(input.city)}` : ""}</p><h1>${e(c.heroTitle)}</h1><p class="sub">${e(c.heroSubtitle)}</p><div class="actions center"><a class="btn" href="${e(primaryHref)}"${waHref ? ' target="_blank" rel="noopener noreferrer"' : ""}>${primaryLabel}</a><a class="btn ghost" href="#sobre">Conheça</a></div></div></section>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(c.seoTitle)}</title>
<meta name="description" content="${e(c.seoDescription)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${e(c.seoTitle)}">
<meta property="og:description" content="${e(c.seoDescription)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${palette.primary}">
<script type="application/ld+json">${jsonLd}</script>
<style>
:root{--p:${palette.primary};--a:${palette.accent};--d:${palette.dark};--l:${palette.light};--t:#1f2937;--m:#6b7280;--r:16px}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;color:var(--t);background:#fff;line-height:1.6;-webkit-font-smoothing:antialiased}
img,svg{max-width:100%}
a{color:inherit}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 20px}
.demo-bar{background:#111827;color:#e5e7eb;font-size:12.5px;text-align:center;padding:7px 16px}
.demo-bar a{color:#93c5fd}
header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid #eef0f3}
.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;height:68px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;min-width:0}
.brand span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mono{display:grid;place-items:center;width:40px;height:40px;flex:none;border-radius:12px;background:linear-gradient(135deg,var(--p),var(--a));color:#fff;font-size:15px;letter-spacing:.5px}
.links{display:flex;gap:22px;font-size:15px}
.links a{text-decoration:none;color:#374151}
.links a:hover{color:var(--p)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 22px;border-radius:999px;background:var(--p);color:#fff;font-weight:600;text-decoration:none;border:2px solid var(--p);transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px -10px var(--p)}
.btn.ghost{background:transparent;color:var(--p)}
.btn.sm{padding:9px 16px;font-size:14px}
.hero{padding:84px 0 76px;position:relative;overflow:hidden}
.hero h1{font-size:clamp(32px,5.2vw,56px);line-height:1.08;letter-spacing:-.02em;margin:10px 0 16px}
.hero .sub{font-size:clamp(17px,2vw,20px);color:var(--m);max-width:640px}
.eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--p)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.center{text-align:center}.center .sub{margin:0 auto}.actions.center{justify-content:center}
.aurora{background:radial-gradient(1200px 500px at 50% -10%,var(--l),#fff 60%)}
.aurora::before{content:"";position:absolute;inset:auto -20% -60% -20%;height:420px;background:radial-gradient(closest-side,color-mix(in srgb,var(--a) 35%,transparent),transparent);filter:blur(10px);z-index:-1}
.bold{background:var(--d);color:#fff}
.bold .sub{color:#cbd5e1}.bold .eyebrow{color:var(--a)}
.bold .btn{background:var(--a);border-color:var(--a);color:var(--d)}.bold .btn.ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.4)}
.bold::after{content:"";position:absolute;right:-120px;top:-120px;width:420px;height:420px;border-radius:50%;background:radial-gradient(closest-side,var(--p),transparent);opacity:.55}
.split{background:linear-gradient(180deg,var(--l),#fff)}
.grid2{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}
.art{position:relative;height:340px}
.blob{position:absolute;inset:0;border-radius:42% 58% 63% 37%/42% 45% 55% 58%;background:linear-gradient(135deg,var(--p),var(--a));opacity:.9}
.badge{position:absolute;inset:0;margin:auto;width:120px;height:120px;border-radius:32px;display:grid;place-items:center;background:#fff;color:var(--p);box-shadow:0 20px 50px -20px rgba(0,0,0,.35)}
.badge.sm{position:static;margin:0 auto 12px;width:72px;height:72px;border-radius:22px}
.section{padding:76px 0}
.section.alt{background:var(--l)}
.section h2{font-size:clamp(26px,3.4vw,38px);letter-spacing:-.01em;line-height:1.15}
.lead{color:var(--m);margin-top:8px;max-width:680px}
.tbc-note{display:inline-block;margin-top:10px;font-size:13px;color:#92400e;background:#fef3c7;border-radius:8px;padding:4px 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;margin-top:32px}
.card{background:#fff;border:1px solid #eceff3;border-radius:var(--r);padding:24px;transition:box-shadow .2s,transform .2s}
.card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -24px rgba(0,0,0,.35)}
.card h3{font-size:18px;margin:14px 0 6px}
.card p{color:var(--m);font-size:15px}
.ic{display:grid;place-items:center;width:46px;height:46px;flex:none;border-radius:14px;background:var(--l);color:var(--p)}
.benefits{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:28px}
.benefits li{display:flex;gap:14px;align-items:flex-start;background:#fff;border-radius:var(--r);padding:20px;border:1px solid #eceff3}
.benefits p{color:var(--m);font-size:15px}
.tick{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:50%;background:var(--p);color:#fff}
.about{display:grid;grid-template-columns:.8fr 1.2fr;gap:40px;align-items:center}
.about .panel{border-radius:24px;min-height:260px;background:linear-gradient(135deg,var(--d),var(--p));color:#fff;display:grid;place-items:center;font-size:64px;font-weight:800;letter-spacing:2px}
.about p{color:#374151;font-size:17px;margin-top:14px}
.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:28px}
.ph{aspect-ratio:4/3;border-radius:14px;display:grid;place-items:center;align-content:center;gap:6px;color:#fff;font-size:13px;background:linear-gradient(135deg,var(--p),var(--a))}
.ph2{background:linear-gradient(135deg,var(--d),var(--p))}.ph3{background:linear-gradient(135deg,var(--a),var(--p))}.ph4{background:linear-gradient(135deg,var(--p),var(--d))}
.contact{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:28px}
.info{display:flex;gap:14px;background:#fff;border:1px solid #eceff3;border-radius:var(--r);padding:20px}
.info h3{font-size:16px;margin-bottom:4px}
.info small{color:var(--m);font-size:12px}
.hours{list-style:none;font-size:14px;color:#374151}
.tbc{color:#92400e}
.link{color:var(--p);font-weight:600}
.cta{margin-top:40px;border-radius:24px;padding:40px;background:linear-gradient(135deg,var(--d),var(--p));color:#fff;display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between}
.cta h3{font-size:clamp(22px,3vw,30px)}
.cta .btn{background:#fff;color:var(--d);border-color:#fff}
footer{background:#0b0f19;color:#9ca3af;padding:40px 0;font-size:14px}
footer .row{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between}
footer strong{color:#fff}
footer a{color:#cbd5e1}
.fab{position:fixed;right:18px;bottom:18px;z-index:20;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}
@media (max-width:860px){.links{display:none}.grid2,.about{grid-template-columns:1fr}.art{height:220px}.gallery{grid-template-columns:repeat(2,1fr)}.hero{padding:56px 0}.section{padding:56px 0}.cta{padding:28px}}
@media (max-width:420px){.nav .btn.sm{display:none}.btn{width:100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="demo-bar" ${DISCLAIMER_MARKER}>Proposta demonstrativa <strong>não oficial</strong>${sender ? `, criada por ${sender},` : ""} para apresentar uma ideia de site. Não é o site oficial de ${name} nem foi aprovado pela empresa.${
    input.removalUrl ? ` <a href="${e(input.removalUrl)}" rel="nofollow">Solicitar remoção</a>` : ""
  }</div>
<header><div class="wrap nav"><a class="brand" href="#inicio"><span class="mono">${mono}</span><span>${name}</span></a><nav class="links" aria-label="Principal"><a href="#servicos">Serviços</a><a href="#sobre">Sobre</a>${niche.gallery ? '<a href="#galeria">Galeria</a>' : ""}<a href="#contato">Contato</a></nav><a class="btn sm" href="${e(primaryHref)}"${waHref ? ' target="_blank" rel="noopener noreferrer"' : ""}>${e(c.ctaText)}</a></div></header>
<main id="inicio">
${hero}
<section class="section" id="servicos" aria-labelledby="servicos-t"><div class="wrap"><h2 id="servicos-t">Serviços</h2><p class="lead">Principais serviços do segmento.</p><span class="tbc-note">Lista a confirmar com a empresa</span><div class="cards">${services}</div></div></section>
<section class="section alt" id="beneficios" aria-labelledby="beneficios-t"><div class="wrap"><h2 id="beneficios-t">Por que escolher a ${name}</h2><ul class="benefits">${benefits}</ul></div></section>
<section class="section" id="sobre" aria-labelledby="sobre-t"><div class="wrap about"><div class="panel" aria-hidden="true">${mono}</div><div><p class="eyebrow">Sobre</p><h2 id="sobre-t">${name}</h2><p>${e(c.about)}</p></div></div></section>
${gallery}
<section class="section alt" id="contato" aria-labelledby="contato-t"><div class="wrap"><h2 id="contato-t">Contato e localização</h2><div class="contact">${phoneBlock}${address}${hours}</div>
<div class="cta"><h3>${e(c.ctaText)} com a ${name}</h3><a class="btn" href="${e(primaryHref)}"${waHref ? ' target="_blank" rel="noopener noreferrer"' : ""}>${primaryLabel}</a></div></div></section>
</main>
<footer><div class="wrap row"><div><strong>${name}</strong><br>${input.city ? `${e(input.city)}${input.state ? ` · ${e(input.state)}` : ""}` : ""}</div><div>Demonstração não oficial${sender ? ` · ${sender}` : ""}${input.attribution ? ` · ${e(input.attribution)}` : ""}</div></div></footer>
${waHref ? `<a class="fab" href="${e(waHref)}" target="_blank" rel="noopener noreferrer" aria-label="Conversar no WhatsApp">${icon("chat", 26)}</a>` : ""}
</body>
</html>`;
  return { html, template };
}
