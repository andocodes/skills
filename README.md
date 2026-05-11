# Swarm Skill

`swarm` breaks larger work into smaller agent tasks. Each task gets its own git worktree, prompt, and handoff file.

It can be used from Cursor, Claude Code, or Codex because the important files are the same everywhere:

- `plan.json` defines the task graph.
- One git worktree isolates each task.
- `logs/<task>-prompt.md` is the launch prompt.
- `handoffs/<task>.md` is the durable task result.
- `state.json` tracks progress.

## Install

Clone this repository anywhere you keep local tools, then run the installer.

```bash
git clone git@github.com:andocodes/skills.git <your-tools-folder>/skills
cd <your-tools-folder>/skills
./install.sh
```

Default install locations:

- Cursor: `~/.cursor/skills/swarm`
- Claude Code: `~/.claude/skills/swarm`
- Codex CLI: `~/.codex/skills/swarm`

The install script creates symlinks to the repository root, so edits in the clone update all hosts.

## Runtime Setup

Install the TypeScript CLI dependencies once:

```bash
cd scripts
bun install
bun run check
```

`CURSOR_API_KEY` is only required for `cursor-sdk` headless execution. Visible Cursor, Claude CLI, and Codex CLI lanes use prompt files and handoffs.

## Executors

- `cursor-visible`: native Cursor subagent in the current chat.
- `cursor-sdk`: headless Cursor SDK runner for unattended work.
- `claude-cli`: terminal-visible Claude Code CLI lane.
- `codex-cli`: terminal-visible Codex CLI lane.

All executors use the same worktree, prompt, handoff, and state files.
