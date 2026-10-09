export const RUN_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  RUNNING: "Em andamento",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELED: "Cancelada",
};

export const RUN_STAGE_LABEL: Record<string, string> = {
  DISCOVERY: "Descoberta e análise",
  PRODUCTION: "Sites, mensagens e envio",
  REPORT: "Relatório",
  DONE: "Finalizada",
};

export const JOB_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  RUNNING: "Em andamento",
  COMPLETED: "Concluído",
  FAILED: "Falhou",
  WAITING_CONFIG: "Aguardando configuração",
  WAITING_AUTH: "Aguardando autorização",
  SKIPPED: "Ignorado",
  CANCELED: "Cancelado",
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  DISCOVER: "1. Descobrir empresas",
  NORMALIZE: "2. Normalizar e deduplicar",
  CHECK_PRESENCE: "3. Verificar presença digital",
  SCORE: "4. Classificar oportunidade",
  RUN_ADVANCE: "Coordenação da execução",
  GENERATE_CONTENT: "5. Gerar conteúdo",
  BUILD_SITE: "6. Criar site",
  VALIDATE_SITE: "7. Validar site",
  PUBLISH_SITE: "8. Publicar demonstração",
  GENERATE_MESSAGE: "9. Gerar mensagem",
  CHECK_ELIGIBILITY: "10. Verificar elegibilidade",
  SEND_MESSAGE: "11. Enviar mensagem",
  FINALIZE: "12–13. Atualizar CRM e gerar relatório",
  MAINTENANCE: "Manutenção",
};

export const PRESENCE_LABEL: Record<string, string> = {
  PENDING: "Não verificado",
  FUNCTIONAL: "Site funcional identificado",
  PROBLEMS: "Site com possíveis problemas",
  NOT_FOUND: "Site não identificado nas fontes",
  INCONCLUSIVE: "Verificação inconclusiva",
};

export const CRM_LABEL: Record<string, string> = {
  NOVO_LEAD: "Novo lead",
  ANALISADO: "Analisado",
  DEMO_GERADA: "Demonstração gerada",
  DEMO_PUBLICADA: "Demonstração publicada",
  CONTATO_PREPARADO: "Contato preparado",
  CONTATO_REALIZADO: "Contato realizado",
  RESPONDEU: "Respondeu",
  INTERESSADO: "Interessado",
  NEGOCIACAO: "Negociação",
  CLIENTE: "Cliente",
  SEM_INTERESSE: "Sem interesse",
  NAO_CONTATAR: "Não contatar",
};

export const SITE_STATUS_LABEL: Record<string, string> = {
  GENERATING: "Gerando",
  GENERATED: "Gerado",
  VALIDATED: "Validado",
  INVALID: "Reprovado na validação",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  PUBLISH_FAILED: "Falha na publicação",
  SIMULATED: "Simulado (não publicado)",
  UNPUBLISHED: "Despublicado",
};

export const MESSAGE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  BLOCKED: "Envio bloqueado",
  WAITING_CONFIG: "Aguardando configuração",
  QUEUED: "Na fila",
  SENDING: "Enviando",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
  NEEDS_VERIFICATION: "Verificar envio manualmente",
  SIMULATED: "Simulada (não enviada)",
  CANCELED: "Cancelada",
};

export const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  MANUAL: "Contato manual",
};

export function tone(status: string): "green" | "blue" | "amber" | "red" | "slate" {
  if (["COMPLETED", "PUBLISHED", "SENT", "DELIVERED", "READ", "FUNCTIONAL", "CLIENTE", "INTERESSADO"].includes(status)) return "green";
  if (["RUNNING", "QUEUED", "SENDING", "PUBLISHING", "GENERATING", "VALIDATED", "GENERATED", "DEMO_PUBLICADA", "CONTATO_REALIZADO", "RESPONDEU", "NEGOCIACAO"].includes(status)) return "blue";
  if (["WAITING_CONFIG", "WAITING_AUTH", "PAUSED", "BLOCKED", "NEEDS_VERIFICATION", "PROBLEMS", "INCONCLUSIVE", "SIMULATED", "DRAFT"].includes(status)) return "amber";
  if (["FAILED", "INVALID", "PUBLISH_FAILED", "NAO_CONTATAR", "SEM_INTERESSE", "CANCELED"].includes(status)) return "red";
  return "slate";
}
