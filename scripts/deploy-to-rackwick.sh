#!/bin/bash
set -e

DIST_DIR="dist-game"

echo "Building game for deploy..."
DEPLOY_BUILD=true npm run game:build

echo "Deploying to Netlify..."

# Deploy directly to Netlify (to the /game subdirectory)
# First time: run 'netlify login' and 'netlify link' in rackwickcity repo
cd "$HOME/projects/rackwickcity"

# Copy game build to game/ subdirectory
rm -rf game/
mkdir -p game/
cp -r "$OLDPWD/$DIST_DIR"/* game/

# Deploy the whole site
netlify deploy --prod --dir=.

echo ""
echo "Deployed!"
