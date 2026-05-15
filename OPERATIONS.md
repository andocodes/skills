# Swarm Operations

This file keeps operational detail out of `SKILL.md`.

## Adapter Selection

Prefer the current harness's native adapter:

- Cursor parent chat: `cursor-visible`
- Claude Code parent chat: `claude-native`
- Codex parent chat: `codex-native`

Use `claude-cli`, `codex-cli`, or `pi-cli` when a parent host intentionally starts a terminal-visible lane in another harness. Use `cursor-sdk` for unattended headless runs.

Always announce the chosen executor, isolation mode, repository mode, `baseRef`, and max concurrency before spawning lanes.

## Visible and Native Runs

Create a workspace without launching hidden workers:

```bash
bun <skillDir>/scripts/cli.ts init "<goal>" --executor <executor> --isolation <mode>
```

The parent writes `plan.json`, prepares each ready task, and launches the returned `executor` using the returned `promptPath`:

```bash
bun <skillDir>/scripts/cli.ts prepare .swarm/<rootSlug> <task>
```

The lane writes `.swarm/<rootSlug>/handoffs/<task>.md`. Record it with:

```bash
bun <skillDir>/scripts/cli.ts complete .swarm/<rootSlug> <task>
```

For `cursor-visible`, use the first returned `cursorSubagentCandidates` entry that exists in the current Cursor session. For `claude-native` and `codex-native`, use the host's native background agent/task tool and do not start another CLI process from Bash. For CLI adapters, open the selected CLI in the task worktree and provide the prompt file.

For command-backed CLI lanes, the local CLI can execute the generated launch plan:

```bash
bun <skillDir>/scripts/cli.ts launch .swarm/<rootSlug> <task>
```

`launch` runs `prepare`, executes `codex-cli`, `claude-cli`, or `pi-cli` either on the host or inside the declared container image, and records the handoff when the lane exits. Use `--dry-run` to inspect the exact command without executing it, or `--no-complete` to leave completion to the parent.

## Isolation Operation

`worktree` mode creates the task worktree and branch, then runs directly in that checkout.

`readonly` mode still prepares a checkout and prompt, but the lane must treat the checkout as read-only. Use it for architecture discovery, audits, and independent verification.

`container` mode prepares the same task worktree, then the harness adapter should run Docker or Podman with:

- only the task worktree mounted or cloned
- the declared `network` policy
- no ambient credentials when `authProfile` is set
- only the named `gitIdentity` profile when one is set
- durable output returned through git branch changes and the handoff file

Container launch executes the selected CLI inside the image. The image must include `codex`, `claude`, or `pi`, git, shell utilities, and any profile resolver needed for the declared `authProfile` or `gitIdentity`. If no image is declared, the launcher chooses the matching core image for the selected executor.

Build images with:

```bash
bun <skillDir>/scripts/cli.ts image build codex-core
bun <skillDir>/scripts/cli.ts image build claude-rust
bun <skillDir>/scripts/cli.ts image build pi-go
```

Image tags follow `swarm-agent:<version>-<preset>`, such as `swarm-agent:0.1.0-codex-core`, `swarm-agent:0.1.0-claude-rust`, `swarm-agent:0.1.0-pi-go`, and `swarm-agent:0.1.0-fake`.

## Headless Cursor SDK Runs

Use:

```bash
bun <skillDir>/scripts/cli.ts run .swarm/<rootSlug> --max-runtime-sec 43200 --task-timeout-sec 1800
```

The headless SDK runner:

- Re-reads `state.json` between sweeps.
- Recovers persisted local SDK `runId` values when possible.
- Spawns ready pending tasks up to `plan.maxConcurrency`.
- Writes `attention.log` when recovery, handoff, or task status needs operator review.
- Exits with a non-zero code when any task is blocked, failed, cancelled, or still pending at checkpoint.
- Fails tasks that stay running longer than `--task-timeout-sec`, writing a failure handoff.

Rerun the same command to recover. The runner reconciles `plan.json` and `state.json` before each loop.

## Cursor SDK Auth

There is no separate local-login auth mode in the Cursor SDK. Local SDK agents need a valid API key.

Run:

```bash
bun <skillDir>/scripts/cli.ts auth
```

This calls `Cursor.me()` and `Cursor.models.list()` with the exact `CURSOR_API_KEY` visible to the process. If it returns `AuthenticationError: unauthenticated`, refresh the key from Cursor Dashboard > Integrations and export it again in the same shell that starts the run.

## Side-By-Side Repositories

For a workspace containing independent child repos:

```bash
bun <skillDir>/scripts/cli.ts init "<goal>" --repo-mode siblings
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
bun <skillDir>/scripts/cli.ts init "<goal>" --repo-mode siblings --base-ref wip/my-branch
```

This keeps every task reproducible: the planner, worktrees, and handoffs all point back to a real git ref instead of a captured local patch.

## Prompt Diagnostics

For each planner or task launch, the runner writes `logs/<name>-prompt.json` with prompt byte counts, selected model/agent information, executor, isolation mode, runtime, and identity profile names. Failure handoffs include diagnostics plus the SDK error name/message when available.

## Inbox

The inbox is parent-mediated coordination, not direct worker chat:

```bash
bun <skillDir>/scripts/cli.ts note .swarm/<rootSlug> "Need contract decision before wiring platform" --task platform-ui --priority blocked
bun <skillDir>/scripts/cli.ts inbox .swarm/<rootSlug>
```

Messages live in `.swarm/<rootSlug>/messages/inbox.jsonl`.

- `--audience planner` is for operator/planner notes.
- `--audience task --task <name>` is injected into that task prompt.
- `--audience all` is injected into all future task prompts.

Keep notes short. Durable implementation detail belongs in handoffs.
