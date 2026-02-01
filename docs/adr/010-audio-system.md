# ADR 010: Audio System

## Status
Proposed

## Context
The game needs audio support for the first publish. Requirements expand over phases:
- **Phase 1**: Background music on menu, fades when entering gameplay
- **Phase 2**: Sound effects tied to actions (footsteps, interactions)
- **Phase 3**: Ambient/environmental sounds (wind, owl hooting, etc.)
- **Future**: Spatial audio for NPCs, positional sounds

## Decision
Use **Howler.js** as the audio foundation, wrapped in an ECS-compatible AudioManager.

### Why Howler.js
- MIT licensed (compatible)
- 7KB gzipped, no dependencies
- Built-in spatial audio (Web Audio API 3D positioning)
- Fade, loop, sprite support out of the box
- Used by Google, Disney, Mozilla, Lego
- Falls back to HTML5 Audio on old browsers

## Architecture

### Audio Graph (Howler handles internally)
```
┌─────────────────────────────────────────────────────────────┐
│                      AudioManager                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Howler (global)                      │   │
│  │  masterVolume ──┬── musicVolume ── Howl (menu.mp3)  │   │
│  │                 ├── sfxVolume ──── Howl (footsteps) │   │
│  │                 └── ambientVolume ─ Howl (wind)     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### State Machine
```
┌─────────┐  onNewGame/onContinue  ┌─────────┐
│  MENU   │ ────────────────────►  │  GAME   │
│         │    (fade out music)    │         │
└─────────┘                        └─────────┘
     ▲                                  │
     │          onQuitToTitle           │
     └──────────────────────────────────┘
              (fade in music)
```

### File Structure
```
src/engine/audio/
  index.ts              # Public exports
  AudioManager.ts       # Main audio system
  types.ts              # AudioState, config types

public/audio/
  music/
    menu.mp3            # 3-minute loop
    game.mp3            # (future) gameplay music
  sfx/
    footstep.mp3        # (phase 2)
    interact.mp3        # (phase 2)
  ambient/
    wind.mp3            # (phase 3)
    owl.mp3             # (phase 3)
```

### AudioManager API

```typescript
interface AudioConfig {
  masterVolume?: number;    // 0-1, default 1
  musicVolume?: number;     // 0-1, default 0.7
  sfxVolume?: number;       // 0-1, default 1
  ambientVolume?: number;   // 0-1, default 0.5
  fadeDuration?: number;    // ms, default 1000
}

type SoundCategory = 'music' | 'sfx' | 'ambient';

class AudioManager {
  constructor(config?: AudioConfig);

  // Sound loading
  load(id: string, url: string, category: SoundCategory, options?: {
    loop?: boolean;
    sprite?: Record<string, [number, number]>;  // for sprite sheets
  }): Promise<void>;

  // Playback
  play(id: string, spriteId?: string): number;  // returns sound ID
  stop(id: string, fadeOut?: boolean): void;
  pause(id: string): void;
  resume(id: string): void;

  // Volume (0-1)
  setMasterVolume(v: number): void;
  setMusicVolume(v: number): void;
  setSFXVolume(v: number): void;
  setAmbientVolume(v: number): void;

  // Fades
  fadeIn(id: string, duration?: number): void;
  fadeOut(id: string, duration?: number): void;

  // State transitions (convenience)
  transitionToGame(): void;    // Fade out menu music
  transitionToMenu(): void;    // Fade in menu music

  // Spatial (phase 2+)
  setPosition(soundInstanceId: number, x: number, y: number, z: number): void;
  setListenerPosition(x: number, y: number, z: number): void;

  // Cleanup
  unload(id: string): void;
  dispose(): void;
}
```

### ECS Integration

**Phase 1**: AudioManager is global, owned by Game:
```typescript
class Game {
  readonly audio: AudioManager;
}
```

**Phase 2+**: Add optional SoundEmitter component for spatial sounds:
```typescript
class SoundEmitter implements Component {
  static readonly type = 'SoundEmitter';
  constructor(
    public soundId: string,
    public trigger: 'loop' | 'once' | 'on-move' | 'random',
    public volume: number = 1,
    public radius: number = 10,
    public randomInterval?: [number, number]  // min/max ms for random trigger
  ) {}
}
```

**SoundSystem** (phase 2+):
```typescript
class SoundSystem implements System {
  update(world: World, delta: number): void {
    // Update listener position from player
    // Trigger sounds based on SoundEmitter.trigger
    // Handle spatial positioning
  }
}
```

### Integration Points

**Game.init()** - Load sounds:
```typescript
await this.audio.load('menu-music', '/audio/music/menu.mp3', 'music', { loop: true });
```

**TitleScreen.show()** - Play menu music:
```typescript
game.audio.play('menu-music');
```

**onNewGame/onContinue** - Fade out:
```typescript
sceneManager.onNewGame(async () => {
  game.audio.transitionToGame();
  // ...
});
```

**Player movement** (phase 2):
```typescript
// In movement system, when player moves
if (isMoving) {
  game.audio.play('footstep');
}
```

## Implementation Phases

### Phase 1: Menu Music (this PR)
1. `npm install howler`
2. Create `AudioManager.ts` with basic music support
3. Add to Game, wire scene transitions
4. Add `menu.mp3` to `public/audio/music/`

### Phase 2: Sound Effects
1. Add SFX loading/playback
2. Add SoundEmitter component
3. Create SoundSystem for triggered sounds
4. Footsteps, interaction sounds

### Phase 3: Ambient Audio
1. Add ambient category with separate volume
2. Random/interval-based triggers
3. Environmental sounds (wind, animals)

### Phase 4: Spatial Audio
1. Enable Howler's spatial audio
2. Update listener position from camera/player
3. Position-based sound falloff

## Consequences

### Positive
- Battle-tested library (Howler.js)
- Grows with needs (spatial audio ready when needed)
- Clean ECS integration path for phase 2+
- Volume categories for player settings
- MIT license, no concerns

### Negative
- External dependency (but small and stable)
- Spatial audio adds complexity (defer to phase 4)

## References
- [Howler.js GitHub](https://github.com/goldfire/howler.js)
- [Howler.js Docs](https://howlerjs.com/)
