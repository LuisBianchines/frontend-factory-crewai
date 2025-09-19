import fs from "fs";
import path from "path";
import archiver from "archiver";
import { ensureDir } from "./fsOps";

export async function zipDirectory(sourceDir: string, zipPath: string): Promise<string> {
  await ensureDir(path.dirname(zipPath));

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(zipPath));
    output.on("error", (error) => reject(error));
    archive.on("error", (error) => reject(error));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize().catch(reject);
  });
}
