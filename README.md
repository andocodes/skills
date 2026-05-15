# Skills

Portable agent skills for Codex, Claude, Cursor, and Pi-compatible agents.

This repository is the source of truth for local skills. Each top-level skill directory contains a `SKILL.md`; optional harness metadata lives under `agents/`.

## Quick Start

```bash
git clone https://github.com/andocodes/skills.git ~/.skills
cd ~/.skills
./install.sh
```

The installer links each skill into:

- `~/.cursor/skills/<name>`
- `~/.claude/skills/<name>`
- `~/.codex/skills/<name>`
- `~/.agents/skills/<name>`

Existing non-matching files or links are left untouched.

## Skills

| Skill | Use it for |
| --- | --- |
| `clarify` | Simplifying and standardising code while preserving behavior. |
| `document` | Writing concise, verified project documentation. |
| `illustrate` | Making concepts concrete with examples, contrasts, and small diagrams. |
| `probe` | Pressure-testing plans with focused questions and a visible decision path. |
| `swarm` | Orchestrating explicit multi-agent work through lanes, adapters, state, and handoffs. |

## Checks

Skills are portable Markdown directories. Before committing changes, run the checks your environment supports.

Useful checks for this repository:

```bash
bash -n install.sh
git diff --check
```

For skills with their own code or tests, run their local checks. For `swarm`:

```bash
cd ~/.skills/swarm/scripts
bun run check
```

If your harness provides a skill validator, run it against the changed skill directories.
