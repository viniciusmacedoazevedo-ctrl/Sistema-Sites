/** Acesso centralizado às variáveis de ambiente (somente no servidor). */
function v(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const env = {
  get publicBaseUrl() {
    return v("PUBLIC_BASE_URL")?.replace(/\/+$/, "");
  },
  get googlePlacesKey() {
    return v("GOOGLE_PLACES_API_KEY");
  },
  get anthropicKey() {
    return v("ANTHROPIC_API_KEY");
  },
  get anthropicModel() {
    return v("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
  },
  get vercelToken() {
    return v("VERCEL_TOKEN");
  },
  get vercelTeamId() {
    return v("VERCEL_TEAM_ID");
  },
  get whatsapp() {
    return {
      token: v("WHATSAPP_ACCESS_TOKEN"),
      phoneNumberId: v("WHATSAPP_PHONE_NUMBER_ID"),
      appSecret: v("WHATSAPP_APP_SECRET"),
      verifyToken: v("WHATSAPP_VERIFY_TOKEN"),
      apiVersion: v("WHATSAPP_API_VERSION") ?? "v21.0",
    };
  },
  get smtp() {
    return {
      host: v("SMTP_HOST"),
      port: Number(v("SMTP_PORT") ?? 587),
      user: v("SMTP_USER"),
      password: v("SMTP_PASSWORD"),
      from: v("SMTP_FROM"),
    };
  },
};

export interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  envVars: string[];
  cost: string;
  note: string;
}

/** Mostra quais integrações estão configuradas, sem revelar valores. */
export function integrationStatus(): IntegrationStatus[] {
  const wa = env.whatsapp;
  const smtp = env.smtp;
  return [
    {
      id: "database",
      label: "Banco de dados PostgreSQL",
      configured: !!v("DATABASE_URL"),
      envVars: ["DATABASE_URL"],
      cost: "Gratuito em planos iniciais de vários provedores (verifique o seu)",
      note: "Obrigatório.",
    },
    {
      id: "auth",
      label: "Autenticação do painel",
      configured: !!v("ADMIN_PASSWORD_HASH") && !!v("AUTH_SECRET"),
      envVars: ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "AUTH_SECRET"],
      cost: "Gratuito",
      note: "Obrigatório.",
    },
    {
      id: "public_url",
      label: "URL pública do servidor",
      configured: !!env.publicBaseUrl,
      envVars: ["PUBLIC_BASE_URL"],
      cost: "Gratuito",
      note: "Necessária para publicação interna das demonstrações e links de descadastro.",
    },
    {
      id: "google_places",
      label: "Google Places API (descoberta de empresas)",
      configured: !!env.googlePlacesKey,
      envVars: ["GOOGLE_PLACES_API_KEY"],
      cost: "Pode gerar cobrança — preço por requisição definido pelo Google (verifique a tabela atual)",
      note: "Necessária para buscar empresas reais. Sem ela, apenas o modo simulação funciona.",
    },
    {
      id: "anthropic",
      label: "Anthropic Claude (textos com IA)",
      configured: !!env.anthropicKey,
      envVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
      cost: "Pode gerar cobrança — por tokens",
      note: "Opcional. Sem chave, textos são gerados pelos templates internos (custo zero).",
    },
    {
      id: "vercel",
      label: "Vercel (publicação das demonstrações)",
      configured: !!env.vercelToken,
      envVars: ["VERCEL_TOKEN", "VERCEL_TEAM_ID"],
      cost: "Depende do plano. O plano Hobby da Vercel é restrito a uso não comercial — verifique os termos.",
      note: "Opcional. Sem token, as demonstrações são publicadas pelo próprio servidor em /d/<slug>.",
    },
    {
      id: "whatsapp",
      label: "WhatsApp Business Platform (Cloud API)",
      configured: !!(wa.token && wa.phoneNumberId),
      envVars: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"],
      cost: "Cobrança por mensagem/conversa definida pela Meta (verifique a tabela atual)",
      note: "Envio apenas para contatos com opt-in registrado e com modelo (template) aprovado.",
    },
    {
      id: "smtp",
      label: "E-mail (SMTP)",
      configured: !!(smtp.host && smtp.from),
      envVars: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"],
      cost: "Depende do provedor SMTP",
      note: "Opcional. Envio somente para e-mails comerciais conhecidos, com descadastro.",
    },
  ];
}
