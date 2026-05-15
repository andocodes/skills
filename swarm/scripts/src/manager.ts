import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Agent, type Run, type RunResult } from "@cursor/sdk";
import {
  loadAgentDefinitions,
  modelSelection,
  toSdkAgentDefinitions,
  type LoadedAgent,
} from "./agents.ts";
import { requireApiKey } from "./auth.ts";
import { branchForTask, ensureWorktree, removeWorktree, worktreePathForTask } from "./git.ts";
import {
  extractFinalHandoff,
  failureHandoff,
  handoffPath,
  parseHandoff,
  readHandoff,
  writeHandoff,
} from "./handoff.ts";
import {
  appendInboxMessage,
  formatInbox,
  readInboxMessages,
  type InboxAudience,
  type InboxPriority,
} from "./inbox.ts";
import { writeJsonAtomic } from "./json.ts";
import {
  buildLaunchPlan,
  runLaunchPlan,
  type LaunchPlan,
  type RunLaunchPlanResult,
} from "./launch.ts";
import { ensureWorkspaceDirs, projectRootFromWorkspace, workspacePath, slugify } from "./paths.ts";
import { rootPlannerPrompt, taskPrompt } from "./prompts.ts";
import {
  type DiscoveredRepo,
  type RepoMode,
  discoverRepositories,
  repoSpec,
} from "./repos.ts";
import {
  type Plan,
  type PlanTask,
  type State,
  type TaskState,
  type Executor,
  type Isolation,
  parsePlanJson,
  parseStateJson,
  SwarmValidationError,
} from "./schemas.ts";

export interface KickoffOptions {
  goal: string;
  rootSlug?: string;
  baseRef?: string;
  model?: string;
  repo?: string;
  repoMode?: RepoMode;
  executor?: Executor;
  isolation?: Isolation;
  authProfile?: string;
  gitIdentity?: string;
}

export interface RunLoopOptions {
  watch?: boolean;
  idleSleepMs?: number;
  maxRuntimeMs?: number;
  taskTimeoutMs?: number;
  once?: boolean;
}

export interface VisibleTaskLaunch {
  task: string;
  executor: Executor;
  isolation: Isolation;
  authProfile?: string;
  gitIdentity?: string;
  requestedAgent?: string;
  nativeAgentCandidates?: string[];
  cursorSubagentCandidates?: string[];
  branch: string;
  worktreePath: string;
  repo: string;
  repoPath: string;
  agent?: string;
  promptPath: string;
  handoffPath: string;
  launch: string;
  launchPlan: LaunchPlan;
}

export interface LaunchTaskOptions {
  dryRun?: boolean;
  complete?: boolean;
}

export interface LaunchTaskResult {
  launch: VisibleTaskLaunch;
  dryRun?: boolean;
  run?: RunLaunchPlanResult;
  completed?: string;
}

export class SwarmManager {
  readonly workspace: string;
  readonly root: string;
  readonly planPath: string;
  readonly statePath: string;
  readonly plan: Plan;
  state: State;
  private readonly promptDiagnostics = new Map<
    string,
    Record<string, string | number | boolean | null | undefined>
  >();

  private constructor(args: {
    workspace: string;
    root: string;
    plan: Plan;
    state: State;
  }) {
    this.workspace = args.workspace;
    this.root = args.root;
    this.plan = args.plan;
    this.state = args.state;
    this.planPath = join(args.workspace, "plan.json");
    this.statePath = join(args.workspace, "state.json");
  }

  static load(workspaceArg: string): SwarmManager {
    const workspace = resolve(workspaceArg);
    ensureWorkspaceDirs(workspace);
    const root = projectRootFromWorkspace(workspace);
    const planPath = join(workspace, "plan.json");
    if (!existsSync(planPath)) {
      throw new SwarmValidationError(`missing plan.json at ${planPath}`);
    }
    const plan = parsePlanJson(readFileSync(planPath, "utf8"), planPath);
    const statePath = join(workspace, "state.json");
    const state = existsSync(statePath)
      ? parseStateJson(readFileSync(statePath, "utf8"), statePath)
      : initialState(plan, workspace);
    const manager = new SwarmManager({ workspace, root, plan, state });
    manager.reconcileState();
    manager.saveState();
    return manager;
  }

