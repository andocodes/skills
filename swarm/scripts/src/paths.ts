import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export function skillRoot(): string {
  return resolve(SCRIPT_DIR, "..");
}

export function repoRoot(cwd = process.cwd()): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function repoRootOrNull(cwd = process.cwd()): string | null {
  try {
    return repoRoot(cwd);
  } catch {
    return null;
  }
}

export function defaultBaseRef(cwd = process.cwd()): string {
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .replace(/^origin\//, "");
  } catch {
    try {
      return execFileSync("git", ["branch", "--show-current"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "main";
    }
  }
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "swarm";
}

export function workspacePath(root: string, rootSlug: string): string {
  return join(root, ".swarm", rootSlug);
}

export function projectRootFromWorkspace(workspace: string): string {
  const resolved = resolve(workspace);
  const marker = `${join(".swarm")}${"/"}`;
  const idx = resolved.indexOf(marker);
  if (idx >= 0) return resolved.slice(0, idx - 1);
  const parts = resolved.split("/");
  const swarmIndex = parts.lastIndexOf(".swarm");
  if (swarmIndex > 0) return parts.slice(0, swarmIndex).join("/") || "/";
  return repoRootOrNull(resolved) ?? resolved;
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function ensureWorkspaceDirs(workspace: string): void {
  ensureDir(workspace);
  ensureDir(join(workspace, "handoffs"));
  ensureDir(join(workspace, "worktrees"));
  ensureDir(join(workspace, "logs"));
  ensureDir(join(workspace, "messages"));
}

export function relativeToRepo(path: string, root: string): string {
  const resolved = resolve(path);
  const resolvedRoot = resolve(root);
  return resolved.startsWith(resolvedRoot) ? resolved.slice(resolvedRoot.length + 1) : path;
}

export function existingPath(path: string): string | null {
  return existsSync(path) ? path : null;
}
