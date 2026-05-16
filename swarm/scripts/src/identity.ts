import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { repoRootOrNull } from "./paths.ts";
import { remoteUrl } from "./repos.ts";

export interface GitConfigEntry {
  scope: string;
  origin: string;
  key: string;
  value: string;
}

export interface GitHubAccount {
  login: string;
  active: boolean;
}

export interface IdentityRecommendation {
  field: "authProfile" | "gitIdentity";
  severity: "info" | "ask" | "required";
  message: string;
}

export interface IdentityDoctorResult {
  repoPath: string;
  git: {
    isRepository: boolean;
    remoteOrigin: string | null;
    githubRemoteOwner?: string;
    currentIdentity: {
      name?: string;
      email?: string;
      signingKey?: string;
    };
    identityEntries: GitConfigEntry[];
    includeIf: GitConfigEntry[];
    credentialHelpers: GitConfigEntry[];
    urlRewrites: GitConfigEntry[];
  };
  github: {
    host: string;
    ghAvailable: boolean;
    statusOk: boolean;
    accounts: GitHubAccount[];
    activeAccounts: string[];
    error?: string;
  };
  profiles: {
    root: string;
    auth: string[];
    git: string[];
  };
  recommendations: IdentityRecommendation[];
}

export function identityDoctor(args: {
  cwd: string;
  repo?: string;
  githubHost?: string;
}): IdentityDoctorResult {
  const requestedPath = resolve(args.repo ?? args.cwd);
  const repoPath = repoRootOrNull(requestedPath) ?? requestedPath;
  const isRepository = repoRootOrNull(repoPath) !== null;
  const entries = gitConfigEntries(repoPath);
  const github = githubStatus(args.githubHost ?? "github.com");
  const profiles = localProfiles();
  const currentIdentity = currentGitIdentity(entries);
  const remoteOrigin = isRepository ? remoteUrl(repoPath) : null;
  const git = {
    isRepository,
    remoteOrigin,
    githubRemoteOwner: remoteOrigin ? parseGitHubRemoteOwner(remoteOrigin) : undefined,
    currentIdentity,
    identityEntries: entries.filter(entry => entry.key.startsWith("user.")),
    includeIf: entries.filter(entry => entry.key.startsWith("includeIf.")),
    credentialHelpers: entries.filter(entry => entry.key.startsWith("credential.")),
    urlRewrites: entries.filter(entry => entry.key.startsWith("url.")),
  };
  return {
    repoPath,
    git,
    github,
    profiles,
    recommendations: identityRecommendations({ git, github, profiles }),
  };
}

export function parseGitConfigEntries(output: string): GitConfigEntry[] {
  return output
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => parseGitConfigEntry(line))
    .filter(entry => entry !== null);
}

export function parseGhAuthStatus(output: string): GitHubAccount[] {
  const accounts: GitHubAccount[] = [];
  let current: GitHubAccount | null = null;
  for (const line of output.split(/\r?\n/)) {
    const login = line.match(/\baccount\s+([A-Za-z0-9-]+)/)?.[1];
    if (login) {
      current = { login, active: false };
      accounts.push(current);
      continue;
    }
    const active = line.match(/Active account:\s*(true|false)/i)?.[1];
    if (current && active) current.active = active.toLowerCase() === "true";
  }
  return dedupeAccounts(accounts);
}

