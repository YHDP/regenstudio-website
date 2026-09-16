#!/bin/bash
# Rebuild the search index and deploy the site assistant, then stamp what went live.
#
# WHY THIS EXISTS
# The assistant does not read the index from the website. The Edge Function imports it at
# build time (`import INDEX from "./search-index.en.json"`), so the copy that decides what
# the assistant knows is the one inside the function directory, and the root copy is
# gitignored and never published anywhere. Publishing a blog therefore put it on the site
# while the assistant kept insisting the site did not cover it. That is how a smart-charging
# case study with a full write-up got denied to a visitor who asked about it directly.
#
# The pre-push hook calls this with --if-stale so the two can never drift again. Running it
# by hand does the same thing unconditionally.
#
# Usage:
#   scripts/deploy-assistant.sh                 deploy now, whatever the state
#   scripts/deploy-assistant.sh --if-stale SHA  deploy only if indexed content moved since
#                                               the last deploy; silent no-op otherwise

set -euo pipefail
cd "$(dirname "$0")/.."

DENO="${DENO:-$HOME/.deno/bin/deno}"
FN_DIR="supabase/functions/site-assistant"
STAMP="$FN_DIR/.deployed-at-sha"

YELLOW='\033[1;33m'; RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

# Everything that feeds any of the three bundled indexes.
#
# NL and PT shipped on 2026-09-16: all three indexes are imported by the function now, so a
# Dutch-only or Portuguese-only content change DOES change what the assistant can answer,
# and leaving them out of this pattern would put a live translated page behind an assistant
# that denies it exists. That is the exact failure this gate was built to prevent, one
# language over.
# Note what is still NOT here: Blogs/<slug>/Header.webp and friends. An image never reaches
# an index, so matching it would buy a 30-second deploy for nothing.
PAGES_RE='(index|about|blog|client-projects|faq|innovation-services|privacy|terms|vision)\.html'
DIRS_RE='(digital-identities|digital-product-passports|problem-analysis|what-is-[a-z0-9-]+)/index\.html'
INDEXED_RE="^$PAGES_RE\$|^$DIRS_RE\$|^(nl|pt)/$PAGES_RE\$|^(nl|pt)/$DIRS_RE\$|^Blogs/blogs\.json\$|^Blogs/[^/]+/(meta(\.(nl|pt))?\.json|content(\.(nl|pt))?\.html)\$|^build\.ts\$"

IF_STALE=""
if [ "${1:-}" = "--if-stale" ]; then
  IF_STALE="${2:-HEAD}"
fi

if [ ! -d "$FN_DIR" ]; then
  if [ -n "$IF_STALE" ]; then
    echo -e "${YELLOW}  assistant: $FN_DIR missing (Proton not mounted) — skipping deploy${NC}"
    exit 0
  fi
  echo "error: $FN_DIR is missing. It is a Proton symlink; this needs the synced folder." >&2
  exit 1
fi

# --- staleness ------------------------------------------------------------------
if [ -n "$IF_STALE" ]; then
  if [ ! -f "$STAMP" ]; then
    echo -e "${YELLOW}  assistant: no deploy stamp yet — deploying to establish one${NC}"
  else
    LAST=$(tr -d '[:space:]' < "$STAMP")
    if ! git cat-file -e "${LAST}^{commit}" 2>/dev/null; then
      echo -e "${YELLOW}  assistant: stamped commit $LAST is not in this history (rebase?) — deploying${NC}"
    else
      DRIFT=$(git diff --name-only "$LAST" "$IF_STALE" 2>/dev/null | grep -E "$INDEXED_RE" || true)
      if [ -z "$DRIFT" ]; then
        exit 0   # nothing the assistant can see has changed; no delay, no output
      fi
      echo ""
      echo "  assistant: indexed content changed since the last deploy:"
      echo "$DRIFT" | sed 's/^/      /' | head -8
      COUNT=$(echo "$DRIFT" | wc -l | tr -d ' ')
      [ "$COUNT" -gt 8 ] && echo "      ... and $((COUNT - 8)) more"
    fi
  fi
fi

# --- refuse to deploy a lie -----------------------------------------------------
# Building from a dirty tree teaches the assistant content that is not in the commit and
# may never be pushed at all.
DIRTY=$(git status --porcelain -- . 2>/dev/null | awk '{print $NF}' | grep -E "$INDEXED_RE" || true)
if [ -n "$DIRTY" ]; then
  echo -e "${RED}  assistant: refusing to deploy — indexed content is uncommitted:${NC}"
  echo "$DIRTY" | sed 's/^/      /' | head -8
  echo -e "${YELLOW}  Commit or stash these first. Deploying now would teach the assistant${NC}"
  echo -e "${YELLOW}  content that is not in the commit you are pushing.${NC}"
  exit 1
fi

echo "  assistant: rebuilding index..."
"$DENO" run --allow-read --allow-write build.ts >/dev/null

# If the build produced a diff in tracked files, the commit being pushed was incomplete.
BUILD_DIRT=$(git status --porcelain -- . 2>/dev/null | awk '{print $NF}' || true)
if [ -n "$BUILD_DIRT" ]; then
  echo -e "${RED}  assistant: refusing to deploy — the build changed tracked files:${NC}"
  echo "$BUILD_DIRT" | sed 's/^/      /' | head -8
  echo -e "${YELLOW}  The commit you are pushing is missing generated output. Run${NC}"
  echo -e "${YELLOW}  'deno run --allow-read --allow-write build.ts', commit the result, push again.${NC}"
  exit 1
fi

echo "  assistant: deploying site-assistant..."
if ! supabase functions deploy site-assistant --no-verify-jwt >/dev/null 2>&1; then
  echo -e "${RED}  assistant: DEPLOY FAILED${NC}"
  echo -e "${YELLOW}  Check network and 'supabase login'. Pushing now would put content live${NC}"
  echo -e "${YELLOW}  that the assistant cannot see. To push anyway:${NC}"
  echo -e "${YELLOW}      SKIP_ASSISTANT_DEPLOY=1 git push${NC}"
  exit 1
fi

HEAD_SHA=$(git rev-parse "${IF_STALE:-HEAD}")
printf '%s\n' "$HEAD_SHA" > "$STAMP"
echo -e "${GREEN}  assistant: deployed and stamped at ${HEAD_SHA:0:8}${NC}"
