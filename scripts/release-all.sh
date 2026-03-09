#!/usr/bin/env bash
set -euo pipefail

# release-all.sh - Full release pipeline: check, bump, build, sign, publish
#
# Builds signed releases for macOS, Windows, and Linux. Requires macOS
# (for code signing/notarization) and signing credentials in .env.
#
# Usage: pnpm release:all <patch|minor|major> [--skip-build] [--no-bump]

BUMP_TYPE=""
SKIP_BUILD=false
NO_BUMP=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --no-bump) NO_BUMP=true ;;
    patch|minor|major) BUMP_TYPE="$arg" ;;
  esac
done

if [ "$NO_BUMP" = false ] && [ -z "$BUMP_TYPE" ]; then
  echo "Usage: pnpm release:all <patch|minor|major> [--skip-build] [--no-bump]"
  exit 1
fi

cd "$(dirname "$0")/.."

# --- Pre-flight: must be macOS ---
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: release:all must be run on macOS (required for code signing and notarization)."
  exit 1
fi

# --- Pre-flight: required tools ---
if ! command -v gh &>/dev/null; then
  echo "Error: GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

# --- Pre-flight: Linux prebuilds ---
if [ "$SKIP_BUILD" = false ]; then
  if [ ! -d build/node-pty-prebuilds/linux-x64 ] || [ ! -f build/node-pty-prebuilds/linux-x64/pty.node ]; then
    echo "Error: Linux prebuilds not found. Run: pnpm build:linux-prebuilds"
    exit 1
  fi
fi

# --- Pre-flight: branch and working tree ---
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: Must be on 'main' branch (currently on '$BRANCH')"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

# --- Pre-flight: Broomy not running from dist/ ---
if [ -d dist ]; then
  BROOMY_PIDS=$(pgrep -f "dist/.*Broomy" 2>/dev/null || true)
  if [ -n "$BROOMY_PIDS" ]; then
    echo ""
    echo "Error: Broomy is running from dist/. Quit it before releasing."
    echo "  PIDs: $BROOMY_PIDS"
    exit 1
  fi
fi

# --- Pre-flight: signing credentials ---
if [ -f .env ]; then
  echo "Loading credentials from .env"
  set -a
  source .env
  set +a
fi

missing=()
[ -z "${CSC_NAME:-}" ] && missing+=("CSC_NAME")
[ -z "${APPLE_ID:-}" ] && missing+=("APPLE_ID")
[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
[ -z "${APPLE_TEAM_ID:-}" ] && missing+=("APPLE_TEAM_ID")

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "Error: Missing required macOS signing variables:"
  for var in "${missing[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Set them in .env or export them before running this script."
  echo "See docs/releasing.md for setup instructions."
  exit 1
fi

# --- Run checks ---
echo ""
echo "Running lint, typecheck, and unit tests..."
pnpm lint
pnpm typecheck
pnpm test:unit

# Read current version (before potential bump)
NEW_VERSION=$(node -p "require('./package.json').version")

if [ "$NO_BUMP" = true ]; then
  echo ""
  echo "Skipping version bump (--no-bump). Using current version $NEW_VERSION."
  TAG="v$NEW_VERSION"
else
  # --- Bump version ---
  echo ""
  echo "Bumping version ($BUMP_TYPE)..."
  pnpm version:bump "$BUMP_TYPE"
  NEW_VERSION=$(node -p "require('./package.json').version")
  TAG="v$NEW_VERSION"

  # --- Commit and tag ---
  echo ""
  echo "Committing version bump and tagging $TAG..."
  git add package.json website/package.json
  git commit -m "Release $TAG"
  git tag "$TAG"
fi

# --- Build all platforms ---
if [ "$SKIP_BUILD" = true ]; then
  echo ""
  echo "Skipping build (--skip-build). Using existing artifacts in dist/."
else
  pnpm dist:all
fi

# --- Confirm before publishing ---
echo ""
echo "============================================"
echo "  Ready to publish"
echo "============================================"
echo "  Version:  $NEW_VERSION"
echo "  Tag:      $TAG"
echo "  Artifacts:"
for f in dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage dist/*.deb dist/*.yml; do
  [ -f "$f" ] && echo "    $(basename "$f")"
done
echo "============================================"
echo ""
read -r -p "Push and create GitHub release? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  if [ "$NO_BUMP" = false ]; then
    echo "The commit and tag are local-only."
    echo "To undo: git reset --soft HEAD~1 && git tag -d $TAG"
  fi
  exit 1
fi

# --- Push ---
echo ""
echo "Pushing to origin..."
git push
git push --tags

# --- Create GitHub release ---
echo ""
echo "Creating GitHub release..."

RELEASE_FILES=()
for f in dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage dist/*.deb dist/*.yml; do
  [ -f "$f" ] && RELEASE_FILES+=("$f")
done

NOTES_ARGS=()
if [ -f release-notes.md ]; then
  echo "Using release notes from release-notes.md"
  NOTES_ARGS=(--notes-file release-notes.md)
else
  echo "Warning: release-notes.md not found. Run '/release-notes' first for better release notes."
  echo "Falling back to auto-generated notes."
  NOTES_ARGS=(--generate-notes)
fi

gh release create "$TAG" "${RELEASE_FILES[@]}" \
  --title "Broomy $TAG" \
  "${NOTES_ARGS[@]}"

echo ""
echo "Done! Release $TAG published."
echo "https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$TAG"
