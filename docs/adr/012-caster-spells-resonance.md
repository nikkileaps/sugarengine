# ADR-012: Caster, Spells & Resonance System

## Status

Accepted

## Context

The game needs a magic system that feels dynamic and encourages strategic play. Rather than a simple "mana bar" approach, we wanted a system where:

1. Resource management creates interesting decisions
2. Risk/reward mechanics add tension
3. Players can mitigate risk through gameplay actions

## Decision

We implemented a three-part magic system:

### Caster
- The player has a single **caster device** - an interface to a dragon bone shard
- The shard is the source of magic; the caster translates human commands into frequencies that vibrate the shard
- Has a **battery** (0-100%) that powers spells
- Battery recharges slowly via **trickle charge from ambient magic** (the background frequency that the whole world emanates)
- Recharge rate is configured in **% per minute** (default: 1% per minute - very slow)
- Can restrict which spell tags are allowed/blocked

### Spells
- Defined with: name, description, battery cost, tags, effects, and chaos effects
- Effects can trigger events, dialogues, world flags, or (future) damage/healing
- Accessed via full-screen menu (C key)

### Resonance
- Charge meter (0-100%) that **does NOT build automatically**
- Players must visit **resonance points** in the world and engage with a resonance mechanic to increase it
- **Stabilizes spells** by reducing chaos chance when casting
- Consumed entirely when casting (use it or lose it)

### Chaos Mechanic

The key innovation is the **chaos system**. Lower battery increases the chance a spell misbehaves:

| Battery Level | Tier | Base Chaos Chance |
|--------------|------|-------------------|
| 75-100% | Full | 0% |
| 25-74% | Unstable | 40% |
| 1-24% | Critical | 80% |
| 0% | Empty | Cannot cast |

Resonance reduces chaos chance by up to 80%:

```
finalChaosChance = baseChaosChance * (1 - (resonance / 100) * 0.8)
```

Example outcomes:
- 50% battery + 0% resonance = 40% chaos chance
- 50% battery + 100% resonance = 8% chaos chance
- 15% battery + 50% resonance = 48% chaos chance

When chaos triggers, the spell's `chaosEffects` execute instead of normal `effects`.

## File Structure

```
src/engine/
├── caster/
│   ├── index.ts           # Exports
│   ├── types.ts           # PlayerCasterConfig, SpellDefinition, etc.
│   ├── CasterManager.ts   # Spell registration and casting logic
│   └── SpellLoader.ts     # Loading utilities
├── components/
│   └── Caster.ts          # ECS component for player caster state
├── systems/
│   └── CasterSystem.ts    # ECS system for battery recharge
├── ui/
│   ├── SpellMenuUI.ts     # Full-screen spell selection
│   └── CasterHUD.ts       # Battery/resonance display
```

## Architecture

The caster system uses ECS (Entity Component System) architecture:

- **Caster component**: Attached to the player entity, stores battery, resonance, recharge rate, and spell restrictions
- **CasterSystem**: Per-frame system that handles battery recharge (resonance is NOT automatic)
- **CasterManager**: Handles spell registration, casting logic, and chaos resolution

## Integration Points

- **Game.ts**: CasterManager as `game.caster`, CasterSystem added to ECS world
- **SaveManager**: Caster state (battery, resonance) persisted in saves
- **InputManager**: C key added for spell menu toggle
- **Engine**: `isSpellMenuPressed()` method exposed, `getPlayerEntity()` for ECS access

## Data Format

Player caster config and spells are defined in project JSON:

```json
{
  "playerCaster": {
    "initialBattery": 100,
    "rechargeRate": 1,
    "initialResonance": 0,
    "allowedSpellTags": ["basic", "light"]
  },
  "spells": [{
    "id": "light",
    "name": "Light",
    "description": "Illuminate the darkness",
    "icon": "✨",
    "tags": ["basic", "light"],
    "batteryCost": 5,
    "effects": [{ "type": "event", "eventName": "spell:light" }],
    "chaosEffects": [{ "type": "event", "eventName": "spell:darkness" }]
  }]
}
```

### PlayerCasterConfig Fields

