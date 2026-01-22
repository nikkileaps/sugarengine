# ADR 006: Perspective "Isometric-Style" Camera System

## Status

Proposed

## Context

The current `IsometricCamera` uses an `OrthographicCamera` with a fixed isometric angle. While this works for static views, it cannot support:

- Player-controlled zoom within a bounded range
- Yaw rotation to reveal obscured geometry
- Limited pitch adjustment while preserving isometric feel
- Smooth camera follow with inertia
- Future occlusion handling (buildings, trees, props)

Orthographic projection becomes brittle as rotation, zoom, and occlusion are introduced. A constrained `PerspectiveCamera` provides a more robust foundation while preserving the isometric aesthetic through careful parameter constraints.

See `docs/ADVANCED_CAMERA.md` for the full proposal.

## Decision

Replace the `IsometricCamera` with a new `GameCamera` class that uses a `PerspectiveCamera` with a hierarchical rig structure and strict constraints to preserve the isometric feel.

### Camera Rig Hierarchy

```
CameraTarget (Object3D)       // Smoothed follow point
 └── YawPivot (Object3D)      // Rotates around Y axis
      └── PitchPivot (Object3D)  // Rotates around X axis (clamped)
           └── Camera (PerspectiveCamera)
```

### Key Design Decisions

#### 1. Low FOV to Preserve Isometric Feel

FOV range: 25°–35° (default: 30°)

Standard third-person cameras use 60-90°. Our low FOV flattens perspective distortion, maintaining the readability of an isometric view while gaining the benefits of perspective projection.

#### 2. Strict Pitch Clamping

- Minimum: 35° downward
- Maximum: 55° downward
- Default: 45° downward

This keeps the camera "looking down" at the world, never going to eye-level or below.

#### 3. Distance-Based Zoom

Zoom by adjusting camera distance from target rather than FOV.

- Min distance: ~8 units (close interaction)
- Max distance: ~25 units (see plazas/intersections)
- Default: ~15 units

Distance zoom is more intuitive for collision/occlusion than FOV zoom.

#### 4. Manual Player-Driven Rotation

- Mouse right-drag controls yaw rotation
- Q / R keys as keyboard alternatives (fixed 45° steps, E is reserved for interact)
- No auto-rotation based on movement direction
- Rotation is deliberately slow to preserve isometric feel

This mirrors modern cozy RPGs (Palia) and keeps camera orientation a conscious player choice.

#### 5. Optional Snap-to-Cardinal

- 45° increment snapping available
- Snapping applied only when rotation input ends
- Smooth interpolation to nearest cardinal if within threshold
- Can be disabled for free rotation

#### 6. Frame-Rate Independent Smoothing

Position follow uses exponential smoothing:

```typescript
target.position.lerp(
  player.position,
  1 - Math.exp(-followStrength * deltaTime)
);
```

This produces consistent "rope-like" lag regardless of frame rate.

### Architecture

#### GameCamera Class

```typescript
interface GameCameraConfig {
  fov: number;              // Default: 30
  pitchMin: number;         // Default: 35 (degrees)
  pitchMax: number;         // Default: 55 (degrees)
  pitchDefault: number;     // Default: 45 (degrees)
  distanceMin: number;      // Default: 8
  distanceMax: number;      // Default: 25
  distanceDefault: number;  // Default: 15
  followStrength: number;   // Default: 8
  rotationSpeed: number;    // Default: 0.003 (radians per pixel)
  snapToCardinal: boolean;  // Default: true
  snapThreshold: number;    // Default: 10 (degrees)
}

class GameCamera {
  camera: THREE.PerspectiveCamera;

  // Rig components
  private cameraTarget: THREE.Object3D;
  private yawPivot: THREE.Object3D;
  private pitchPivot: THREE.Object3D;

  // State
  private currentYaw: number;
  private currentPitch: number;
  private currentDistance: number;
  private targetYaw: number;
  private isDragging: boolean;

  constructor(config: Partial<GameCameraConfig>, container: HTMLElement);

  // Core methods
  update(deltaTime: number): void;
  follow(target: THREE.Vector3): void;

  // Input handling
  onMouseDown(e: MouseEvent): void;
  onMouseMove(e: MouseEvent): void;
  onMouseUp(e: MouseEvent): void;
  onWheel(e: WheelEvent): void;
  onKeyDown(e: KeyboardEvent): void;

  // Zoom control
  setZoom(normalized: number): void;  // 0-1 range
  getZoom(): number;

  // Rotation control
  rotateYaw(delta: number): void;
  rotatePitch(delta: number): void;
  snapToNearest(): void;

  // Resize handling
  updateAspect(container: HTMLElement): void;

  // Scene integration
  getSceneObjects(): THREE.Object3D;  // Returns cameraTarget for adding to scene
}
```

#### Input State Machine

