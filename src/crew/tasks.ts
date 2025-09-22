import fs from "fs/promises";
import path from "path";
import {
  DesignTokens,
  GenerationRequest,
  JobRecord,
  PageDefinition,
  ProjectSpec,
  QAResult,
} from "../types";
import { copyTemplateDir, slugify, writeJsonFile } from "../tools/fsOps";
import { runProjectQA } from "../tools/qaRunner";
import {
  ProjectPaths,
  baseGlobalsCss,
  injectTokensInCss,
  renderArchitectureDoc,
  renderLayout,
  renderPage,
  renderReadme,
  resolveProjectPaths,
  resetProjectDirectory,
  writeArchitectureDoc,
  writeGlobalsCss,
  writeLayoutFile,
  writePageFile,
  writeProjectReadme,
  writeSpecArtifact,
  writeTokensArtifact,
} from "./tools";
import {
  ArchitectAgent,
  DocsAgent,
  PlannerAgent,
  QAAgent,
  ScaffolderAgent,
  UIDSAgent,
} from "./roles";

export interface PlannerOutput {
  spec: ProjectSpec;
  paths: ProjectPaths;
}

function capitalize(value: string): string {
  if (!value.length) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sentenceFromBriefing(briefing: string): string {
  const sanitized = briefing.replace(/\s+/g, " ").trim();
  if (!sanitized) return "Projeto Lapidatto gerado automaticamente.";
  const sentenceEnd = sanitized.search(/[.!?]/);
  if (sentenceEnd === -1) {
    return capitalize(sanitized);
  }
  return capitalize(sanitized.slice(0, sentenceEnd + 1));
}

function extractObjectives(request: GenerationRequest): string[] {
  if (request.goals?.length) {
    return request.goals;
  }
  const sentences = request.briefing
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 6 && part.length < 140);
  if (!sentences.length) {
    return ["Lançar MVP visual consistente com padrões Lapidatto."];
  }
  return sentences.slice(0, 3).map((sentence) => capitalize(sentence));
}

function detectTheme(briefing: string): {
  theme: string;
  palette: {
    background: string;
    surface: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    muted: string;
  };
} {
  const normalized = briefing.toLowerCase();
  if (normalized.includes("finance") || normalized.includes("fintech")) {
    return {
      theme: "Aurora Finance",
      palette: {
        background: "#0f172a",
        surface: "#111c3d",
        foreground: "#f8fafc",
        primary: "#22d3ee",
        primaryForeground: "#082f49",
        muted: "rgba(34, 211, 238, 0.12)",
      },
    };
  }
  if (normalized.includes("health") || normalized.includes("saúde")) {
    return {
      theme: "Vital Pulse",
      palette: {
        background: "#f0fdf4",
        surface: "#ffffff",
        foreground: "#064e3b",
        primary: "#0ea5e9",
        primaryForeground: "#f0f9ff",
        muted: "rgba(14, 165, 233, 0.12)",
      },
    };
  }
  if (normalized.includes("education") || normalized.includes("learning") || normalized.includes("edtech")) {
    return {
      theme: "Nova Learning",
      palette: {
        background: "#f8fafc",
        surface: "#ffffff",
        foreground: "#111827",
        primary: "#6366f1",
        primaryForeground: "#eef2ff",
        muted: "rgba(99, 102, 241, 0.12)",
      },
    };
  }
  if (normalized.includes("ecommerce") || normalized.includes("retail")) {
    return {
      theme: "Flux Commerce",
      palette: {
        background: "#fef2f2",
        surface: "#ffffff",
        foreground: "#111827",
        primary: "#f97316",
        primaryForeground: "#1f2937",
        muted: "rgba(249, 115, 22, 0.12)",
      },
    };
  }
  return {
    theme: "Luminous",
    palette: {
      background: "#0f172a",
      surface: "#111c3d",
      foreground: "#f8fafc",
      primary: "#818cf8",
      primaryForeground: "#0f172a",
      muted: "rgba(129, 140, 248, 0.18)",
    },
  };
}