  static async kickoff(options: KickoffOptions): Promise<string> {
    const discovered = discoverRepositories({
      cwd: options.repo ?? process.cwd(),
      mode: options.repoMode,
      repo: options.repo,
      baseRef: options.baseRef,
    });
    const root = discovered.projectRoot;
    const rootSlug = options.rootSlug ?? slugify(options.goal);
    const workspace = workspacePath(root, rootSlug);
    ensureWorkspaceDirs(workspace);
    const repoContext = discovered;
    const baseRef = options.baseRef ?? repoContext.repos[0]?.baseRef ?? "main";
    const agents = loadAgentDefinitions(root);
    const apiKey = requireApiKey();
    writeJsonAtomic(join(workspace, "kickoff.json"), {
      status: "starting",
      goal: options.goal,
      rootSlug,
      root,
      workspace,
      repositoryMode: repoContext.mode,
      repositories: repoContext.repos,
      executor: options.executor ?? "cursor-visible",
      isolation: options.isolation,
      authProfile: options.authProfile,
      gitIdentity: options.gitIdentity,
      startedAt: now(),
    });
    console.error(`[swarm] workspace: ${workspace}`);
    console.error(`[swarm] repositories: ${repoContext.repos.map(repo => repo.name).join(", ")}`);
    const prompt = rootPlannerPrompt({
      goal: options.goal,
      rootSlug,
      baseRef,
      workspace,
      agents,
      repositories: repoContext.repos,
      repositoryMode: repoContext.mode === "siblings" ? "siblings" : "single",
      executor: options.executor ?? "cursor-sdk",
      isolation: options.isolation,
      authProfile: options.authProfile,
      gitIdentity: options.gitIdentity,
      defaultRepo: repoContext.defaultRepo,
    });
    writePromptDiagnostics(workspace, "planner", prompt, agents, {
      phase: "kickoff",
      model: options.model ?? "default",
    });
    const agent = await Agent.create({
      name: `swarm planner ${rootSlug}`,
      apiKey,
      model: modelSelection(options.model ?? "default"),
      local: { cwd: root, settingSources: ["project", "user", "plugins"] },
      agents: toSdkAgentDefinitions(agents),
    });
    try {
      const run = await agent.send(prompt);
      writeJsonAtomic(join(workspace, "kickoff.json"), {
        status: "running",
        agentId: agent.agentId,
        runId: run.id,
        workspace,
        root,
        repositories: repoContext.repos,
        updatedAt: now(),
      });
      console.error(`[swarm] planner run: ${run.id}`);
      const result = await run.wait();
      if (result.status !== "finished") {
        writeJsonAtomic(join(workspace, "kickoff.json"), {
          status: "error",
          agentId: agent.agentId,
          runId: run.id,
          resultStatus: result.status,
          workspace,
          root,
          updatedAt: now(),
        });
        throw new Error(`planner run ended with ${result.status}`);
      }
    } finally {
      await agent[Symbol.asyncDispose]();
    }
    if (!existsSync(join(workspace, "plan.json"))) {
      throw new Error(`planner completed but did not write ${join(workspace, "plan.json")}`);
    }
    const plan = withRepositoryDefaults(
      parsePlanJson(readFileSync(join(workspace, "plan.json"), "utf8")),
      repoContext.repos,
      repoContext.defaultRepo,
      repoContext.mode === "siblings" ? "siblings" : "single"
    );
    writeJsonAtomic(join(workspace, "plan.json"), plan);
    const manager = new SwarmManager({
      workspace,
      root,
      plan,
      state: initialState(plan, workspace),
    });
    manager.saveState();
    writeJsonAtomic(join(workspace, "kickoff.json"), {
      status: "finished",
      workspace,
      root,
      planPath: join(workspace, "plan.json"),
      updatedAt: now(),
    });
    return workspace;
  }

  static init(options: KickoffOptions): string {
    const discovered = discoverRepositories({
      cwd: options.repo ?? process.cwd(),
      mode: options.repoMode,
      repo: options.repo,
      baseRef: options.baseRef,
    });
    const root = discovered.projectRoot;
    const rootSlug = options.rootSlug ?? slugify(options.goal);
    const workspace = workspacePath(root, rootSlug);
    ensureWorkspaceDirs(workspace);
    writeJsonAtomic(join(workspace, "kickoff.json"), {
      status: "initialized",
      goal: options.goal,
      rootSlug,
      root,
      workspace,
      repositoryMode: discovered.mode,
      repositories: discovered.repos,
      defaultRepo: discovered.defaultRepo,
      baseRef: options.baseRef ?? discovered.repos[0]?.baseRef ?? "main",
      executor: options.executor ?? "cursor-visible",
      isolation: options.isolation,
      authProfile: options.authProfile,
      gitIdentity: options.gitIdentity,
      initializedAt: now(),
    });
    return workspace;
  }

  async runLoop(options: RunLoopOptions = {}): Promise<number> {
    const started = Date.now();
    const idleSleepMs = options.idleSleepMs ?? 30_000;
    const watch = options.watch ?? true;
    const inFlight = new Map<string, Promise<void>>();
    while (true) {
      this.failTimedOutRunningTasks(options.taskTimeoutMs, new Set(inFlight.keys()));
      await this.recoverRunningTasks(new Set(inFlight.keys()));
      for (const taskRun of this.spawnReadyTasks(options.taskTimeoutMs)) {
        inFlight.set(taskRun.name, taskRun.promise);
        taskRun.promise.finally(() => inFlight.delete(taskRun.name));
      }
      this.saveState();
      this.printHeartbeat();
      const terminal = this.isTerminal();
      if ((terminal && inFlight.size === 0) || options.once) {
        if (inFlight.size > 0) await Promise.allSettled(inFlight.values());
        return this.exitCode();
      }
      if (!watch && !this.hasRunningTasks()) return this.exitCode();
      if (options.maxRuntimeMs && Date.now() - started >= options.maxRuntimeMs) {
        this.attention(`checkpoint: max runtime reached; rerun \`swarm run ${this.workspace}\` to resume`);
        this.saveState();
        return this.exitCode();
      }
      await sleepOrTaskCompletion(idleSleepMs, inFlight);
      this.reloadState();
    }
  }

