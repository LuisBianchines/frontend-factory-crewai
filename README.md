# Lapidatto Frontend Factory · CrewAI Edition

Orquestrador Node.js/TypeScript que implementa o fluxo de geração de projetos Next.js padrão Lapidatto utilizando um time de agentes no estilo CrewAI. A API Fastify expõe os mesmos endpoints do prompt LangGraph (`/generate-project`, `/add-page`, `/approve/spec`, `/downloads/:jobId`).

## Visão geral

- **Stack**: Node.js 20+, TypeScript, Fastify, persistência em JSON, archiver para empacotamento e templates Next.js prontos para shadcn/Lapidatto.
- **Agentes** (definidos em [`src/crew/roles.ts`](src/crew/roles.ts)):
  - `PlannerAgent` – transforma o briefing em `ProjectSpec` estruturado.
  - `ArchitectAgent` – aplica o template Next.js, configura pacotes e estrutura.
  - `UIDSAgent` – gera tokens de design Lapidatto e injeta no CSS global.
  - `ScaffolderAgent` – materializa páginas, rotas e navegação seguindo o spec.
  - `QAAgent` – valida artefatos essenciais e scripts do projeto.
  - `DocsAgent` – produz README e ADR inicial.
- **Fluxo sequencial** (`src/crew/flows.ts`): Planner → Architect → UI/DS → Scaffolder → QA → Docs. Falhas de QA colocam o job em `qa_failed`, permitindo reexecução após ajustes.
- **Templates**: `src/templates/nextjs-base` contém o esqueleto Next.js (App Router, TypeScript, tokens Lapidatto marcados com `LAPIDATTO::TOKENS_*`).

## Arquitetura e módulos chave

```
lapidatto-frontend-factory-crewai/
├─ src/
│  ├─ api/server.ts              # API Fastify + endpoints REST
│  ├─ crew/
│  │  ├─ roles.ts                # definição dos seis agentes
│  │  ├─ tasks.ts                # tarefas executadas por cada agente
│  │  ├─ flows.ts                # orquestração do fluxo e hooks de aprovação
│  │  └─ tools.ts                # utilitários para scaffolding e documentação
│  ├─ contracts/                 # JSON Schemas (ProjectSpec + Design Tokens)
│  ├─ templates/nextjs-base/     # template Next.js base
│  └─ tools/                     # abstrações de FS, QA e zip
├─ data/jobs.json                # armazenado automaticamente no primeiro uso
└─ .lapidatto/                   # workspaces e zips gerados pela API
```

Persistência é feita via JSON (`JobStore`), garantindo estado após reinício. Cada job possui histórico de agentes, status, artefatos (spec, tokens, páginas, docs e zip) e QA result.

## Endpoints

| Método | Endpoint | Descrição |
| ------ | -------- | --------- |
| `POST` | `/generate-project` | Cria um novo job a partir de `projectName`, `briefing`, `template` (default `nextjs-base`) e opções adicionais. Retorna `jobId`, `status` e o `ProjectSpec` gerado pelo Planner. Com `autoApproveSpec: true` o fluxo segue automaticamente. |
| `POST` | `/approve/spec` | Recebe `{ jobId }`, marca o spec como aprovado e dispara o restante do fluxo (Architect → Docs). |
| `POST` | `/add-page` | Estende um projeto existente com uma nova página. Atualiza spec, layout, roda QA e recompila o zip. |
| `GET`  | `/downloads/:jobId` | Faz download do `.zip` gerado com o projeto Next.js completo. |
| `GET`  | `/jobs/:jobId` | Obtém snapshot do estado do job (status, histórico, artefatos). |
| `GET`  | `/health` | Saúde da API + nome do planner. |

### Coleção Postman

Importe `postman/lapidatto-frontend-factory.postman_collection.json` para testar rapidamente os endpoints. A coleção já traz variáveis `baseUrl` (default `http://localhost:3333`) e `jobId` para reaproveitar a resposta da criação do projeto ao aprovar o spec, adicionar páginas e baixar o `.zip`.

