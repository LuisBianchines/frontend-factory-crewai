import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fse from "fs-extra";
import { nanoid } from "nanoid";
import {
  GenerationRequest,
  JobHistoryEntry,
  JobRecord,
  JobStatus,
} from "../types";

const DEFAULT_DATA_FILE = path.resolve("data/jobs.json");

interface JobStoreData {
  jobs: Record<string, JobRecord>;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch (error) {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fse.mkdirp(dir);
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content, "utf-8");
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}

export async function readTextFile(filePath: string): Promise<string> {
  return fsp.readFile(filePath, "utf-8");
}

export async function copyTemplateDir(templateDir: string, destination: string): Promise<void> {
  await ensureDir(path.dirname(destination));
  await fse.copy(templateDir, destination, { overwrite: true, recursive: true });
}

export async function removeDir(target: string): Promise<void> {
  if (await pathExists(target)) {
    await fse.remove(target);
  }
}

export async function fileExists(target: string): Promise<boolean> {
  return pathExists(target);
}

async function ensureStoreFile(storeFile: string): Promise<void> {
  await ensureDir(path.dirname(storeFile));
  if (!(await pathExists(storeFile))) {
    const initialData: JobStoreData = { jobs: {} };
    await writeJsonFile(storeFile, initialData);
  }
}

async function readStore(storeFile: string): Promise<JobStoreData> {
  await ensureStoreFile(storeFile);
  const content = await fsp.readFile(storeFile, "utf-8");
  try {
    return JSON.parse(content) as JobStoreData;
  } catch (error) {
    return { jobs: {} };
  }
}

async function writeStore(storeFile: string, data: JobStoreData): Promise<void> {
  await ensureDir(path.dirname(storeFile));
  await fsp.writeFile(storeFile, JSON.stringify(data, null, 2), "utf-8");
}

function nowIso(): string {
  return new Date().toISOString();
}

export class JobStore {
  private readonly storeFile: string;

  constructor(storeFile: string = DEFAULT_DATA_FILE) {
    this.storeFile = storeFile;
  }

  async createJob(input: GenerationRequest): Promise<JobRecord> {
    const store = await readStore(this.storeFile);
    const id = nanoid(12);
    const timestamp = nowIso();
    const job: JobRecord = {
      id,
      status: "planning",
      input,
      approval: {
        specApproved: false,
      },
      history: [],
      artifacts: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.jobs[id] = job;
    await writeStore(this.storeFile, store);
    return job;
  }

  async getJob(jobId: string): Promise<JobRecord | undefined> {
    const store = await readStore(this.storeFile);
    return store.jobs[jobId];
  }

  async listJobs(): Promise<JobRecord[]> {
    const store = await readStore(this.storeFile);
    return Object.values(store.jobs).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  async updateJob(jobId: string, updater: (job: JobRecord) => void): Promise<JobRecord> {
    const store = await readStore(this.storeFile);
    const job = store.jobs[jobId];
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    updater(job);
    job.updatedAt = nowIso();
    store.jobs[jobId] = job;
    await writeStore(this.storeFile, store);
    return job;
  }

  async setStatus(jobId: string, status: JobStatus): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      job.status = status;
    });
  }

  async appendHistory(jobId: string, entry: Omit<JobHistoryEntry, "timestamp"> & { timestamp?: string }): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      const timestamp = entry.timestamp ?? nowIso();
      job.history.push({ ...entry, timestamp });
    });
  }

  async setSpec(jobId: string, spec: JobRecord["spec"], specPath?: string): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      job.spec = spec;
      if (specPath) {
        job.artifacts.specPath = specPath;
      }
    });
  }

  async setTokens(jobId: string, tokens: JobRecord["tokens"], tokenPath?: string): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      job.tokens = tokens ?? undefined;
      if (tokenPath) {
        job.artifacts.tokensPath = tokenPath;
      }
    });
  }

  async setArtifacts(jobId: string, artifacts: Partial<JobRecord["artifacts"]>): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      job.artifacts = {
        ...job.artifacts,
        ...artifacts,
        pages: {
          ...(job.artifacts.pages ?? {}),
          ...(artifacts.pages ?? {}),
        },
        docs: {
          ...(job.artifacts.docs ?? {}),
          ...(artifacts.docs ?? {}),
        },
      };
    });
  }

  async setQA(jobId: string, qa: JobRecord["qa"]): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      job.qa = qa;
    });
  }

  async setError(jobId: string, message: string): Promise<JobRecord> {
    return this.updateJob(jobId, (job) => {
      job.error = message;
    });
  }
}

export function loadJsonSync<T>(jsonPath: string): T | undefined {
  if (!fs.existsSync(jsonPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    return undefined;
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50) || "lapidatto-project";
}
