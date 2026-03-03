# Deployment & Publication

This document describes the multi-game publish/deploy workflow.

## Select Active Game

Set an active game once per workspace session:

```bash
npm run game:use -- rackwick-city
```

You can check the current selection:

```bash
npm run game:use
```

All build/export/stage/deploy commands use this active game by default.

Overrides still work when needed:

- `--slug <slug>` for `game:export` and `game:stage`
- `GAME_SLUG=<slug>` for deploy/build commands

## Architecture Overview

```text
sugarengine/                       (engine + editor repo)
├── games/
│   ├── .active-game              (local workspace selection)
│   └── <slug>/
│       ├── project.sgrgame
│       └── assets/
├── public/games/<slug>/           (generated staging area)
├── dist-game/                     (generated game build)
└── scripts/
    ├── deploy-game.sh             (generic deploy)
    └── deploy-to-rackwick.sh      (Rackwick defaults wrapper)

<site-repo>/                       (separate deployed site repo)
├── <landing-dir>/                 (landing/marketing site content)
└── <deploy-dir>/                  (generated combined deploy directory)
```

## Build Commands

Local preview (compressed game build):

```bash
npm run publish:local
```

`game:build` resolves the active game and injects `VITE_GAME_SLUG` into the build, so runtime startup does not depend on a hardcoded fallback slug.

## Production Deploy (Generic)

Use the generic deploy script:

```bash
SITE_DIR=~/projects/<site-repo> npm run publish:deploy
```

Required environment variables:

- `SITE_DIR` - absolute path to external site repo (unless `deploy.siteDir` is set in game config)

Required game selection:

- Active game (`npm run game:use -- <slug>`) or explicit `GAME_SLUG`

Optional environment variables:

- `LANDING_DIR` - landing content folder inside site repo (default: `pubsite`)
- `DEPLOY_DIR_NAME` - generated deploy folder inside site repo (default: `dist`)
- `GAME_MOUNT_PATH` - URL subpath where game build is mounted (default: `game`)
- `DEPLOY_URL` - printed post-deploy URL (for convenience)
- `DIST_DIR` - local build directory to compress/copy (default: `dist-game`)

Per-game deploy defaults are read from `games/<slug>/config/game.config.json`:

- `deploy.siteDir`
- `deploy.landingDir`
- `deploy.deployDirName`
- `deploy.gameMountPath`
- `deploy.deployUrl`

Environment variables override config values.

Example (Rackwick):

```bash
npm run game:use -- rackwick-city
SITE_DIR=~/projects/rackwickcity \
LANDING_DIR=pubsite \
GAME_MOUNT_PATH=game \
DEPLOY_URL=https://rackwickcity.com \
npm run publish:deploy
```

Example (Wordlark):

```bash
npm run game:use -- wordlark
SITE_DIR=~/projects/wordlark-site \
LANDING_DIR=site \
GAME_MOUNT_PATH=play \
DEPLOY_URL=https://wordlark.com \
npm run publish:deploy
```

## Rackwick Compatibility Wrapper

Rackwick defaults are still available:

```bash
npm run publish:deploy:rackwick
```

This calls `deploy-game.sh` with:

- `GAME_SLUG=rackwick-city`
- `SITE_DIR=~/projects/rackwickcity`
- `LANDING_DIR=pubsite`
- `DEPLOY_DIR_NAME=dist`
- `GAME_MOUNT_PATH=game`
- `DEPLOY_URL=https://rackwickcity.com`

## What `publish:deploy` Does

`deploy-game.sh` runs these steps:

1. Resolves game selection (active game or `GAME_SLUG`)
2. Loads deploy defaults from `games/<slug>/config/game.config.json`
3. Applies env overrides (if provided)
4. Builds the selected game via `npm run game:build`
5. Sets `DEPLOY_BUILD=true` and `DEPLOY_BASE_PATH` from `GAME_MOUNT_PATH`
6. Compresses `dist-game/**/*.glb` with Draco
7. Copies Draco decoder files into `dist-game/draco/`
8. Rebuilds `<site-repo>/<deploy-dir>` from scratch
9. Copies landing site to deploy root
10. Copies game build to `<deploy-dir>/<game-mount-path>/` (or root when mount is `/`)
11. Runs `netlify deploy --prod --dir=<deploy-dir>` from `SITE_DIR`

## Export/Stage Data Flow

`game:build` runs both export and stage steps before the Vite game build:

```text
games/<slug>/project.sgrgame
  └─(game:export)→ public/games/<slug>/game.json

games/<slug>/assets/**
  └─(game:stage)→  public/games/<slug>/assets/**
```

Slug selection sources (in order):

1. `--slug <slug>` (where supported)
2. `GAME_SLUG=<slug>` env var
3. `games/.active-game`

## Prerequisites

Before first deploy from a given site repo:

```bash
cd ~/projects/<site-repo>
netlify login
netlify link
```

## Troubleshooting

Deploy fails with `Missing game selection`:

- Run `npm run game:use -- <slug>`
- Or set `GAME_SLUG=<slug>` for one-off runs

Deploy fails with `Missing SITE_DIR`:

- Set `SITE_DIR` to your external site repo path

Deploy fails with `not linked`:

- Run `netlify link` in the site repo

Game assets 404 after deploy:

- Verify `meta.contentBasePath` points to `games/<slug>/assets/`
- Verify `GAME_MOUNT_PATH` matches deployed URL path
