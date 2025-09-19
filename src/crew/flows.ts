import path from "path";
import {
  AddPageRequest,
  GenerationRequest,
  JobRecord,
  PageDefinition,
  ProjectSpec,
} from "../types";
import { JobStore, slugify } from "../tools/fsOps";
import { zipDirectory } from "../tools/zipUtils";
import {
  applyDesignSystem,
  buildPageDefinition,
  computePlannerOutput,
  generateDocumentation,
  runQualityGate,
  scaffoldPages,
  scaffoldSinglePage,
  setupArchitecture,
} from "./tasks";
import {
  renderLayout,
  resolveProjectPaths,
  writeLayoutFile,
  writeSpecArtifact,
} from "./tools";
import { assertValidDesignTokens, assertValidProjectSpec } from "../contracts/validators";
import {
  ArchitectAgent,
  DocsAgent,
  PlannerAgent,
  QAAgent,
  ScaffolderAgent,
  UIDSAgent,
} from "./roles";
import type { ProjectPaths } from "./tools";

export interface FlowConfig {
  jobStore: JobStore;
  workspaceRoot: string;
  templatesRoot: string;
  downloadsRoot: string;
}

interface ResumeContext {
  job: JobRecord;
  spec: ProjectSpec;
  paths: ProjectPaths;
  templateDir: string;
}

export class FlowOrchestrator {
  private readonly jobStore: JobStore;
  private readonly workspaceRoot: string;
  private readonly templatesRoot: string;
  private readonly downloadsRoot: string;

  constructor(config: FlowConfig) {
    this.jobStore = config.jobStore;
    this.workspaceRoot = config.workspaceRoot;
    this.templatesRoot = config.templatesRoot;
    this.downloadsRoot = config.downloadsRoot;
  }

