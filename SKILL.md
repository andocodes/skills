---
name: swarm
description: Use only when the user explicitly types `/swarm <goal>` to decompose a large local task into visible agent lanes, each isolated in its own git worktree, with JSON state and structured handoffs. Do not invoke autonomously.
disable-model-invocation: true
---

# Swarm

`/swarm <goal>` is a local orchestration workflow. It decomposes a large goal, runs visible agent lanes in isolated git worktrees, and records progress through JSON state plus markdown handoffs.

## Setup

- `CURSOR_API_KEY` is required only for `cursor-sdk` mode.
- Scripts expect `bun` on PATH.
- First use: run `bun install` inside `~/.cursor/skills/swarm/scripts/`.
- Check auth with `bun ~/.cursor/skills/swarm/scripts/cli.ts auth`.
- Workspaces live under `.swarm/<rootSlug>/` in the active repository or side-by-side repo container.
- Task worktrees live under `.swarm/<rootSlug>/worktrees/<repo>/<taskName>/`.
- Side-by-side repo containers are supported with `--repo-mode siblings`; tasks then set `repo`.
- Swarm runs from committed git refs. If current WIP matters, make a WIP branch or commit and pass it with `--base-ref`.

## Core Rules

1. The planner writes `plan.json`. It does not code.
2. By default, workers and verifiers use `cursor-visible`: Cursor's native subagent tool, visible in the current chat.
3. Workers communicate only through handoffs and parent-mediated inbox notes.
4. Tasks may select `.cursor/agents/*.md` or `~/.cursor/agents/*.md` personas.
5. Universal execution is an adapter hint, not a new artifact model: `cursor-visible`, `cursor-sdk`, `claude-cli`, or `codex-cli`.
6. No cloud clone, Slack bridge, automatic PR creation, or automatic merging in v1.

## Dispatcher Workflow

When the user invokes `/swarm <goal>`:

1. Ask for clarification only if the goal is missing or genuinely ambiguous.
2. Create the workspace without launching hidden SDK agents:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts init "<goal>"
```

3. In the parent chat, write `.swarm/<rootSlug>/plan.json` yourself using the planner contract below. Keep fan-out small.
4. Prepare each ready task:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts prepare .swarm/<rootSlug> <task>
```

5. Read the returned `promptPath`, then launch the returned `executor`. `cursor-visible` uses a native Cursor subagent; `claude-cli` and `codex-cli` use terminal-visible lanes.
6. After the visible subagent writes `.swarm/<rootSlug>/handoffs/<task>.md`, record it:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts complete .swarm/<rootSlug> <task>
```

7. Inspect progress with:

```bash
bun ~/.cursor/skills/swarm/scripts/cli.ts tree .swarm/<rootSlug>
bun ~/.cursor/skills/swarm/scripts/cli.ts status .swarm/<rootSlug>
```

## Planner Contract

The root planner writes `.swarm/<rootSlug>/plan.json`:

```json
{
  "goal": "verbatim user goal",
  "summary": "short human orientation",
  "rootSlug": "short-kebab-name",
  "repositoryMode": "single",
  "executor": "cursor-visible",
  "repositories": [
    { "name": "platform", "path": "/path/to/platform", "baseRef": "main" }
  ],
  "defaultRepo": "platform",
  "baseRef": "main",
  "maxConcurrency": 2,
  "tasks": [
    {
      "name": "frontend-slice",
      "type": "worker",
      "repo": "platform",
      "executor": "cursor-visible",
      "agent": "btl-frontend-track",
      "scopedGoal": "Implement the UI slice.",
      "pathsAllowed": ["platform/**", "design-system/**"],
      "acceptance": ["UI renders the new state"],
      "verify": "Run the package tests for touched files."
    },
    {
      "name": "frontend-verifier",
      "type": "verifier",
      "verifies": "frontend-slice",
      "agent": "btl-staging-verifier",
      "scopedGoal": "Verify the frontend slice against acceptance.",
      "dependsOn": ["frontend-slice"]
    }
  ]
}
```

Prefer fewer, broader workers. Add verifiers only when independent checking has real value. Verifiers can either target a worker with `verifies` or run as standalone audit/check lanes without modifying code.

Executors:

- `cursor-visible`: native Cursor subagent in the current chat.
- `claude-cli`: terminal-visible Claude Code CLI lane using the same prompt/handoff files.
- `codex-cli`: terminal-visible Codex CLI lane using the same prompt/handoff files.
- `cursor-sdk`: headless Cursor SDK lane for unattended runs.

## Worker Handoff

Workers must end with a structured handoff:

```markdown
## Status
success | blocked | failed

## Branch
`swarm/<rootSlug>/<taskName>`

## Summary
What changed and why.

## Files Changed
- `path`

## Verification
- `command`: result

## Risks
- Remaining concerns, or `(none)`.

## Next Steps
- Follow-up work, or `(none)`.
```

Verifiers use `## Verification` with one of: `passed`, `failed`, `blocked`.

## CLI Commands

- `init <goal>`: create a workspace and repo context for visible parent-chat planning.
- `init <goal> --executor claude-cli|codex-cli|cursor-visible`: set the default executor hint for the plan.
- `kickoff <goal>`: create a workspace and ask a local root planner to write `plan.json`.
- `kickoff <goal> --repo-mode siblings`: discover child git repos in a side-by-side workspace and require task-level `repo`.
- `kickoff <goal> --base-ref <ref>`: run all task worktrees from a committed branch, tag, or SHA.
- `auth`: validate `CURSOR_API_KEY` with the Cursor SDK and print available model ids.
- `prepare <workspace> <task>`: create the task worktree, mark it running, and write `logs/<task>-prompt.md` plus launch instructions for the selected executor.
- `complete <workspace> <task>`: read `handoffs/<task>.md`, parse the structured handoff, and update `state.json`.
- `run <workspace>`: headless SDK mode for overnight runs. It spawns ready tasks, recovers running SDK runs, waits for handoffs, and updates `state.json`. Use `--max-runtime-sec` for checkpointing and `--task-timeout-sec` to fail stuck SDK runs with a handoff.
- `status <workspace>`: print task counts and attention items.
- `tree <workspace>`: print task lineage and branch/worktree paths.
- `inbox <workspace>`: list parent-mediated notes from `.swarm/<rootSlug>/messages/inbox.jsonl`.
- `note <workspace> "<body>" [--task <task>] [--audience planner|task|all] [--priority info|blocked|decision]`: append a bounded note.
- `spawn <workspace> <task>`: spawn one pending task.
- `kill <workspace> <task>`: mark a non-terminal task cancelled.
- `clean <workspace>`: remove task worktrees after confirmation.

For long-running operating guidance, see `OPERATIONS.md`.
