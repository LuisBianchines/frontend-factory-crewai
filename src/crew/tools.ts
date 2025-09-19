import path from "path";
import { DesignTokens, PageDefinition, ProjectSpec, QAResult } from "../types";
import {
  ensureDir,
  readTextFile,
  removeDir,
  writeJsonFile,
  writeTextFile,
} from "../tools/fsOps";

export interface ProjectPaths {
  jobRoot: string;
  projectRoot: string;
  docsDir: string;
  designSystemDir: string;
  appDir: string;
}

export function resolveProjectPaths(
  workspaceRoot: string,
  jobId: string,
  projectSlug: string,
): ProjectPaths {
  const jobRoot = path.join(workspaceRoot, jobId);
  const projectRoot = path.join(jobRoot, projectSlug);
  return {
    jobRoot,
    projectRoot,
    docsDir: path.join(projectRoot, "docs"),
    designSystemDir: path.join(projectRoot, "design-system"),
    appDir: path.join(projectRoot, "app"),
  };
}

export async function resetProjectDirectory(paths: ProjectPaths): Promise<void> {
  await removeDir(paths.projectRoot);
  await ensureDir(paths.projectRoot);
}

function escapeTemplate(value: string): string {
  return value.replace(/[`$]/g, (match) => `\\${match}`);
}

export function buildNavigation(spec: ProjectSpec): Array<{ href: string; label: string; description: string }> {
  return spec.pages.map((page) => ({
    href: page.route,
    label: page.name,
    description: page.description,
  }));
}

export function renderLayout(spec: ProjectSpec): string {
  const navItems = buildNavigation(spec)
    .map(
      (item) =>
        `  { href: "${item.href}", label: "${escapeTemplate(item.label)}", description: "${escapeTemplate(item.description)}" }`,
    )
    .join(",\n");

  return `import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "${escapeTemplate(spec.projectName)}",
  description: "${escapeTemplate(spec.summary)}",
};

const navItems = [
${navItems}
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-surface text-foreground antialiased">
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-border bg-muted/70 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
              <span className="font-semibold tracking-tight text-primary">${spec.projectName}</span>
              <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="transition hover:text-foreground">
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>
          <footer className="border-t border-border bg-muted/60 py-6 text-center text-sm text-muted-foreground">
            © {year} ${spec.projectName}. Criado com Lapidatto Frontend Factory.
          </footer>
        </div>
      </body>
    </html>
  );
}
`;
}

function pascalCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("") || "Page";
}

function renderSection(component: string, page: PageDefinition): string {
  switch (component) {
    case "Hero":
      return `<section className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-10 shadow-lg">
  <div className="space-y-4">
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
      ${escapeTemplate(page.name)}
    </span>
    <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
      ${escapeTemplate(page.hero ?? page.seo.title)}
    </h1>
    <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
      ${escapeTemplate(page.description)}
    </p>
  </div>
</section>`;
    case "FeaturesGrid": {
      const features = [
        {
          title: `${page.name} sem fricção`,
          description: `Fluxo central inspirado no storytelling Lapidatto: ${page.description}`,
        },
        {
          title: "Componentes reutilizáveis",
          description: "Construído com slots shadcn e tokens Lapidatto para acelerar squads.",
        },
        {
          title: "Métricas integradas",
          description: "Seções prontas para conectar dados dinâmicos e narrativas de impacto.",
        },
        {
          title: "Acessibilidade nativa",
          description: "Contrast ratio, foco visível e semântica preparada para WCAG.",
        },
      ];
      const cards = features
        .map(
          (feature) => `<div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
    <h3 className="text-lg font-semibold text-foreground">${escapeTemplate(feature.title)}</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      ${escapeTemplate(feature.description)}
    </p>
  </div>`,
        )
        .join("\n");
      return `<section className="grid gap-6 md:grid-cols-2">
${cards}
</section>`;
    }
    case "MetricsGrid":
      return `<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {["Meta", "Engajamento", "Conversão", "Satisfação"].map((metric, index) => (
    <div
      key={metric}
      className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {metric}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{["72%", "4.8", "38%", "96%"][index]}</p>
    </div>
  ))}
</section>`;
    case "CallToAction":
      return `<section className="rounded-3xl border border-primary/20 bg-primary text-primary-foreground p-8 shadow-xl">
  <div className="space-y-3 text-center">
    <h2 className="text-3xl font-semibold tracking-tight">Pronto para avançar?</h2>
    <p className="text-sm text-primary-foreground/80">
      Entre em contato com a equipe para implementar ${escapeTemplate(page.name)} em seu fluxo.
    </p>
    <div className="flex justify-center gap-3">
      <a
        className="inline-flex items-center justify-center rounded-full bg-background px-5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        href="/contact"
      >
        Fale com a equipe
      </a>
      <a
        className="inline-flex items-center justify-center rounded-full border border-background/60 px-5 py-2 text-sm font-medium text-primary-foreground/90 transition hover:bg-background/10"
        href="/about"
      >
        Conheça mais
      </a>
    </div>
  </div>
</section>`;
    default:
      return `<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
  <h2 className="text-2xl font-semibold text-foreground">${component}</h2>
  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
    ${page.description}
  </p>
</section>`;
  }
}

export function renderPage(spec: ProjectSpec, page: PageDefinition): string {
  const componentName = pascalCase(`${page.name} Page`);
  const sections = page.components
    .map((component) => renderSection(component, page))
    .map((section) => section.split("\n").map((line) => `      ${line}`).join("\n"))
    .join("\n\n");

  return `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "${escapeTemplate(page.seo.title)}",
  description: "${escapeTemplate(page.seo.description)}",
};