export function buildPageDefinition(input: {
  name: string;
  route: string;
  description: string;
  layout: PageDefinition["layout"];
  hero?: string;
  components?: string[];
}): PageDefinition {
  const components = input.components ?? ["Hero", "FeaturesGrid", "CallToAction"];
  const baseTitle = `${input.name} — ${input.description}`.slice(0, 96);
  return {
    name: input.name,
    route: input.route,
    description: input.description,
    layout: input.layout,
    hero: input.hero,
    components,
    seo: {
      title: baseTitle,
      description: input.description,
      keywords: [input.name, "Lapidatto", "Next.js", "Design System"],
    },
  };
}

function derivePages(request: GenerationRequest): PageDefinition[] {
  const basePages: PageDefinition[] = [
    buildPageDefinition({
      name: "Home",
      route: "/",
      description: `Visão geral do projeto ${request.projectName}`,
      layout: "marketing",
      hero: `Acelere ${request.projectName} com o padrão Lapidatto.`,
      components: ["Hero", "FeaturesGrid", "CallToAction"],
    }),
    buildPageDefinition({
      name: "Sobre",
      route: "/about",
      description: "História, proposta de valor e diferenciais.",
      layout: "informational",
      hero: "História e propósito",
      components: ["Hero", "FeaturesGrid"],
    }),
    buildPageDefinition({
      name: "Contato",
      route: "/contact",
      description: "Canal de contato e agenda de demonstrações.",
      layout: "informational",
      hero: "Vamos conversar",
      components: ["Hero", "CallToAction"],
    }),
  ];

  const briefing = request.briefing.toLowerCase();
  const features = new Map<string, PageDefinition>();

  if (briefing.includes("dashboard")) {
    features.set("/dashboard", buildPageDefinition({
      name: "Dashboard",
      route: "/dashboard",
      description: "Indicadores em tempo real com visão executiva.",
      layout: "dashboard",
      hero: "Painel de performance",
      components: ["Hero", "MetricsGrid", "FeaturesGrid"],
    }));
  }
  if (briefing.includes("blog") || briefing.includes("conteúdo")) {
    features.set("/blog", buildPageDefinition({
      name: "Blog",
      route: "/blog",
      description: "Artigos e atualizações de produto.",
      layout: "marketing",
      hero: "Conteúdo para lideranças",
      components: ["Hero", "FeaturesGrid"],
    }));
  }
  if (briefing.includes("faq") || briefing.includes("perguntas")) {
    features.set("/faq", buildPageDefinition({
      name: "FAQ",
      route: "/faq",
      description: "Perguntas frequentes e suporte.",
      layout: "informational",
      hero: "Tudo sobre o produto",
      components: ["Hero", "FeaturesGrid"],
    }));
  }
  if (briefing.includes("pricing") || briefing.includes("planos")) {
    features.set("/pricing", buildPageDefinition({
      name: "Planos",
      route: "/pricing",
      description: "Tabela de planos e diferenciais de valor.",
      layout: "marketing",
      hero: "Escolha o plano ideal",
      components: ["Hero", "FeaturesGrid", "CallToAction"],
    }));
  }

  request.features?.forEach((feature, index) => {
    const slug = slugify(feature).replace(/-+/g, "-");
    const route = `/${slug || `feature-${index + 1}`}`;
    if (!features.has(route)) {
      features.set(
        route,
        buildPageDefinition({
          name: capitalize(feature),
          route,
          description: `Feature estratégica: ${feature}.`,
          layout: "marketing",
        }),
      );
    }
  });

  return [...basePages, ...features.values()];
}

