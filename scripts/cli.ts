#!/usr/bin/env bun
import { Command } from "commander";
import { authDoctor } from "./src/auth.ts";
import { buildImage, parseImagePreset } from "./src/images.ts";
import { SwarmManager } from "./src/manager.ts";
import { type Executor, type Isolation, SwarmValidationError } from "./src/schemas.ts";

const program = new Command();

program
  .name("swarm")
  .description("Run local orchestration for the swarm skill.")
  .version("0.0.0");

program
  .command("auth")
  .description("Check Cursor SDK API-key auth and list available model ids")
  .action(async () => {
    const result = await authDoctor();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  });

const image = program.command("image").description("Build swarm agent container images");

image
  .command("build")
  .argument(
    "[preset]",
    "Image preset: codex-core, claude-core, pi-core, codex-rust, claude-rust, pi-rust, codex-go, claude-go, pi-go, or fake",
    "codex-core"
  )
  .option("--runtime <runtime>", "Container builder runtime: docker or podman", parseContainerRuntime, "docker")
  .option("--tag <tag>", "Override image tag")
  .option("--dry-run", "Print build command without running it")
  .description("Build a swarm-agent image")
  .action((preset, options) => {
    const result = buildImage({
      preset: parseImagePreset(preset),
      runtime: options.runtime,
      tag: options.tag,
      dryRun: Boolean(options.dryRun),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== undefined) process.exitCode = result.status;
  });

program
  .command("init")
  .argument("<goal>", "Goal for the local swarm")
  .option("--root-slug <slug>", "Workspace slug under .swarm/")
  .option("--base-ref <ref>", "Base ref for task worktrees")
  .option(
    "--executor <executor>",
    "Default executor: cursor-visible, cursor-sdk, claude-native, claude-cli, codex-native, codex-cli, or pi-cli",
    "cursor-visible"
  )
  .option(
    "--isolation <mode>",
    "Default isolation: worktree, container, or readonly",
    "worktree"
  )
  .option("--isolation-runtime <runtime>", "Isolation runtime: docker or podman")
  .option("--isolation-image <image>", "Container image for container isolation")
  .option("--network <policy>", "Isolation network policy: restricted, none, or inherit")
  .option("--auth-profile <profile>", "Named local auth profile; never an inline secret")
  .option("--git-identity <identity>", "Named local git identity profile")
  .option("--repo <path>", "Repository root or child path")
  .option(
    "--repo-mode <mode>",
    "Repository discovery mode: auto, single, or siblings",
    "auto"
  )
  .description("Create a swarm workspace without launching SDK agents")
  .action((goal, options) => {
    const workspace = SwarmManager.init({
      goal,
      rootSlug: options.rootSlug,
      baseRef: options.baseRef,
      executor: parseExecutor(options.executor),
      isolation: parseIsolation(options),
      authProfile: options.authProfile,
      gitIdentity: options.gitIdentity,
      repo: options.repo,
      repoMode: parseRepoMode(options.repoMode),
    });
    console.log(JSON.stringify({ workspace }, null, 2));
  });

program
  .command("kickoff")
  .argument("<goal>", "Goal for the local swarm")
  .option("--root-slug <slug>", "Workspace slug under .swarm/")
  .option("--base-ref <ref>", "Base ref for task worktrees")
  .option("--model <model>", "Planner model id", "default")
  .option(
    "--executor <executor>",
    "Default executor: cursor-visible, cursor-sdk, claude-native, claude-cli, codex-native, codex-cli, or pi-cli",
    "cursor-sdk"
  )
  .option(
    "--isolation <mode>",
    "Default isolation: worktree, container, or readonly",
    "worktree"
  )
  .option("--isolation-runtime <runtime>", "Isolation runtime: docker or podman")
  .option("--isolation-image <image>", "Container image for container isolation")
  .option("--network <policy>", "Isolation network policy: restricted, none, or inherit")
  .option("--auth-profile <profile>", "Named local auth profile; never an inline secret")
  .option("--git-identity <identity>", "Named local git identity profile")
  .option("--repo <path>", "Repository root or child path")
  .option(
    "--repo-mode <mode>",
    "Repository discovery mode: auto, single, or siblings",
    "auto"
  )
  .action(async (goal, options) => {
    const workspace = await SwarmManager.kickoff({
      goal,
      rootSlug: options.rootSlug,
      baseRef: options.baseRef,
      model: options.model,
      executor: parseExecutor(options.executor),
      isolation: parseIsolation(options),
      authProfile: options.authProfile,
      gitIdentity: options.gitIdentity,
      repo: options.repo,
      repoMode: parseRepoMode(options.repoMode),
    });
    console.log(JSON.stringify({ workspace }, null, 2));
  });

program
  .command("run")
  .argument("<workspace>", "Swarm workspace path")
  .option("--once", "Run one sweep and exit")
  .option("--no-watch", "Do not keep sleeping and recovering after the first sweep")
  .option("--idle-sleep-ms <ms>", "Sleep between watch sweeps", parseNumber)
  .option("--max-runtime-sec <sec>", "Checkpoint after this many seconds", parseNumber)
  .option(
    "--task-timeout-sec <sec>",
    "Fail a task that remains running longer than this many seconds",
    parseNumber
  )
  .action(async (workspace, options) => {
    const manager = SwarmManager.load(workspace);
    const exitCode = await manager.runLoop({
      once: Boolean(options.once),
      watch: options.watch,
      idleSleepMs: options.idleSleepMs,
      maxRuntimeMs: options.maxRuntimeSec ? options.maxRuntimeSec * 1000 : undefined,
      taskTimeoutMs: options.taskTimeoutSec ? options.taskTimeoutSec * 1000 : undefined,
    });
    process.exitCode = exitCode;
  });

program
  .command("prepare")
  .argument("<workspace>", "Swarm workspace path")
  .argument("<task>", "Pending task name")
  .description("Prepare a task worktree and prompt for the selected executor")
  .action((workspace, task) => {
    console.log(JSON.stringify(SwarmManager.load(workspace).prepareVisibleTask(task), null, 2));
  });

program
  .command("launch")
  .argument("<workspace>", "Swarm workspace path")
  .argument("<task>", "Pending or running task name")
  .option("--dry-run", "Print the launch plan without executing it")
  .option("--no-complete", "Do not record the handoff after the command exits")
  .description("Prepare and execute a command-backed CLI lane")
  .action((workspace, task, options) => {
    const result = SwarmManager.load(workspace).launchTask(task, {
      dryRun: Boolean(options.dryRun),
      complete: options.complete,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.run) process.exitCode = result.run.status;
  });

program
  .command("complete")
  .argument("<workspace>", "Swarm workspace path")
  .argument("<task>", "Task name")
  .description("Record a visible subagent handoff from handoffs/<task>.md")
  .action((workspace, task) => {
    console.log(SwarmManager.load(workspace).completeVisibleTask(task));
  });

program
  .command("inbox")
  .argument("<workspace>", "Swarm workspace path")
  .option("--task <task>", "Show messages for a task plus all-task broadcasts")
  .option("--limit <n>", "Limit to the most recent N messages", parseNumber)
  .action((workspace, options) => {
    console.log(SwarmManager.load(workspace).inbox({
      task: options.task,
      limit: options.limit,
    }));
  });

program
  .command("note")
  .argument("<workspace>", "Swarm workspace path")
  .argument("<body>", "Message body")
  .option("--from <from>", "Message author", "operator")
  .option("--audience <audience>", "planner, task, or all", parseAudience)
  .option("--task <task>", "Task name for task-scoped notes")
  .option("--priority <priority>", "info, blocked, or decision", parsePriority)
  .action((workspace, body, options) => {
    console.log(SwarmManager.load(workspace).note({
      from: options.from,
      audience: options.audience,
      task: options.task,
      priority: options.priority,
      body,
    }));
  });

program
  .command("status")
  .argument("<workspace>", "Swarm workspace path")
  .action(workspace => {
    console.log(SwarmManager.load(workspace).status());
  });

program
  .command("tree")
  .argument("<workspace>", "Swarm workspace path")
  .action(workspace => {
    console.log(SwarmManager.load(workspace).tree());
  });

program
  .command("spawn")
  .argument("<workspace>", "Swarm workspace path")
  .argument("<task>", "Pending task name")
  .action(async (workspace, task) => {
    await SwarmManager.load(workspace).spawnOne(task);
  });

program
  .command("kill")
  .argument("<workspace>", "Swarm workspace path")
  .argument("<task>", "Task name")
  .action((workspace, task) => {
    SwarmManager.load(workspace).kill(task);
  });

program
  .command("clean")
  .argument("<workspace>", "Swarm workspace path")
  .option("-f, --force", "Remove running worktrees too")
  .action((workspace, options) => {
    SwarmManager.load(workspace).clean(Boolean(options.force));
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof SwarmValidationError) {
    console.error(`[swarm] ${error.message}`);
    process.exit(2);
  }
  if (error instanceof Error) {
    console.error(`[swarm] ${error.message}`);
    process.exit(1);
  }
  throw error;
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`expected number, got ${value}`);
  return parsed;
}

function parseRepoMode(value: string): "auto" | "single" | "siblings" {
  if (value === "auto" || value === "single" || value === "siblings") return value;
  throw new Error(`expected repo mode auto, single, or siblings; got ${value}`);
}

function parseExecutor(value: string): Executor {
  if (
    value === "cursor-visible" ||
    value === "cursor-sdk" ||
    value === "claude-native" ||
    value === "claude-cli" ||
    value === "codex-native" ||
    value === "codex-cli" ||
    value === "pi-cli"
  ) {
    return value;
  }
  throw new Error(
    `expected executor cursor-visible, cursor-sdk, claude-native, claude-cli, codex-native, codex-cli, or pi-cli; got ${value}`
  );
}

function parseContainerRuntime(value: string): "docker" | "podman" {
  if (value === "docker" || value === "podman") return value;
  throw new Error(`expected container runtime docker or podman; got ${value}`);
}

function parseIsolation(options: {
  isolation?: string;
  isolationRuntime?: string;
  isolationImage?: string;
  network?: string;
}): Isolation {
  const mode = options.isolation ?? "worktree";
  if (
    mode !== "worktree" &&
    mode !== "container" &&
    mode !== "readonly"
  ) {
    throw new Error(`expected isolation worktree, container, or readonly; got ${mode}`);
  }

  const network = options.network ?? "restricted";
  if (network !== "restricted" && network !== "none" && network !== "inherit") {
    throw new Error(`expected network restricted, none, or inherit; got ${network}`);
  }

  const rawRuntime = options.isolationRuntime;
  if (rawRuntime && rawRuntime !== "docker" && rawRuntime !== "podman") {
    throw new Error(`expected isolation runtime docker or podman; got ${rawRuntime}`);
  }
  const runtime = rawRuntime as Isolation["runtime"] | undefined;
  if (mode === "container" && runtime && runtime !== "docker" && runtime !== "podman") {
    throw new Error(`container isolation supports docker or podman; got ${runtime}`);
  }
  if ((mode === "worktree" || mode === "readonly") && runtime) {
    throw new Error(`${mode} isolation does not use a runtime`);
  }
  if ((mode === "worktree" || mode === "readonly") && options.isolationImage) {
    throw new Error(`${mode} isolation does not use an image`);
  }

  return {
    mode,
    runtime,
    image: options.isolationImage,
    network,
  };
}

function parseAudience(value: string): "planner" | "task" | "all" {
  if (value === "planner" || value === "task" || value === "all") return value;
  throw new Error(`expected audience planner, task, or all; got ${value}`);
}

function parsePriority(value: string): "info" | "blocked" | "decision" {
  if (value === "info" || value === "blocked" || value === "decision") return value;
  throw new Error(`expected priority info, blocked, or decision; got ${value}`);
}
