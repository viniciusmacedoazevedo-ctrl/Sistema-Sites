/**
 * Perfis de nicho usados para busca, pontuação e geração de sites.
 * Os serviços listados são SUGESTÕES genéricas do segmento e aparecem nos sites
 * marcadas como "a confirmar com a empresa" — nunca como fatos sobre o negócio.
 */
export interface NicheProfile {
  id: string;
  label: string;
  searchTerm: string;
  /** 0–15: quanto um site tende a ajudar esse tipo de negócio local. */
  siteBenefit: number;
  palettes: { primary: string; accent: string; dark: string; light: string }[];
  icon: string;
  heroAngle: string;
  services: string[];
  benefits: string[];
  gallery: boolean;
}

const PAL = {
  ocean: { primary: "#1d4ed8", accent: "#38bdf8", dark: "#0b1530", light: "#eff6ff" },
  teal: { primary: "#0f766e", accent: "#2dd4bf", dark: "#062925", light: "#f0fdfa" },
  rose: { primary: "#be185d", accent: "#f9a8d4", dark: "#2a0a1a", light: "#fdf2f8" },
  gold: { primary: "#a16207", accent: "#facc15", dark: "#1c1305", light: "#fefce8" },
  slate: { primary: "#334155", accent: "#f59e0b", dark: "#0f172a", light: "#f8fafc" },
  green: { primary: "#15803d", accent: "#a3e635", dark: "#052e16", light: "#f0fdf4" },
  orange: { primary: "#c2410c", accent: "#fdba74", dark: "#2a1006", light: "#fff7ed" },
  violet: { primary: "#6d28d9", accent: "#c4b5fd", dark: "#1a0b38", light: "#f5f3ff" },
  red: { primary: "#b91c1c", accent: "#fca5a5", dark: "#2a0707", light: "#fef2f2" },
  sky: { primary: "#0369a1", accent: "#7dd3fc", dark: "#082030", light: "#f0f9ff" },
};