export default function ${componentName}() {
  return (
    <div className="space-y-12">
${sections}
    </div>
  );
}
`;
}

export function renderReadme(spec: ProjectSpec, qa: QAResult | undefined): string {
  const pagesMarkdown = spec.pages
    .map((page) => `- **${page.name}** (${page.route}) — ${page.description}`)
    .join("\n");

  const qaSummary = qa
    ? qa.success
      ? `✅ QA: ${qa.summary}`
      : `⚠️ QA encontrou problemas:\n${qa.issues.map((issue) => `  - ${issue}`).join("\n")}`
    : "QA ainda não executado.";

  return `# ${spec.projectName}

${spec.summary}

## Objetivos
${spec.objectives.map((objective) => `- ${objective}`).join("\n")}

## Páginas
${pagesMarkdown}

## Design System
- Theme: ${spec.designSystem.theme}
- Tokens: ${spec.designSystem.tokensFile}

## Stack Técnica
${spec.techStack.map((item) => `- ${item}`).join("\n")}

## Qualidade
${qaSummary}

---
_Gerado automaticamente pela Lapidatto Frontend Factory._
`;
}

export function renderArchitectureDoc(spec: ProjectSpec, tokens: DesignTokens | undefined): string {
  const pageList = spec.pages.map((page) => `- ${page.name} (${page.route}) — layout ${page.layout}`).join("\n");
  const tokenSummary = tokens
    ? Object.entries(tokens.colors)
        .map(([token, value]) => `  - ${token}: ${value}`)
        .join("\n")
    : "  - Tokens pendentes";

  return `# ADR 0001 - Base Arquitetural

## Contexto
O projeto **${spec.projectName}** foi gerado automaticamente a partir do briefing aprovado.

## Decisão
- Utilizar Next.js com App Router, TypeScript e Tailwind utilitário customizado.
- Aplicar tokens Lapidatto descritos em \`${spec.designSystem.tokensFile}\`.
- Estruturar páginas principais conforme ProjectSpec:
${pageList}

## Consequências
- Facilidade para evolução incremental via endpoint /add-page.
- QA automatizado garante presença de scripts críticos.
- Tokens Lapidatto garantem consistência visual:
${tokenSummary}
`;
}

export function tokensToCssVariables(tokens: DesignTokens): string {
  const colorVars = Object.entries(tokens.colors)
    .map(([key, value]) => `  --color-${key}: ${value};`)
    .join("\n");
  const radiusVars = Object.entries(tokens.radii)
    .map(([key, value]) => `  --radius-${key}: ${value};`)
    .join("\n");
  const shadowVars = Object.entries(tokens.shadows)
    .map(([key, value]) => `  --shadow-${key}: ${value};`)
    .join("\n");
  const spacingVars = Object.entries(tokens.spacing)
    .map(([key, value]) => `  --space-${key}: ${value};`)
    .join("\n");

  return `  --font-family-base: ${tokens.typography.fontFamily};
  --font-family-headings: ${tokens.typography.headings};
${colorVars}
${radiusVars}
${shadowVars}
${spacingVars}`;
}