  async spawnOne(taskName: string): Promise<void> {
    const task = this.plan.tasks.find(t => t.name === taskName);
    if (!task) throw new SwarmValidationError(`unknown task ${taskName}`);
    const state = this.getTaskState(taskName);
    if (state.status !== "pending") {
      throw new SwarmValidationError(`${taskName} is ${state.status}, not pending`);
    }
    if (!this.dependenciesSatisfied(task)) {
      throw new SwarmValidationError(`${taskName} dependencies are not satisfied`);
    }
    await this.spawnTask(task);
    this.saveState();
  }

  kill(taskName: string): void {
    const task = this.getTaskState(taskName);
    if (task.status === "handed-off" || task.status === "cancelled") return;
    task.status = "cancelled";
    task.finishedAt = now();
    this.attention(`${taskName}: cancelled by operator`);
    this.saveState();
  }

  clean(force = false): void {
    for (const task of this.state.tasks) {
      if (!force && task.status === "running") {
        throw new SwarmValidationError(`refusing to clean running task ${task.name}`);
      }
      removeWorktree(task.repoPath, task.worktreePath, force);
    }
    const logs = join(this.workspace, "logs");
    if (existsSync(logs)) rmSync(logs, { recursive: true, force: true });
  }

  status(): string {
    const counts = countStatuses(this.state.tasks);
    const lines = [
      `workspace: ${this.workspace}`,
      `root: ${this.root}`,
      `goal: ${this.plan.summary ?? this.plan.goal}`,
      `tasks: ${Object.entries(counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")}`,
    ];
    if (this.state.attention.length > 0) {
      lines.push("attention:");
      lines.push(...this.state.attention.slice(-10).map(line => `- ${line}`));
    }
    return lines.join("\n");
  }

  tree(): string {
    return this.state.tasks
      .map(task => {
        const def = this.plan.tasks.find(t => t.name === task.name);
        const deps = def?.dependsOn?.length ? ` deps=[${def.dependsOn.join(",")}]` : "";
        const agent = task.agent ? ` agent=${task.agent}` : "";
        const repo = task.repo ? ` repo=${task.repo}` : "";
        const runtime = effectiveIsolationRuntime(task.isolation);
        const isolation = ` isolation=${task.isolation.mode}${runtime ? `:${runtime}` : ""}`;
        return `${task.status.padEnd(10)} ${task.name}${repo}${agent}${isolation}${deps} branch=${task.branch} worktree=${relative(this.root, task.worktreePath)}`;
      })
      .join("\n");
  }

  inbox(options: { task?: string; limit?: number } = {}): string {
    let messages = readInboxMessages(this.workspace);
    if (options.task) {
      messages = messages.filter(
        message => message.task === options.task || message.audience === "all"
      );
    }
    if (options.limit && options.limit > 0) messages = messages.slice(-options.limit);
    return formatInbox(messages);
  }

  note(input: {
    from?: string;
    audience?: InboxAudience;
    task?: string;
    priority?: InboxPriority;
    body: string;
  }): string {
    const message = appendInboxMessage(this.workspace, {
      from: input.from ?? "operator",
      audience: input.audience,
      task: input.task,
      priority: input.priority,
      body: input.body,
    });
    return `wrote ${message.id}`;
  }

