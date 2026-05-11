import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir } from "./paths.ts";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function currentHead(cwd: string): string {
  return git(cwd, ["rev-parse", "HEAD"]);
}

export function branchExists(cwd: string, branch: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd,
  });
  return result.status === 0;
}

export function ensureWorktree(args: {
  repoRoot: string;
  branch: string;
  baseRef: string;
  worktreePath: string;
}): void {
  ensureDir(dirname(args.worktreePath));
  if (existsSync(join(args.worktreePath, ".git"))) return;
  if (branchExists(args.repoRoot, args.branch)) {
    git(args.repoRoot, ["worktree", "add", args.worktreePath, args.branch]);
    return;
  }
  git(args.repoRoot, ["worktree", "add", "-b", args.branch, args.worktreePath, args.baseRef]);
}

export function removeWorktree(repoRoot: string, worktreePath: string, force = false): void {
  if (!existsSync(worktreePath)) return;
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(worktreePath);
  git(repoRoot, args);
}

export function worktreePathForTask(workspace: string, repoName: string, taskName: string): string {
  return join(workspace, "worktrees", repoName, taskName);
}

export function branchForTask(rootSlug: string, taskName: string): string {
  return `swarm/${rootSlug}/${taskName}`;
}
