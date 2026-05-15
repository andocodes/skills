import type { LoadedAgent } from "./agents.ts";
import { readHandoff } from "./handoff.ts";
import { formatInbox, messagesForTask, type InboxMessage } from "./inbox.ts";
import type { DiscoveredRepo } from "./repos.ts";
import type { Executor, Isolation, Plan, PlanTask, TaskState } from "./schemas.ts";

export function rootPlannerPrompt(args: {
  goal: string;
  rootSlug: string;
  baseRef: string;
  workspace: string;
  agents: Map<string, LoadedAgent>;
  repositories: DiscoveredRepo[];
  repositoryMode: "single" | "siblings";
  executor: Executor;
  isolation?: Isolation;
  authProfile?: string;
  gitIdentity?: string;
  defaultRepo?: string;
}): string {
  return `You are the root planner for a local swarm run.

Goal:
${args.goal}

Write a JSON plan to:
${args.workspace}/plan.json

Plan contract:
- goal: the verbatim goal above.
- summary: one-line human orientation.
- rootSlug: "${args.rootSlug}".
- repositoryMode: "${args.repositoryMode}".
- executor: "${args.executor}" unless a specific task needs a different executor.
- isolation: ${JSON.stringify(args.isolation ?? { mode: "worktree", network: "restricted" })} unless a task needs a stronger or weaker boundary.
- authProfile: ${args.authProfile ? `"${args.authProfile}"` : "omit unless the user named a local auth profile"}.
- gitIdentity: ${args.gitIdentity ? `"${args.gitIdentity}"` : "omit unless the user named a local git identity"}.
- repositories: copy the available repositories below exactly.
- defaultRepo: ${args.defaultRepo ? `"${args.defaultRepo}"` : "omit when multiple repos are available"}.
- baseRef: "${args.baseRef}" unless you have a strong reason to use another existing ref.
- maxConcurrency: 1-4, default 2.
- tasks: worker and verifier tasks with kebab-case names.
- A task may set executor to cursor-visible, cursor-sdk, claude-native, claude-cli, codex-native, codex-cli, or pi-cli.
- A task may set isolation to { "mode": "worktree" }, { "mode": "container", "runtime": "docker" }, { "mode": "container", "runtime": "podman" }, or { "mode": "readonly" }. Container tasks may set readonly: true to mount the checkout read-only while still allowing handoff writes.
- A task may set authProfile or gitIdentity only as named local profiles. Never inline tokens, private keys, or secret values.
- In sibling repo mode, set task.repo for every task. Paths are relative to that repo.
- Each task needs scopedGoal. Use agent when one of the available agents clearly fits.
- Use dependsOn for ordering. Verifiers may set verifies when checking a specific worker, or omit verifies for standalone audit/check lanes.
- Keep fan-out small and meaningful. Prefer fewer, broader workers.
- Do not edit code. Only write plan.json.

Available agents:
${renderAvailableAgents(args.agents)}

Available repositories:
${renderRepositories(args.repositories)}

Return a short summary after writing the file.`;
}

export function taskPrompt(args: {
  plan: Plan;
  task: PlanTask;
  taskState: TaskState;
  agent?: LoadedAgent;
  workspace: string;
  inboxMessages?: InboxMessage[];
}): string {
  const upstream = renderUpstreamHandoffs(args.workspace, args.task);
  const inbox = renderInboxForTask(args.inboxMessages ?? [], args.task.name);
  const agentBlock = args.agent
    ? `Selected agent persona: ${args.agent.name}
Source: ${args.agent.path}

${args.agent.prompt}`
    : "No named agent persona was selected. Use general senior engineering judgment.";
  if (args.task.type === "verifier") {
    return verifierPrompt({ ...args, upstream, inbox, agentBlock });
  }
  return workerPrompt({ ...args, upstream, inbox, agentBlock });
}

function workerPrompt(args: {
  plan: Plan;
  task: PlanTask;
  taskState: TaskState;
  agentBlock: string;
  upstream: string;
  inbox: string;
}): string {
  return `You are a local swarm worker.

Root goal:
${args.plan.goal}

Task:
${args.task.scopedGoal}

${args.task.brief ? `Task brief:\n${args.task.brief}\n` : ""}
Agent persona:
${args.agentBlock}

Branch:
${args.taskState.branch}

Repository:
${args.taskState.repo ?? "(default)"} at ${args.taskState.repoPath}

Isolation:
${renderIsolation(args.taskState)}

Auth and git identity:
${renderIdentity(args.taskState)}

Allowed paths:
${renderList(args.task.pathsAllowed, "(none declared - stay tightly scoped and ask via handoff if blocked)")}

Forbidden paths:
${renderList(args.task.pathsForbidden, "(none)")}

Acceptance:
${renderChecklist(args.task.acceptance)}

Verification plan:
${args.task.verify ?? "(none declared - run the smallest credible verification for your changes)"}

${args.upstream}

${args.inbox}

Rules:
- You are running inside the declared swarm isolation boundary for this task.
- The git branch above is the durable boundary for any changes, even when the execution sandbox is a container.
- Use only the named auth/git identity profiles above; never use ambient credentials if a profile is specified.
- Do not merge, rebase, push, or open a PR.
- Keep changes scoped to this task.
- If you need to leave a parent-mediated note, mention the exact \`swarm note\` command in your handoff. Do not attempt sibling-to-sibling chat.
- End your final answer with the exact structured handoff below.

Required final handoff:
## Status
success | blocked | failed

## Branch
\`${args.taskState.branch}\`

## Summary
What changed and why.

## Files Changed
- \`path\`

## Verification
- \`command\`: result

## Risks
- Remaining concerns, or \`(none)\`.

## Next Steps
- Follow-up work, or \`(none)\`.`;
}

