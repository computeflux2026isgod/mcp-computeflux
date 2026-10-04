#!/usr/bin/env bash
# Build mcp-computeflux.mcpb (MCP Bundle, spec v0.3) and print its sha256 for server.json.
# Deterministic enough for a stable hash across rebuilds of identical inputs.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

OUT="$REPO/mcp-computeflux.mcpb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/stage"
cp manifest.mcpb.json "$TMP/stage/manifest.json"
cp server.mjs        "$TMP/stage/server.mjs"

# pin mtimes so the zip — and its sha256 — is reproducible
touch -d '2026-01-01 00:00:00 UTC' "$TMP/stage/manifest.json" "$TMP/stage/server.mjs"

# zip with stable member ordering + no extra attributes
( cd "$TMP/stage" && zip -q -r -X "$OUT" . )

sha256="$(sha256sum "$OUT" | awk '{print $1}')"
echo ":: $OUT built ($(wc -c <"$OUT") bytes)"
echo ":: fileSha256=${sha256}"
echo ":: paste into server.json -> packages[0].fileSha256, then add as GitHub Release asset at tag v<version>"
