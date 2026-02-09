# ADR-020: Character Animation System

## Status

Proposed

## Context

ADR-007 established that authored character animations (idle, walk, gestures) come from external tools and the engine loads and plays them. Currently:

- **Player model**: Static GLB loaded in `Engine.spawnPlayer()`. No animation playback.
- **NPC models**: Placeholder capsule geometry. No real models yet.
- **ModelLoader**: Only supports GLTF/GLB via `GLTFLoader`. No FBX support.
- **No AnimationMixer usage anywhere** in the engine.
- **MovementSystem** already tracks `isPlayerMoving` (for footstep sounds) but doesn't signal anything for animation.

The user has an FBX model with a walk animation baked in, with materials. We need to load it and play the walk clip when the player moves.

### Why FBX?

Many character asset pipelines (Mixamo, Blender, game asset stores) export FBX with embedded animations. GLTF/GLB is preferred for static models but FBX remains common for animated characters. We should support both.

### What Exists

- `ModelLoader` — GLTF/GLB loading with cache
- `Renderable` component — holds a `THREE.Object3D` mesh
- `RenderSystem` — syncs position, sets facing direction from velocity
- `MovementSystem` — converts input to velocity, tracks `isPlayerMoving`, fires footstep callbacks
- `Engine.spawnPlayer()` — loads GLB, creates entity with Position + Velocity + PlayerControlled + Renderable

## Decision

### New: Animator Component

An ECS component that holds animation state for an entity:

```typescript
class Animator implements Component {
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;    // named clips
  actions: Map<string, THREE.AnimationAction>; // lazy-created from clips
  currentState: string | null;

  addClip(name: string, clip: THREE.AnimationClip): void;
  play(name: string, fadeDuration?: number): void;  // cross-fade to state
  stop(): void;
}
```

- The mixer is created from the entity's root `Object3D`.
- Clips are registered by name (`'idle'`, `'walk'`, `'run'`, etc.).
- `play()` cross-fades between states. Calling `play('walk')` when already in `'walk'` is a no-op.
- The component does NOT decide when to play what — that's the system's job.

### New: AnimationSystem

An ECS system that runs each frame:

```typescript
class AnimationSystem extends System {
  update(world: World, delta: number): void {
    // 1. Update all animation mixers
    for (const { components: [animator] } of world.query(Animator)) {
      animator.mixer.update(delta);
    }

    // 2. Auto-transition player animation based on movement
    for (const { components: [animator, velocity] } of world.query(Animator, Velocity)) {
      const isMoving = velocity.x !== 0 || velocity.z !== 0;
      const target = isMoving ? 'walk' : 'idle';
      animator.play(target);
    }
  }
}
```

- Runs after MovementSystem (velocities are set) and before RenderSystem (mesh positions are synced).
- Movement-based transitions apply to any entity with both `Animator` and `Velocity`.
- Future: NPC animations, cutscene poses, emotes can all use the same component.

### Updated: ModelLoader

Add FBX loading alongside existing GLTF:

```typescript
class ModelLoader {
  // Existing
  async load(url: string): Promise<THREE.Group>;
  async loadGLTF(url: string): Promise<GLTF>;

  // New
  async loadFBX(url: string): Promise<THREE.Group>;
  async loadAnimatedModel(url: string): Promise<{
    scene: THREE.Group;
    clips: THREE.AnimationClip[];
  }>;
}
```

- `loadFBX()` uses three.js `FBXLoader` from `three/addons/loaders/FBXLoader.js`.
- `loadAnimatedModel()` is format-agnostic — detects `.fbx` vs `.glb` by extension, returns the scene graph + animation clips from either format.
- Caching works the same way as GLTF (keyed by URL).

### Updated: Engine.spawnPlayer()

