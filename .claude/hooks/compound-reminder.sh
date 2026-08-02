#!/usr/bin/env bash
# Stop hook: nudge for a ce-compound capture when this branch has landed real
# work that produced no learning doc.
#
# Instructions alone proved unreliable -- AGENTS.md and CLAUDE.md both carry the
# standing instruction, and it still gets missed, because "before the final
# handoff" is a judgement call an agent makes while its attention is elsewhere.
# The harness firing a check does not depend on that judgement.
#
# Gated hard so it stays silent almost always:
#   - only when commits in the recent window touched code, and
#   - none of them touched docs/solutions/, and
#   - it has not already fired for this exact HEAD.
# Any failure exits 0 quietly. A reminder must never block a turn.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

WINDOW="6 hours ago"
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null) || exit 0

# Fire once per HEAD, not once per turn.
STATE="$(git rev-parse --git-dir)/ce-compound-reminded"
[ -f "$STATE" ] && [ "$(cat "$STATE" 2>/dev/null)" = "$HEAD_SHA" ] && exit 0

RANGE=$(git log --since="$WINDOW" --format=%H 2>/dev/null) || exit 0
[ -z "$RANGE" ] && exit 0

# Did the window contain substantive work outside the knowledge store?
CODE=$(git log --since="$WINDOW" --name-only --format= 2>/dev/null \
       | grep -v '^$' | grep -v '^docs/' | head -1)
[ -z "$CODE" ] && exit 0

# Did any of it already get captured?
CAPTURED=$(git log --since="$WINDOW" --name-only --format= 2>/dev/null \
           | grep '^docs/solutions/' | head -1)
[ -n "$CAPTURED" ] && exit 0

echo "$HEAD_SHA" > "$STATE" 2>/dev/null

cat <<'EOF'
This branch has landed changes in the last few hours with nothing written to
docs/solutions/. If any of it was a non-trivial, reusable learning rather than
routine work, invoke the ce-compound skill with mode:headless before handing
back. If it was routine, ignore this.
EOF
exit 0
