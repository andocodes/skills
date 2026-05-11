import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { defaultBaseRef, repoRootOrNull } from "./paths.ts";

export type RepoMode = "auto" | "single" | "siblings";

export interface DiscoveredRepo {
  name: string;
  path: string;
  baseRef: string;
}

export interface RepositoryContext {
  projectRoot: string;
  mode: RepoMode;
  repos: DiscoveredRepo[];
  defaultRepo?: string;
}

export function discoverRepositories(args: {
  cwd: string;
  mode?: RepoMode;
  repo?: string;
  baseRef?: string;
}): RepositoryContext {
  const cwd = resolve(args.cwd);
  const mode = args.mode ?? "auto";
  if (args.repo) {
    const repoPath = repoRootOrNull(resolve(args.repo)) ?? resolve(args.repo);
    return {
      projectRoot: repoPath,
      mode: "single",
      repos: [repoSpec(repoPath, args.baseRef)],
      defaultRepo: basename(repoPath),
    };
  }

  const currentRepo = repoRootOrNull(cwd);
  if (mode === "single") {
    if (!currentRepo) throw new Error(`not inside a git repository: ${cwd}`);
    return {
      projectRoot: currentRepo,
      mode,
      repos: [repoSpec(currentRepo, args.baseRef)],
      defaultRepo: basename(currentRepo),
    };
  }

  if (mode === "auto" && currentRepo) {
    return {
      projectRoot: currentRepo,
      mode: "single",
      repos: [repoSpec(currentRepo, args.baseRef)],
      defaultRepo: basename(currentRepo),
    };
  }

  const siblings = discoverSiblingRepos(cwd, args.baseRef);
  if (siblings.length === 0) {
    throw new Error(`no git repositories discovered under ${cwd}`);
  }
  return {
    projectRoot: cwd,
    mode: "siblings",
    repos: siblings,
    defaultRepo: siblings.length === 1 ? siblings[0].name : undefined,
  };
}

export function repoSpec(path: string, baseRef?: string): DiscoveredRepo {
  const resolved = resolve(path);
  return {
    name: basename(resolved),
    path: resolved,
    baseRef: baseRef ?? defaultBaseRef(resolved),
  };
}

export function resolveRepoPath(projectRoot: string, repoPath: string): string {
  return resolve(projectRoot, repoPath);
}

export function isGitRepo(path: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: path,
    stdio: "ignore",
  });
  return result.status === 0;
}

function discoverSiblingRepos(root: string, baseRef?: string): DiscoveredRepo[] {
  return readdirSync(root)
    .sort()
    .filter(entry => !entry.startsWith("."))
    .map(entry => join(root, entry))
    .filter(path => existsSync(path) && statSync(path).isDirectory())
    .filter(path => isGitRepo(path))
    .map(path => repoSpec(path, baseRef));
}

export function remoteUrl(path: string): string | null {
  try {
    return execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: path,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}