```typescript
// Before
mesh = await this.models.load('models/player.glb');

// After
const { scene, clips } = await this.models.loadAnimatedModel('models/player.fbx');
mesh = scene;
// ... setup shadows, naming ...

// If the model has animations, add Animator component
if (clips.length > 0) {
  const animator = new Animator(mesh);
  // Register clips by name (FBX typically has one clip per file)
  for (const clip of clips) {
    const name = inferClipName(clip.name, clips.length);
    animator.addClip(name, clip);
  }
  // Start with idle if available, otherwise play whatever we have
  if (animator has 'idle') animator.play('idle', 0);
  else if (animator has 'walk') animator.play('walk', 0);
  world.addComponent(entity, animator);
}
```

### Clip Naming Convention

FBX files from Mixamo and similar tools name clips inconsistently (`"mixamo.com"`, `"Take 001"`, `"Armature|Walk"`, etc.). We handle this with simple heuristics:

- If there's only one clip and the filename contains `walk` → name it `'walk'`
- If there's only one clip and the filename contains `idle` → name it `'idle'`
- If there's only one clip and we can't tell → name it `'walk'` (most common use case for single-clip FBX)
- If there are multiple clips, use `clip.name` cleaned up (lowercased, stripped of prefixes like `"Armature|"`)

### Fallback Behavior

- If the model file doesn't exist or fails to load → fall back to the cube (existing behavior)
- If the model loads but has no animations → entity gets `Renderable` only, no `Animator` (works exactly like today)
- If `AnimationSystem` tries to play `'idle'` but only `'walk'` exists → stays on `'walk'`

### Player Model Path

The player model path should be configurable via `GameConfig` rather than hardcoded:

```typescript
interface GameConfig {
  // ... existing fields ...
  playerModel?: string;  // default: 'models/player.glb'
}
```

## File Changes

### New Files (3)

| File | Purpose |
|------|---------|
| `src/engine/components/Animator.ts` | Animator ECS component |
| `src/engine/systems/AnimationSystem.ts` | Updates mixers, handles movement→animation transitions |
| (none — FBX loading added to existing ModelLoader) | |

### Modified Files (4)

| File | Change |
|------|--------|
| `src/engine/loaders/ModelLoader.ts` | Add `loadFBX()` and `loadAnimatedModel()` methods |
| `src/engine/core/Engine.ts` | Update `spawnPlayer()` to use `loadAnimatedModel()`, create Animator, register AnimationSystem |
| `src/engine/components/index.ts` | Export Animator |
| `src/engine/index.ts` | Export Animator + AnimationSystem |

### What Does NOT Change

- `Renderable` component — still holds the mesh, untouched
- `RenderSystem` — still syncs position and facing, untouched
- `MovementSystem` — still handles input→velocity and footsteps, untouched
- NPC spawning — stays as placeholder capsules for now (future: same Animator pattern)
- Editor — no changes needed

## Implementation Phases

### Phase 1: FBX Loading + Walk Animation
- Add FBX loading to ModelLoader
- Create Animator component
- Create AnimationSystem
- Update spawnPlayer to load FBX with animation
- Auto-play walk when moving, stop when idle (even without a separate idle clip)

### Phase 2: Multi-Clip Support (Future)
- Load separate idle/walk/run FBX clips and merge onto one model
- Configurable clip mapping in editor (model path + clip assignments)
- NPC animated models using the same system

### Phase 3: Advanced (Future)
- Animation layers (upper body override for gestures)
- Animation events (footstep sync, VFX triggers at specific frames)
- Blend trees for walk→run speed-based blending

## Consequences

### Positive
- FBX models with baked animations "just work"
- Same Animator component works for player and NPCs
- Cross-fade transitions feel smooth
- No changes to existing systems — purely additive

### Negative
- FBXLoader is heavier than GLTFLoader (pulls in more three.js code)
- Single-clip FBX naming heuristics may guess wrong (mitigated by allowing explicit naming later)

### Neutral
- Player model path moves to config (minor API change)
- GLB models with embedded animations also work via the same `loadAnimatedModel()` path
