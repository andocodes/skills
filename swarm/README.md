# Swarm Skill

`swarm` is a host-neutral orchestration contract for local multi-agent work. It can run from Cursor, Claude Code, Codex, or terminal CLI lanes because every harness shares the same artifacts:

- `plan.json` defines the task graph, adapters, repositories, and safety boundaries.
- `state.json` tracks task status and attention items.
- `logs/<task>-prompt.md` is the launch prompt for a lane.
- `handoffs/<task>.md` is the durable task result.
- `.swarm/<rootSlug>/worktrees/<repo>/<task>/` is the default git checkout boundary.

## Install

Clone this repository into a harness-neutral location, then run the installer.

```bash
git clone git@github.com:andocodes/skills.git ~/.skills
cd ~/.skills
./install.sh
```

Default install locations:

- Cursor: `~/.cursor/skills/swarm`
- Claude Code: `~/.claude/skills/swarm`
- Codex CLI: `~/.codex/skills/swarm`

The install script creates symlinks to each skill folder, so edits in `~/.skills/<skill>` update all hosts.

## Runtime Setup

Install the TypeScript CLI dependencies once:

```bash
cd swarm/scripts
bun install
bun run check
```

`CURSOR_API_KEY` is only required for `cursor-sdk` headless execution. Native Cursor, Claude, Codex, Pi, and terminal CLI lanes use prompt files and handoffs.

## Harness Adapters

- `cursor-visible`: native Cursor subagent in the current chat.
- `cursor-sdk`: headless Cursor SDK runner for unattended work.
- `claude-native`: native Claude Code background agent/task lane.
- `claude-cli`: terminal-visible Claude Code CLI lane launched from another host.
- `codex-native`: native Codex background agent/task lane.
- `codex-cli`: terminal-visible Codex CLI lane launched from another host.
- `pi-cli`: terminal-visible Pi CLI lane launched from another host.

Use the current host's native adapter by default. Use CLI adapters only when intentionally launching another host from a terminal. Use `cursor-sdk` for unattended runs.

## Isolation Adapters

- `worktree`: default trusted local execution. Each lane gets a git branch and worktree.
- `container`: Docker or Podman sandbox for dependency-heavy or moderately risky tasks.
- `readonly`: exploration or verification lanes that should not mutate code.

The execution sandbox is not the durable artifact model. Git branches, prompts, handoffs, and state remain the source of truth for every mode.

## Identity Profiles

Use `authProfile` and `gitIdentity` as local profile names only:

```json
{
  "authProfile": "github-work",
  "gitIdentity": "thomas-work"
}
```

Do not put tokens, private keys, SSH material, or full credential config in swarm artifacts. Harness and isolation adapters resolve profile names to local configuration.

Profile files live under `${SWARM_PROFILE_HOME:-~/.swarm/profiles}`:

```text
auth/github-work.env
git/thomas-work.gitconfig
```

Auth env files can define `GH_TOKEN`, `GITHUB_TOKEN`, or any derivative token needed by the selected harness. Git identity files use normal git config syntax.

## Common Commands

Create a parent-planned workspace:

```bash
bun <skillDir>/scripts/cli.ts init "<goal>" --executor codex-native --isolation worktree
```

Prepare and complete a visible/native lane:

```bash
bun <skillDir>/scripts/cli.ts prepare .swarm/<rootSlug> <task>
bun <skillDir>/scripts/cli.ts complete .swarm/<rootSlug> <task>
```

Execute a command-backed CLI lane:

```bash
bun <skillDir>/scripts/cli.ts launch .swarm/<rootSlug> <task>
bun <skillDir>/scripts/cli.ts launch .swarm/<rootSlug> <task> --dry-run
```

Run side-by-side repositories:

```bash
bun <skillDir>/scripts/cli.ts init "<goal>" --repo-mode siblings --base-ref wip/my-branch
```

Build agent images:

```bash
bun <skillDir>/scripts/cli.ts image build codex-core
bun <skillDir>/scripts/cli.ts image build claude-rust
bun <skillDir>/scripts/cli.ts image build pi-go
bun <skillDir>/scripts/cli.ts image build fake --tag swarm-agent:0.1.0-fake
```

Set stronger isolation defaults:

```bash
bun <skillDir>/scripts/cli.ts init "<goal>" --isolation container --isolation-runtime docker --isolation-image swarm-agent:0.1.0-codex-core
bun <skillDir>/scripts/cli.ts init "<goal>" --isolation container --isolation-runtime podman --isolation-image swarm-agent:0.1.0-claude-rust --network none
bun <skillDir>/scripts/cli.ts init "<goal>" --executor pi-cli --isolation container --isolation-runtime docker --isolation-image swarm-agent:0.1.0-pi-core
```

Inspect state:

```bash
bun <skillDir>/scripts/cli.ts status .swarm/<rootSlug>
bun <skillDir>/scripts/cli.ts tree .swarm/<rootSlug>
bun <skillDir>/scripts/cli.ts inbox .swarm/<rootSlug>
```

For long-running operation, Cursor SDK auth, and recovery behavior, see `OPERATIONS.md`.
