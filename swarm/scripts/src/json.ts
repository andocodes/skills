import { renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir } from "./paths.ts";

export function writeJsonAtomic(path: string, value: unknown): void {
  ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}
