# ADR 007: Animation Architecture

## Status
Accepted

## Context
Sugar Engine needs animation to make the game world feel alive. Animation encompasses many different types of motion—from character locomotion to environmental ambiance to interactive props. Without clear boundaries, animation systems tend to become sprawling and difficult to maintain.

We need to define:
- What types of animation exist
- Where each type is authored
- Where each type is executed
- How parameters flow between systems

## Decision

### Three-Tier Animation Architecture

Animation lives in three places, organized by **type and authorship**, not by asset:

#### 1. SugarEngine (Runtime)
**Purpose:** Play animations and drive procedural motion at runtime.

**Owns:**
- Animation playback and blending
- State machines for animation transitions
- Procedural/shader-based motion
- Global parameters (time, wind, weather)

**Handles:**
- Character locomotion (idle/walk/run) - playing clips
- Camera movement
- Interactive prop responses
- Environmental motion driven by time or gameplay
- Shader-based effects (glow, sway, flicker, ripples)

**Does NOT:**
- Author animations
- Contain animation editing UI
- Store keyframes
- Try to be a DCC tool

#### 2. External Tools (Blender, etc.)
**Purpose:** Author skeletal animations that require intention, timing, or acting.

**Used for:**
- Character rigs and body movement
- Facial expressions and hand poses
- Emotes and gestures
- Cutscene-worthy motion
- Anything with emotional weight or story meaning

**Exports:**
- glTF/GLB format
- Named clips (idle, walk, turn, gesture)
- Clean, neutral base loops

**SugarEngine then:**
- Loads the clips
- Blends them (crossfade, additive)
- Layers them (upper body, lower body, overrides)

#### 3. Level Builder / Editor
**Purpose:** Author parameters that control how alive a place feels.

**Configures:**
- Wind strength and direction
- Grass sway intensity
- Lamp flicker speed and intensity
- Water ripple amplitude
- Ambient motion presets

**Authors parameters, NOT keyframes:**
```yaml
# Good - parametric
environment:
  windStrength: 0.4
  windGustiness: 0.7
  lampGlowIntensity: 0.8

# Bad - keyframed
animation:
  frame1: { lampBrightness: 0.8 }
  frame12: { lampBrightness: 0.85 }
```

### Procedural vs Authored (The Real Axis)

**Procedural/Shader-based (SugarEngine)**
Perfect for:
- Grass waving
- Tree/foliage motion
- Cloth-ish movement on props
- Fire, smoke, fog effects
- Water surfaces
- Lamp glow pulsing
- Candle flickering
- Idle "alive" motion

Driven by:
- Time
- Noise functions
- World position
- Wind fields
- Camera distance (LOD)

This should **never** be baked or exported per-asset.

**Authored (External Tools)**
Required for:
- Characters and creatures
- Anything emotional or narrative
- Anything readable at a glance
- Anything with weight or timing
- Cutscenes

If it has **intent, timing, or story meaning**, it's authored externally.

### Decision Heuristic

Ask: "Could this motion vary per-scene, per-weather, or per-time-of-day?"

- **Yes** → Procedural (SugarEngine) or builder parameters
- **No** → Authored (Blender)

### Implementation: Shader-Based Environmental Animation

For procedural environmental effects, we use shader injection:

1. **Global Uniforms** - Engine provides time, wind, weather to all shaders
2. **Material Convention** - Materials opt-in via naming or metadata
3. **Shader Chunks** - Reusable GLSL snippets for common effects
4. **Parameter Binding** - Region/scene parameters flow to uniforms

Example effects:
- `emissive_glow` - Soft pulsing emission (lamps, signs)
- `emissive_flicker` - Fast irregular emission (candles, fire)
- `vertex_wind` - World-space vertex displacement (foliage, flags)
- `vertex_sway` - Gentle swaying motion (hanging signs, chains)

## Consequences

### Positive
- Clear ownership prevents sprawl
- Procedural effects are lightweight and infinitely variable
- Artists use familiar tools for complex animation
- Parameters are designer-friendly
- Effects automatically respond to weather/time-of-day

### Negative
- Requires shader knowledge for new effect types
- Some effects may need both authored and procedural components
- Material naming conventions must be documented and followed

### Neutral
- Characters will always need external animation authoring
- Editor gains environmental parameter UI over time

## Implementation Notes

### Phase 1: Foundation
- [ ] Lamp glow effect (emissive pulsing)
- [ ] Global time uniform injection
- [ ] Material identification system

### Phase 2: Environmental Motion
- [ ] Foliage wind effect (vertex displacement)
- [ ] Candle/shrine flicker effect
- [ ] Wind parameter system

### Phase 3: Integration
- [ ] Region-level environment parameters in editor
- [ ] Time-of-day parameter variation
- [ ] Weather system hooks
