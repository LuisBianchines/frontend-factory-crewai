import type { JSONSchemaType } from "ajv";

export type PageLayout = "marketing" | "dashboard" | "informational";

export interface PageDefinition {
  name: string;
  route: string;
  description: string;
  layout: PageLayout;
  hero?: string;
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  components: string[];
}

export interface ProjectSpec {
  id: string;
  projectName: string;
  summary: string;
  objectives: string[];
  targetAudience: string;
  voiceTone: string;
  pages: PageDefinition[];
  dataRequirements: string[];
  integrations: string[];
  techStack: string[];
  designSystem: {
    theme: string;
    tokensFile: string;
    foundations: string[];
  };
}

export interface DesignTokens {
  themeName: string;
  colors: Record<string, string>;
  typography: {
    fontFamily: string;
    headings: string;
    body: string;
  };
  radii: Record<string, string>;
  shadows: Record<string, string>;
  spacing: Record<string, string>;
}

export interface QAResult {
  success: boolean;
  issues: string[];
  summary: string;
}

export type JobStatus =
  | "planning"
  | "waiting_spec_approval"
  | "architecting"
  | "ui_design"
  | "scaffolding"
  | "qa"
  | "qa_failed"
  | "docs"
  | "completed"
  | "failed";

export interface JobHistoryEntry {
  agent: string;
  task: string;
  status: "success" | "failed";
  timestamp: string;
  summary: string;
}

export interface JobArtifacts {
  specPath?: string;
  tokensPath?: string;
  projectRoot?: string;
  docs?: {
    readme?: string;
    architecture?: string;
  };
  pages?: Record<string, string>;
  zipPath?: string;
}

export interface GenerationRequest {
  projectName: string;
  template: string;
  briefing: string;
  targetAudience?: string;
  goals?: string[];
  features?: string[];
  autoApproveSpec?: boolean;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  input: GenerationRequest;
  spec?: ProjectSpec;
  tokens?: DesignTokens;
  qa?: QAResult;
  approval: {
    specApproved: boolean;
    requestedAt?: string;
    approvedAt?: string;
  };
  history: JobHistoryEntry[];
  artifacts: JobArtifacts;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface AddPageRequest {
  jobId: string;
  page: {
    name: string;
    route: string;
    description: string;
    layout?: PageLayout;
    components?: string[];
  };
}

export type ProjectSpecSchema = JSONSchemaType<ProjectSpec>;
export type DesignTokensSchema = JSONSchemaType<DesignTokens>;