  private async ensureJob(jobId: string): Promise<JobRecord> {
    const job = await this.jobStore.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} não encontrado.`);
    }
    return job;
  }

  private getTemplateDir(template: string): string {
    return path.join(this.templatesRoot, template);
  }

  private resolvePaths(job: JobRecord, spec: ProjectSpec): ProjectPaths {
    const slug = slugify(spec.projectName || `job-${job.id}`);
    return resolveProjectPaths(this.workspaceRoot, job.id, slug);
  }

  async planProject(jobId: string, request: GenerationRequest): Promise<ProjectSpec> {
    await this.jobStore.setStatus(jobId, "planning");
    const job = await this.ensureJob(jobId);
    const { spec, paths } = computePlannerOutput(job, request, this.workspaceRoot);
    assertValidProjectSpec(spec);

    await this.jobStore.setSpec(jobId, spec);
    const specPath = await writeSpecArtifact(paths, spec);
    await this.jobStore.setArtifacts(jobId, {
      projectRoot: paths.projectRoot,
      specPath,
    });
    await this.jobStore.appendHistory(jobId, {
      agent: PlannerAgent.id,
      task: "planner.generateSpec",
      status: "success",
      summary: "ProjectSpec criado e aguardando aprovação.",
    });
    await this.jobStore.updateJob(jobId, (record) => {
      record.approval.requestedAt = new Date().toISOString();
    });
    await this.jobStore.setStatus(jobId, "waiting_spec_approval");
    return spec;
  }

  private async buildResumeContext(jobId: string): Promise<ResumeContext> {
    const job = await this.ensureJob(jobId);
    if (!job.spec) {
      throw new Error("Job ainda não possui ProjectSpec aprovado.");
    }
    assertValidProjectSpec(job.spec);
    const paths = this.resolvePaths(job, job.spec);
    const templateDir = this.getTemplateDir(job.input.template);
    return { job, spec: job.spec, paths, templateDir };
  }

  async resumeAfterSpecApproval(jobId: string): Promise<void> {
    const context = await this.buildResumeContext(jobId);
    if (!context.job.approval.specApproved) {
      throw new Error("Spec precisa ser aprovado antes de prosseguir.");
    }

    try {
      await this.runArchitecture(jobId, context);
      const tokens = await this.runDesignSystem(jobId, context);
      await this.runScaffolding(jobId, context);
      const qa = await this.runQuality(jobId, context);
      if (!qa.success) {
        await this.jobStore.setStatus(jobId, "qa_failed");
        await this.jobStore.setError(jobId, qa.summary);
        return;
      }
      await this.runDocs(jobId, context, qa, tokens);
      await this.buildZip(jobId, context);
      await this.jobStore.setStatus(jobId, "completed");
      await this.jobStore.appendHistory(jobId, {
        agent: DocsAgent.id,
        task: "delivery.completed",
        status: "success",
        summary: "Fluxo concluído com zip disponível para download.",
      });
    } catch (error) {
      await this.jobStore.setStatus(jobId, "failed");
      await this.jobStore.setError(jobId, error instanceof Error ? error.message : String(error));
      await this.jobStore.appendHistory(jobId, {
        agent: "system",
        task: "flow.error",
        status: "failed",
        summary: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async runArchitecture(jobId: string, context: ResumeContext): Promise<void> {
    await this.jobStore.setStatus(jobId, "architecting");
    await setupArchitecture(context.paths, context.templateDir, context.spec);
    await this.jobStore.appendHistory(jobId, {
      agent: ArchitectAgent.id,
      task: "architecture.setup",
      status: "success",
      summary: "Template Next.js Lapidatto estruturado.",
    });
    await this.jobStore.setArtifacts(jobId, { projectRoot: context.paths.projectRoot });
  }

  private async runDesignSystem(jobId: string, context: ResumeContext) {
    await this.jobStore.setStatus(jobId, "ui_design");
    const tokens = assertValidDesignTokens(
      await applyDesignSystem(context.paths, context.spec),
    );
    await this.jobStore.setTokens(jobId, tokens, path.join(context.paths.designSystemDir, "tokens.json"));
    await this.jobStore.appendHistory(jobId, {
      agent: UIDSAgent.id,
      task: "ui.tokens",
      status: "success",
      summary: `Tokens Lapidatto (${tokens.themeName}) aplicados ao projeto.`,
    });
    return tokens;
  }

  private async runScaffolding(jobId: string, context: ResumeContext) {
    await this.jobStore.setStatus(jobId, "scaffolding");
    const pages = await scaffoldPages(context.paths, context.spec);
    await this.jobStore.setArtifacts(jobId, { pages });
    await this.jobStore.appendHistory(jobId, {
      agent: ScaffolderAgent.id,
      task: "scaffolder.pages",
      status: "success",
      summary: `${Object.keys(pages).length} páginas criadas com storytelling Lapidatto.`,
    });
    return pages;
  }

  private async runQuality(jobId: string, context: ResumeContext) {
    await this.jobStore.setStatus(jobId, "qa");
    const qa = await runQualityGate(context.paths);
    await this.jobStore.setQA(jobId, qa);
    await this.jobStore.appendHistory(jobId, {
      agent: QAAgent.id,
      task: "qa.run",
      status: qa.success ? "success" : "failed",
      summary: qa.summary,
    });
    return qa;
  }

  private async runDocs(jobId: string, context: ResumeContext, qa: Awaited<ReturnType<typeof runQualityGate>>, tokens: Awaited<ReturnType<typeof applyDesignSystem>>) {
    await this.jobStore.setStatus(jobId, "docs");
    const docs = await generateDocumentation(context.paths, context.spec, qa, tokens);
    await this.jobStore.setArtifacts(jobId, { docs });
    await this.jobStore.appendHistory(jobId, {
      agent: DocsAgent.id,
      task: "docs.generate",
      status: "success",
      summary: "Documentação final gerada.",
    });
  }

  private async buildZip(jobId: string, context: ResumeContext) {
    const zipPath = path.join(this.downloadsRoot, `${jobId}.zip`);
    await zipDirectory(context.paths.projectRoot, zipPath);
    await this.jobStore.setArtifacts(jobId, { zipPath });
  }

  async addPage(jobId: string, payload: AddPageRequest["page"]): Promise<PageDefinition> {
    const job = await this.ensureJob(jobId);
    if (!job.spec) {
      throw new Error("Job ainda não possui ProjectSpec gerado.");
    }
    const page = buildPageDefinition({
      name: payload.name,
      route: payload.route.startsWith("/") ? payload.route : `/${payload.route}`,
      description: payload.description,
      layout: payload.layout ?? "marketing",
      components: payload.components,
    });
    job.spec.pages.push(page);
    assertValidProjectSpec(job.spec);
    await this.jobStore.setSpec(jobId, job.spec);

    const paths = this.resolvePaths(job, job.spec);
    const specPath = await writeSpecArtifact(paths, job.spec);
    await writeLayoutFile(paths, renderLayout(job.spec));
    const filePath = await scaffoldSinglePage(paths, job.spec, page);
    await this.jobStore.setArtifacts(jobId, {
      specPath,
      pages: { [page.route]: filePath },
    });
    await this.jobStore.appendHistory(jobId, {
      agent: ScaffolderAgent.id,
      task: "scaffolder.addPage",
      status: "success",
      summary: `Página ${page.name} adicionada via endpoint /add-page.`,
    });

    await this.jobStore.setStatus(jobId, "qa");
    const qa = await runQualityGate(paths);
    await this.jobStore.setQA(jobId, qa);
    await this.jobStore.appendHistory(jobId, {
      agent: QAAgent.id,
      task: "qa.run",
      status: qa.success ? "success" : "failed",
      summary: `QA após add-page: ${qa.summary}`,
    });

    if (qa.success) {
      const docs = await generateDocumentation(paths, job.spec, qa, job.tokens);
      await this.jobStore.setArtifacts(jobId, { docs });
      const zipPath = path.join(this.downloadsRoot, `${jobId}.zip`);
      await zipDirectory(paths.projectRoot, zipPath);
      await this.jobStore.setArtifacts(jobId, { zipPath });
      await this.jobStore.setStatus(jobId, "completed");
    } else {
      await this.jobStore.setStatus(jobId, "qa_failed");
    }

    return page;
  }
}
