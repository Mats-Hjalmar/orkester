#!/bin/sh
set -eu

REPO="Mats-Hjalmar/orkester"
APP="Orkester"
ASSET="$APP-universal.zip"
APPS_DIR="${APPS_DIR:-/Applications}"

[ "$(uname -s)" = "Darwin" ] || { echo "Orkester only ships for macOS." >&2; exit 1; }

if [ -n "${VERSION:-}" ]; then
  url="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
else
  url="https://github.com/$REPO/releases/latest/download/$ASSET"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $url"
curl -fL --progress-bar -o "$tmp/$ASSET" "$url"
ditto -x -k "$tmp/$ASSET" "$tmp/unpacked"

if pgrep -x "$APP" >/dev/null; then
  echo "Quitting the running ${APP}…"
  osascript -e "quit app \"$APP\""
  while pgrep -x "$APP" >/dev/null; do sleep 0.25; done
fi

dest="$APPS_DIR/$APP.app"
sudo=""
[ -w "$APPS_DIR" ] || sudo="sudo"
$sudo rm -rf "$dest"
$sudo ditto "$tmp/unpacked/$APP.app" "$dest"
$sudo xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true

echo "Installed $dest"