  prepareVisibleTask(taskName: string): VisibleTaskLaunch {
    const task = this.plan.tasks.find(t => t.name === taskName);
    if (!task) throw new SwarmValidationError(`unknown task ${taskName}`);
    const taskState = this.getTaskState(taskName);
    if (taskState.status === "pending") {
      if (!this.dependenciesSatisfied(task)) {
        throw new SwarmValidationError(`${taskName} dependencies are not satisfied`);
      }
      taskState.status = "running";
      taskState.startedAt ??= now();
      taskState.attempts += 1;
    } else if (taskState.status !== "running") {
      throw new SwarmValidationError(`${taskName} is ${taskState.status}, not pending or running`);
    }
    const taskRepo = this.repoForTask(task);
    ensureWorktree({
      repoRoot: taskRepo.path,
      branch: taskState.branch,
      baseRef: taskRepo.baseRef,
      worktreePath: taskState.worktreePath,
    });
    const agents = loadAgentDefinitions(this.root);
    const selectedAgent = task.agent ? agents.get(task.agent) : undefined;
    if (task.agent && !selectedAgent) {
      this.attention(`${task.name}: requested agent ${task.agent} was not found`);
    }
    const finalHandoffPath = handoffPath(this.workspace, task.name);
    const prompt = `${taskPrompt({
      plan: this.plan,
      task,
      taskState,
      agent: selectedAgent,
      workspace: this.workspace,
      inboxMessages: readInboxMessages(this.workspace),
    })}

${executorInstructions(taskState.executor ?? this.plan.executor)}
${isolationLaunchInstructions(taskState.isolation)}
- Work only in the task worktree: \`${taskState.worktreePath}\`.
- Before your final response, write the same structured handoff to \`${finalHandoffPath}\`.
- The parent will record that handoff with \`swarm complete ${this.workspace} ${task.name}\`.`;
    const promptPath = join(this.workspace, "logs", `${task.name}-prompt.md`);
    writeFileSync(promptPath, prompt);
    const diagnostics = writePromptDiagnostics(this.workspace, task.name, prompt, agents, {
      phase: "visible-task",
      repo: taskState.repo,
      isolationMode: taskState.isolation.mode,
      isolationRuntime: effectiveIsolationRuntime(taskState.isolation),
      authProfile: taskState.authProfile,
      gitIdentity: taskState.gitIdentity,
      model: task.model ?? "default",
      agent: task.agent,
    });
    this.promptDiagnostics.set(task.name, diagnostics);
    this.saveState();
    const executor = taskState.executor ?? this.plan.executor;
    const launch = launchInstruction(executor, promptPath, task.agent);
    const launchPlan = buildLaunchPlan({
      executor,
      isolation: taskState.isolation,
      taskState,
      workspace: this.workspace,
      root: this.root,
      promptPath,
      handoffPath: finalHandoffPath,
      launchInstruction: launch,
    });
    return {
      task: task.name,
      executor,
      isolation: taskState.isolation,
      authProfile: taskState.authProfile,
      gitIdentity: taskState.gitIdentity,
      requestedAgent: task.agent,
      nativeAgentCandidates: nativeAgentCandidates(task.agent),
      cursorSubagentCandidates:
        (taskState.executor ?? this.plan.executor) === "cursor-visible"
          ? cursorSubagentCandidates(task.agent)
          : undefined,
      branch: taskState.branch,
      worktreePath: taskState.worktreePath,
      repo: taskState.repo ?? taskRepo.name,
      repoPath: taskState.repoPath,
      agent: task.agent,
      promptPath,
      handoffPath: finalHandoffPath,
      launch,
      launchPlan,
    };
  }

  launchTask(taskName: string, options: LaunchTaskOptions = {}): LaunchTaskResult {
    const launch = this.prepareVisibleTask(taskName);
    if (options.dryRun) {
      return { launch, dryRun: true };
    }
    if (launch.launchPlan.kind !== "command") {
      throw new SwarmValidationError(
        `${taskName}: ${launch.launchPlan.kind} launch plans must be started by the parent harness`
      );
    }

    const run = runLaunchPlan(launch.launchPlan);
    if (options.complete === false) return { launch, run };

    if (existsSync(launch.handoffPath)) {
      return { launch, run, completed: this.completeVisibleTask(taskName) };
    }

    return {
      launch,
      run,
      completed: this.failVisibleTask(
        taskName,
        `launch exited with status ${run.status}${run.error ? ` (${run.error})` : ""} without writing ${launch.handoffPath}`
      ),
    };
  }

  completeVisibleTask(taskName: string): string {
    const task = this.plan.tasks.find(t => t.name === taskName);
    if (!task) throw new SwarmValidationError(`unknown task ${taskName}`);
    const taskState = this.getTaskState(taskName);
    const body = readHandoff(this.workspace, task.name);
    if (!body) {
      throw new SwarmValidationError(`missing handoff for ${taskName} at ${handoffPath(this.workspace, task.name)}`);
    }
    taskState.handoffPath = relative(this.workspace, handoffPath(this.workspace, task.name));
    taskState.resultStatus = "finished";
    taskState.finishedAt = now();
    const parsed = parseHandoff(body);
    if (!parsed.hasStructuredHandoff) {
      taskState.status = "error";
      this.attention(`${task.name}: missing structured handoff heading`);
    } else {
      const status = parsed.status?.toLowerCase() ?? "";
      taskState.status =
        status.includes("failed") || status.includes("blocked") ? "error" : "handed-off";
      if (taskState.status === "error") {
        this.attention(`${task.name}: handoff status ${parsed.status ?? "(unknown)"}`);
      }
    }
    this.saveState();
    return `${task.name}: ${taskState.status}`;
  }

  private failVisibleTask(taskName: string, reason: string): string {
    const task = this.plan.tasks.find(t => t.name === taskName);
    if (!task) throw new SwarmValidationError(`unknown task ${taskName}`);
    const taskState = this.getTaskState(taskName);
    const body = failureHandoff({
      taskName: task.name,
      branch: taskState.branch,
      reason,
      diagnostics: this.failureDiagnostics(task.name, new Error(reason)),
    });
    taskState.handoffPath = relative(
      this.workspace,
      writeHandoff({ workspace: this.workspace, task, body })
    );
    taskState.resultStatus = "error";
    taskState.status = "error";
    taskState.finishedAt = now();
    this.attention(`${task.name}: ${reason}`);
    this.saveState();
    return `${task.name}: error`;
  }

