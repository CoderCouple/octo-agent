#!/usr/bin/env bash
set -euo pipefail

# Build and package Broomy for Linux.
# Injects pre-compiled node-pty native modules so we don't need to compile on Linux.
# Run scripts/build-linux-prebuilds.sh first to generate the prebuilds.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PREBUILDS_DIR="$PROJECT_DIR/build/node-pty-prebuilds"

# Check that prebuilds exist
if [ ! -d "$PREBUILDS_DIR/linux-x64" ] || [ ! -f "$PREBUILDS_DIR/linux-x64/pty.node" ]; then
  echo "ERROR: Linux prebuilds not found."
  echo "Run: pnpm build:linux-prebuilds"
  exit 1
fi

# .deb packaging uses 'ar' which requires the Xcode license on macOS
if [[ "$OSTYPE" == darwin* ]] && ! /usr/bin/xcrun --find ar &>/dev/null; then
  echo "ERROR: Xcode license not accepted. The .deb build requires 'ar' which won't run until you agree."
  echo "Run: sudo xcodebuild -license"
  exit 1
fi

# Inject prebuilds into node_modules so electron-builder packages them
NODE_PTY_DIR="$PROJECT_DIR/node_modules/node-pty"

for arch in x64 arm64; do
  src="$PREBUILDS_DIR/linux-$arch"
  dest="$NODE_PTY_DIR/prebuilds/linux-$arch"

  if [ -d "$src" ]; then
    echo "Copying prebuilds: linux-$arch"
    mkdir -p "$dest"
    cp "$src"/* "$dest/"
  else
    echo "Skipping linux-$arch (no prebuilds found)"
  fi
done

# Build and package — skip npmRebuild since we're providing our own native modules
pnpm build && electron-builder --linux -c.npmRebuild=false
