import path from "path";
import { QAResult } from "../types";
import { fileExists, readTextFile } from "./fsOps";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function runProjectQA(projectRoot: string): Promise<QAResult> {
  const issues: string[] = [];

  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    issues.push("package.json não encontrado no projeto gerado.");
  } else {
    try {
      const pkg = JSON.parse(await readTextFile(packageJsonPath)) as PackageJson;
      if (!pkg.name) {
        issues.push("Campo 'name' ausente no package.json.");
      }
      if (!pkg.scripts?.lint) {
        issues.push("Script 'lint' não configurado no package.json.");
      }
      if (!pkg.scripts?.test) {
        issues.push("Script 'test' não configurado no package.json.");
      }
    } catch (error) {
      issues.push("Falha ao ler package.json: arquivo inválido.");
    }
  }

  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  if (!(await fileExists(tsconfigPath))) {
    issues.push("tsconfig.json não encontrado.");
  }

  const appDir = path.join(projectRoot, "app");
  if (!(await fileExists(path.join(appDir, "page.tsx")))) {
    issues.push("Arquivo app/page.tsx não foi gerado.");
  }

  const summary = issues.length
    ? `QA encontrou ${issues.length} problema(s).`
    : "QA executado com sucesso: nenhum problema identificado.";

  return {
    success: issues.length === 0,
    issues,
    summary,
  };
}
