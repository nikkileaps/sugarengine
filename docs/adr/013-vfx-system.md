# ADR-014: VFX System (Flames, Sparkles, Particles)

## Status

Proposed

## Context

The game needs visual effects (VFX) for magic spells, environmental ambiance, and interactive elements. Two initial effect types are needed: **flame** and **sparkle**. Effects should:

- Be creatable and tunable in the editor
- Be placeable in regions (like NPCs, items, resonance points)
- Eventually trigger from spell casts and game events
- Maintain 30fps+ in web browsers
- Fit the low-poly aesthetic

## Research Summary

### Approaches Evaluated

| Approach | Complexity | Performance | Flexibility | Editor |
|----------|------------|-------------|-------------|--------|
| **Custom THREE.Points + Shaders** | High  | Excellent | Excellent | Build from scratch |
| **three.quarks library** | Low | Very Good | Good | Separate desktop app |
| **three-nebula library** | Low-Med | Good | Good | Separate desktop app |
| **Sprite flipbooks** | Low | Excellent | Poor | External tools |

### Performance Targets

- **Desktop (60fps)**: 10k-50k particles
- **Mobile (30fps)**: 5k-15k particles
- **Low-poly mesh particles**: 1k-5k (more expensive than sprites)

## Decision

**Recommended: Custom System (Option A)** with simple initial scope.

### Rationale

1. **No external dependencies** - Keeps bundle small, no library abandonment risk
2. **Full control** - Can optimize for our low-poly aesthetic specifically
3. **ECS native** - Fits existing architecture patterns perfectly
4. **Incremental** - Start simple (flame, sparkle), expand as needed
5. **Future-proof** - Can add three.quarks import later if visual editor needed

### What We're Building

A lightweight particle system using:
- **THREE.InstancedMesh** for geometric particles (cubes, shards)
- **THREE.Points** for simple point sprites
- **Custom shaders** for billboarding, color gradients, additive blending
- **Object pooling** for performance

---

## Architecture

### Data Structures

**Editor Store** (`useEditorStore.ts`):
```typescript
export interface VFXDefinition {
  id: string;
  name: string;
  type: 'particle' | 'sprite';

  // Emission
  emissionRate: number;           // Particles per second
  maxParticles: number;           // Pool size

  // Particle properties
  lifetime: [number, number];     // Random range in seconds
  size: [number, number];         // Random range
  speed: [number, number];        // Random range

  // Appearance
  geometry: 'point' | 'cube' | 'shard' | 'spark';
  color: string;                  // Start color
  colorEnd?: string;              // Optional end color (gradient)
  blendMode: 'normal' | 'additive';

  // Movement
  direction: { x: number; y: number; z: number };
  spread: number;                 // Cone angle in degrees
  gravity: number;                // -1 to 1

  // Optional
  sprite?: string;                // Sprite texture path
  loop: boolean;
}

export interface VFXPlacement {
  id: string;
  vfxId: string;                  // References VFXDefinition.id
  position: { x: number; y: number; z: number };
  scale?: number;
  autoPlay: boolean;
}
```

**Region Definition** (add to RegionData):
```typescript
// In RegionData:
vfxPlacements?: VFXPlacement[];
```

**ECS Component**:
```typescript
export class VFXEmitter implements Component {
  static readonly type = 'VFXEmitter';
  readonly type = VFXEmitter.type;

  constructor(
    public id: string,
    public vfxId: string,
    public playing: boolean = false
  ) {}
}
```

### File Structure

```
src/engine/
├── vfx/
│   ├── index.ts
│   ├── types.ts                  # VFXDefinition, ParticleState
│   ├── VFXLoader.ts              # Load definitions from project data
│   ├── VFXManager.ts             # Create/manage emitter instances
│   ├── ParticlePool.ts           # Object pooling
│   └── shaders/
│       ├── particle.vert         # Billboarding vertex shader
│       └── particle.frag         # Color/alpha fragment shader
├── components/
│   └── VFXEmitter.ts
├── systems/
│   └── VFXSystem.ts              # Update particles each frame

src/editor/
├── panels/
│   └── vfx/
│       ├── index.ts
│       ├── VFXPanel.tsx          # Main panel
│       ├── VFXList.tsx           # Left panel list
│       ├── VFXDetail.tsx         # Center panel editor
│       └── VFXPreview.tsx        # Live preview canvas
```

---

## Implementation Phases

### Phase 1: Core Particle System (Engine)

**Files to create:**
- `src/engine/vfx/types.ts`
- `src/engine/vfx/ParticlePool.ts`
- `src/engine/vfx/VFXManager.ts`
- `src/engine/vfx/VFXLoader.ts`
- `src/engine/vfx/index.ts`
- `src/engine/vfx/shaders/particle.vert`
- `src/engine/vfx/shaders/particle.frag`
- `src/engine/components/VFXEmitter.ts`
- `src/engine/systems/VFXSystem.ts`

**Core classes:**

```typescript
// ParticlePool - Reusable particle instances
class ParticlePool {
  private particles: ParticleState[];
  private freeList: number[];

  acquire(): number;  // Get free particle index
  release(index: number): void;
  reset(): void;
}

// VFXManager - Orchestrates emitters
class VFXManager {
  private definitions: Map<string, VFXDefinition>;
  private emitters: Map<string, EmitterInstance>;

  registerDefinition(def: VFXDefinition): void;
  createEmitter(vfxId: string, position: THREE.Vector3): EmitterInstance;
  update(delta: number): void;
}

// EmitterInstance - Single particle emitter
class EmitterInstance {
  private mesh: THREE.InstancedMesh | THREE.Points;
  private pool: ParticlePool;
  private emissionAccumulator: number;

  emit(count: number): void;
  update(delta: number): void;
  play(): void;
  stop(): void;
}
```

