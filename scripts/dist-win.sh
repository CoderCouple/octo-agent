#!/usr/bin/env bash
set -euo pipefail

# Build and package Broomy for Windows.
# Cross-compiles from macOS/Linux using electron-builder.

cd "$(dirname "$0")/.."

pnpm build && electron-builder --win --x64
