#!/usr/bin/env bash
set -euo pipefail

cat >/tmp/swarm-fake-prompt.txt
mkdir -p "$(dirname "${SWARM_HANDOFF:?}")"

cat >"$SWARM_HANDOFF" <<HANDOFF
## Status
success

## Branch
\`${SWARM_BRANCH:-swarm/fake/task}\`

## Summary
Fake swarm agent wrote this handoff.

## Files Changed
- \`(none)\`

## Verification
- \`fake-agent\`: passed

## Risks
- \`(none)\`.

## Next Steps
- \`(none)\`.
HANDOFF
