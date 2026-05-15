---
name: swarm
description: Use only when the user explicitly says "swarm", invokes /swarm or $swarm, asks to use the swarm skill, or asks to run work as swarm lanes or agents. Do not invoke merely because a task is large. Orchestrates local multi-agent work through host adapters, isolated execution boundaries, git branches, JSON state, and structured handoffs.
---

# Swarm

Swarm is a portable local orchestration contract. It decomposes a large goal into visible or headless agent lanes, gives each lane an explicit execution boundary, and records progress through `plan.json`, `state.json`, prompt logs, inbox notes, and markdown handoffs.

## Invariants

1. Invoke swarm only when the user explicitly names swarm.
2. Keep the root planner in the parent conversation. The planner writes `plan.json`; it does not implement code.
3. Give every task a durable git branch and a bounded workspace, even when the execution sandbox is a container.
4. Keep worker communication parent-mediated through handoffs and inbox notes. Do not create sibling-to-sibling chat.
5. Use named auth and git identity profiles only. Never inline tokens, keys, or secret values in `plan.json`, prompts, handoffs, or logs.
6. Do not merge, push, open PRs, or perform destructive cleanup unless the user explicitly asks.

## Adapter Model

Swarm has two adapter layers:

- **Harness adapter**: how a lane is launched: `cursor-visible`, `cursor-sdk`, `claude-native`, `claude-cli`, `codex-native`, `codex-cli`, or `pi-cli`.
- **Isolation adapter**: where a lane runs: `worktree`, `container`, or `readonly`.

Auto-select adapters in this order:

1. Use any explicit user override.
2. Prefer the current host's native visible/background lane: Cursor uses `cursor-visible`, Claude Code uses `claude-native`, Codex uses `codex-native`.
3. Use `claude-cli`, `codex-cli`, or `pi-cli` only when intentionally launching another host from a terminal.
4. Use `cursor-sdk` only for unattended or headless runs.

Announce the selected harness, isolation mode, repository mode, and concurrency before launching lanes.

## Isolation Modes

- `worktree`: default for trusted local implementation. Creates an isolated git worktree and branch.
- `container`: use Docker or Podman when dependencies are messy, tool installs are risky, or process/filesystem boundaries matter.
- `readonly`: use for exploration, architecture mapping, audits, and verifiers that must not mutate code.

The durable boundary is still git: each non-readonly lane works on `swarm/<rootSlug>/<taskName>` and returns a handoff.

## Dispatcher Workflow

When the user asks for swarm:

1. Clarify only if the goal, repository scope, or safety boundary is genuinely ambiguous.
2. Pick harness, isolation, repo mode, `baseRef`, and `maxConcurrency`.
3. Create a workspace without launching hidden workers:

```bash
bun <skillDir>/scripts/cli.ts init "<goal>" --executor <executor> --isolation <mode>
```

4. Write `.swarm/<rootSlug>/plan.json` in the parent conversation using the planner contract below.
5. Prepare each ready task:

```bash
bun <skillDir>/scripts/cli.ts prepare .swarm/<rootSlug> <task>
```

6. Read the returned `promptPath`, `launch`, `launchPlan`, `isolation`, `authProfile`, and `gitIdentity`, then launch the lane through the selected harness adapter. For command-backed CLI lanes, `swarm launch` can execute the returned command plan.
7. After the worker writes `.swarm/<rootSlug>/handoffs/<task>.md`, record it:

```bash
bun <skillDir>/scripts/cli.ts complete .swarm/<rootSlug> <task>
```

8. Inspect progress with `tree`, `status`, `inbox`, and handoffs.

## Planner Contract

The root planner writes `.swarm/<rootSlug>/plan.json`:

```json
{
  "goal": "verbatim user goal",
  "summary": "short human orientation",
  "rootSlug": "short-kebab-name",
  "repositoryMode": "single",
  "executor": "codex-native",
  "isolation": { "mode": "worktree", "network": "restricted" },
  "authProfile": "github-work",
  "gitIdentity": "thomas-work",
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
      "executor": "codex-native",
      "isolation": { "mode": "container", "runtime": "docker", "image": "swarm-agent:0.1.0-codex-core" },
      "agent": "frontend-design",
      "scopedGoal": "Implement the UI slice.",
      "pathsAllowed": ["src/**", "design-system/**"],
      "acceptance": ["UI renders the new state"],
      "verify": "Run the package tests for touched files."
    },
    {
      "name": "frontend-verifier",
      "type": "verifier",
      "repo": "platform",
      "isolation": { "mode": "readonly", "network": "none" },
      "verifies": "frontend-slice",
      "scopedGoal": "Verify the frontend slice against acceptance.",
      "dependsOn": ["frontend-slice"]
    }
  ]
}
```

Prefer fewer, broader workers. Add verifiers only when independent checking has real value. Use task-level `authProfile`, `gitIdentity`, `executor`, or `isolation` only when a lane needs to differ from the plan default.

## Handoff Contract

Workers must end with:

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

Verifiers use `## Verification` with one of `passed`, `failed`, or `blocked`, then include `## Evidence`, `## Findings`, `## Risks`, and `## Next Steps`.

For CLI details and long-running guidance, read `README.md` and `OPERATIONS.md` only when needed.