### Phase 2: Preset Effects (Flame & Sparkle)

**Built-in presets:**

```typescript
const FLAME_PRESET: VFXDefinition = {
  id: 'builtin-flame',
  name: 'Flame',
  type: 'particle',
  emissionRate: 30,
  maxParticles: 100,
  lifetime: [0.5, 1.5],
  size: [0.1, 0.3],
  speed: [1, 2],
  geometry: 'shard',
  color: '#ff6600',
  colorEnd: '#ffcc00',
  blendMode: 'additive',
  direction: { x: 0, y: 1, z: 0 },
  spread: 20,
  gravity: -0.3,  // Rises
  loop: true,
};

const SPARKLE_PRESET: VFXDefinition = {
  id: 'builtin-sparkle',
  name: 'Sparkle',
  type: 'particle',
  emissionRate: 10,
  maxParticles: 50,
  lifetime: [0.3, 0.8],
  size: [0.05, 0.15],
  speed: [0.5, 1.5],
  geometry: 'point',
  color: '#ffffff',
  colorEnd: '#ffff88',
  blendMode: 'additive',
  direction: { x: 0, y: 1, z: 0 },
  spread: 360,  // All directions
  gravity: 0.1,  // Slight fall
  loop: true,
};
```

### Phase 3: Editor Tab

**Files to create:**
- `src/editor/panels/vfx/VFXPanel.tsx`
- `src/editor/panels/vfx/VFXList.tsx`
- `src/editor/panels/vfx/VFXDetail.tsx`
- `src/editor/panels/vfx/VFXPreview.tsx`
- `src/editor/panels/vfx/index.ts`

**Files to modify:**
- `src/editor/store/useEditorStore.ts` - Add VFXDefinition[], vfxPlacements in regions
- `src/editor/Editor.tsx` - Add 'vfx' to TABS
- `src/editor/panels/region/RegionDetail.tsx` - Add 'vfx' to SPAWN_CONFIG
- `src/editor/panels/region/SpawnInspector.tsx` - Add VFX inspector

**Editor features:**
- List of VFX definitions (left panel)
- Property editor with sliders/inputs (center)
- Live 3D preview canvas (right panel or inline)
- Color pickers for start/end colors
- Preset buttons (Flame, Sparkle, etc.)

### Phase 4: Region Spawning & Triggers

**Files to modify:**
- `src/engine/loaders/RegionLoader.ts` - Add VFXPlacement type
- `src/engine/core/Engine.ts` - Spawn VFX emitters from region data
- `src/engine/core/Game.ts` - Wire up spell effects to VFX triggers

**Spell integration:**
```typescript
// In SpellEffect, add new type:
interface SpellEffect {
  type: 'vfx';
  vfxId: string;
  position: 'caster' | 'target' | 'world';
  duration?: number;  // Auto-stop after duration
}

// Game.ts handles:
case 'vfx':
  const emitter = this.vfxManager.createEmitter(effect.vfxId, position);
  emitter.play();
  if (effect.duration) {
    setTimeout(() => emitter.stop(), effect.duration * 1000);
  }
  break;
```

---

## Shader Overview

### Billboard Vertex Shader
```glsl
// particle.vert
attribute vec3 offset;      // Particle position
attribute float size;       // Particle size
attribute float life;       // 0-1 lifetime progress
attribute vec3 color;       // Particle color

varying float vLife;
varying vec3 vColor;

void main() {
  vLife = life;
  vColor = color;

  // Billboard: always face camera
  vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  vec3 worldPos = offset + cameraRight * position.x * size + cameraUp * position.y * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
```

### Fragment Shader
```glsl
// particle.frag
varying float vLife;
varying vec3 vColor;

uniform vec3 colorEnd;
uniform float opacity;

void main() {
  // Fade out over lifetime
  float alpha = 1.0 - vLife;

  // Color gradient
  vec3 finalColor = mix(vColor, colorEnd, vLife);

  // Soft circle (for point geometry)
  float dist = length(gl_PointCoord - vec2(0.5));
  float circle = 1.0 - smoothstep(0.4, 0.5, dist);

  gl_FragColor = vec4(finalColor, alpha * circle * opacity);
}
```

---

## Future Considerations

1. **Import from external tools**: Add "Import three.quarks JSON" to convert external formats to our VFXDefinition
2. **Sprite flipbooks**: Support pre-rendered sprite sheet animations
3. **Trails**: Add trail renderer for projectiles, magic streaks
4. **Audio sync**: Trigger sounds at particle events (burst, impact)
5. **LOD**: Reduce particle count based on camera distance
6. **WebGPU**: Migrate to compute shaders for 100k+ particles when browser support reaches 80%

---

## Verification

### Manual Testing

1. **Editor:**
   - Create a new VFX definition
   - Adjust properties, see live preview update
   - Save project, verify data persists
   - Place VFX in region via spawn menu

2. **Preview:**
   - Load region with VFX placement
   - Verify particles render at correct position
   - Check performance (should maintain 60fps with 100 particles)

3. **Spell Integration:**
   - Cast spell with VFX effect
   - Verify particles spawn at caster/target
   - Check particles stop after duration

### Build Verification

```bash
npm run build  # Should complete without errors
npm run dev    # Editor should load with VFX tab
```

---

## Summary

This ADR proposes a **custom lightweight particle system** that:
- Uses THREE.InstancedMesh/Points for efficient rendering
- Fits naturally into the existing ECS architecture
- Provides an editor tab for creating and tuning effects
- Starts with two presets (flame, sparkle) and expands from there
- Maintains 30fps+ with reasonable particle counts (100-1000)
- Leaves the door open for external tool import in the future
