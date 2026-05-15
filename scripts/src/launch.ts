import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Executor, Isolation, TaskState } from "./schemas.ts";

export type LaunchPlanKind = "command" | "native" | "sdk";

export interface LaunchPlan {
  kind: LaunchPlanKind;
  executor: Executor;
  isolation: Isolation;
  cwd: string;
  command?: string[];
  commandPreview?: string;
  stdinFile?: string;
  env?: Record<string, string>;
  profileFiles?: {
    authEnv?: string;
    gitConfig?: string;
  };
  instructions: string;
}

export interface BuildLaunchPlanArgs {
  executor: Executor;
  isolation: Isolation;
  taskState: TaskState;
  workspace: string;
  root: string;
  promptPath: string;
  handoffPath: string;
  launchInstruction: string;
}

export interface RunLaunchPlanResult {
  status: number;
  signal: NodeJS.Signals | null;
  error?: string;
}

export function buildLaunchPlan(args: BuildLaunchPlanArgs): LaunchPlan {
  if (args.executor === "cursor-sdk") {
    return {
      kind: "sdk",
      executor: args.executor,
      isolation: args.isolation,
      cwd: args.taskState.worktreePath,
      instructions: "Use `swarm run <workspace>` for headless Cursor SDK execution.",
    };
  }

  if (args.executor === "cursor-visible" || args.executor.endsWith("-native")) {
    return {
      kind: "native",
      executor: args.executor,
      isolation: args.isolation,
      cwd: args.taskState.worktreePath,
      instructions: args.launchInstruction,
    };
  }

  if (args.isolation.mode === "container") {
    return containerCliPlan(args);
  }

  return hostCliPlan(args);
}

export function runLaunchPlan(plan: LaunchPlan): RunLaunchPlanResult {
  if (plan.kind !== "command" || !plan.command?.length) {
    throw new Error(`launch plan is ${plan.kind}, not executable by the CLI`);
  }

  const input = plan.stdinFile ? readFileSync(plan.stdinFile) : undefined;
  const privateEnv = envFromProfileFiles(plan.profileFiles);
  const result = spawnSync(plan.command[0], plan.command.slice(1), {
    cwd: plan.cwd,
    env: { ...process.env, ...privateEnv, ...(plan.env ?? {}) },
    input,
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
  });

  return {
    status: result.status ?? 1,
    signal: result.signal,
    error: result.error?.message,
  };
}

function hostCliPlan(args: BuildLaunchPlanArgs): LaunchPlan {
  const profileFiles = resolveProfileFiles(args.taskState);
  const command = hostCliCommand(args.executor, args.taskState.worktreePath, isReadonly(args.isolation));
  const env = swarmEnv(args, profileFiles);
  return {
    kind: "command",
    executor: args.executor,
    isolation: args.isolation,
    cwd: args.taskState.worktreePath,
    command,
    commandPreview: `${shellQuoteAll(command)} < ${quote(args.promptPath)}`,
    stdinFile: args.promptPath,
    env,
    profileFiles,
    instructions: `Run ${args.executor} on the host in ${args.taskState.worktreePath}.`,
  };
}

function containerCliPlan(args: BuildLaunchPlanArgs): LaunchPlan {
  const profileFiles = resolveProfileFiles(args.taskState);
  const runtime = args.isolation.runtime ?? "docker";
  const image = args.isolation.image ?? "swarm-agent:0.1.0-codex-core";
  const readonly = isReadonly(args.isolation);
  const command = [
    runtime,
    "run",
    "--rm",
    "-i",
    "--name",
    containerName(args.taskState),
    "--workdir",
    args.taskState.worktreePath,
    ...networkArgs(args.isolation),
    ...userArgs(),
    "--mount",
    bindMount(args.workspace),
    "--mount",
    bindMount(args.taskState.repoPath, readonly),
    ...(readonly ? ["--mount", bindMount(args.taskState.worktreePath, true)] : []),
    ...(profileFiles.gitConfig
      ? [
          "--mount",
          `type=bind,source=${profileFiles.gitConfig},target=/run/swarm/git-identity.gitconfig,readonly`,
        ]
      : []),
    ...(profileFiles.authEnv ? ["--env-file", profileFiles.authEnv] : []),
    "-e",
    "SWARM_TASK",
    "-e",
    "SWARM_BRANCH",
    "-e",
    "SWARM_WORKSPACE",
    "-e",
    "SWARM_WORKTREE",
    "-e",
    "SWARM_PROMPT",
    "-e",
    "SWARM_HANDOFF",
    "-e",
    "SWARM_AUTH_PROFILE",
    "-e",
    "SWARM_GIT_IDENTITY",
    "-e",
    "SWARM_GIT_IDENTITY_FILE",
    "-e",
    "HOME=/tmp/swarm-home",
    image,
    "sh",
    "-lc",
    containerScript(args.executor),
  ];

  return {
    kind: "command",
    executor: args.executor,
    isolation: { ...args.isolation, runtime },
    cwd: args.root,
    command,
    commandPreview: shellQuoteAll(command),
    env: swarmEnv(args, profileFiles),
    profileFiles,
    instructions: `Run ${args.executor} inside ${runtime} image ${image}. The image must contain the selected agent CLI, git, and any profile resolver needed by SWARM_AUTH_PROFILE or SWARM_GIT_IDENTITY.`,
  };
}

