#!/usr/bin/env bash
set -euo pipefail

# Release Screenshot Compare
# Generates screenshots from the last release tag and current code,
# then compares them pixel-by-pixel to produce a visual diff report.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/release-compare"
FEATURES_DIR="$PROJECT_DIR/tests/features"

# Colors for output
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

step_num=0
total_steps=7

progress() {
  step_num=$((step_num + 1))
  echo ""
  echo -e "${BOLD}${CYAN}[$step_num/$total_steps]${RESET} ${BOLD}$1${RESET}"
  echo -e "${DIM}$(printf '%.0s─' {1..60})${RESET}"
}

info() {
  echo -e "  ${DIM}→${RESET} $1"
}

success() {
  echo -e "  ${GREEN}✓${RESET} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${RESET} $1"
}

fail() {
  echo -e "  ${RED}✗${RESET} $1"
}

# ──────────────────────────────────────────────────────────────
# Step 1: Pre-flight checks
# ──────────────────────────────────────────────────────────────
progress "Pre-flight checks"

cd "$PROJECT_DIR"

# Check for uncommitted changes (hard fail)
if [ -n "$(git status --porcelain)" ]; then
  fail "Uncommitted changes detected. Please commit or stash before running."
  echo ""
  git status --short
  exit 1
fi
success "Working tree is clean"

# Record current branch for later restoration
ORIGINAL_REF=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse HEAD)
info "Current branch: $ORIGINAL_REF"

# Warn if not on main
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "main" ]; then
  warn "Not on main branch (on '$CURRENT_BRANCH'). Comparing against last release tag anyway."
fi

# Warn if main is behind origin/main
if git rev-parse --verify origin/main &>/dev/null; then
  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
  if [ "$BEHIND" -gt 0 ]; then
    warn "Local branch is $BEHIND commit(s) behind origin/main. Consider pulling first."
  fi
fi

# ──────────────────────────────────────────────────────────────
# Step 2: Determine the last release tag
# ──────────────────────────────────────────────────────────────
progress "Finding last release tag"

LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -n 1)

if [ -z "$LAST_TAG" ]; then
  fail "No v* release tags found. Cannot compare."
  exit 1
fi

success "Last release tag: $LAST_TAG"

COMMIT_COUNT=$(git rev-list --count "$LAST_TAG"..HEAD 2>/dev/null || echo "?")
info "$COMMIT_COUNT commit(s) since $LAST_TAG"

# ──────────────────────────────────────────────────────────────
# Step 3: Prepare output directory
# ──────────────────────────────────────────────────────────────
progress "Preparing output directory"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/baseline" "$OUTPUT_DIR/current" "$OUTPUT_DIR/diffs"
success "Created $OUTPUT_DIR/"