  private spawnReadyTasks(taskTimeoutMs?: number): Array<{ name: string; promise: Promise<void> }> {
    const available = Math.max(0, this.plan.maxConcurrency - this.runningCount());
    if (available === 0) return [];
    const ready = this.plan.tasks
      .filter(task => this.getTaskState(task.name).status === "pending")
      .filter(task => this.dependenciesSatisfied(task))
      .slice(0, available);
    return ready.map(task => ({
      name: task.name,
      promise: this.spawnTask(task, taskTimeoutMs).catch(error =>
        this.recordSpawnError(task, error)
      ),
    }));
  }

  private async spawnTask(task: PlanTask, taskTimeoutMs?: number): Promise<void> {
    const taskState = this.getTaskState(task.name);
    taskState.status = "running";
    taskState.startedAt ??= now();
    taskState.attempts += 1;
    const taskRepo = this.repoForTask(task);
    ensureWorktree({
      repoRoot: taskRepo.path,
      branch: taskState.branch,
      baseRef: taskRepo.baseRef,
      worktreePath: taskState.worktreePath,
    });
    this.saveState();
    const agents = loadAgentDefinitions(this.root);
    const selectedAgent = task.agent ? agents.get(task.agent) : undefined;
    if (task.agent && !selectedAgent) {
      this.attention(`${task.name}: requested agent ${task.agent} was not found`);
    }
    const prompt = taskPrompt({
      plan: this.plan,
      task,
      taskState,
      agent: selectedAgent,
      workspace: this.workspace,
      inboxMessages: readInboxMessages(this.workspace),
    });
    const diagnostics = writePromptDiagnostics(this.workspace, task.name, prompt, agents, {
      phase: "task",
      repo: taskState.repo,
      isolationMode: taskState.isolation.mode,
      isolationRuntime: effectiveIsolationRuntime(taskState.isolation),
      authProfile: taskState.authProfile,
      gitIdentity: taskState.gitIdentity,
      model: task.model ?? "default",
      agent: task.agent,
    });
    this.promptDiagnostics.set(task.name, diagnostics);
    const model = task.model ?? "default";
    const apiKey = requireApiKey();
    const sdkAgent = await Agent.create({
      name: `swarm ${this.plan.rootSlug} ${task.name}`,
      apiKey,
      model: modelSelection(model),
      local: {
        cwd: taskState.worktreePath,
        settingSources: ["project", "user", "plugins"],
      },
      agents: toSdkAgentDefinitions(agents),
    });
    taskState.agentId = sdkAgent.agentId;
    this.saveState();
    try {
      const run = await sdkAgent.send(prompt);
      taskState.runId = run.id;
      this.saveState();
      await this.waitAndHandoff(task, taskState, run, taskTimeoutMs);
    } finally {
      await sdkAgent[Symbol.asyncDispose]();
    }
  }

  private async waitAndHandoff(
    task: PlanTask,
    taskState: TaskState,
    run: Run,
    taskTimeoutMs?: number
  ): Promise<void> {
    try {
      const result = await waitWithOptionalTimeout(run, task.name, taskTimeoutMs);
      this.finishFromResult(task, taskState, result);
    } catch (error) {
      taskState.resultStatus = "error";
      taskState.status = "error";
      taskState.finishedAt = now();
      const body = failureHandoff({
        taskName: task.name,
        branch: taskState.branch,
        reason: error instanceof Error ? error.message : String(error),
        diagnostics: this.failureDiagnostics(task.name, error),
      });
      taskState.handoffPath = relative(this.workspace, writeHandoff({ workspace: this.workspace, task, body }));
      this.attention(`${task.name}: run failed; wrote failure handoff`);
    } finally {
      this.saveState();
    }
  }

  private recordSpawnError(task: PlanTask, error: unknown): void {
    const taskState = this.getTaskState(task.name);
    taskState.status = "error";
    taskState.resultStatus = "error";
    taskState.finishedAt = now();
    const body = failureHandoff({
      taskName: task.name,
      branch: taskState.branch,
      reason: error instanceof Error ? error.message : String(error),
      diagnostics: this.failureDiagnostics(task.name, error),
    });
    taskState.handoffPath = relative(
      this.workspace,
      writeHandoff({ workspace: this.workspace, task, body })
    );
    this.attention(`${task.name}: spawn failed; wrote failure handoff`);
    this.saveState();
  }

  private finishFromResult(task: PlanTask, taskState: TaskState, result: RunResult): void {
    taskState.resultStatus = result.status;
    taskState.finishedAt = now();
    const body =
      extractFinalHandoff(result.result) ||
      failureHandoff({
        taskName: task.name,
        branch: taskState.branch,
        reason: "SDK run returned no final result text.",
      });
    const path = writeHandoff({ workspace: this.workspace, task, body });
    taskState.handoffPath = relative(this.workspace, path);
    const parsed = parseHandoff(body);
    if (!parsed.hasStructuredHandoff) {
      taskState.status = "error";
      this.attention(`${task.name}: missing structured handoff heading`);
      return;
    }
    if (result.status !== "finished") {
      taskState.status = "error";
      this.attention(`${task.name}: SDK run ended with ${result.status}`);
      return;
    }
    const status = parsed.status?.toLowerCase() ?? "";
    taskState.status =
      status.includes("failed") || status.includes("blocked") ? "error" : "handed-off";
    if (taskState.status === "error") {
      this.attention(`${task.name}: handoff status ${parsed.status ?? "(unknown)"}`);
    }
  }