```
IDLE
 │
 ├─ Right mouse down → ROTATING
 │                      │
 │                      └─ Right mouse up → check snap threshold
 │                                          │
 │                                          ├─ Within threshold → SNAPPING
 │                                          │                     │
 │                                          │                     └─ Snap complete → IDLE
 │                                          │
 │                                          └─ Outside threshold → IDLE
 │
 ├─ Q pressed → Rotate -45° → IDLE
 │
 └─ R pressed → Rotate +45° → IDLE
```

#### Chaos Tiers for Battery (Reference)

The camera zoom level may affect UI feedback for the Caster system's battery tiers:

- Full (75-100%): Normal view
- Unstable (25-74%): Subtle screen effects possible
- Critical (1-24%): More pronounced effects
- Empty (0%): Caster tongue-out animation visible

### Migration Strategy

#### Phase 1: Parallel Implementation

1. Create `GameCamera` class alongside `IsometricCamera`
2. Add config flag to switch between cameras
3. Keep `IsometricCamera` as fallback

#### Phase 2: Visual Parity

1. Tune `GameCamera` defaults to match current ortho framing
2. Validate scale, UI readability, grid alignment
3. Test with existing content and props

#### Phase 3: Input Integration

1. Wire up mouse/keyboard input handlers
2. Test rotation and zoom feel
3. Tune smoothing and speed values

#### Phase 4: Switch Default

1. Make `GameCamera` the primary camera
2. Keep ortho mode as debug option
3. Remove `IsometricCamera` after validation period

### Future: Occlusion Handling

The rig architecture supports future occlusion without refactoring:

**Phase A: Fade Occluders**
- Raycast camera → player
- Fade intersecting meshes

**Phase B: Camera Collision**
- Sphere cast from target along camera vector
- Push camera closer if blocked

## Implementation Plan

### Step 1: Core Rig Structure

Create the basic `GameCamera` class with:
- Rig hierarchy (target → yaw → pitch → camera)
- PerspectiveCamera with low FOV
- Basic `follow()` that snaps to target (no smoothing yet)
- `updateAspect()` for resize handling

**Test**: Camera follows player, looking down at 45°.

### Step 2: Exponential Smoothing

Add frame-rate independent position smoothing:
- `update(deltaTime)` method
- Configurable follow strength
- "Rope-like" lag behavior

**Test**: Camera smoothly follows player movement with consistent feel at 30/60/144 fps.

### Step 3: Distance Zoom

Implement zoom via camera distance:
- Mouse wheel handler
- Min/max distance clamping
- Smooth zoom interpolation

**Test**: Scroll wheel zooms in/out within bounds.

### Step 4: Yaw Rotation

Add horizontal orbit:
- Right-mouse drag tracking
- Yaw rotation around target
- Configurable rotation speed

**Test**: Right-drag rotates view around player.

### Step 5: Keyboard Rotation

Add Q/R discrete rotation:
- 45° step rotation
- Smooth interpolation to target angle

**Test**: Q/R rotate camera in 45° increments.

### Step 6: Snap-to-Cardinal

Implement optional snapping:
- Detect nearest cardinal on drag end
- Threshold-based activation
- Smooth snap interpolation

**Test**: Releasing drag near 45° boundary snaps to it.

### Step 7: Pitch Adjustment

Add vertical tilt (if desired):
- Middle-mouse or modifier+drag for pitch
- Strict clamping (35°-55°)
- Smooth interpolation

**Test**: Pitch adjustable within bounds, never goes horizontal.

### Step 8: Engine Integration

Wire into Engine:
- Replace `IsometricCamera` instantiation
- Update render loop to call `camera.update(deltaTime)`
- Ensure all existing camera references work

**Test**: Game runs with new camera, all features work.

### Step 9: Cleanup

- Remove `IsometricCamera` (or keep as debug mode)
- Update documentation
- Tune default values based on playtesting

## Consequences

### Positive

- **Rotation and zoom** - Players can reveal obscured areas and adjust view
- **Occlusion-ready** - Perspective enables raycast-based solutions
- **Modern feel** - Matches player expectations from cozy RPGs
- **Preserves aesthetic** - Low FOV and pitch clamps maintain isometric vibe
- **Player agency** - Manual rotation keeps camera control intentional

### Negative

- **More complexity** - Rig hierarchy vs simple offset
- **Tuning required** - FOV, distances, speeds all need playtesting
- **Potential motion sensitivity** - Mitigated by conservative smoothing, no roll

### Edge Cases

- **Player against wall**: Camera may need collision push (future Phase B)
- **Indoor vs outdoor**: May want different zoom ranges per region (future config)
- **Cutscenes**: Will need separate camera control system (not in scope)

## Files Changed

**New:**
- `src/core/GameCamera.ts` - Main camera implementation
- `src/core/GameCameraConfig.ts` - Configuration types and defaults

**Modified:**
- `src/core/Engine.ts` - Switch to GameCamera, add update call
- `src/core/index.ts` - Export GameCamera

**Deprecated (Phase 4):**
- `src/core/IsometricCamera.ts` - Remove after validation

**Documentation:**
- `docs/api/` - Update camera documentation