### Estrutura do ProjectSpec

O Planner produz um objeto conforme [`src/contracts/project_spec.schema.json`](src/contracts/project_spec.schema.json), incluindo:

- Identificação do projeto, resumo, objetivos e voz de comunicação;
- Lista de páginas com rota, layout (`marketing`, `dashboard` ou `informational`), SEO e componentes desejados;
- Requisitos de dados, integrações e stack técnica;
- Referência ao arquivo de tokens (`design-system/tokens.json`).

### Tokens de design

O `UIDSAgent` gera tokens validados por [`src/contracts/ds.tokens.schema.json`](src/contracts/ds.tokens.schema.json) e injeta variáveis CSS entre os marcadores `/* LAPIDATTO::TOKENS_START/END */` do `globals.css`.

## Como rodar localmente

1. **Instale dependências** (Node.js 20+):
   ```bash
   npm install
   ```
2. **Rodando em desenvolvimento** (Fastify + watch via `tsx`):
   ```bash
   npm run dev
   ```
   A API sobe em `http://localhost:3333` (pode alterar porta via `PORT`) e o terminal abre um modo interativo perguntando o nome, briefing e preferências do novo projeto. Basta responder para que o Planner gere o ProjectSpec; opcionalmente marque a autoaprovação para disparar o pipeline completo e acompanhar o progresso diretamente no console.
   - Pressione **Enter** no campo “Nome do projeto” para sair do modo interativo mantendo a API ativa.
   - Defina `LAPIDATTO_NO_INTERACTIVE=1` caso queira iniciar o servidor sem prompts (útil para executar apenas via HTTP/Postman).
3. **Build & produção**:
   ```bash
   npm run build
   npm start
   ```

### Fluxo típico

1. `POST /generate-project` com briefing → retorna `jobId` e `ProjectSpec` aguardando aprovação.
2. Revisar o `ProjectSpec` salvo em `data/jobs.json` / `project-spec.json` do workspace.
3. Aprovar via `POST /approve/spec` → pipeline completo é executado em background.
4. Consultar `GET /jobs/:jobId` ou baixar o zip final em `/downloads/:jobId`.
5. Para evoluções incrementais, usar `POST /add-page` com rota, descrição e componentes desejados.

### Estrutura de arquivos gerados

Após aprovação, cada job cria diretório em `.lapidatto/workspace/<jobId>/<slug-do-projeto>` contendo:

- Projeto Next.js completo (package.json atualizado com nome/descrição do spec);
- `design-system/tokens.json` com tokens Lapidatto;
- Páginas em `app/.../page.tsx` geradas pelo Scaffolder;
- `README.md` e `docs/architecture-decisions/0001-base.md` criados pelo DocsAgent;
- Zip final disponível em `.lapidatto/downloads/<jobId>.zip`.

### QA loop

O `QAAgent` verifica presença de `package.json`, scripts `lint`/`test`, `tsconfig` e páginas principais. Se falhar, o job fica em `qa_failed`; após ajustar o workspace, basta repetir `POST /approve/spec` (mesmo com o spec já aprovado) para limpar o erro e reiniciar o pipeline a partir do `ArchitectAgent`.

## Scripts npm

- `npm run dev` – inicia API com recarga.
- `npm run build` – compila TypeScript para `dist/`.
- `npm run start` – executa a versão compilada.
- `npm run lint` – usa `tsc --noEmit` para checar tipos.
- `npm run test` – placeholder (`node --test` desligado por padrão, retorna sucesso para integração CI simples).

## Convenções adicionais

- Dados persistidos em `data/jobs.json` (criado automaticamente).
- Diretórios temporários `.lapidatto/workspace` e `.lapidatto/downloads` são gerenciados pelo fluxo.
- Implementação dos agentes segue conceito Crew (Agents + Tasks + Flow) mas não depende de lib externa.

Sinta-se à vontade para adaptar os templates ou adicionar novos agentes/tarefas mantendo o padrão Lapidatto. Bons builds! ✨