export function computePlannerOutput(
  job: JobRecord,
  request: GenerationRequest,
  workspaceRoot: string,
): PlannerOutput {
  console.log(`🎯 [PLANNER] Helena aplicando metodologia de planejamento estratégico...`);
  console.log(`📋 [PLANNER] Instruções carregadas: ${PlannerAgent.instructions ? 'SIM' : 'NÃO'}`);
  
  if (PlannerAgent.instructions) {
    console.log(`📝 [PLANNER] Seguindo padrões: análise de briefing + ProjectSpec estruturado`);
    console.log(`🎯 [PLANNER] Criando especificação técnica profissional`);
  }

  const { palette, theme } = detectTheme(request.briefing);
  const pages = derivePages(request);
  
  console.log(`🎨 [PLANNER] Tema detectado: ${theme}`);
  console.log(`📄 [PLANNER] ${pages.length} páginas planejadas`);
  
  const spec: ProjectSpec = {
    id: `spec-${job.id}`,
    projectName: request.projectName,
    summary: sentenceFromBriefing(request.briefing),
    objectives: extractObjectives(request),
    targetAudience:
      request.targetAudience ?? "Squads de produto que precisam acelerar entregas front-end.",
    voiceTone: "Confiante, orientado a impacto e com linguagem executiva.",
    pages,
    dataRequirements: [
      "Integração futura com APIs internas",
      "Suporte a conteúdo dinâmico e CMS Headless",
    ],
    integrations: ["Analytics", "Auth", "Design Tokens"],
    techStack: ["Next.js 14 App Router", "TypeScript", "Lapidatto DS", "shadcn/ui"],
    designSystem: {
      theme,
      tokensFile: "design-system/tokens.json",
      foundations: ["cores", "tipografia", "radii", "sombras"],
    },
  };

  const projectSlug = slugify(request.projectName || `job-${job.id}`);
  const paths = resolveProjectPaths(workspaceRoot, job.id, projectSlug);

  console.log(`✅ [PLANNER] ProjectSpec finalizado por Helena`);
  return { spec, paths };
}

export async function setupArchitecture(
  paths: ProjectPaths,
  templateDir: string,
  spec: ProjectSpec,
): Promise<void> {
  console.log(`🏗️  [ARCHITECT] Rafael aplicando instruções de arquitetura Next.js...`);
  console.log(`📋 [ARCHITECT] Instruções carregadas: ${ArchitectAgent.instructions ? 'SIM' : 'NÃO'}`);
  
  if (ArchitectAgent.instructions) {
    console.log(`📝 [ARCHITECT] Seguindo padrões: Next.js 14 + App Router + TypeScript`);
    console.log(`🎯 [ARCHITECT] Estrutura profissional e configurações otimizadas`);
  }

  await resetProjectDirectory(paths);
  await copyTemplateDir(templateDir, paths.projectRoot);

  const pkgPath = path.join(paths.projectRoot, "package.json");
  try {
    const pkgContent = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);
    pkg.name = slugify(spec.projectName);
    pkg.description = spec.summary;
    await writeJsonFile(pkgPath, pkg);
  } catch (error) {
    // Mantém package.json padrão do template
  }

  const globalsPath = path.join(paths.appDir, "globals.css");
  if (!(await fs.stat(globalsPath).catch(() => undefined))) {
    await writeGlobalsCss(paths, baseGlobalsCss());
  }

  await writeLayoutFile(paths, renderLayout(spec));
  await writeSpecArtifact(paths, spec);
  
  console.log(`✅ [ARCHITECT] Arquitetura estruturada por Rafael`);
}

export function generateDesignTokens(spec: ProjectSpec): DesignTokens {
  const { palette, theme } = detectTheme(spec.summary + " " + spec.projectName);
  return {
    themeName: theme,
    colors: {
      background: palette.background,
      surface: palette.surface,
      foreground: palette.foreground,
      border: "rgba(15, 23, 42, 0.24)",
      muted: palette.muted,
      primary: palette.primary,
      primaryForeground: palette.primaryForeground,
      accent: "#facc15",
      success: "#22c55e",
      danger: "#ef4444",
    },
    typography: {
      fontFamily: "'Inter', sans-serif",
      headings: "'Clash Display', sans-serif",
      body: "'Inter', sans-serif",
    },
    radii: {
      sm: "12px",
      md: "16px",
      lg: "28px",
      full: "9999px",
    },
    shadows: {
      sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
      md: "0 12px 40px rgba(15, 23, 42, 0.16)",
      glow: "0 0 0 1px rgba(255, 255, 255, 0.08), 0 30px 80px rgba(129, 140, 248, 0.35)",
    },
    spacing: {
      xs: "8px",
      sm: "12px",
      md: "16px",
      lg: "24px",
      xl: "40px",
    },
  };
}