export const NICHES: NicheProfile[] = [
  {
    id: "salao-de-beleza",
    label: "Salões de beleza",
    searchTerm: "salão de beleza",
    siteBenefit: 12,
    palettes: [PAL.rose, PAL.violet, PAL.gold],
    icon: "sparkles",
    heroAngle: "cuidado, beleza e bem-estar",
    services: ["Corte e escova", "Coloração", "Tratamentos capilares", "Manicure e pedicure", "Maquiagem"],
    benefits: ["Agendamento facilitado", "Atendimento personalizado", "Ambiente acolhedor"],
    gallery: true,
  },
  {
    id: "barbearia",
    label: "Barbearias",
    searchTerm: "barbearia",
    siteBenefit: 11,
    palettes: [PAL.slate, PAL.gold, PAL.red],
    icon: "scissors",
    heroAngle: "estilo e cuidado masculino",
    services: ["Corte de cabelo", "Barba", "Corte e barba", "Pigmentação", "Sobrancelha"],
    benefits: ["Horários organizados", "Profissionais dedicados", "Ambiente descontraído"],
    gallery: true,
  },
  {
    id: "clinica-odontologica",
    label: "Clínicas odontológicas",
    searchTerm: "clínica odontológica",
    siteBenefit: 14,
    palettes: [PAL.sky, PAL.teal, PAL.ocean],
    icon: "tooth",
    heroAngle: "saúde bucal com atenção e cuidado",
    services: ["Avaliação odontológica", "Limpeza", "Clareamento", "Ortodontia", "Implantes"],
    benefits: ["Informações claras para o paciente", "Contato rápido para agendamento", "Localização fácil"],
    gallery: false,
  },
  {
    id: "oficina-mecanica",
    label: "Oficinas mecânicas",
    searchTerm: "oficina mecânica",
    siteBenefit: 12,
    palettes: [PAL.slate, PAL.orange, PAL.red],
    icon: "wrench",
    heroAngle: "manutenção automotiva de confiança",
    services: ["Revisão preventiva", "Freios e suspensão", "Troca de óleo", "Diagnóstico", "Alinhamento e balanceamento"],
    benefits: ["Orçamento pelo telefone ou WhatsApp", "Atendimento próximo de você", "Transparência no serviço"],
    gallery: false,
  },
  {
    id: "eletricista",
    label: "Eletricistas",
    searchTerm: "eletricista",
    siteBenefit: 13,
    palettes: [PAL.gold, PAL.ocean, PAL.slate],
    icon: "bolt",
    heroAngle: "instalações elétricas com segurança",
    services: ["Instalações residenciais", "Manutenção elétrica", "Quadros de distribuição", "Iluminação", "Atendimento emergencial"],
    benefits: ["Contato direto com o profissional", "Atendimento na sua região", "Orçamento sem complicação"],
    gallery: false,
  },
  {
    id: "energia-solar",
    label: "Energia solar",
    searchTerm: "energia solar",
    siteBenefit: 14,
    palettes: [PAL.gold, PAL.green, PAL.sky],
    icon: "sun",
    heroAngle: "energia solar para sua casa ou empresa",
    services: ["Projeto fotovoltaico", "Instalação de painéis", "Manutenção e limpeza", "Homologação junto à distribuidora", "Monitoramento"],
    benefits: ["Simulação de economia sob consulta", "Atendimento técnico", "Acompanhamento do projeto"],
    gallery: true,
  },
  {
    id: "ar-condicionado",
    label: "Ar-condicionado",
    searchTerm: "instalação de ar condicionado",
    siteBenefit: 13,
    palettes: [PAL.sky, PAL.ocean, PAL.teal],
    icon: "snow",
    heroAngle: "conforto térmico o ano inteiro",
    services: ["Instalação", "Manutenção preventiva", "Limpeza e higienização", "Conserto", "PMOC"],
    benefits: ["Agendamento rápido", "Atendimento residencial e comercial", "Orçamento pelo WhatsApp"],
    gallery: false,
  },
  {
    id: "academia",
    label: "Academias",
    searchTerm: "academia",
    siteBenefit: 11,
    palettes: [PAL.red, PAL.orange, PAL.violet],
    icon: "dumbbell",
    heroAngle: "treino, saúde e disposição",
    services: ["Musculação", "Aulas coletivas", "Treino funcional", "Acompanhamento de professores", "Planos flexíveis"],
    benefits: ["Horários informados com clareza", "Conheça a estrutura antes de ir", "Contato rápido"],
    gallery: true,
  },
  {
    id: "restaurante",
    label: "Restaurantes",
    searchTerm: "restaurante",
    siteBenefit: 10,
    palettes: [PAL.orange, PAL.red, PAL.green],
    icon: "utensils",
    heroAngle: "sabor e boa comida perto de você",
    services: ["Almoço", "Jantar", "Pedidos para viagem", "Eventos e reservas", "Cardápio variado"],
    benefits: ["Cardápio fácil de consultar", "Horários e endereço sempre à mão", "Reservas pelo telefone"],
    gallery: true,
  },
  {
    id: "limpeza",
    label: "Empresas de limpeza",
    searchTerm: "empresa de limpeza",
    siteBenefit: 13,
    palettes: [PAL.teal, PAL.sky, PAL.green],
    icon: "broom",
    heroAngle: "ambientes limpos e organizados",
    services: ["Limpeza residencial", "Limpeza comercial", "Limpeza pós-obra", "Higienização de estofados", "Contratos recorrentes"],
    benefits: ["Orçamento sob medida", "Equipe organizada", "Atendimento agendado"],
    gallery: false,
  },
  {
    id: "servicos-locais",
    label: "Prestadores de serviços locais",
    searchTerm: "prestador de serviços",
    siteBenefit: 10,
    palettes: [PAL.ocean, PAL.teal, PAL.slate],
    icon: "briefcase",
    heroAngle: "serviços de qualidade na sua região",
    services: ["Atendimento sob demanda", "Orçamentos", "Manutenção", "Visitas técnicas"],
    benefits: ["Contato direto", "Atendimento local", "Agilidade"],
    gallery: false,
  },
];

export function getNiche(id: string | null | undefined): NicheProfile {
  return NICHES.find((n) => n.id === id) ?? NICHES[NICHES.length - 1];
}

/** Cria um perfil para um nicho digitado livremente pelo usuário. */
export function customNiche(term: string): NicheProfile {
  const base = getNiche("servicos-locais");
  return { ...base, id: `custom:${term}`, label: term, searchTerm: term };
}

export function resolveNiche(idOrTerm: string): NicheProfile {
  return NICHES.find((n) => n.id === idOrTerm) ?? customNiche(idOrTerm.replace(/^custom:/, ""));
}
