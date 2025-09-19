import fs from "fs";
import path from "path";
import { createInterface } from "node:readline/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { FlowOrchestrator } from "../crew/flows";
import { JobStore, ensureDir, slugify } from "../tools/fsOps";
import { AddPageRequest, GenerationRequest } from "../types";
import type { JobRecord, JobStatus } from "../types";
import { PlannerAgent } from "../crew/roles";

const server = Fastify({ logger: true });

interface ServerContext {
  jobStore: JobStore;
  orchestrator: FlowOrchestrator;
}

async function bootstrap(): Promise<ServerContext> {
  await server.register(cors, { origin: true });

  const workspaceRoot = path.resolve(".lapidatto/workspace");
  const downloadsRoot = path.resolve(".lapidatto/downloads");
  await ensureDir(workspaceRoot);
  await ensureDir(downloadsRoot);

  const jobStore = new JobStore();
  const orchestrator = new FlowOrchestrator({
    jobStore,
    workspaceRoot,
    templatesRoot: path.resolve("src/templates"),
    downloadsRoot,
  });

  server.get("/health", async () => ({ status: "ok", agent: PlannerAgent.name }));

  server.post("/generate-project", async (request, reply) => {
    const body = request.body as Partial<GenerationRequest>;
    if (!body?.projectName || !body?.briefing) {
      reply.code(400);
      return { error: "projectName e briefing são obrigatórios." };
    }
    const jobInput: GenerationRequest = {
      projectName: body.projectName,
      template: body.template ?? "nextjs-base",
      briefing: body.briefing,
      targetAudience: body.targetAudience,
      goals: body.goals ?? [],
      features: body.features ?? [],
      autoApproveSpec: body.autoApproveSpec ?? false,
    };
    const job = await jobStore.createJob(jobInput);
    const spec = await orchestrator.planProject(job.id, jobInput);

    let status = "waiting_spec_approval";
    if (jobInput.autoApproveSpec) {
      status = "architecting";
      await jobStore.updateJob(job.id, (record) => {
        record.approval.specApproved = true;
        record.approval.approvedAt = new Date().toISOString();
      });
      orchestrator.resumeAfterSpecApproval(job.id).catch((error) => {
        server.log.error({ err: error, jobId: job.id }, "Falha ao continuar fluxo após auto-approve");
      });
    }

    return { jobId: job.id, status, spec };
  });

  server.post("/approve/spec", async (request, reply) => {
    const body = request.body as { jobId?: string };
    if (!body?.jobId) {
      reply.code(400);
      return { error: "jobId é obrigatório." };
    }
    const job = await jobStore.getJob(body.jobId);
    if (!job) {
      reply.code(404);
      return { error: "Job não encontrado." };
    }
    const approvedAt = new Date().toISOString();
    const resumeFlow = () =>
      orchestrator.resumeAfterSpecApproval(job.id).catch((error) => {
        server.log.error({ err: error, jobId: job.id }, "Erro ao continuar fluxo após aprovação");
      });

    if (!job.approval.specApproved) {
      await jobStore.updateJob(job.id, (record) => {
        record.approval.specApproved = true;
        record.approval.approvedAt = approvedAt;
        record.error = undefined;
        record.qa = undefined;
      });
      await jobStore.setStatus(job.id, "architecting");
      await jobStore.appendHistory(job.id, {
        agent: "client",
        task: "spec.approve",
        status: "success",
        summary: "ProjectSpec aprovado manualmente via API.",
      });
      resumeFlow();
      return { jobId: job.id, status: "architecting" };
    }

    if (job.status === "qa_failed" || job.status === "failed") {
      await jobStore.updateJob(job.id, (record) => {
        record.status = "architecting";
        record.error = undefined;
        record.approval.approvedAt = approvedAt;
        record.qa = undefined;
      });
      await jobStore.appendHistory(job.id, {
        agent: "client",
        task: "spec.reapprove",
        status: "success",
        summary: "Fluxo reexecutado após falha anterior.",
      });
      resumeFlow();
      return { jobId: job.id, status: "architecting" };
    }

    return { jobId: job.id, status: job.status };
  });

  server.post("/add-page", async (request, reply) => {
    const body = request.body as AddPageRequest;
    if (!body?.jobId || !body?.page) {
      reply.code(400);
      return { error: "jobId e dados da página são obrigatórios." };
    }
    try {
      const page = await orchestrator.addPage(body.jobId, body.page);
      const job = await jobStore.getJob(body.jobId);
      return { jobId: body.jobId, status: job?.status, page, qa: job?.qa };
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  server.get("/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await jobStore.getJob(jobId);
    if (!job) {
      reply.code(404);
      return { error: "Job não encontrado." };
    }
    return job;
  });

  server.get("/downloads/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await jobStore.getJob(jobId);
    if (!job) {
      reply.code(404);
      return { error: "Job não encontrado." };
    }
    const zipPath = job.artifacts.zipPath ?? path.join(downloadsRoot, `${jobId}.zip`);
    if (!fs.existsSync(zipPath)) {
      reply.code(404);
      return { error: "Arquivo ainda não gerado." };
    }
    reply.header("Content-Type", "application/zip");
    const filename = `${slugify(job.spec?.projectName ?? jobId)}.zip`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(fs.createReadStream(zipPath));
  });

  return { jobStore, orchestrator };
}

const ready = bootstrap();

ready.catch((error) => {
  server.log.error(error, "Erro ao inicializar servidor");
  process.exit(1);
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3333);
  ready.then((context) => {
    server.listen({ port, host: "0.0.0.0" }, (err, address) => {
      if (err) {
        server.log.error(err);
        process.exit(1);
      }
      server.log.info(`API Lapidatto pronta em ${address}`);
      const baseUrl = process.env.LAPIDATTO_BASE_URL ?? `http://localhost:${port}`;
      startInteractivePrompt({ ...context, baseUrl }).catch((error) => {
        server.log.error(error, "Erro ao executar modo interativo");
      });
    });
  });
}

export default server;

interface InteractiveContext extends ServerContext {
  baseUrl: string;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  planning: "Planejando ProjectSpec",
  waiting_spec_approval: "Aguardando aprovação do ProjectSpec",
  architecting: "Configurando template Next.js",
  ui_design: "Aplicando design system Lapidatto",
  scaffolding: "Gerando páginas e rotas",
  qa: "Executando QA automatizado",
  qa_failed: "QA reprovado",
  docs: "Gerando documentação",
  completed: "Fluxo concluído",
  failed: "Fluxo interrompido",
};

const TERMINAL_STATUSES = new Set<JobStatus>(["completed", "qa_failed", "failed"]);

async function startInteractivePrompt(context: InteractiveContext): Promise<void> {
  if (process.env.LAPIDATTO_NO_INTERACTIVE === "1") {
    server.log.info("Modo interativo desabilitado via LAPIDATTO_NO_INTERACTIVE.");
    return;
  }

  if (!process.stdin.isTTY) {
    server.log.info("Modo interativo indisponível: stdin não é um TTY.");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n=== Lapidatto Frontend Factory · Modo Interativo ===");
  console.log("Responda às perguntas para gerar um novo projeto Next.js Lapidatto.");
  console.log("Pressione Enter sem digitar o nome do projeto para sair.\n");

  try {
    while (true) {
      const projectName = (await rl.question("Nome do projeto (Enter para sair): ")).trim();
      if (!projectName) {
        console.log(`\nModo interativo encerrado. A API segue disponível em ${context.baseUrl}.`);
        break;
      }

      let briefing = "";
      while (!briefing) {
        briefing = (await rl.question("Briefing/resumo do projeto: ")).trim();
        if (!briefing) {
          console.log("Informe um briefing para continuar.");
        }
      }

      const templateInput = (await rl.question("Template Next.js (padrão: nextjs-base): ")).trim();
      const template = templateInput || "nextjs-base";
      const targetAudienceInput = (await rl.question("Público-alvo (opcional): ")).trim();
      const goalsInput = (await rl.question("Metas principais (separe por vírgula, opcional): ")).trim();
      const featuresInput = (await rl.question("Funcionalidades-chave (separe por vírgula, opcional): ")).trim();
      const autoApproveAnswer = (await rl.question("Aprovar ProjectSpec automaticamente? (s/N): "))
        .trim()
        .toLowerCase();
      const autoApproveSpec = autoApproveAnswer.startsWith("s");

      const generationRequest: GenerationRequest = {
        projectName,
        briefing,
        template,
        targetAudience: targetAudienceInput || undefined,
        goals: parseList(goalsInput),
        features: parseList(featuresInput),
        autoApproveSpec,
      };

      console.log("\n📋 Planejando ProjectSpec...");
      const job = await context.jobStore.createJob(generationRequest);
      const spec = await context.orchestrator.planProject(job.id, generationRequest);
      const snapshot = await context.jobStore.getJob(job.id);

      console.log(`\n✅ ProjectSpec criado para "${spec.projectName}".`);
      console.log(`• Job ID: ${job.id}`);
      if (snapshot?.artifacts.specPath) {
        console.log(`• Arquivo do spec: ${snapshot.artifacts.specPath}`);
      }
      if (snapshot?.artifacts.projectRoot) {
        console.log(`• Workspace: ${snapshot.artifacts.projectRoot}`);
      }
      if (spec.pages?.length) {
        const pageNames = spec.pages.map((page) => page.name).join(", ");
        console.log(`• Páginas planejadas: ${pageNames}`);
      }
      console.log(`• Acompanhe o job em ${context.baseUrl}/jobs/${job.id}`);

      if (autoApproveSpec) {
        console.log("\n🚀 Autoaprovação habilitada. Iniciando pipeline completo...");
        await context.jobStore.updateJob(job.id, (record) => {
          record.approval.specApproved = true;
          record.approval.approvedAt = new Date().toISOString();
          record.error = undefined;
          record.qa = undefined;
        });

        const flowPromise = context.orchestrator.resumeAfterSpecApproval(job.id);
        flowPromise.catch((error) => {
          server.log.error({ err: error, jobId: job.id }, "Falha no fluxo após autoaprovação");
        });

        const finalJob = await monitorJobProgress(context.jobStore, job.id);
        await flowPromise.catch(() => undefined);

        if (finalJob) {
          reportFinalStatus(finalJob, context.baseUrl);
        }
      } else {
        console.log("\n🤝 Revise o ProjectSpec e aprove quando estiver pronto:");
        console.log(
          `   curl -X POST ${context.baseUrl}/approve/spec -H "Content-Type: application/json" -d '{"jobId":"${job.id}"}'`,
        );
        console.log(
          "   ou utilize a coleção Postman em postman/lapidatto-frontend-factory.postman_collection.json",
        );
      }

      const again = (await rl.question("\nGerar outro projeto agora? (s/N): ")).trim().toLowerCase();
      if (!again.startsWith("s")) {
        console.log(`\nModo interativo encerrado. A API continua ativa em ${context.baseUrl}.`);
        break;
      }
      console.log("");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Erro no modo interativo: ${message}`);
    server.log.error({ err: error }, "Erro durante prompts interativos");
  } finally {
    rl.close();
  }
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function monitorJobProgress(jobStore: JobStore, jobId: string): Promise<JobRecord | undefined> {
  let lastStatus: JobStatus | undefined;
  let lastHistoryIndex = 0;

  while (true) {
    const job = await jobStore.getJob(jobId);
    if (!job) {
      console.log("Job não encontrado ou removido.");
      return undefined;
    }

    if (job.status !== lastStatus) {
      const label = STATUS_LABELS[job.status] ?? job.status;
      console.log(`\n[${job.status}] ${label}`);
      lastStatus = job.status;
    }

    if (job.history.length > lastHistoryIndex) {
      const recent = job.history.slice(lastHistoryIndex);
      for (const entry of recent) {
        const icon = entry.status === "success" ? "✓" : "✗";
        console.log(`  ${icon} ${entry.agent}: ${entry.summary}`);
      }
      lastHistoryIndex = job.history.length;
    }

    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    await wait(1000);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportFinalStatus(job: JobRecord, baseUrl: string): void {
  if (job.status === "completed") {
    console.log("\n✅ Projeto concluído com sucesso!");
    if (job.artifacts.projectRoot) {
      console.log(`• Pasta do projeto: ${job.artifacts.projectRoot}`);
    }
    const zipPath = job.artifacts.zipPath ?? path.join(".lapidatto/downloads", `${job.id}.zip`);
    console.log(`• Zip local: ${zipPath}`);
    console.log(`• Download via API: ${baseUrl}/downloads/${job.id}`);
    if (job.qa) {
      console.log(`• QA: ${job.qa.summary}`);
    }
  } else if (job.status === "qa_failed") {
    const reason = job.qa?.summary ?? job.error ?? "Verifique os artefatos gerados.";
    console.log("\n⚠️ QA reprovado.");
    console.log(`• Motivo: ${reason}`);
    console.log("• Ajuste o workspace e repita POST /approve/spec para reexecutar.");
  } else if (job.status === "failed") {
    const reason = job.error ?? "Motivo não informado.";
    console.log("\n❌ Fluxo interrompido.");
    console.log(`• Erro: ${reason}`);
    console.log("• Consulte os logs e o histórico do job para detalhes.");
  }
}
