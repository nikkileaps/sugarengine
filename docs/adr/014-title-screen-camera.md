# ADR-014: Title Screen Camera & Cinematic Transitions

## Status

Proposed

## Context

Currently when the game loads, the player is visible and the camera follows them even during the title screen. This breaks immersion - the player sees their character standing in the world while menu buttons float on screen.

The desired experience is:
1. **Title screen**: A cinematic "balcony" shot looking out over the city toward dragon mountain, with the rift visible in the background. Player is not visible.
2. **Transition**: When "New Game" is clicked, screen fades to black, episode loads, then fades back in with player visible and camera in gameplay mode.

## Decision

Add camera and player visibility controls to the Engine, plus a fade transition system. Keep it simple - no separate title scene, just camera positioning and a CSS-based fade overlay.

### User Flow

1. Game loads, title screen appears
2. Camera is positioned at configured "balcony" viewpoint, looking at mountain
3. Player mesh is hidden
4. User clicks "New Game"
5. Screen fades to black (500ms)
6. Episode loads, player spawns at configured position/facing
7. Camera switches to follow-player mode
8. Player becomes visible
9. Screen fades from black (500ms)
10. Gameplay begins

---

## Architecture

### Data Structures

**Title Screen Config** (add to GameConfig or separate):
```typescript
interface TitleScreenConfig {
  // Camera position for title screen (world coordinates)
  cameraPosition: { x: number; y: number; z: number };
  // Point camera looks at (world coordinates)
  cameraLookAt: { x: number; y: number; z: number };
  // Optional: hide player during title (default true)
  hidePlayer?: boolean;
  // Optional: transition duration in ms (default 500)
  transitionDuration?: number;
}
```

**Engine Methods** (new public methods):
```typescript
// Camera control
setCameraPosition(x: number, y: number, z: number): void;
setCameraLookAt(x: number, y: number, z: number): void;
resumePlayerCamera(): void;

// Player visibility
setPlayerVisible(visible: boolean): void;
```

**Fade Overlay** (new UI component):
```typescript
class FadeOverlay {
  private overlay: HTMLDivElement;

  fadeToBlack(durationMs: number): Promise<void>;
  fadeFromBlack(durationMs: number): Promise<void>;
  setOpacity(opacity: number): void;
}
```

### File Structure

```
src/engine/
├── core/
│   └── Engine.ts              # Add camera/visibility methods
├── ui/
│   └── FadeOverlay.ts         # NEW: Simple fade transition overlay

src/
├── preview.ts                 # Wire up title screen camera config
```

---

## Implementation Phases

### Phase 1: Engine Camera Controls

**Files to modify:**
- `src/engine/core/Engine.ts`

**Add methods:**
```typescript
/**
 * Set camera to a fixed position (disables player following)
 */
setCameraPosition(x: number, y: number, z: number): void {
  this.camera.position.set(x, y, z);
  this.cameraFollowsPlayer = false;
}

/**
 * Point camera at a world position
 */
setCameraLookAt(x: number, y: number, z: number): void {
  this.camera.lookAt(x, y, z);
}

/**
 * Resume normal player-following camera behavior
 */
resumePlayerCamera(): void {
  this.cameraFollowsPlayer = true;
}
```

**Notes:**
- Need to add `cameraFollowsPlayer: boolean` flag
- Modify camera update logic to check this flag
- When `cameraFollowsPlayer` is false, camera stays where it was positioned

### Phase 2: Player Visibility Control

**Files to modify:**
- `src/engine/core/Engine.ts`

**Add method:**
```typescript
/**
 * Show or hide the player mesh
 */
setPlayerVisible(visible: boolean): void {
  if (this.playerEntity < 0) return;
  const renderable = this.world.getComponent<Renderable>(this.playerEntity, Renderable);
  if (renderable?.mesh) {
    renderable.mesh.visible = visible;
  }
}
```

### Phase 3: Fade Overlay

**Files to create:**
- `src/engine/ui/FadeOverlay.ts`

