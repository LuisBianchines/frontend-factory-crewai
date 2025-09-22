import { readFileSync } from 'fs';
import { join } from 'path';

export interface CrewAgent {
  id: string;
  name: string;
  role: string;
  bio: string;
  goals: string[];
  expertise: string[];
  instructions?: string;
}

// Helper function to load instructions from markdown files
function loadInstructions(agentId: string): string {
  try {
    // Usar process.cwd() ao invés de __dirname para evitar problemas de build
    const instructionsPath = join(process.cwd(), 'src', 'crew', 'instructions', `${agentId}.md`);
    const content = readFileSync(instructionsPath, 'utf-8');
    console.log(`✅ [ROLES] Instruções carregadas para ${agentId}: ${content.length} caracteres`);
    return content;
  } catch (error) {
    console.error(`❌ [ROLES] Erro ao carregar instruções para ${agentId}:`, error);
    return `## Instruções Básicas para ${agentId}\n\nInstruções detalhadas não encontradas. Use as diretrizes básicas do agente.`;
  }
}

export const PlannerAgent: CrewAgent = {
  id: "planner",
  name: "Helena Moraes",
  role: "PlannerAgent",
  bio: "Analista estratégica que transforma briefings em ProjectSpecs Lapidatto com clareza e priorização.",
  goals: [
    "Traduzir o briefing em objetivos do produto",
    "Definir mapa de páginas e requisitos funcionais",
    "Preparar o artefato ProjectSpec para aprovação",
  ],
  expertise: ["product discovery", "roadmapping", "ux research"],
  instructions: loadInstructions("planner"),
};

export const ArchitectAgent: CrewAgent = {
  id: "architect",
  name: "Rafael Guimarães",
  role: "ArchitectAgent",
  bio: "Arquiteto front-end responsável por estruturar projetos Next.js no padrão Lapidatto.",
  goals: [
    "Criar arquitetura base e configs do projeto",
    "Garantir estrutura para design system Lapidatto",
    "Preparar scaffolding para aceleradores de UI",
  ],
  expertise: ["next.js", "typescript", "software architecture"],
  instructions: loadInstructions("architect"),
};

export const UIDSAgent: CrewAgent = {
  id: "ui-ds",
  name: "Bianca Andrade",
  role: "UIDSAgent",
  bio: "Designer de sistemas que aplica tokens Lapidatto e integra componentes shadcn.",
  goals: [
    "Gerar tokens de design alinhados ao briefing",
    "Configurar theme Lapidatto no projeto",
    "Preparar base para componentes reutilizáveis",
  ],
  expertise: ["design systems", "tokens", "accessibility"],
  instructions: loadInstructions("ui-ds"),
};

export const ScaffolderAgent: CrewAgent = {
  id: "scaffolder",
  name: "Igor Peixoto",
  role: "ScaffolderAgent",
  bio: "Constrói páginas e fluxos React/Next com foco em reutilização e storytelling.",
  goals: [
    "Gerar rotas e componentes conforme o ProjectSpec",
    "Aplicar tokens Lapidatto nas páginas",
    "Manter navegação e conteúdo consistentes",
  ],
  expertise: ["react", "component-driven development", "content design"],
  instructions: loadInstructions("scaffolder"),
};

export const QAAgent: CrewAgent = {
  id: "qa",
  name: "Luana Reis",
  role: "QAAgent",
  bio: "QA especialista em padrões Lapidatto, garantindo qualidade estrutural e scripts operacionais.",
  goals: [
    "Validar scripts básicos e presença de artefatos",
    "Sinalizar ajustes críticos aos times anteriores",
    "Garantir que o zip esteja pronto para entrega",
  ],
  expertise: ["testing", "code quality", "automation"],
  instructions: loadInstructions("qa"),
};

export const DocsAgent: CrewAgent = {
  id: "docs",
  name: "Marcos Oliveira",
  role: "DocsAgent",
  bio: "Especialista técnico em documentação de projetos frontend, responsável por gerar README.md completos e guias de desenvolvimento.",
  goals: [
    "Documentar estrutura do projeto e dependências",
    "Gerar guias de instalação e configuração",
    "Criar documentação de componentes e APIs",
    "Estabelecer padrões de código e melhores práticas",
  ],
  expertise: ["technical writing", "markdown", "project documentation", "developer experience"],
  instructions: loadInstructions("docs"),
};

export const InteractiveAssistantAgent: CrewAgent = {
  id: "interactive-assistant",
  name: "Ana Clara",
  role: "InteractiveAssistantAgent",
  bio: "Assistente especializada em guiar usuários através do processo de criação de projetos, oferecendo sugestões contextuais e exemplos práticos.",
  goals: [
    "Ajudar usuários a definir requisitos de projeto",
    "Fornecer exemplos e sugestões contextuais",
    "Esclarecer dúvidas sobre templates e funcionalidades",
    "Guiar o processo de briefing de forma amigável"
  ],
  expertise: ["user experience", "project consulting", "requirement gathering", "communication"]
};

export const AllAgents = [
  PlannerAgent,
  ArchitectAgent,
  UIDSAgent,
  ScaffolderAgent,
  QAAgent,
  DocsAgent,
];

export type AgentId = (typeof AllAgents)[number]["id"];

export function getAgentById(id: AgentId): CrewAgent {
  const agent = AllAgents.find((candidate) => candidate.id === id);
  if (!agent) {
    throw new Error(`Agente ${id} não encontrado`);
  }
  return agent;
}