function verifierPrompt(args: {
  plan: Plan;
  task: PlanTask;
  taskState: TaskState;
  agentBlock: string;
  upstream: string;
  inbox: string;
}): string {
  const target = args.plan.tasks.find(task => task.name === args.task.verifies);
  return `You are a local swarm verifier.

Root goal:
${args.plan.goal}

Verifier task:
${args.task.scopedGoal}

Verification target:
${renderVerificationTarget(args.task, target)}

Agent persona:
${args.agentBlock}

Branch:
${args.taskState.branch}

Repository:
${args.taskState.repo ?? "(default)"} at ${args.taskState.repoPath}

Isolation:
${renderIsolation(args.taskState)}

Auth and git identity:
${renderIdentity(args.taskState)}

Acceptance to verify:
${renderChecklist(target?.acceptance ?? args.task.acceptance)}

Verification plan:
${args.task.verify ?? target?.verify ?? "(none declared - perform the smallest credible independent check)"}

${args.upstream}

${args.inbox}

Rules:
- You are running inside the declared swarm isolation boundary for this task.
- The git branch above is the durable boundary for any changes, even when the execution sandbox is a container.
- Use only the named auth/git identity profiles above; never use ambient credentials if a profile is specified.
- Do not modify code unless the verifier task explicitly asks you to. Report findings.
- If you need to leave a parent-mediated note, mention the exact \`swarm note\` command in your handoff. Do not attempt sibling-to-sibling chat.
- End your final answer with the exact structured handoff below.

Required final handoff:
## Verification
passed | failed | blocked

## Branch
\`${args.taskState.branch}\`

## Summary
What you verified.

## Evidence
- \`command\`: result

## Findings
- Issues found, or \`(none)\`.

## Risks
- Remaining concerns, or \`(none)\`.

## Next Steps
- Follow-up work, or \`(none)\`.`;
}

function renderUpstreamHandoffs(workspace: string, task: PlanTask): string {
  if (task.dependsOn.length === 0) return "Upstream handoffs: (none)";
  const chunks = task.dependsOn.map(dep => {
    const body = readHandoff(workspace, dep);
    return `### ${dep}\n\n${body?.trim() || "(missing handoff)"}`;
  });
  return `Upstream handoffs:\n\n${chunks.join("\n\n---\n\n")}`;
}

function renderInboxForTask(messages: InboxMessage[], taskName: string): string {
  const relevant = messagesForTask(messages, taskName);
  if (relevant.length === 0) return "Swarm inbox notes: (none)";
  return `Swarm inbox notes (parent-mediated, not sibling chat):\n\n${formatInbox(relevant.slice(-10))}`;
}

function renderVerificationTarget(task: PlanTask, target: PlanTask | undefined): string {
  if (target) return `${target.name}: ${target.scopedGoal}`;
  if (task.verifies) return `${task.verifies} (target task not found)`;
  return "(standalone verification lane)";
}

function renderAvailableAgents(agents: Map<string, LoadedAgent>): string {
  if (agents.size === 0) return "- (none found)";
  return [...agents.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(agent => `- ${agent.name}: ${agent.description}`)
    .join("\n");
}

function renderRepositories(repositories: DiscoveredRepo[]): string {
  if (repositories.length === 0) return "- (none discovered)";
  return repositories
    .map(repo => {
      const auth = repo.authProfile ? `, authProfile=${repo.authProfile}` : "";
      const identity = repo.gitIdentity ? `, gitIdentity=${repo.gitIdentity}` : "";
      return `- ${repo.name}: path=${repo.path}, baseRef=${repo.baseRef}${auth}${identity}`;
    })
    .join("\n");
}

function renderList(items: string[], empty: string): string {
  return items.length > 0 ? items.map(item => `- ${item}`).join("\n") : `- ${empty}`;
}

function renderChecklist(items: string[]): string {
  return items.length > 0 ? items.map(item => `- [ ] ${item}`).join("\n") : "- (none declared)";
}

function renderIsolation(taskState: TaskState): string {
  const isolation = taskState.isolation;
  const runtime = isolation.runtime ? ` runtime=${isolation.runtime}` : "";
  const image = isolation.image ? ` image=${isolation.image}` : "";
  const readonly = isolation.readonly ? " readonly=true" : "";
  const notes = isolation.notes ? `\n- notes: ${isolation.notes}` : "";
  return `- mode=${isolation.mode}${runtime}${image} network=${isolation.network}${readonly}${notes}`;
}

function renderIdentity(taskState: TaskState): string {
  const lines = [
    `- authProfile: ${taskState.authProfile ?? "(ambient/default)"}`,
    `- gitIdentity: ${taskState.gitIdentity ?? "(ambient/default)"}`,
  ];
  return lines.join("\n");
}