# List available features
FEATURES=()
for dir in "$FEATURES_DIR"/*/; do
  name=$(basename "$dir")
  if [ "$name" != "_shared" ]; then
    FEATURES+=("$name")
  fi
done

FEATURE_COUNT=${#FEATURES[@]}
info "Found $FEATURE_COUNT feature walkthroughs to run"

# ──────────────────────────────────────────────────────────────
# Step 4: Generate baseline screenshots (last release)
# ──────────────────────────────────────────────────────────────
progress "Generating baseline screenshots from $LAST_TAG"

info "Checking out $LAST_TAG..."
git checkout "$LAST_TAG" --quiet

info "Installing dependencies for $LAST_TAG..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

info "Building app..."
pnpm build

info "Running $FEATURE_COUNT feature walkthroughs (this takes a while)..."

# Run feature docs and capture results
BASELINE_RESULTS="{}"
baseline_passed=0
baseline_failed=0
baseline_errors=""

for i in "${!FEATURES[@]}"; do
  feature="${FEATURES[$i]}"
  num=$((i + 1))
  echo -ne "  ${DIM}[$num/$FEATURE_COUNT]${RESET} $feature... "

  # Clean any existing screenshots for this feature
  rm -rf "$FEATURES_DIR/$feature/screenshots"

  if output=$(npx playwright test --config playwright.features.config.ts "tests/features/$feature/" 2>&1); then
    echo -e "${GREEN}passed${RESET}"
    baseline_passed=$((baseline_passed + 1))

    # Copy screenshots to baseline
    if [ -d "$FEATURES_DIR/$feature/screenshots" ]; then
      mkdir -p "$OUTPUT_DIR/baseline/$feature"
      cp "$FEATURES_DIR/$feature/screenshots/"*.png "$OUTPUT_DIR/baseline/$feature/" 2>/dev/null || true
      count=$(ls "$OUTPUT_DIR/baseline/$feature/"*.png 2>/dev/null | wc -l | tr -d ' ')
      echo -e "    ${DIM}→ $count screenshot(s) captured${RESET}"
    fi
  else
    echo -e "${RED}failed${RESET}"
    baseline_failed=$((baseline_failed + 1))
    baseline_errors="$baseline_errors\n--- $feature ---\n$output"
  fi

  # Clean up screenshots from tests/features/ so they don't get committed
  rm -rf "$FEATURES_DIR/$feature/screenshots"
done

# Write baseline results JSON
node -e "
const results = {
  tag: '$LAST_TAG',
  passed: $baseline_passed,
  failed: $baseline_failed,
  features: $(printf '%s\n' "${FEATURES[@]}" | jq -R . | jq -s .),
  errors: $(echo -e "$baseline_errors" | jq -Rs .)
};
require('fs').writeFileSync('$OUTPUT_DIR/baseline-results.json', JSON.stringify(results, null, 2));
"

success "Baseline: $baseline_passed passed, $baseline_failed failed"

# ──────────────────────────────────────────────────────────────
# Step 5: Generate current screenshots
# ──────────────────────────────────────────────────────────────
progress "Generating current screenshots from $ORIGINAL_REF"

info "Checking out $ORIGINAL_REF..."
git checkout "$ORIGINAL_REF" --quiet

info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

info "Building app..."
pnpm build

info "Running $FEATURE_COUNT feature walkthroughs..."

current_passed=0
current_failed=0
current_errors=""

for i in "${!FEATURES[@]}"; do
  feature="${FEATURES[$i]}"
  num=$((i + 1))
  echo -ne "  ${DIM}[$num/$FEATURE_COUNT]${RESET} $feature... "

  # Clean any existing screenshots for this feature
  rm -rf "$FEATURES_DIR/$feature/screenshots"

  if output=$(npx playwright test --config playwright.features.config.ts "tests/features/$feature/" 2>&1); then
    echo -e "${GREEN}passed${RESET}"
    current_passed=$((current_passed + 1))

    # Copy screenshots to current
    if [ -d "$FEATURES_DIR/$feature/screenshots" ]; then
      mkdir -p "$OUTPUT_DIR/current/$feature"
      cp "$FEATURES_DIR/$feature/screenshots/"*.png "$OUTPUT_DIR/current/$feature/" 2>/dev/null || true
      count=$(ls "$OUTPUT_DIR/current/$feature/"*.png 2>/dev/null | wc -l | tr -d ' ')
      echo -e "    ${DIM}→ $count screenshot(s) captured${RESET}"
    fi
  else
    echo -e "${RED}failed${RESET}"
    current_failed=$((current_failed + 1))
    current_errors="$current_errors\n--- $feature ---\n$output"
  fi

  # Clean up screenshots from tests/features/ so they don't get committed
  rm -rf "$FEATURES_DIR/$feature/screenshots"
done

# Write current results JSON
node -e "
const results = {
  ref: '$ORIGINAL_REF',
  passed: $current_passed,
  failed: $current_failed,
  features: $(printf '%s\n' "${FEATURES[@]}" | jq -R . | jq -s .),
  errors: $(echo -e "$current_errors" | jq -Rs .)
};
require('fs').writeFileSync('$OUTPUT_DIR/current-results.json', JSON.stringify(results, null, 2));
"

success "Current: $current_passed passed, $current_failed failed"

# ──────────────────────────────────────────────────────────────
# Step 6: Compare screenshots
# ──────────────────────────────────────────────────────────────
progress "Comparing screenshots pixel-by-pixel"

node "$SCRIPT_DIR/compare-screenshots.cjs" "$OUTPUT_DIR"

# ──────────────────────────────────────────────────────────────
# Step 7: Open report
# ──────────────────────────────────────────────────────────────
progress "Done!"

REPORT="$OUTPUT_DIR/index.html"
if [ -f "$REPORT" ]; then
  success "Report generated: $REPORT"

  # Print summary from comparison.json
  if [ -f "$OUTPUT_DIR/comparison.json" ]; then
    node -e "
    const c = require('./$OUTPUT_DIR/comparison.json');
    const { unchanged, changed, added, removed } = c.summary;
    console.log('');
    console.log('  Summary:');
    console.log('    Unchanged: ' + unchanged);
    console.log('    Changed:   ' + changed);
    console.log('    Added:     ' + added);
    console.log('    Removed:   ' + removed);
    if (c.summary.baselineFailures > 0 || c.summary.currentFailures > 0) {
      console.log('    Baseline test failures: ' + c.summary.baselineFailures);
      console.log('    Current test failures:  ' + c.summary.currentFailures);
    }
    "
  fi

  echo ""
  info "Opening report in browser..."
  open "$REPORT" 2>/dev/null || xdg-open "$REPORT" 2>/dev/null || echo "  Open $REPORT in your browser"
else
  fail "Report was not generated"
  exit 1
fi

echo ""