  private async recoverRunningTasks(skip = new Set<string>()): Promise<void> {
    await Promise.all(
      this.state.tasks
        .filter(task => task.status === "running" && task.runId && !skip.has(task.name))
        .map(async taskState => {
          const task = this.plan.tasks.find(t => t.name === taskState.name);
          if (!task || !taskState.runId) return;
          try {
            const run = await Agent.getRun(taskState.runId, {
              runtime: "local",
              cwd: taskState.worktreePath,
            });
            if (run.status === "running") return;
            const result = run.result
              ? {
                  id: run.id,
                  status: run.status,
                  result: run.result,
                  model: run.model,
                  durationMs: run.durationMs,
                  git: run.git,
                }
              : await run.wait();
            this.finishFromResult(task, taskState, result);
          } catch (error) {
            this.attention(
              `${taskState.name}: could not recover running task ${taskState.runId}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        })
    );
  }

  private failTimedOutRunningTasks(taskTimeoutMs: number | undefined, skip: Set<string>): void {
    if (!taskTimeoutMs || taskTimeoutMs <= 0) return;
    const cutoff = Date.now() - taskTimeoutMs;
    for (const taskState of this.state.tasks) {
      if (taskState.status !== "running" || skip.has(taskState.name) || !taskState.startedAt) {
        continue;
      }
      const startedAt = Date.parse(taskState.startedAt);
      if (!Number.isFinite(startedAt) || startedAt > cutoff) continue;
      const task = this.plan.tasks.find(candidate => candidate.name === taskState.name);
      if (!task) continue;
      taskState.status = "error";
      taskState.resultStatus = "error";
      taskState.finishedAt = now();
      const body = failureHandoff({
        taskName: task.name,
        branch: taskState.branch,
        reason: `Task exceeded timeout of ${Math.round(taskTimeoutMs / 1000)}s while still marked running.`,
        diagnostics: this.failureDiagnostics(task.name, new Error("task timeout")),
      });
      taskState.handoffPath = relative(
        this.workspace,
        writeHandoff({ workspace: this.workspace, task, body })
      );
      this.attention(`${task.name}: timed out while running; wrote failure handoff`);
    }
  }

  private dependenciesSatisfied(task: PlanTask): boolean {
    return task.dependsOn.every(dep => this.getTaskState(dep).status === "handed-off");
  }

  private reconcileState(): void {
    const byName = new Map(this.state.tasks.map(task => [task.name, task]));
    const next = this.plan.tasks.map(task => {
      const existing = byName.get(task.name);
      if (existing) return existing;
      return initialTaskState(this.plan, this.workspace, task);
    });
    this.state.tasks = next;
    this.state.projectRoot = this.root;
    this.state.repositories = this.repositories();
    this.state.updatedAt = now();
  }

  private reloadState(): void {
    if (!existsSync(this.statePath)) return;
    this.state = parseStateJson(readFileSync(this.statePath, "utf8"), this.statePath);
    this.reconcileState();
  }

  private saveState(): void {
    this.state.updatedAt = now();
    writeJsonAtomic(this.statePath, this.state);
  }

  private getTaskState(name: string): TaskState {
    const task = this.state.tasks.find(item => item.name === name);
    if (!task) throw new SwarmValidationError(`unknown task state ${name}`);
    return task;
  }

  private runningCount(): number {
    return this.state.tasks.filter(task => task.status === "running").length;
  }

  private hasRunningTasks(): boolean {
    return this.runningCount() > 0;
  }

  private isTerminal(): boolean {
    return this.state.tasks.every(task =>
      ["handed-off", "error", "cancelled"].includes(task.status)
    );
  }

  private exitCode(): number {
    return this.state.tasks.every(task => task.status === "handed-off") ? 0 : 1;
  }

  private attention(line: string): void {
    const entry = `${new Date().toISOString()} ${line}`;
    this.state.attention.push(entry);
    writeFileSync(join(this.workspace, "attention.log"), `${entry}\n`, { flag: "a" });
  }

  private printHeartbeat(): void {
    const counts = countStatuses(this.state.tasks);
    console.log(
      `[${new Date().toISOString()}] swarm ${this.plan.rootSlug}: ${Object.entries(counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")}`
    );
  }

  private repositories(): DiscoveredRepo[] {
    if (this.plan.repositories.length > 0) return this.plan.repositories;
    return [repoSpec(this.root, this.plan.baseRef)];
  }

  private repoForTask(task: PlanTask): DiscoveredRepo {
    const repositories = this.repositories();
    const repoName =
      task.repo ??
      this.plan.defaultRepo ??
      (repositories.length === 1 ? repositories[0].name : undefined);
    const repo = repositories.find(candidate => candidate.name === repoName);
    if (!repo) {
      throw new SwarmValidationError(
        `${task.name}: task.repo is required when multiple repositories are available`
      );
    }
    return repo;
  }

  private failureDiagnostics(
    taskName: string,
    error: unknown
  ): Record<string, string | number | boolean | null | undefined> {
    const base = this.promptDiagnostics.get(taskName) ?? {};
    return {
      ...base,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function initialState(plan: Plan, workspace: string): State {
  const timestamp = now();
  const projectRoot = projectRootFromWorkspace(workspace);
  const repositories =
    plan.repositories.length > 0 ? plan.repositories : [repoSpec(projectRoot, plan.baseRef)];
  return {
    rootSlug: plan.rootSlug,
    projectRoot,
    repositories,
    createdAt: timestamp,
    updatedAt: timestamp,
    tasks: plan.tasks.map(task => initialTaskState(plan, workspace, task)),
    attention: [],
  };
}

function initialTaskState(plan: Plan, workspace: string, task: PlanTask): TaskState {
  const projectRoot = projectRootFromWorkspace(workspace);
  const repositories =
    plan.repositories.length > 0 ? plan.repositories : [repoSpec(projectRoot, plan.baseRef)];
  const repoName = task.repo ?? plan.defaultRepo ?? repositories[0].name;
  const repo = repositories.find(candidate => candidate.name === repoName) ?? repositories[0];
  return {
    name: task.name,
    type: task.type,
    status: "pending",
    repo: repo.name,
    repoPath: repo.path,
    agent: task.agent,
    executor: task.executor ?? plan.executor,
    isolation: resolvedIsolation(task.isolation ?? plan.isolation),
    authProfile: task.authProfile ?? repo.authProfile ?? plan.authProfile,
    gitIdentity: task.gitIdentity ?? repo.gitIdentity ?? plan.gitIdentity,
    branch: branchForTask(plan.rootSlug, task.name),
    worktreePath: worktreePathForTask(workspace, repo.name, task.name),
    agentId: null,
    runId: null,
    resultStatus: null,
    handoffPath: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    dependsOn: task.dependsOn,
  };
}

function withRepositoryDefaults(
  plan: Plan,
  repositories: DiscoveredRepo[],
  defaultRepo: string | undefined,
  repositoryMode: "single" | "siblings"
): Plan {
  return {
    ...plan,
    repositoryMode,
    executor: plan.executor ?? "cursor-visible",
    isolation: resolvedIsolation(plan.isolation),
    repositories,
    defaultRepo: plan.defaultRepo ?? defaultRepo,
    baseRef: plan.baseRef ?? repositories[0]?.baseRef ?? "main",
    tasks: plan.tasks.map(task => ({
      ...task,
      repo: task.repo ?? (repositories.length === 1 ? repositories[0].name : undefined),
      isolation: task.isolation ? resolvedIsolation(task.isolation) : undefined,
    })),
  };
}

function resolvedIsolation(isolation: Isolation): Isolation {
  if (isolation.mode === "container") {
    return { ...isolation, runtime: isolation.runtime ?? "docker" };
  }
  const { runtime: _runtime, ...rest } = isolation;
  return rest;
}

function effectiveIsolationRuntime(isolation: Isolation): string | undefined {
  if (isolation.runtime) return isolation.runtime;
  if (isolation.mode === "container") return "docker";
  return undefined;
}

function countStatuses(tasks: TaskState[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
}

function writePromptDiagnostics(
  workspace: string,
  name: string,
  prompt: string,
  agents: Map<string, LoadedAgent>,
  extra: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean | null | undefined> {
  const sdkAgents = toSdkAgentDefinitions(agents);
  const diagnostics = {
    ...extra,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
    sdkAgentsBytes: Buffer.byteLength(JSON.stringify(sdkAgents), "utf8"),
  };
  writeJsonAtomic(join(workspace, "logs", `${name}-prompt.json`), diagnostics);
  return diagnostics;
}

function executorInstructions(executor: Executor): string {
  switch (executor) {
    case "cursor-visible":
      return [
        "Executor: cursor-visible",
        "- You are a Cursor subagent launched from the parent chat, so your reasoning and tool activity are visible to the operator.",
        "- The parent may launch a native subagent type matching the selected swarm agent when this Cursor runtime supports it.",
        "- If no matching native subagent type exists, the parent should launch generalPurpose. The selected persona is embedded in this prompt either way.",
      ].join("\n");
    case "claude-cli":
      return [
        "Executor: claude-cli",
        "- You are running from a Claude Code CLI process started by another host.",
        "- Stream useful progress in the terminal and keep durable conclusions in the handoff.",
      ].join("\n");
    case "claude-native":
      return [
        "Executor: claude-native",
        "- You are a Claude Code native background agent/task launched by the parent Claude session.",
        "- Do not start another Claude process from Bash for this lane.",
        "- The selected persona is embedded in this prompt. Use a matching native Claude subagent/persona when available; otherwise use the default native agent.",
      ].join("\n");
    case "codex-cli":
      return [
        "Executor: codex-cli",
        "- You are running from a Codex CLI process started by another host.",
        "- Stream useful progress in the terminal and keep durable conclusions in the handoff.",
      ].join("\n");
    case "pi-cli":
      return [
        "Executor: pi-cli",
        "- You are running from a Pi CLI process started by another host.",
        "- Stream useful progress in the terminal and keep durable conclusions in the handoff.",
      ].join("\n");
    case "codex-native":
      return [
        "Executor: codex-native",
        "- You are a Codex native background agent/task launched by the parent Codex session.",
        "- Do not start another Codex process from Bash for this lane.",
        "- The selected persona is embedded in this prompt. Use a matching native Codex agent/persona when available; otherwise use the default native agent.",
      ].join("\n");
    case "cursor-sdk":
      return [
        "Executor: cursor-sdk",
        "- You are running through the headless Cursor SDK runner.",
        "- Keep all durable conclusions in the handoff because the operator may not watch the live run.",
      ].join("\n");
  }
}

function isolationLaunchInstructions(isolation: Isolation): string {
  const runtime = effectiveIsolationRuntime(isolation);
  switch (isolation.mode) {
    case "worktree":
      return [
        "Isolation: worktree",
        "- The task worktree is the execution boundary. Do not read or write outside the allowed task scope.",
      ].join("\n");
    case "readonly":
      return [
        "Isolation: readonly",
        "- Treat the checkout as read-only. Do not modify files unless the parent explicitly changes this task's isolation mode.",
      ].join("\n");
    case "container":
      return [
        `Isolation: container (${runtime ?? "docker"})`,
        "- Run inside the declared container sandbox when the selected harness supports it.",
        "- Mount or clone only the task worktree, use the declared network policy, and keep credentials limited to named profiles.",
      ].join("\n");
  }
}

function cursorSubagentCandidates(agent: string | undefined): string[] {
  return agent ? [agent, "generalPurpose"] : ["generalPurpose"];
}

function nativeAgentCandidates(agent: string | undefined): string[] {
  return agent ? [agent, "default"] : ["default"];
}

function launchInstruction(executor: Executor, promptPath: string, agent: string | undefined): string {
  switch (executor) {
    case "cursor-visible":
      if (agent) {
        return `If "${agent}" is an available Cursor subagent_type in this session, launch it with the prompt in ${promptPath}; otherwise launch generalPurpose. The persona is embedded in the prompt either way.`;
      }
      return `Launch a visible Cursor generalPurpose subagent with the prompt in ${promptPath}.`;
    case "claude-cli":
      if (agent) {
        return `Open Claude Code CLI in the worktree. If a matching Claude subagent/persona named "${agent}" is available, use it; otherwise provide the prompt from ${promptPath} to the default Claude CLI session.`;
      }
      return `Open Claude Code CLI in the worktree and provide the prompt from ${promptPath}.`;
    case "claude-native":
      if (agent) {
        return `Launch a Claude Code native background agent/task for this lane. If a matching native subagent/persona named "${agent}" is available, use it; otherwise use the default native agent. Give it the prompt from ${promptPath}; do not start Claude via Bash.`;
      }
      return `Launch a Claude Code native background agent/task with the prompt from ${promptPath}; do not start Claude via Bash.`;
    case "codex-cli":
      if (agent) {
        return `Open Codex CLI in the worktree. If a matching Codex agent/persona named "${agent}" is available, use it; otherwise provide the prompt from ${promptPath} to the default Codex CLI session.`;
      }
      return `Open Codex CLI in the worktree and provide the prompt from ${promptPath}.`;
    case "pi-cli":
      if (agent) {
        return `Open Pi CLI in the worktree. If a matching Pi skill/persona named "${agent}" is available, use it; otherwise provide the prompt from ${promptPath} to the default Pi CLI session.`;
      }
      return `Open Pi CLI in the worktree and provide the prompt from ${promptPath}.`;
    case "codex-native":
      if (agent) {
        return `Launch a Codex native background agent/task for this lane. If a matching native agent/persona named "${agent}" is available, use it; otherwise use the default native agent. Give it the prompt from ${promptPath}; do not start Codex via Bash.`;
      }
      return `Launch a Codex native background agent/task with the prompt from ${promptPath}; do not start Codex via Bash.`;
    case "cursor-sdk":
      return "Use `swarm run <workspace>` for headless Cursor SDK execution.";
  }
}

async function sleepOrTaskCompletion(
  idleSleepMs: number,
  inFlight: Map<string, Promise<void>>
): Promise<void> {
  if (inFlight.size === 0) {
    await sleep(idleSleepMs);
    return;
  }
  await Promise.race([sleep(idleSleepMs), ...inFlight.values()]);
}

async function waitWithOptionalTimeout(
  run: Run,
  taskName: string,
  taskTimeoutMs?: number
): Promise<RunResult> {
  if (!taskTimeoutMs || taskTimeoutMs <= 0) return run.wait();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run.wait(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `${taskName}: task exceeded timeout of ${Math.round(taskTimeoutMs / 1000)}s`
            )
          );
        }, taskTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function now(): string {
  return new Date().toISOString();
}