**Implementation:**
```typescript
export class FadeOverlay {
  private overlay: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: black;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s ease-in-out;
      z-index: 9999;
    `;
    container.appendChild(this.overlay);
  }

  fadeToBlack(durationMs: number = 500): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;
      this.overlay.style.opacity = '1';
      setTimeout(resolve, durationMs);
    });
  }

  fadeFromBlack(durationMs: number = 500): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;
      this.overlay.style.opacity = '0';
      setTimeout(resolve, durationMs);
    });
  }

  setOpacity(opacity: number): void {
    this.overlay.style.opacity = String(opacity);
  }

  dispose(): void {
    this.overlay.remove();
  }
}
```

### Phase 4: Game.ts Integration

**Files to modify:**
- `src/engine/core/Game.ts`

**Add title screen config:**
```typescript
interface GameConfig {
  // ... existing fields
  titleScreen?: TitleScreenConfig;
}
```

**Modify initialization:**
```typescript
// In constructor or init, after engine is ready:
if (this.config.titleScreen) {
  const { cameraPosition, cameraLookAt } = this.config.titleScreen;
  this.engine.setCameraPosition(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  this.engine.setCameraLookAt(cameraLookAt.x, cameraLookAt.y, cameraLookAt.z);
  this.engine.setPlayerVisible(false);
}
```

**Modify onNewGame:**
```typescript
private async onNewGame(): Promise<void> {
  const duration = this.config.titleScreen?.transitionDuration ?? 500;

  // Fade to black
  await this.fadeOverlay.fadeToBlack(duration);

  // Load episode (existing code)
  const spawnOverride = this.playerCasterConfig?.initialSpawnPosition;
  await this.engine.loadRegion(this.config.startRegion, spawnOverride);

  if (this.playerCasterConfig?.initialFacingAngle !== undefined) {
    this.engine.setPlayerFacingAngle(this.playerCasterConfig.initialFacingAngle);
  }

  // Show player and resume camera
  this.engine.setPlayerVisible(true);
  this.engine.resumePlayerCamera();

  // Initialize caster, etc. (existing code)
  this.initializePlayerCaster();

  // Fade from black
  await this.fadeOverlay.fadeFromBlack(duration);

  this.gameState = 'playing';
}
```

### Phase 5: Preview Integration

**Files to modify:**
- `src/preview.ts`

**Add title screen config to game initialization:**
```typescript
const game = new Game({
  // ... existing config
  titleScreen: {
    // Balcony position - needs to be determined based on actual world geometry
    cameraPosition: { x: -50, y: 25, z: 80 },
    // Look at dragon mountain / rift area
    cameraLookAt: { x: 0, y: 10, z: -100 },
    hidePlayer: true,
    transitionDuration: 500,
  },
});
```

**Note:** The actual camera coordinates will need to be tuned based on the world geometry and where the "balcony" and "dragon mountain" are located.

---

## Configuration Options

### Editor Integration (Future)

Could add a "Title Screen" section to the editor's settings:
- Camera position picker (click in 3D view to set)
- Camera look-at picker
- Transition duration slider
- Preview button to test the view

For now, hardcode in preview.ts or GameConfig.

---

## Critical Files Summary

**Create:**
1. `src/engine/ui/FadeOverlay.ts`

**Modify:**
1. `src/engine/core/Engine.ts` - Camera controls, player visibility
2. `src/engine/core/Game.ts` - Title screen config, transition flow
3. `src/preview.ts` - Pass title screen config

---

## Verification

### Manual Testing

1. **Title screen camera:**
   - Load game, verify camera is at balcony position
   - Verify camera points at mountain/rift area
   - Verify player is not visible

2. **Transition:**
   - Click "New Game"
   - Verify screen fades to black smoothly
   - Verify screen fades back in
   - Verify player is now visible
   - Verify camera follows player

3. **No config:**
   - Remove titleScreen config
   - Verify game works as before (player visible, camera follows)

### Build Verification

```bash
npm run build  # Should complete without errors
npm run dev    # Preview should show title screen camera
```

---

## Future Considerations

1. **Multiple camera presets**: Different angles for different menu states
2. **Camera animation**: Slow pan/drift during title screen for more dynamism
3. **Per-episode title shots**: Each episode could have its own cinematic intro camera
4. **Skip transition**: Option to skip fade for faster iteration during development
5. **Audio integration**: Music change or audio cue during transition
