#!/usr/bin/env bash
set -euo pipefail

# Build and package Broomy for all platforms.
# macOS is signed + notarized, Windows and Linux are unsigned.
#
# Usage: pnpm dist:all

cd "$(dirname "$0")/.."

echo "Cleaning dist/..."
rm -rf dist

echo ""
echo "=== Building macOS (signed + notarized) ==="
pnpm dist:signed

echo ""
echo "=== Building Windows ==="
pnpm dist:win

echo ""
echo "=== Building Linux ==="
pnpm dist:linux

echo ""
echo "Done! All artifacts are in dist/"
for f in dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage dist/*.deb dist/*.yml; do
  [ -f "$f" ] && echo "  $(basename "$f")"
done
