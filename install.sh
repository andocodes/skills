#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_link() {
  local source="$1"
  local target="$2"
  mkdir -p "$(dirname "$target")"
  if [[ -L "$target" || -e "$target" ]]; then
    if [[ "$(readlink "$target" 2>/dev/null || true)" == "$source" ]]; then
      printf 'already linked: %s\n' "$target"
      return
    fi
    printf 'exists, skipping: %s\n' "$target"
    return
  fi
  ln -s "$source" "$target"
  printf 'linked: %s -> %s\n' "$target" "$source"
}

for skill_dir in "$repo_root"/*; do
  [[ -f "$skill_dir/SKILL.md" ]] || continue
  skill_name="$(basename "$skill_dir")"
  install_link "$skill_dir" "$HOME/.cursor/skills/$skill_name"
  install_link "$skill_dir" "$HOME/.claude/skills/$skill_name"
  install_link "$skill_dir" "$HOME/.codex/skills/$skill_name"
  install_link "$skill_dir" "$HOME/.agents/skills/$skill_name"
done