export async function injectTokensInCss(
  globalsCssPath: string,
  tokens: DesignTokens,
): Promise<void> {
  const css = await readTextFile(globalsCssPath);
  const tokensBlock = tokensToCssVariables(tokens);
  const startTag = "/* LAPIDATTO::TOKENS_START */";
  const endTag = "/* LAPIDATTO::TOKENS_END */";

  const startIndex = css.indexOf(startTag);
  const endIndex = css.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Template CSS não possui marcadores Lapidatto para tokens.");
  }

  const before = css.slice(0, startIndex + startTag.length);
  const after = css.slice(endIndex);
  const newCss = `${before}\n${tokensBlock}\n${after}`;
  await writeTextFile(globalsCssPath, newCss);
}

export async function writeSpecArtifact(
  paths: ProjectPaths,
  spec: ProjectSpec,
): Promise<string> {
  const targetPath = path.join(paths.jobRoot, "project-spec.json");
  await writeJsonFile(targetPath, spec);
  return targetPath;
}

export async function writeTokensArtifact(
  paths: ProjectPaths,
  tokens: DesignTokens,
): Promise<string> {
  const targetPath = path.join(paths.designSystemDir, "tokens.json");
  await ensureDir(paths.designSystemDir);
  await writeJsonFile(targetPath, tokens);
  return targetPath;
}

export async function writeProjectReadme(
  paths: ProjectPaths,
  content: string,
): Promise<string> {
  const targetPath = path.join(paths.projectRoot, "README.md");
  await writeTextFile(targetPath, content);
  return targetPath;
}

export async function writeArchitectureDoc(
  paths: ProjectPaths,
  content: string,
): Promise<string> {
  const targetPath = path.join(paths.docsDir, "architecture-decisions", "0001-base.md");
  await ensureDir(path.dirname(targetPath));
  await writeTextFile(targetPath, content);
  return targetPath;
}

export async function writePageFile(
  paths: ProjectPaths,
  page: PageDefinition,
  content: string,
): Promise<string> {
  const routeSegments = page.route === "/" ? [] : page.route.replace(/^\//, "").split("/");
  const pageDir = path.join(paths.appDir, ...routeSegments);
  await ensureDir(pageDir);
  const filePath = path.join(pageDir, "page.tsx");
  await writeTextFile(filePath, content);
  return filePath;
}

export async function writeLayoutFile(paths: ProjectPaths, content: string): Promise<string> {
  const filePath = path.join(paths.appDir, "layout.tsx");
  await ensureDir(path.dirname(filePath));
  await writeTextFile(filePath, content);
  return filePath;
}

export async function writeGlobalsCss(paths: ProjectPaths, css: string): Promise<string> {
  const filePath = path.join(paths.appDir, "globals.css");
  await ensureDir(path.dirname(filePath));
  await writeTextFile(filePath, css);
  return filePath;
}

export function baseGlobalsCss(): string {
  return `:root {
  /* LAPIDATTO::TOKENS_START */
  --font-family-base: 'Inter', sans-serif;
  --font-family-headings: 'Clash Display', sans-serif;
  --color-background: #f8fafc;
  --color-foreground: #0f172a;
  --color-surface: #ffffff;
  --color-border: rgba(15, 23, 42, 0.12);
  --color-primary: #6366f1;
  --color-primary-foreground: #f8fafc;
  --color-muted: rgba(99, 102, 241, 0.12);
  --radius-lg: 24px;
  --radius-md: 16px;
  --radius-sm: 12px;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 8px 30px rgba(79, 70, 229, 0.15);
  --space-4: 16px;
  --space-6: 24px;
  /* LAPIDATTO::TOKENS_END */
}

body {
  margin: 0;
  font-family: var(--font-family-base);
  background: var(--color-background);
  color: var(--color-foreground);
}

*, *::before, *::after {
  box-sizing: border-box;
}

.bg-card {
  background: var(--color-surface);
}

.bg-muted {
  background: var(--color-muted);
}

.bg-surface {
  background: var(--color-surface);
}

.text-muted-foreground {
  color: color-mix(in srgb, var(--color-foreground) 65%, white 35%);
}

.text-primary {
  color: var(--color-primary);
}

.text-primary-foreground {
  color: var(--color-primary-foreground);
}

.border-border {
  border-color: var(--color-border);
}

.rounded-2xl {
  border-radius: var(--radius-md);
}

.rounded-3xl {
  border-radius: var(--radius-lg);
}

.shadow-sm {
  box-shadow: var(--shadow-sm);
}

.shadow-lg {
  box-shadow: var(--shadow-md);
}
`;
}
