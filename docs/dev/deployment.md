# Deployment & Publication

This document describes how to build and deploy the game for production.

## Architecture Overview

```
sugarengine/              (this repo - engine + editor)
├── src/game.ts           Production game entry point
├── game.html             Production game HTML template
├── dist-game/            Build output (generated)
└── scripts/
    └── deploy-to-rackwick.sh

rackwickcity/             (separate repo - deployed site)
├── pubsite/              Landing page & marketing site
│   ├── index.html        Homepage (login/signup)
│   ├── about.html
│   ├── news.html
│   └── *.css, *.png
├── game/                 Game build (copied during deploy)
└── dist/                 Combined deploy directory (generated)
```

**Deployed URLs:**
- `rackwickcity.com` → Landing page (pubsite)
- `rackwickcity.com/game` → The game

## Build & Deploy Commands

### Local Preview

Preview the built game locally:

```bash
npm run publish:local
```

This builds the game and serves it at `http://localhost:4173`.

### Deploy to Production

Deploy to Netlify (rackwickcity.com):

```bash
npm run publish:deploy
```

This script:
1. Builds the game with `DEPLOY_BUILD=true` (sets `base: '/game/'` in vite config)
2. Creates `rackwickcity/dist/` directory
3. Copies `rackwickcity/pubsite/*` to `dist/` (landing page at root)
4. Copies game build to `dist/game/`
5. Deploys `dist/` to Netlify

### Prerequisites

Before first deploy, set up Netlify CLI in the rackwickcity repo:

```bash
cd ~/projects/rackwickcity
netlify login
netlify link
```

## How It Works

### Entry Points

| Entry Point | Purpose | Used By |
|-------------|---------|---------|
| `src/main.tsx` | Editor application | `npm run dev` |
| `src/preview.ts` | Editor preview pane | Editor iframe |
| `src/game.ts` | Production game | `npm run publish:*` |

### Build Configuration

The game build uses `vite.config.game.ts`:

```typescript
export default defineConfig({
  // When DEPLOY_BUILD=true, assets load from /game/ path
  base: process.env.DEPLOY_BUILD ? '/game/' : '/',
  build: {
    outDir: 'dist-game',
  },
  // ...
})
```

### Asset Loading

All asset paths in the engine use `import.meta.env.BASE_URL` to work in both local and deployed environments:

```typescript
// Correct - works everywhere
fetch(import.meta.env.BASE_URL + 'game.json')
this.models.load(import.meta.env.BASE_URL + 'models/player.glb')

// Wrong - breaks on deployed site
fetch('/game.json')
this.models.load('/models/player.glb')
```

### Project Data Flow

```
Editor                          Production
───────                         ──────────
.sgrgame file
    │
    ▼
npm run game:export
    │
    ▼
public/game.json ──────────────► Bundled in dist-game/
public/regions/*.glb
public/models/*.glb
```

The export script (`scripts/export-game.ts`) reads the `.sgrgame` project file and writes:
- `public/game.json` - All game data (NPCs, items, dialogues, quests, regions, etc.)
- Region geometry files stay in `public/regions/`

### Loading Indicator

The production build (`game.html`) includes a loading spinner that displays while assets download. It's automatically removed when the game finishes loading:

```html
<div id="loading">
  <div class="spinner"></div>
  <div>Loading...</div>
</div>
```

Removed in `game.ts` after `loadRegion()` completes:
```typescript
await game.loadRegion(startRegionPath);
document.getElementById('loading')?.remove();
```

## Troubleshooting

### Assets not loading (404)

Check that paths use `import.meta.env.BASE_URL`:
```typescript
// In Engine.ts, Game.ts, etc.
fetch(import.meta.env.BASE_URL + 'path/to/asset')
```

### Game shows orange cube instead of player

The player model path needs the base URL prefix. Check `Engine.ts`:
```typescript
mesh = await this.models.load(import.meta.env.BASE_URL + 'models/player.glb');
```

### Deploy fails with "not linked"

Run `netlify link` in the rackwickcity repo to connect it to your Netlify site.

### Changes not appearing after deploy

1. Hard refresh the browser (Cmd+Shift+R)
2. Check browser dev tools Network tab for cached responses
3. Verify the deploy completed successfully in Netlify dashboard

## File Size Considerations

The player model (`public/models/player.glb`) is ~22MB, which causes a 30+ second load time on slower connections. The loading spinner helps communicate this to users.

Future optimizations:
- Compress/optimize the GLB file
- Use Draco compression
- Implement progressive loading
