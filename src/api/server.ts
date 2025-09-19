import fs from "fs";
import path from "path";
import { createInterface } from "node:readline/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { FlowOrchestrator } from "../crew/flows";
import { JobStore, ensureDir, slugify } from "../tools/fsOps";
import { AddPageRequest, GenerationRequest } from "../types";
import type { JobRecord, JobStatus } from "../types";
import { PlannerAgent } from "../crew/roles";
import { InteractiveAssistant } from "../services/interactive-assistant";

const execAsync = promisify(exec);

// Função para verificar se uma porta está em uso
async function isPortInUse(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// Função para matar processos em uma porta específica
async function killProcessOnPort(port: number): Promise<void> {
  try {
    await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
    console.log(`🔄 Processos na porta ${port} finalizados`);
    // Aguarda um momento para garantir que a porta seja liberada
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.log(`⚠️  Não foi possível finalizar processos na porta ${port}`);
  }
}

// Função para preparar a porta (matar processos se necessário)
async function preparePort(port: number): Promise<void> {
  const portBusy = await isPortInUse(port);
  if (portBusy) {
    console.log(`⚡ Porta ${port} ocupada - finalizando processos...`);
    await killProcessOnPort(port);
  }
}

// Função para tentar iniciar o servidor em uma porta
async function startServer(server: any, context: any, port: number, retryCount = 0): Promise<void> {
  const maxRetries = 3;
  
  try {
    await preparePort(port);
    
    return new Promise((resolve, reject) => {
      server.listen({ port, host: "0.0.0.0" }, (err: any, address: string) => {
        if (err) {
          if (err.code === 'EADDRINUSE' && retryCount < maxRetries) {
            console.log(`⚠️  Porta ${port} ainda ocupada, tentativa ${retryCount + 1}/${maxRetries}`);
            // Aguarda mais um pouco e tenta novamente
            setTimeout(() => {
              startServer(server, context, port, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, 2000);
          } else {
            reject(err);
          }
          return;
        }
        
        console.log(`🚀 API Lapidatto iniciada em ${address}`);
        
        const baseUrl = process.env.LAPIDATTO_BASE_URL ?? `http://localhost:${port}`;
        startInteractivePrompt({ ...context, baseUrl }).catch((error) => {
          console.error("❌ Erro no modo interativo:", error.message);
        });
        
        resolve();
      });
    });
  } catch (error) {
    throw error;
  }
}

const server = Fastify({ 
  logger: process.env.NODE_ENV === "development" ? false : true 
});

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
  
  ready.then(async (context) => {
    try {
      await startServer(server, context, port);
    } catch (error) {
      console.error("❌ Falha crítica ao iniciar servidor:", error);
      process.exit(1);
    }
  });
}

export default server;

interface InteractiveContext extends ServerContext {
  baseUrl: string;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  planning: "📋 Planejando ProjectSpec",
  waiting_spec_approval: "⏳ Aguardando aprovação do ProjectSpec", 
  architecting: "🏗️  Configurando template Next.js",
  ui_design: "🎨 Aplicando design system Lapidatto",
  scaffolding: "📁 Gerando páginas e rotas",
  qa: "🔍 Executando QA automatizado",
  qa_failed: "❌ QA reprovado",
  docs: "📚 Gerando documentação",
  completed: "✅ Fluxo concluído",
  failed: "💥 Fluxo interrompido",
};

const TERMINAL_STATUSES = new Set<JobStatus>(["completed", "qa_failed", "failed"]);

// Utilitários para melhor apresentação visual
function clearScreen(): void {
  console.clear();
}

function printHeader(): void {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║               🏭 Lapidatto Frontend Factory                   ║");
  console.log("║                      Modo Interativo                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("\n🚀 Gerador automático de projetos Next.js com IA");
  console.log("💡 Pressione Enter sem digitar nada para sair a qualquer momento\n");
}

function printDivider(): void {
  console.log("\n" + "─".repeat(64) + "\n");
}

function printSuccess(message: string): void {
  console.log(`✅ ${message}`);
}

function printInfo(message: string): void {
  console.log(`ℹ️  ${message}`);
}

function printWarning(message: string): void {
  console.log(`⚠️  ${message}`);
}

function printError(message: string): void {
  console.log(`❌ ${message}`);
}

async function startInteractivePrompt(context: InteractiveContext): Promise<void> {
  if (process.env.LAPIDATTO_NO_INTERACTIVE === "1") {
    console.log("🔇 Modo interativo desabilitado via LAPIDATTO_NO_INTERACTIVE");
    return;
  }

  if (!process.stdin.isTTY) {
    console.log("⚠️  Modo interativo indisponível: stdin não é um TTY");
    return;
  }

  // Aguarda um pouco para o servidor estar pronto
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  clearScreen();
  printHeader();

  const rl = createInterface({ 
    input: process.stdin, 
    output: process.stdout,
    terminal: true
  });
  
  const assistant = new InteractiveAssistant();
  
  // Função para prompts com assistente
  const promptWithAssistant = async (question: string, questionType?: string, required: boolean = false): Promise<string> => {
    while (true) {
      const answer = (await rl.question(question)).trim();
      
      // Se usuário pedir ajuda
      if (answer.toLowerCase().includes('ajuda') || 
          answer.toLowerCase().includes('sugestão') || 
          answer.toLowerCase().includes('sugestoes') ||
          answer.toLowerCase().includes('sugestões') ||
          answer.toLowerCase().includes('não entendi') ||
          answer.toLowerCase().includes('nao entendi') ||
          answer.toLowerCase().includes('help') ||
          answer === '?') {
        
        const suggestions = await assistant.getSuggestions(questionType || 'general');
        console.log(assistant.formatSuggestion(suggestions));
        continue; // Volta para a pergunta
      }
      
      // Se campo é obrigatório mas está vazio
      if (required && !answer) {
        printWarning("Este campo é obrigatório. Digite 'ajuda' para sugestões ou forneça uma resposta.");
        continue;
      }
      
      return answer;
    }
  };
  
  // Handler para cleanup adequado
  const cleanup = () => {
    rl.close();
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    console.log("🤖 Dica: Digite 'ajuda' ou '?' para obter sugestões da Ana Clara sobre como descrever seu projeto!\n");
    
    while (true) {
      printDivider();
      console.log("📝 Vamos criar um novo projeto!");
      console.log();
      
      const projectName = await promptWithAssistant("📦 Nome do projeto (ou Enter para sair): ");
      if (!projectName) {
        console.log("\n👋 Modo interativo encerrado.");
        printInfo(`A API continua disponível em ${context.baseUrl}`);
        break;
      }

      const briefing = await promptWithAssistant(
        "📋 Descreva detalhadamente o que você quer criar (ou 'ajuda' para sugestões): ", 
        "briefing", 
        true
      );
      
      const autoApproveAnswer = (await rl.question("🚀 Gerar projeto automaticamente? (S/n): "))
        .trim()
        .toLowerCase();
      const autoApproveSpec = !autoApproveAnswer.startsWith("n");

      const generationRequest: GenerationRequest = {
        projectName,
        briefing,
        template: "nextjs-base", // Sempre usar template base e deixar agentes decidirem a estrutura
        targetAudience: undefined, // Será extraído do briefing pelos agentes
        goals: [], // Será extraído do briefing pelos agentes
        features: [], // Será extraído do briefing pelos agentes
        autoApproveSpec,
      };

      console.log("\n� Iniciando geração do projeto...");
      console.log("�📋 Planejando ProjectSpec...");
      
      const job = await context.jobStore.createJob(generationRequest);
      const spec = await context.orchestrator.planProject(job.id, generationRequest);
      const snapshot = await context.jobStore.getJob(job.id);

      printDivider();
      printSuccess(`ProjectSpec criado para "${spec.projectName}"`);
      console.log(`🆔 Job ID: ${job.id}`);
      
      if (snapshot?.artifacts.specPath) {
        printInfo(`Spec salvo em: ${snapshot.artifacts.specPath}`);
      }
      if (snapshot?.artifacts.projectRoot) {
        printInfo(`Workspace: ${snapshot.artifacts.projectRoot}`);
      }
      if (spec.pages?.length) {
        const pageNames = spec.pages.map((page) => page.name).join(", ");
        printInfo(`Páginas planejadas: ${pageNames}`);
      }
      printInfo(`Acompanhe em: ${context.baseUrl}/jobs/${job.id}`);

      if (autoApproveSpec) {
        console.log("\n🚀 Autoaprovação habilitada - Executando pipeline completo...");
        await context.jobStore.updateJob(job.id, (record) => {
          record.approval.specApproved = true;
          record.approval.approvedAt = new Date().toISOString();
          record.error = undefined;
          record.qa = undefined;
        });

        const flowPromise = context.orchestrator.resumeAfterSpecApproval(job.id);
        flowPromise.catch((error) => {
          console.error(`❌ Erro no fluxo: ${error.message}`);
        });

        const finalJob = await monitorJobProgress(context.jobStore, job.id);
        await flowPromise.catch(() => undefined);

        if (finalJob) {
          reportFinalStatus(finalJob, context.baseUrl);
        }
      } else {
        console.log("\n⏳ Aguardando aprovação manual do ProjectSpec");
        console.log("📝 Para aprovar, use um dos métodos abaixo:");
        console.log(`   • API: curl -X POST ${context.baseUrl}/approve/spec -H "Content-Type: application/json" -d '{"jobId":"${job.id}"}'`);
        console.log("   • Postman: Use a coleção em postman/lapidatto-frontend-factory.postman_collection.json");
      }

      printDivider();
      const again = (await rl.question("🔄 Gerar outro projeto? (s/N): ")).trim().toLowerCase();
      if (!again.startsWith("s")) {
        console.log("\n👋 Sessão encerrada!");
        printInfo(`API disponível em: ${context.baseUrl}`);
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(`Erro no modo interativo: ${message}`);
  } finally {
    // Remove os handlers de processo para evitar vazamentos
    process.removeListener('SIGINT', cleanup);
    process.removeListener('SIGTERM', cleanup);
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

  console.log("\n🔄 Acompanhando progresso do projeto...\n");

  while (true) {
    const job = await jobStore.getJob(jobId);
    if (!job) {
      printError("Job não encontrado ou removido");
      return undefined;
    }

    if (job.status !== lastStatus) {
      const label = STATUS_LABELS[job.status] ?? `🔄 ${job.status}`;
      console.log(`${label}`);
      lastStatus = job.status;
    }

    if (job.history.length > lastHistoryIndex) {
      const recent = job.history.slice(lastHistoryIndex);
      for (const entry of recent) {
        const icon = entry.status === "success" ? "  ✓" : "  ✗";
        console.log(`${icon} ${entry.agent}: ${entry.summary}`);
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
  printDivider();
  
  if (job.status === "completed") {
    console.log("🎉 PROJETO CONCLUÍDO COM SUCESSO! 🎉");
    console.log();
    
    if (job.artifacts.projectRoot) {
      printSuccess(`Projeto salvo em: ${job.artifacts.projectRoot}`);
    }
    
    const zipPath = job.artifacts.zipPath ?? path.join(".lapidatto/downloads", `${job.id}.zip`);
    printInfo(`Arquivo ZIP: ${zipPath}`);
    printInfo(`Download via API: ${baseUrl}/downloads/${job.id}`);
    
    if (job.qa) {
      printInfo(`QA: ${job.qa.summary}`);
    }
    
    console.log("\n🚀 Seu projeto está pronto para uso!");
    
  } else if (job.status === "qa_failed") {
    const reason = job.qa?.summary ?? job.error ?? "Verifique os artefatos gerados";
    printWarning("QA REPROVADO");
    console.log();
    printError(`Motivo: ${reason}`);
    printInfo("Ajuste o workspace e execute POST /approve/spec para tentar novamente");
    
  } else if (job.status === "failed") {
    const reason = job.error ?? "Motivo não informado";
    printError("FLUXO INTERROMPIDO");
    console.log();
    printError(`Erro: ${reason}`);
    printInfo("Consulte os logs e histórico do job para mais detalhes");
  }
}
