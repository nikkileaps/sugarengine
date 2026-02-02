#!/bin/bash
set -e

DIST_DIR="dist-game"
RACKWICK_DIR="$HOME/projects/rackwickcity"
DEPLOY_DIR="$RACKWICK_DIR/dist"

echo "Building game for deploy..."
DEPLOY_BUILD=true npm run game:build

echo "Preparing deploy directory..."
cd "$RACKWICK_DIR"

# Create clean deploy directory
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy landing page (pubsite) to root
cp -r pubsite/* "$DEPLOY_DIR/"

# Copy game build to /game subdirectory
mkdir -p "$DEPLOY_DIR/game"
cp -r "$OLDPWD/$DIST_DIR"/* "$DEPLOY_DIR/game/"

echo "Deploying to Netlify..."
netlify deploy --prod --dir="$DEPLOY_DIR"

echo ""
echo "Deployed!"
echo "  Landing page: https://rackwickcity.com"
echo "  Game: https://rackwickcity.com/game"
