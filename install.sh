#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_link() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  if [[ -L "$target" || -e "$target" ]]; then
    if [[ "$(readlink "$target" 2>/dev/null || true)" == "$repo_root" ]]; then
      printf 'already linked: %s\n' "$target"
      return
    fi
    printf 'exists, skipping: %s\n' "$target"
    return
  fi
  ln -s "$repo_root" "$target"
  printf 'linked: %s -> %s\n' "$target" "$repo_root"
}

install_link "$HOME/.cursor/skills/swarm"
install_link "$HOME/.claude/skills/swarm"
install_link "$HOME/.codex/skills/swarm"
