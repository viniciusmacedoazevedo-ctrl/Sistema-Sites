import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { PermanentError, WaitingConfigError } from "../errors";

export interface SendResult {
  providerMessageId: string;
}

export interface WhatsAppSendInput {
  to: string; // E.164
  /** Texto livre — só permitido dentro da janela de atendimento de 24h. */
  text?: string;
  template?: { name: string; language: string; params: string[] };
}

/**
 * WhatsApp Business Platform — Cloud API (oficial).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 * Mensagens iniciadas pela empresa exigem modelo (template) aprovado e opt-in do destinatário.
 */
export class WhatsAppCloudSender {
  constructor(
    private cfg = env.whatsapp,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get configured() {
    return !!(this.cfg.token && this.cfg.phoneNumberId);
  }

  async send(input: WhatsAppSendInput): Promise<SendResult> {
    if (!this.configured) throw new WaitingConfigError("WhatsApp Cloud API não configurada.");
    const to = input.to.replace(/\D/g, "");
    const body = input.template
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: input.template.name,
            language: { code: input.template.language },
            components: [{ type: "body", parameters: input.template.params.map((text) => ({ type: "text", text })) }],
          },
        }
      : { messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: input.text } };

    const res = await this.fetchImpl(`https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (res.status === 401) throw new WaitingConfigError("WhatsApp: token inválido ou expirado.");
    if (res.status === 429) throw new Error("WhatsApp: limite de envio atingido (429).");
    if (!res.ok || !json.messages?.[0]?.id) {
      const msg = `WhatsApp: ${json.error?.message ?? `HTTP ${res.status}`}`;
      if (res.status >= 400 && res.status < 500) throw new PermanentError(msg);
      throw new Error(msg);
    }
    return { providerMessageId: json.messages[0].id };
  }
}

export interface EmailSendInput {
  to: string;
  subject: string;
  text: string;
  listUnsubscribe?: string | null;
  idempotencyKey: string;
}

/** Envio via SMTP (qualquer provedor). Inclui cabeçalho List-Unsubscribe. */
export class SmtpSender {
  constructor(private cfg = env.smtp) {}

  get configured() {
    return !!(this.cfg.host && this.cfg.from);
  }

  async send(input: EmailSendInput): Promise<SendResult> {
    if (!this.configured) throw new WaitingConfigError("SMTP não configurado.");
    const transport = nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.port === 465,
      auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.password } : undefined,
    });
    const info = await transport.sendMail({
      from: this.cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      messageId: `<${input.idempotencyKey.replace(/[^a-zA-Z0-9.-]/g, "-")}@sitehunter>`,
      headers: input.listUnsubscribe ? { "List-Unsubscribe": `<${input.listUnsubscribe}>` } : undefined,
    });
    return { providerMessageId: info.messageId };
  }
}