export async function applyDesignSystem(
  paths: ProjectPaths,
  spec: ProjectSpec,
): Promise<DesignTokens> {
  console.log(`🎨 [UI-DS] Bianca aplicando instruções detalhadas para Design System...`);
  console.log(`📋 [UI-DS] Instruções carregadas: ${UIDSAgent.instructions ? 'SIM' : 'NÃO'}`);
  
  if (UIDSAgent.instructions) {
    console.log(`📝 [UI-DS] Seguindo especificações: Tailwind CSS + shadcn/ui + design tokens`);
    console.log(`🎯 [UI-DS] Aplicando padrões profissionais de componentes`);
  }
  
  const tokens = generateDesignTokens(spec);
  await writeTokensArtifact(paths, tokens);
  const globalsPath = path.join(paths.appDir, "globals.css");
  await injectTokensInCss(globalsPath, tokens);
  
  console.log(`✅ [UI-DS] Design System aplicado por Bianca: tema ${tokens.themeName}`);
  return tokens;
}

export async function scaffoldPages(
  paths: ProjectPaths,
  spec: ProjectSpec,
): Promise<Record<string, string>> {
  console.log(`⚛️  [SCAFFOLDER] Igor aplicando instruções para componentes React...`);
  console.log(`📋 [SCAFFOLDER] Instruções carregadas: ${ScaffolderAgent.instructions ? 'SIM' : 'NÃO'}`);
  
  if (ScaffolderAgent.instructions) {
    console.log(`📝 [SCAFFOLDER] Seguindo padrões: componentes funcionais + TypeScript + Tailwind`);
    console.log(`🎯 [SCAFFOLDER] Criando páginas com estrutura profissional`);
  }

  const pageFiles: Record<string, string> = {};
  for (const page of spec.pages) {
    console.log(`📄 [SCAFFOLDER] Criando página: ${page.name} (${page.route})`);
    const content = renderPage(spec, page);
    const filePath = await writePageFile(paths, page, content);
    pageFiles[page.route] = path.relative(paths.projectRoot, filePath);
  }
  
  console.log(`✅ [SCAFFOLDER] ${Object.keys(pageFiles).length} páginas criadas por Igor`);
  return pageFiles;
}

export async function scaffoldSinglePage(
  paths: ProjectPaths,
  spec: ProjectSpec,
  page: PageDefinition,
): Promise<string> {
  const content = renderPage(spec, page);
  const filePath = await writePageFile(paths, page, content);
  return path.relative(paths.projectRoot, filePath);
}

export async function runQualityGate(paths: ProjectPaths): Promise<QAResult> {
  console.log(`🔍 [QA] Luana aplicando critérios de Quality Assurance...`);
  console.log(`📋 [QA] Instruções carregadas: ${QAAgent.instructions ? 'SIM' : 'NÃO'}`);
  
  if (QAAgent.instructions) {
    console.log(`📝 [QA] Seguindo padrões: testes, performance, acessibilidade`);
    console.log(`🎯 [QA] Validando estrutura e qualidade do código`);
  }

  const result = await runProjectQA(paths.projectRoot);
  
  console.log(`${result.success ? '✅' : '❌'} [QA] Quality Gate: ${result.success ? 'APROVADO' : 'REPROVADO'}`);
  if (!result.success) {
    console.log(`📋 [QA] Issues encontradas: ${result.summary}`);
  }
  
  return result;
}

export async function generateDocumentation(
  paths: ProjectPaths,
  spec: ProjectSpec,
  qa: QAResult | undefined,
  tokens: DesignTokens | undefined,
): Promise<{ readme: string; architecture: string }> {
  console.log(`📚 [DOCS] Marcos aplicando padrões de documentação profissional...`);
  console.log(`📋 [DOCS] Instruções carregadas: ${DocsAgent.instructions ? 'SIM' : 'NÃO'}`);
  
  if (DocsAgent.instructions) {
    console.log(`📝 [DOCS] Seguindo padrões: README.md completo + guias técnicos`);
    console.log(`🎯 [DOCS] Criando documentação profissional e acessível`);
  }

  const readmeContent = renderReadme(spec, qa);
  const architectureContent = renderArchitectureDoc(spec, tokens);
  const readmePath = await writeProjectReadme(paths, readmeContent);
  const architecturePath = await writeArchitectureDoc(paths, architectureContent);
  
  console.log(`✅ [DOCS] Documentação gerada por Marcos`);
  console.log(`📄 [DOCS] README.md e arquivos técnicos criados`);
  
  return {
    readme: path.relative(paths.projectRoot, readmePath),
    architecture: path.relative(paths.projectRoot, architecturePath),
  };
}