export function parseGitHubRemoteOwner(remote: string): string | undefined {
  const https = remote.match(/^https:\/\/github\.com\/([^/]+)\//)?.[1];
  if (https) return https;
  const ssh = remote.match(/^git@github\.com:([^/]+)\//)?.[1];
  if (ssh) return ssh;
  return undefined;
}

function parseGitConfigEntry(line: string): GitConfigEntry | null {
  const tabParts = line.split("\t");
  const [scope, origin, rest] = tabParts.length >= 3
    ? [tabParts[0], tabParts[1], tabParts.slice(2).join("\t")]
    : parseSpaceSeparatedGitConfigEntry(line);
  if (!scope || !origin || !rest) return null;
  const separator = rest.search(/\s/);
  if (separator === -1) {
    return { scope, origin, key: rest, value: "" };
  }
  return {
    scope,
    origin,
    key: rest.slice(0, separator),
    value: rest.slice(separator + 1).trim(),
  };
}

function parseSpaceSeparatedGitConfigEntry(line: string): [string, string, string] {
  const match = line.match(/^(\S+)\s+(\S+)\s+(.+)$/);
  return match ? [match[1], match[2], match[3]] : ["", "", ""];
}

function gitConfigEntries(repoPath: string): GitConfigEntry[] {
  const result = spawnSync(
    "git",
    [
      "config",
      "--show-origin",
      "--show-scope",
      "--includes",
      "--get-regexp",
      "^(user\\.|includeIf\\.|credential\\.|url\\.)",
    ],
    { cwd: repoPath, encoding: "utf8" }
  );
  if (result.error || (result.status !== 0 && !result.stdout)) return [];
  return parseGitConfigEntries(result.stdout);
}

function currentGitIdentity(entries: GitConfigEntry[]): IdentityDoctorResult["git"]["currentIdentity"] {
  return {
    name: lastEntry(entries, "user.name")?.value,
    email: lastEntry(entries, "user.email")?.value,
    signingKey: lastEntry(entries, "user.signingkey")?.value,
  };
}

function lastEntry(entries: GitConfigEntry[], key: string): GitConfigEntry | undefined {
  return entries.filter(entry => entry.key === key).at(-1);
}

function githubStatus(host: string): IdentityDoctorResult["github"] {
  const result = spawnSync("gh", ["auth", "status", "--hostname", host], {
    encoding: "utf8",
  });
  if (result.error) {
    return {
      host,
      ghAvailable: false,
      statusOk: false,
      accounts: [],
      activeAccounts: [],
      error: result.error.message,
    };
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const accounts = parseGhAuthStatus(output);
  return {
    host,
    ghAvailable: true,
    statusOk: result.status === 0,
    accounts,
    activeAccounts: accounts.filter(account => account.active).map(account => account.login),
    error: result.status === 0 ? undefined : output.trim() || `gh auth status exited ${result.status}`,
  };
}

function localProfiles(): IdentityDoctorResult["profiles"] {
  const root = process.env.SWARM_PROFILE_HOME ?? join(homedir(), ".swarm", "profiles");
  return {
    root,
    auth: profileNames(join(root, "auth"), ".env"),
    git: profileNames(join(root, "git"), ".gitconfig"),
  };
}

function profileNames(dir: string, suffix: string): string[] {
  if (!isDirectory(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith(suffix))
    .map(name => basename(name, suffix))
    .sort();
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function identityRecommendations(args: {
  git: IdentityDoctorResult["git"];
  github: IdentityDoctorResult["github"];
  profiles: IdentityDoctorResult["profiles"];
}): IdentityRecommendation[] {
  const recommendations: IdentityRecommendation[] = [];
  const { git, github, profiles } = args;
  const nameEntry = lastEntry(git.identityEntries, "user.name");
  const emailEntry = lastEntry(git.identityEntries, "user.email");
  const repoScopedIdentity = nameEntry?.scope === "local" || emailEntry?.scope === "local";
  const multipleIdentitySignals =
    profiles.git.length > 1 ||
    git.includeIf.length > 0 ||
    distinctEntryValues(git.identityEntries, "user.email").length > 1 ||
    distinctEntryValues(git.identityEntries, "user.name").length > 1;

  if (!git.currentIdentity.name || !git.currentIdentity.email) {
    recommendations.push({
      field: "gitIdentity",
      severity: profiles.git.length > 0 ? "ask" : "required",
      message: "No complete git user.name/user.email is visible for this repository. Pick a gitIdentity profile or configure the repo before write lanes commit.",
    });
  } else if (multipleIdentitySignals && !repoScopedIdentity) {
    recommendations.push({
      field: "gitIdentity",
      severity: "ask",
      message: `Git identity resolves to ${git.currentIdentity.name} <${git.currentIdentity.email}>, but multiple git identity signals are visible. Confirm this is the intended identity before write lanes commit.`,
    });
  } else if (repoScopedIdentity) {
    recommendations.push({
      field: "gitIdentity",
      severity: "info",
      message: `Repository git identity resolves to ${git.currentIdentity.name} <${git.currentIdentity.email}>.`,
    });
  } else {
    recommendations.push({
      field: "gitIdentity",
      severity: "info",
      message: `Ambient git identity resolves to ${git.currentIdentity.name} <${git.currentIdentity.email}>.`,
    });
  }

  if (!github.ghAvailable) {
    recommendations.push({
      field: "authProfile",
      severity: profiles.auth.length > 0 ? "ask" : "info",
      message: "GitHub CLI is not available. Use a named authProfile for lanes that need GitHub credentials.",
    });
  } else if (github.accounts.length > 1 || profiles.auth.length > 1) {
    recommendations.push({
      field: "authProfile",
      severity: "ask",
      message: "Multiple GitHub accounts or auth profiles are available. Pick an authProfile for lanes that need GitHub, PR, or issue access.",
    });
  } else if (profiles.auth.length === 1) {
    recommendations.push({
      field: "authProfile",
      severity: "info",
      message: `One auth profile is available: ${profiles.auth[0]}. Use it for container lanes or cross-harness CLI lanes that need credentials.`,
    });
  } else {
    recommendations.push({
      field: "authProfile",
      severity: "info",
      message: "Ambient GitHub auth appears sufficient for local host lanes. Use an authProfile for container lanes or cross-harness CLI lanes that need credentials.",
    });
  }

  if (
    git.githubRemoteOwner &&
    github.activeAccounts.length === 1 &&
    github.activeAccounts[0] !== git.githubRemoteOwner
  ) {
    recommendations.push({
      field: "authProfile",
      severity: "ask",
      message: `GitHub remote owner is ${git.githubRemoteOwner}, but the active GitHub CLI account is ${github.activeAccounts[0]}. Confirm or choose an authProfile before GitHub lanes run.`,
    });
  }

  if (git.remoteOrigin?.includes("github") && github.ghAvailable && !github.statusOk && profiles.auth.length === 0) {
    recommendations.push({
      field: "authProfile",
      severity: "required",
      message: "This repository uses a GitHub remote, but no working GitHub auth or auth profile was found.",
    });
  }

  return recommendations;
}

function distinctEntryValues(entries: GitConfigEntry[], key: string): string[] {
  return [...new Set(entries
    .filter(entry => entry.key === key)
    .map(entry => entry.value)
    .filter(Boolean))];
}

function dedupeAccounts(accounts: GitHubAccount[]): GitHubAccount[] {
  const byLogin = new Map<string, GitHubAccount>();
  for (const account of accounts) {
    const existing = byLogin.get(account.login);
    byLogin.set(account.login, {
      login: account.login,
      active: Boolean(existing?.active || account.active),
    });
  }
  return [...byLogin.values()];
}
