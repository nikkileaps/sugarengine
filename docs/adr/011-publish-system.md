# ADR 011: Publish System

## Status
Proposed

## Context
The game is ready for first publish. We need a workflow that:
1. Builds a **game-only** bundle (no editor)
2. Allows **local preview** before pushing
3. Supports a **staging → production** promotion flow
4. Deploys to **Netlify** via git integration

Current state:
- `preview.html` runs the game (dev mode via postMessage, production mode from files)
- Production mode path isn't fully wired - needs published game data
- No Netlify configuration exists

## Decision

### Git-Based Deploy with Branch Contexts

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Develop   │────▶│   Preview   │────▶│   Staging   │────▶│ Production  │
│   (local)   │     │   (local)   │     │  (netlify)  │     │  (netlify)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
    npm dev        npm run publish:local   push staging      merge to main
```

### Branch Strategy

| Branch    | Netlify Context | URL                           | Auto-deploy? |
|-----------|-----------------|-------------------------------|--------------|
| `main`    | Production      | `yourgame.netlify.app`        | Yes          |
| `staging` | Branch deploy   | `staging--yourgame.netlify.app` | Yes        |
| Feature   | Deploy preview  | `deploy-preview-123--...`     | Optional     |

### Workflow

**Day-to-day development:**
```bash
# 1. Develop in editor
npm run dev

# 2. Click "Publish" button in editor
#    → Saves game.json to public/ folder

# 3. Preview locally
npm run publish:local
# Opens http://localhost:4173 with production build

# 4. Happy? Push to staging
git add public/game.json
git commit -m "Ready for staging"
git push origin staging
# Netlify auto-deploys to staging URL

# 5. Test on staging URL, run e2e tests (future)

# 6. Promote to production
git checkout main
git merge staging
git push origin main
# Netlify auto-deploys to production
```

### Build Configuration

**Game-only Vite config** (`vite.config.game.ts`):

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist-game',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'game.html'),
    },
  },
});
```

**Production entry point** (`game.html`):
- Standalone game page (no editor dependencies)
- Loads game data from `/game.json`

**Production game loader** (`src/game.ts`):
```typescript
// Load published game data
const response = await fetch('/game.json');
const gameData = await response.json();
runGame(gameData, gameData.defaultEpisode);
```

### Project Export

Before committing, export current project state:

```bash
npm run game:export
```

This copies:
- `project.json` → `public/game.json`
- Region files stay in `public/regions/`
- Audio stays in `public/audio/`

The build then bundles everything from `public/` into `dist-game/`.

### File Structure

```
dist-game/                    # Built game (git-ignored)
├── index.html                # Game entry point
├── assets/                   # Bundled JS/CSS
├── game.json                 # Exported project data
├── regions/
│   └── cafe-nollie/
│       └── map.json
└── audio/
    ├── music/
    ├── sfx/
    └── ambient/

public/                       # Source assets (git-tracked)
├── game.json                 # Exported project data
├── regions/
└── audio/
```

### Netlify Configuration

**`netlify.toml`**:

```toml
[build]
  command = "npm run game:build"
  publish = "dist-game"

# Production context (main branch)
[context.production]
  command = "npm run game:build"

# Staging context
[context.staging]
  command = "npm run game:build"

# SPA routing - all routes serve index.html
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### npm Scripts

```json
{
  "scripts": {
    "game:build": "vite build --config vite.config.game.ts",
    "publish:local": "npm run game:build && vite preview --outDir dist-game --port 4173"
  }
}
```

### Editor Publish Button

The editor has a "Publish" button that exports game data directly to `public/game.json`.
This replaces the need for a separate export script.

## Implementation Steps

### Phase 1: Game Build (this PR) ✅
1. Create `vite.config.game.ts`
2. Create `game.html` and `src/game.ts` (production entry)
3. Add "Publish" button to editor (exports to `public/game.json`)
4. Add npm scripts: `game:build`, `publish:local`
5. Create `netlify.toml`

### Phase 2: First Deploy
1. Click "Publish" in editor → save to `public/game.json`
2. Run `npm run publish:local` to verify
3. Connect repo to Netlify
4. Set up `staging` branch
5. First deploy!

### Phase 3: Polish (future)
1. E2E tests that run against staging
2. Slack/Discord notification on deploy

## Consequences

### Positive
- Git-based workflow (familiar, auditable)
- Staging environment for testing before prod
- Local preview catches issues early
- Netlify handles SSL, CDN, builds automatically
- Path to e2e testing on staging

### Negative
- Must remember to export project data before pushing
- Two branches to manage (staging + main)
- Netlify build minutes (free tier: 300 min/month)

### Mitigations
- Editor could auto-export on save (future)
- CI could validate game.json is up-to-date
- Build is fast (<30s), minutes shouldn't be an issue

## First-Time Setup

### 1. Create Netlify Site
1. Go to [netlify.com](https://netlify.com) → Add new site → Import from Git
2. Connect GitHub repo
3. Configure:
   - Build command: `npm run game:build`
   - Publish directory: `dist-game`
4. Deploy

### 2. Create Staging Branch
```bash
git checkout -b staging
git push -u origin staging
```

### 3. Enable Branch Deploys
In Netlify dashboard:
1. Site settings → Build & deploy → Branches
2. Add `staging` to branch deploy allowlist

### 4. Test the Flow
```bash
npm run publish:local          # Local check
git push origin staging       # Deploy to staging
# Verify at staging--yoursite.netlify.app
git checkout main && git merge staging && git push  # Promote
```

## References
- [Netlify Branch Deploys](https://docs.netlify.com/site-deploys/overview/#branch-deploy-controls)
- [Netlify Build Configuration](https://docs.netlify.com/configure-builds/file-based-configuration/)
