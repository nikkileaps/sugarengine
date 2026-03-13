#!/usr/bin/env bash
set -euo pipefail

export GAME_SLUG="${GAME_SLUG:-rackwick-city}"
export SITE_DIR="${SITE_DIR:-$HOME/projects/rackwickcity}"
export LANDING_DIR="${LANDING_DIR:-pubsite}"
export DEPLOY_DIR_NAME="${DEPLOY_DIR_NAME:-dist}"
export GAME_MOUNT_PATH="${GAME_MOUNT_PATH:-game}"
export DEPLOY_URL="${DEPLOY_URL:-https://rackwickcity.com}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/deploy-game.sh"
