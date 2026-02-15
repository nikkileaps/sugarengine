# ADR-023: Draco Mesh Compression for Published Builds

## Status

Proposed

## Context

The first published build of Rackwick City takes ~60 seconds to load. Profiling the asset sizes reveals the cause:

| Asset | Size |
|-------|------|
| `regions/cafe-nollie/geometry.glb` | **400 MB** |
| `models/player.glb` | 21 MB |
| Audio, textures, gazette images, etc. | ~22 MB |
| **Total** | **~443 MB** |

The cafe-nollie GLB is 400 MB, of which **392.5 MB is raw mesh vertex data** (positions, normals, UVs, indices) across 2,334 meshes. Textures are only 4.2 MB — the geometry is the entire problem.

### Why It's So Large

GLB stores mesh data as uncompressed binary buffers. Blender exports vertex attributes as 32-bit floats with full precision. For a detailed scene with 2,334 meshes and 2,285 materials, this adds up fast.

### Draco Compression

[Draco](https://google.github.io/draco/) is Google's open-source mesh compression library. It's the standard approach for compressed glTF — supported natively by Three.js, Blender, and all major glTF tools.

Typical compression ratios for mesh geometry:

| Compression | Ratio | 400 MB GLB becomes |
|-------------|-------|---------------------|
| Draco (default settings) | 10-20x | **20-40 MB** |
| Draco (aggressive quantization) | 20-30x | 13-20 MB |

At 30 MB, the same connection that took 60 seconds would load in ~5 seconds.

### Constraint: Development vs Production

Draco compression adds a decode step on the client (runs on a web worker, ~1-2 seconds). During development, iteration speed matters more than file size — assets are served locally over localhost. We only want compression in the published build, not in the editor preview.

### Prior Art

| Engine/Tool | Approach |
|-------------|----------|
| PlayCanvas | Compresses at publish time, runtime decoder |
| Babylon.js | Optional Draco/meshopt in asset pipeline |
| gltf-transform | CLI tool for offline GLB optimization (Draco, meshopt, texture compression) |
| Three.js | `DRACOLoader` extension for `GLTFLoader`, decoder runs in web worker |

## Decision

### Architecture: Publish-Time Compression, Conditional Runtime Decode

```
Development (editor preview):
  public/regions/cafe-nollie/geometry.glb  (uncompressed, fast iteration)
      │
      ▼
  GLTFLoader (no Draco decoder needed)

Published build:
  public/regions/cafe-nollie/geometry.glb  (uncompressed, source of truth)
      │
      ▼
  deploy script: gltf-transform draco encode
      │
      ▼
  dist-game/regions/cafe-nollie/geometry.glb  (Draco compressed)
      │
      ▼
  GLTFLoader + DRACOLoader (web worker decoder)
```

The uncompressed GLB in `public/` remains the source of truth. Compression happens only during the deploy build, applied to the output in `dist-game/`.

### 1. Offline Compression with gltf-transform

Add `@gltf-transform/cli` as a dev dependency. After `vite build`, run Draco compression on all GLB files in the output directory.

```bash
# In deploy-to-rackwick.sh, after vite build:
find dist-game -name "*.glb" -exec gltf-transform draco {} {} \;
```

gltf-transform's `draco` command compresses in-place. Settings:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `--method edgebreaker` | default | Best compression for triangle meshes |
| Quantization bits (position) | 14 | Good balance — ~0.02mm precision at scene scale |
| Quantization bits (normal) | 10 | Normals don't need high precision |
| Quantization bits (texcoord) | 12 | Standard for UV coordinates |

These are gltf-transform defaults and should work well without tuning.

### 2. Conditional DRACOLoader in ModelLoader

The `ModelLoader` constructor accepts an optional flag to enable Draco decoding. The published build sets it; the editor preview does not.

```typescript
// ModelLoader.ts
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class ModelLoader {
  constructor(options?: { draco?: boolean }) {
    this.gltfLoader = new GLTFLoader();

    if (options?.draco) {
      const dracoLoader = new DRACOLoader();
      // Use Three.js hosted decoder (small WASM file, loaded on demand)
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      this.gltfLoader.setDRACOLoader(dracoLoader);
    }

    this.fbxLoader = new FBXLoader();
  }
}
```

The Draco decoder is a ~300KB WASM file loaded from Google's CDN. It runs in a web worker automatically — no main thread blocking.

**Important:** `DRACOLoader` is backwards-compatible. A `GLTFLoader` with Draco enabled can load both compressed and uncompressed GLBs transparently. So even if some assets aren't compressed, nothing breaks.

### 3. Engine Config Flag

Add a `draco` option to the engine config so entry points can opt in:

```typescript
// Engine constructor or ModelLoader factory
engine: {
  camera: { ... },
  draco: true,  // Enable Draco decoder for compressed assets
}
```

- `game.ts` (published build): `draco: true`
- `preview.ts` (editor): `draco: false` (or omit — default off)

Since DRACOLoader handles both compressed and uncompressed GLBs, it's safe to always enable it. But keeping it off in dev avoids loading the decoder WASM when it's not needed.

### 4. Deploy Script Changes

Update `scripts/deploy-to-rackwick.sh` to compress GLBs after the vite build:

```bash
echo "Building game for deploy..."
DEPLOY_BUILD=true npm run game:build

echo "Compressing GLB files with Draco..."
find "$DIST_DIR" -name "*.glb" -exec npx gltf-transform draco {} {} \;

echo "Preparing deploy directory..."
# ... rest of existing script
```

### 5. Self-Hosted Draco Decoder (Optional Follow-Up)

The initial implementation uses Google's CDN for the Draco decoder WASM (`gstatic.com`). This is simple and reliable but adds an external dependency. A follow-up could copy the decoder files into the build output for fully self-hosted deployment:

```typescript
// Copy from node_modules/three/examples/jsm/libs/draco/ to dist-game/draco/
dracoLoader.setDecoderPath(import.meta.env.BASE_URL + 'draco/');
```

## Implementation Phases

### Phase 1: Draco Decoder in Engine

- Add `DRACOLoader` setup to `ModelLoader` behind an `options.draco` flag
- Thread the `draco` flag through `EngineConfig` → `Engine` → `ModelLoader`
- Wire up `game.ts` to pass `draco: true`, `preview.ts` leaves it off
- No compression yet — just the decoder. Uncompressed GLBs still load fine.

### Phase 2: Build-Time Compression

- Add `@gltf-transform/cli` as a dev dependency
- Add a `compress:glb` npm script: `find dist-game -name '*.glb' -exec gltf-transform draco {} {} \;`
- Update `deploy-to-rackwick.sh` to run compression after vite build
- Update `game:build` script to optionally run compression
- Test: verify compressed GLB loads correctly in published build
- Test: verify uncompressed GLB still loads in editor preview

### Phase 3: Measure and Tune

- Measure actual compressed sizes and load times
- If quality loss is visible, adjust quantization bits upward
- If load time is still too high, try aggressive quantization or meshopt as a complement
- Consider compressing `player.glb` (21 MB → ~2 MB) for additional gains
- Update `docs/dev/deployment.md` with new asset size expectations

## Expected Impact

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| cafe-nollie GLB | 400 MB | ~25-40 MB |
| player.glb | 21 MB | ~2-3 MB |
| Total download | ~443 MB | ~50-65 MB |
| Load time (50 Mbps) | ~60s | ~8-10s |
| Decode overhead | 0 | ~1-2s (web worker) |
| **Total perceived load** | **~60s** | **~10-12s** |

## Risks

- **Visual artifacts from quantization**: Draco uses lossy quantization on vertex positions. At default settings (14-bit) this is imperceptible for game assets. If specific meshes show artifacts (e.g., thin edges, precise geometric patterns), they can be excluded from compression.
- **Draco decoder CDN dependency**: If `gstatic.com` is down, the published game can't decode meshes. Mitigated by self-hosting the decoder in Phase 3 if needed.
- **gltf-transform version drift**: Pin the version in package.json to avoid compression format changes between builds.
