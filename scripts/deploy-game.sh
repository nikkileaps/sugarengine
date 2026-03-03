#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${DIST_DIR:-dist-game}"
GAME_SLUG="${GAME_SLUG:-}"
SITE_DIR="${SITE_DIR:-}"
LANDING_DIR="${LANDING_DIR:-}"
DEPLOY_DIR_NAME="${DEPLOY_DIR_NAME:-}"
GAME_MOUNT_PATH="${GAME_MOUNT_PATH:-}"
DEPLOY_URL="${DEPLOY_URL:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ACTIVE_GAME_FILE="$PROJECT_ROOT/games/.active-game"

if [[ -z "$GAME_SLUG" && -f "$ACTIVE_GAME_FILE" ]]; then
  GAME_SLUG="$(tr -d '[:space:]' < "$ACTIVE_GAME_FILE")"
fi

if [[ -z "$GAME_SLUG" ]]; then
  echo "✗ Missing game selection."
  echo "  Use: npm run game:use -- <game-slug>"
  echo "  Or set: GAME_SLUG=<game-slug>"
  exit 1
fi

GAME_CONFIG_PATH="$PROJECT_ROOT/games/$GAME_SLUG/config/game.config.json"

read_game_config_value() {
  local key="$1"
  node --input-type=module -e '
    import fs from "node:fs";

    const filePath = process.argv[1];
    const keyPath = process.argv[2];
    if (!filePath || !keyPath || !fs.existsSync(filePath)) process.exit(0);

    let current;
    try {
      current = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      process.exit(0);
    }

    for (const part of keyPath.split(".")) {
      if (!current || typeof current !== "object" || !(part in current)) {
        process.exit(0);
      }
      current = current[part];
    }

    if (current === undefined || current === null) process.exit(0);
    process.stdout.write(typeof current === "string" ? current : String(current));
  ' "$GAME_CONFIG_PATH" "$key"
}

CONFIG_SITE_DIR="$(read_game_config_value "deploy.siteDir")"
CONFIG_LANDING_DIR="$(read_game_config_value "deploy.landingDir")"
CONFIG_DEPLOY_DIR_NAME="$(read_game_config_value "deploy.deployDirName")"
CONFIG_GAME_MOUNT_PATH="$(read_game_config_value "deploy.gameMountPath")"
CONFIG_DEPLOY_URL="$(read_game_config_value "deploy.deployUrl")"

SITE_DIR="${SITE_DIR:-$CONFIG_SITE_DIR}"
LANDING_DIR="${LANDING_DIR:-${CONFIG_LANDING_DIR:-pubsite}}"
DEPLOY_DIR_NAME="${DEPLOY_DIR_NAME:-${CONFIG_DEPLOY_DIR_NAME:-dist}}"
GAME_MOUNT_PATH="${GAME_MOUNT_PATH:-${CONFIG_GAME_MOUNT_PATH:-game}}"
DEPLOY_URL="${DEPLOY_URL:-$CONFIG_DEPLOY_URL}"

if [[ -z "$SITE_DIR" ]]; then
  echo "✗ Missing SITE_DIR. Example: SITE_DIR=\$HOME/projects/rackwickcity"
  exit 1
fi

if [[ ! -d "$SITE_DIR" ]]; then
  echo "✗ SITE_DIR does not exist: $SITE_DIR"
  exit 1
fi

LANDING_SRC_DIR="$SITE_DIR/$LANDING_DIR"
if [[ ! -d "$LANDING_SRC_DIR" ]]; then
  echo "✗ Landing directory does not exist: $LANDING_SRC_DIR"
  exit 1
fi

if [[ "$GAME_MOUNT_PATH" == "/" ]]; then
  GAME_MOUNT_PATH=""
fi
GAME_MOUNT_PATH="${GAME_MOUNT_PATH#/}"
GAME_MOUNT_PATH="${GAME_MOUNT_PATH%/}"

DEPLOY_BASE_PATH="/"
if [[ -n "$GAME_MOUNT_PATH" ]]; then
  DEPLOY_BASE_PATH="/$GAME_MOUNT_PATH/"
fi

DEPLOY_DIR="$SITE_DIR/$DEPLOY_DIR_NAME"

echo "Building game for deploy..."
GAME_SLUG="$GAME_SLUG" DEPLOY_BUILD=true DEPLOY_BASE_PATH="$DEPLOY_BASE_PATH" npm run game:build

echo "Compressing GLB files with Draco..."
node scripts/compress-glb.mjs "$DIST_DIR"

echo "Copying Draco decoder to build..."
cp -r node_modules/three/examples/jsm/libs/draco/gltf/ "$DIST_DIR/draco/"

echo "Preparing deploy directory..."
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp -r "$LANDING_SRC_DIR"/. "$DEPLOY_DIR"/

GAME_DEPLOY_DIR="$DEPLOY_DIR"
if [[ -n "$GAME_MOUNT_PATH" ]]; then
  GAME_DEPLOY_DIR="$DEPLOY_DIR/$GAME_MOUNT_PATH"
  mkdir -p "$GAME_DEPLOY_DIR"
fi
cp -r "$DIST_DIR"/. "$GAME_DEPLOY_DIR"/

echo "Deploying to Netlify..."
(
  cd "$SITE_DIR"
  netlify deploy --prod --dir="$DEPLOY_DIR"
)

echo ""
echo "Deployed!"
if [[ -n "$DEPLOY_URL" ]]; then
  BASE_URL="${DEPLOY_URL%/}"
  echo "  Landing page: $BASE_URL"
  if [[ -n "$GAME_MOUNT_PATH" ]]; then
    echo "  Game: $BASE_URL/$GAME_MOUNT_PATH"
  else
    echo "  Game: $BASE_URL"
  fi
else
  echo "  Deploy directory: $DEPLOY_DIR"
  if [[ -n "$GAME_MOUNT_PATH" ]]; then
    echo "  Game mount path: /$GAME_MOUNT_PATH/"
  else
    echo "  Game mount path: /"
  fi
fi