| Field | Type | Description |
|-------|------|-------------|
| `initialBattery` | number | Starting battery % (0-100) for the episode |
| `rechargeRate` | number | Battery % per minute (slow trickle from ambient magic) |
| `initialResonance` | number | Starting resonance % (0-100) for the episode |
| `allowedSpellTags` | string[] | Only these spell tags can be cast (optional) |
| `blockedSpellTags` | string[] | These spell tags cannot be cast (optional) |
```

## Consequences

### Positive
- Creates meaningful resource management decisions
- Risk/reward adds tension to low-battery casting
- Resonance rewards exploration and engagement with resonance points
- Chaos effects enable narrative opportunities (spells going wrong)
- System is extensible (new effect types, spell restrictions)
- Slow battery recharge (% per minute) makes resource management meaningful
- Dragon bone shard lore adds flavor to the magic system

### Negative
- More complex than simple mana system
- Requires balancing chaos rates and resonance availability
- Players may find chaos frustrating if not tuned well
- Resonance points need to be placed thoughtfully in level design

### Neutral
- Spell effects are currently limited (event, dialogue, world-flag)
- Health/damage effects stubbed but not implemented (no health system yet)
- Resonance point interaction mechanic not yet implemented

## Editor Integration

The editor provides visual UI for configuring the player caster and creating spells.

### Editor Tabs

Two tabs handle the magic system:

1. **Player** (icon: `👤`) - Configure player caster settings (battery, resonance, spell restrictions)
2. **Spells** (icon: `✨`) - List and edit spell definitions

### Store Additions

```typescript
// useEditorStore.ts additions
export interface PlayerCasterData {
  initialBattery: number;        // Starting battery % (0-100)
  rechargeRate: number;          // Battery % per minute
  initialResonance?: number;     // Starting resonance % (0-100)
  allowedSpellTags?: string[];
  blockedSpellTags?: string[];
}

export interface SpellEffectData {
  type: 'event' | 'unlock' | 'world-flag' | 'dialogue' | 'heal' | 'damage';
  eventName?: string;
  flagName?: string;
  flagValue?: boolean | string | number;
  dialogueId?: string;
  amount?: number;
}

export interface SpellData {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tags: string[];
  batteryCost: number;
  effects: SpellEffectData[];
  chaosEffects?: SpellEffectData[];
}

// State additions
playerCaster: PlayerCasterData | null;
spells: SpellData[];
setPlayerCaster: (playerCaster: PlayerCasterData | null) => void;
setSpells: (spells: SpellData[]) => void;
```

### Editor Files

```
src/editor/panels/
├── player/
│   ├── index.ts              # Exports
│   └── PlayerPanel.tsx       # Player caster settings (render props pattern)
├── magic/
│   ├── index.ts              # Exports
│   ├── MagicPanel.tsx        # Spells-only panel
│   ├── SpellList.tsx         # Left panel spell list
│   ├── SpellDetail.tsx       # Center panel spell editor
│   ├── SpellInspector.tsx    # Right panel spell properties
│   └── SpellEffectEditor.tsx # Reusable effect editor component
```

### Player Panel UI

The Player panel configures the caster for the current episode:

**Battery Section:**
- Initial Battery slider (0-100%) - starting charge when episode begins
- Recharge Rate slider (0-10% per minute) - slow trickle from ambient magic

**Resonance Section:**
- Initial Resonance slider (0-100%) - starting resonance when episode begins
- Note: Resonance does not build automatically; players must visit resonance points

**Spell Restrictions Section:**
- Allowed Spell Tags input (comma-separated)
- Blocked Spell Tags input (comma-separated)

### Spell Editor UI

**Spell Editor (center panel):**
- Icon picker (emoji selector or text input)
- Name text input
- Description textarea
- Battery Cost slider (0-100)
- Tags input (comma-separated or chips)
- Effects section with add/remove buttons
- Chaos Effects section (what happens on misfire)

**Effect Editor (inline component):**
- Type dropdown: event, dialogue, world-flag, unlock, heal, damage
- Type-specific fields based on selection

## Future Considerations

1. **Resonance points**: Implement world objects (triggers/inspectables) that increase resonance when players interact with them
2. **Resonance mechanic**: Design the actual minigame/interaction at resonance points
3. **Visual feedback**: Spell casting animations, chaos visual effects, battery/resonance UI effects
4. **Sound effects**: Casting sounds, chaos failure sounds, ambient magic hum
5. **Spell preview**: Test cast spells directly from editor
6. **Tag management**: Dedicated UI for managing spell tags across the project
7. **Dragon bone lore**: Expose lore/flavor text about the shard and ambient magic in the UI
