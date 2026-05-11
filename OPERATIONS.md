# Swarm Operations

This file keeps long-running behavior out of `SKILL.md`.

## Visible Runs

Default `/swarm` should use `cursor-visible`: Cursor `generalPurpose` subagents launched from the parent chat.

Use:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts init "<goal>"
```

Then the parent chat writes `plan.json`, prepares each ready task, and launches the requested executor from the returned prompt file:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts prepare .swarm/<rootSlug> <task>
```

The visible subagent writes `.swarm/<rootSlug>/handoffs/<task>.md`. Record it with:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts complete .swarm/<rootSlug> <task>
```

Use `cursor-visible` when the operator is actively working in Cursor and wants to inspect worker reasoning, tool calls, and blockers in the chat UI. The task `agent` is a persona inside the prompt, not a Cursor `subagent_type`; launch `generalPurpose` unless a future runtime explicitly advertises a compatible predefined type.

Use `claude-cli` or `codex-cli` when the same swarm task should run in a terminal-visible lane. Those executors still use the same worktree, prompt file, handoff file, and `complete` step; they just do not appear as native Cursor subagent chats.

## Headless Overnight Runs

Use:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts run .swarm/<rootSlug> --max-runtime-sec 43200 --task-timeout-sec 1800
```

The headless SDK runner is the heartbeat:

- Re-reads `state.json` between sweeps.
- Recovers persisted local SDK `runId` values when possible.
- Spawns ready pending tasks up to `plan.maxConcurrency`.
- Writes `attention.log` when recovery, handoff, or task status needs operator review.
- Exits with a non-zero code when any task is blocked, failed, cancelled, or still pending at checkpoint.
- Fails tasks that stay running longer than `--task-timeout-sec`, writing a failure handoff instead of leaving zombie state.

Rerunning the same command is the recovery path. The runner reconciles `plan.json` and `state.json` before each loop.

For repeated local SDK transport errors such as `NGHTTP2_FRAME_SIZE_ERROR`, prefer a bounded run:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts run .swarm/<rootSlug> --task-timeout-sec 600
```

If no handoff arrives within the timeout, the task is marked `error` with a generated failure handoff. The runner also writes prompt-size diagnostics under `logs/` so SDK failures can be investigated without changing prompt behavior.

Kickoff writes `.swarm/<rootSlug>/kickoff.json` before the planner completes, then updates it with planner `agentId`/`runId` and terminal status. If kickoff appears silent, inspect that file before restarting.

## Auth

There is no separate local-login auth mode in the Cursor SDK. Local agents still need a valid API key.

Run:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts auth
```

This calls `Cursor.me()` and `Cursor.models.list()` with the exact `CURSOR_API_KEY` visible to the process. If it returns `AuthenticationError: unauthenticated`, refresh the key from Cursor Dashboard > Integrations and export it again in the same shell that starts `/swarm`.

## Side-By-Side Repositories

For workspaces like `BTL/` where child folders are independent git repos:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts kickoff "<goal>" --repo-mode siblings
```

The planner receives all child git repositories and should set `repo` on each task:

```json
{
  "repositoryMode": "siblings",
  "repositories": [
    { "name": "platform", "path": "/Users/me/BTL/platform", "baseRef": "main" },
    { "name": "content-service", "path": "/Users/me/BTL/content-service", "baseRef": "main" }
  ],
  "tasks": [
    { "name": "platform-ui", "repo": "platform", "type": "worker", "scopedGoal": "..." }
  ]
}
```

Each task gets a worktree under `.swarm/<rootSlug>/worktrees/<repo>/<task>/`, but the git branch is created inside that task's selected repository.

## Working Base

Workers branch from the selected repo's `baseRef`. They do not see uncommitted local work.

If current WIP matters, create a WIP branch or commit first, then pass that ref:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts kickoff "<goal>" --repo-mode siblings --base-ref wip/my-branch
```

This keeps every task reproducible: the planner, worktrees, and handoffs all point back to a real git ref instead of a captured local patch.

## Prompt Diagnostics

Swarm sends the full generated prompt and selected agent definitions to the SDK. It does not shrink prompts to work around transport errors.

For each planner or task launch, the runner writes `logs/<name>-prompt.json` with prompt and SDK-agent payload byte counts. Failure handoffs include the same diagnostics plus the SDK error name/message when available.

## Planning Shape

Borrow from `.planning` only where it improves continuity:

- Use one durable state file, not many chat notes.
- Store handoffs as markdown artifacts.
- Keep decisions and blockers explicit in `attention.log`.
- Keep project-level roadmaps in the project, not inside this skill.

The skill should stay generic. Project-specific milestone language belongs in task prompts, `.planning`, or `.cursor/agents`.

## Inbox

The inbox is parent-mediated coordination, not direct worker chat:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts note .swarm/<rootSlug> "Need contract decision before wiring platform" --task platform-ui --priority blocked
bun ~/.cursor/skills/swarm/scripts/cli.ts inbox .swarm/<rootSlug>
```

Messages live in `.swarm/<rootSlug>/messages/inbox.jsonl`.

- `--audience planner` is for operator/planner notes.
- `--audience task --task <name>` is injected into that task prompt.
- `--audience all` is injected into all future task prompts.

Keep notes short. Durable implementation detail still belongs in handoffs.