function hostCliCommand(executor: Executor, worktreePath: string, readonly: boolean): string[] {
  switch (executor) {
    case "codex-cli":
      return readonly
        ? ["codex", "exec", "--cd", worktreePath, "--sandbox", "read-only", "-"]
        : [
            "codex",
            "exec",
            "--cd",
            worktreePath,
            "--dangerously-bypass-approvals-and-sandbox",
            "-",
          ];
    case "claude-cli":
      return readonly
        ? [
            "claude",
            "--print",
            "--input-format",
            "text",
            "--permission-mode",
            "plan",
            "--disallowedTools",
            "Edit,MultiEdit,Write,NotebookEdit",
          ]
        : ["claude", "--print", "--dangerously-skip-permissions", "--input-format", "text"];
    default:
      throw new Error(`${executor} is not a CLI executor`);
  }
}

function containerScript(executor: Executor): string {
  const command =
    executor === "codex-cli"
      ? 'codex exec --cd "$SWARM_WORKTREE" --dangerously-bypass-approvals-and-sandbox - < "$SWARM_PROMPT"'
      : 'claude --print --dangerously-skip-permissions --input-format text < "$SWARM_PROMPT"';
  return [
    "set -eu",
    'mkdir -p "$(dirname "$SWARM_HANDOFF")" /tmp/swarm-home',
    'cd "$SWARM_WORKTREE"',
    'if [ -n "${SWARM_AUTH_PROFILE:-}" ]; then echo "[swarm] auth profile: $SWARM_AUTH_PROFILE" >&2; fi',
    'if [ -n "${SWARM_GIT_IDENTITY_FILE:-}" ]; then export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=include.path GIT_CONFIG_VALUE_0="$SWARM_GIT_IDENTITY_FILE"; fi',
    'if [ -n "${SWARM_GIT_IDENTITY:-}" ]; then echo "[swarm] git identity: $SWARM_GIT_IDENTITY" >&2; fi',
    command,
  ].join("\n");
}

function networkArgs(isolation: Isolation): string[] {
  if (isolation.network === "none") return ["--network", "none"];
  if (isolation.network === "inherit") return ["--network", "host"];
  return [];
}

function userArgs(): string[] {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") return [];
  return ["--user", `${process.getuid()}:${process.getgid()}`];
}

function swarmEnv(
  args: BuildLaunchPlanArgs,
  profileFiles: { authEnv?: string; gitConfig?: string } = {}
): Record<string, string> {
  const env: Record<string, string> = {
    SWARM_TASK: args.taskState.name,
    SWARM_BRANCH: args.taskState.branch,
    SWARM_WORKSPACE: args.workspace,
    SWARM_WORKTREE: args.taskState.worktreePath,
    SWARM_PROMPT: args.promptPath,
    SWARM_HANDOFF: args.handoffPath,
    SWARM_AUTH_PROFILE: args.taskState.authProfile ?? "",
    SWARM_GIT_IDENTITY: args.taskState.gitIdentity ?? "",
    SWARM_GIT_IDENTITY_FILE: profileFiles.gitConfig ? "/run/swarm/git-identity.gitconfig" : "",
  };
  if (profileFiles.gitConfig) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "include.path";
    env.GIT_CONFIG_VALUE_0 = profileFiles.gitConfig;
  }
  return env;
}

function bindMount(path: string, readonly = false): string {
  return `type=bind,source=${path},target=${path}${readonly ? ",readonly" : ""}`;
}

function containerName(taskState: TaskState): string {
  return `swarm-${taskState.branch.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 96)}`;
}

function shellQuoteAll(command: string[]): string {
  return command.map(quote).join(" ");
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isReadonly(isolation: Isolation): boolean {
  return isolation.mode === "readonly" || isolation.readonly === true;
}

function profileRoot(): string {
  return process.env.SWARM_PROFILE_HOME ?? join(homedir(), ".swarm", "profiles");
}

function resolveProfileFiles(taskState: TaskState): { authEnv?: string; gitConfig?: string } {
  const root = profileRoot();
  const files: { authEnv?: string; gitConfig?: string } = {};
  if (taskState.authProfile) {
    files.authEnv = join(root, "auth", `${taskState.authProfile}.env`);
    requireFile(files.authEnv, `auth profile ${taskState.authProfile}`);
  }
  if (taskState.gitIdentity) {
    files.gitConfig = join(root, "git", `${taskState.gitIdentity}.gitconfig`);
    requireFile(files.gitConfig, `git identity ${taskState.gitIdentity}`);
  }
  return files;
}

function requireFile(path: string, label: string): void {
  if (!existsSync(path)) {
    throw new Error(`missing ${label}: expected ${path}`);
  }
}

function envFromProfileFiles(profileFiles: LaunchPlan["profileFiles"]): Record<string, string> {
  if (!profileFiles?.authEnv) return {};
  return parseEnvFile(profileFiles.authEnv);
}

function parseEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [index, rawLine] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${path}:${index + 1}: expected KEY=value`);
    env[match[1]] = unquoteEnvValue(match[2]);
  }
  return env;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
