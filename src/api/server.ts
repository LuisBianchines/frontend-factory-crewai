import fs from "fs";
import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { FlowOrchestrator } from "../crew/flows";
import { JobStore, ensureDir, slugify } from "../tools/fsOps";
import { AddPageRequest, GenerationRequest } from "../types";
import { PlannerAgent } from "../crew/roles";

const server = Fastify({ logger: true });

async function bootstrap() {
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
    if (job.approval.specApproved) {
      return { jobId: job.id, status: job.status };
    }
    await jobStore.updateJob(job.id, (record) => {
      record.approval.specApproved = true;
      record.approval.approvedAt = new Date().toISOString();
    });
    orchestrator.resumeAfterSpecApproval(job.id).catch((error) => {
      server.log.error({ err: error, jobId: job.id }, "Erro ao continuar fluxo após aprovação");
    });
    return { jobId: job.id, status: "architecting" };
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

  return server;
}

const ready = bootstrap();

ready.catch((error) => {
  server.log.error(error, "Erro ao inicializar servidor");
  process.exit(1);
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3333);
  ready.then(() => {
    server.listen({ port, host: "0.0.0.0" }, (err, address) => {
      if (err) {
        server.log.error(err);
        process.exit(1);
      }
      server.log.info(`API Lapidatto pronta em ${address}`);
    });
  });
}

export default server;
