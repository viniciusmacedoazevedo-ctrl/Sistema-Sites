import { formatBrPhone } from "@/lib/normalize";

export type Decision = "SEND" | "SIMULATE" | "BLOCK" | "WAITING_CONFIG" | "DEFER";

export interface EligibilityInput {
  mode: "SIMULATION" | "REAL";
  channel: "WHATSAPP" | "EMAIL";
  autoSendEnabled: boolean;
  company: {
    isSimulated: boolean;
    doNotContact: boolean;
    phoneNormalized: string | null;
    phoneIsMobile: boolean;
    email: string | null;
    sourceUrl: string | null;
  };
  recipientSuppressed: boolean;
  consent: { basis: string; revokedAt: Date | null } | null;
  alreadyContactedRecipient: boolean;
  sentTodayOnChannel: number;
  dailyLimit: number;
  channelConfigured: boolean;
  whatsappTemplateConfigured: boolean;
  emailLegalBasisConfirmed: boolean;
  hasOptOutLink: boolean;
}

export interface EligibilityResult {
  decision: Decision;
  reason: string;
  recipient: string | null;
  consentBasis: string | null;
  alternative: string | null;
}

export function alternativeContact(c: EligibilityInput["company"]): string | null {
  const parts: string[] = [];
  if (c.phoneNormalized) parts.push(`Ligar ou iniciar conversa manualmente pelo telefone comercial ${formatBrPhone(c.phoneNormalized)}`);
  if (c.sourceUrl) parts.push(`Ver perfil público: ${c.sourceUrl}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Regras de envio automático. Princípios:
 *  - telefone público NÃO é autorização para mensagem promocional no WhatsApp (exige opt-in registrado);
 *  - simulação nunca envia nada externo;
 *  - supressão/descadastro e "não contatar" sempre bloqueiam;
 *  - um destinatário recebe no máximo uma abordagem inicial;
 *  - limites diários por canal.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const c = input.company;
  const recipient = input.channel === "WHATSAPP" ? c.phoneNormalized : c.email;
  const alt = alternativeContact(c);
  const block = (reason: string, decision: Decision = "BLOCK"): EligibilityResult => ({ decision, reason, recipient, consentBasis: null, alternative: alt });

  if (!recipient) return block(input.channel === "WHATSAPP" ? "Sem telefone comercial válido." : "Sem e-mail comercial conhecido.");
  if (input.channel === "WHATSAPP" && !c.phoneIsMobile) return block("O telefone informado parece ser fixo; WhatsApp não aplicável.");
  if (c.doNotContact) return block("Empresa marcada como 'não contatar'.");
  if (input.recipientSuppressed) return block("Contato está na lista de bloqueio/descadastro.");
  if (input.alreadyContactedRecipient) return block("Este contato já recebeu uma abordagem (controle de duplicidade).");

  if (input.mode === "SIMULATION" || c.isSimulated) {
    return { decision: "SIMULATE", reason: "Modo simulação: a mensagem não é enviada.", recipient, consentBasis: null, alternative: alt };
  }

  if (!input.channelConfigured) return block(input.channel === "WHATSAPP" ? "WhatsApp Cloud API não configurada (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)." : "SMTP não configurado (SMTP_HOST / SMTP_FROM).", "WAITING_CONFIG");

  if (input.channel === "WHATSAPP") {
    if (!input.consent || input.consent.revokedAt) {
      return block("Sem opt-in registrado para este número. Um telefone comercial público não autoriza mensagens promocionais no WhatsApp.");
    }
    if (!input.whatsappTemplateConfigured) return block("Nenhum modelo (template) aprovado configurado para mensagens iniciadas pela empresa.", "WAITING_CONFIG");
  }

  if (input.channel === "EMAIL") {
    if (!input.emailLegalBasisConfirmed) {
      return block("Base legal para e-mail comercial B2B não confirmada em Configurações (LGPD).", "WAITING_CONFIG");
    }
    if (!input.hasOptOutLink) return block("Link de descadastro indisponível (PUBLIC_BASE_URL não configurada).", "WAITING_CONFIG");
  }

  if (!input.autoSendEnabled) return block("Envio automático desativado nas configurações. Mensagem salva como rascunho.");

  if (input.sentTodayOnChannel >= input.dailyLimit) {
    return { decision: "DEFER", reason: `Limite diário do canal atingido (${input.dailyLimit}). Reagendado para amanhã.`, recipient, consentBasis: null, alternative: alt };
  }

  const consentBasis = input.channel === "WHATSAPP" ? `opt-in: ${input.consent!.basis}` : "legítimo interesse B2B (confirmado pelo operador), com descadastro";
  return { decision: "SEND", reason: "Elegível para envio automático.", recipient, consentBasis, alternative: alt };
}
