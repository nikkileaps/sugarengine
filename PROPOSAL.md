# Sugarengine - Project Proposal

## Overview

Sugarengine is a lightweight, reusable Three.js-based game engine for cozy isometric 3D games focused on storytelling, exploration, and quests - no combat.

The engine is designed to power **multiple games**, with **Rackwick City** as the first title. It consumes maps exported from **Sugarbuilder** (the world/map editor) and provides the runtime systems needed to turn those maps into playable games.

## Design Philosophy

- **Cozy, not complex** - No combat systems, damage calculations, or AI combat behavior
- **Story-first** - Dialogue, quests, and narrative are the core mechanics
- **Lightweight runtime** - No editor UI, no React, just Three.js and game logic
- **Data-driven** - Maps, dialogue, and quests defined in JSON/data files
- **Separation of concerns** - Sugarbuilder builds worlds, Sugarengine runs games
- **Multi-game architecture** - Engine is reusable, games are just content packages
- **ECS architecture** - Entity-Component-System for flexible, composable game objects

## Core Systems

### 1. Map Loader
- Import optimized geometry from Sugarbuilder exports
- Load spawn points, NPC markers, trigger zones
- Set up collision/walkable areas

### 2. Player Controller
- Fixed isometric camera that follows player (bounded zoom)
- WASD + controller support (gamepad/PlayStation)
- Movement constrained to walkable areas
- Simple collision with world geometry

### 3. NPC System
- Load NPC definitions (name, appearance, schedule)
- Simple pathfinding on walkable areas
- Daily schedules (NPC goes to market in morning, home at night)
- Interaction trigger (click NPC → start dialogue)

### 4. Dialogue System
- Branching conversation trees
- Player choices that affect story state
- Portrait/emotion display
- Typewriter text effect (cozy!)

### 5. Quest System
- Quest state machine (not_started → in_progress → complete)
- Objectives tracking
- Quest triggers (talk to NPC, enter area, collect item)
- Journal/log UI

### 6. Inventory System
- Simple item collection (quest items, gifts, keys)
- Give item to NPC mechanic
- No stats, no equipment - just narrative items

### 7. Trigger Zones
- Invisible collision boxes placed in Sugarbuilder
- Fire events: start dialogue, update quest, play sound, transition map

### 8. Game State & Save/Load
- Track quest progress, inventory, NPC relationships
- Save to localStorage or file
- Load and restore full game state

### 9. Audio
- Ambient background music per area
- Sound effects for interactions
- Probably Howler.js or similar

## ECS Architecture

Sugarengine uses an **Entity-Component-System** pattern for game objects:

### Entities
- Just an ID (number or string)
- No data, no behavior - just a unique identifier
- Examples: player, NPC, trigger zone, item pickup

### Components
- Pure data, no logic
- Attached to entities to give them properties
- Examples:
  - `Position { x, y, z }`
  - `Renderable { mesh, visible }`
  - `NPC { name, dialogueId, schedule }`
  - `TriggerZone { bounds, eventType }`
  - `Inventory { items[] }`
  - `QuestState { questId, status, objectives }`

### Systems
- Logic that operates on entities with specific components
- Run each frame (or on events)
- Examples:
  - `MovementSystem` - updates Position based on input
  - `RenderSystem` - syncs Position to Three.js meshes
  - `TriggerSystem` - checks player overlap with TriggerZone
  - `DialogueSystem` - handles conversation flow
  - `ScheduleSystem` - moves NPCs based on time of day

### Why ECS?
- **Composable**: Mix and match components to create new entity types
- **Data-driven**: Entity definitions can live in JSON files
- **Testable**: Systems are pure functions, easy to unit test
- **Performant**: Systems can batch-process entities efficiently
- **Flexible**: Add new behaviors without modifying existing code

### Example Entity Definitions
```json
{
  "entities": [
    {
      "id": "player",
      "components": {
        "Position": { "x": 0, "y": 0, "z": 0 },
        "Renderable": { "model": "player.glb" },
        "PlayerControlled": {},
        "Inventory": { "items": [] }
      }
    },
    {
      "id": "baker-tom",
      "components": {
        "Position": { "x": 5, "y": 0, "z": 3 },
        "Renderable": { "model": "baker.glb" },
        "NPC": { "name": "Tom", "dialogueId": "baker-tom-default" },
        "Schedule": { "morning": "bakery", "evening": "home" }
      }
    }
  ]
}
```

## Multi-Game Architecture

Sugarengine separates **engine code** (reusable systems) from **game content** (data that defines a specific game).

### Project Structure

```
sugarengine/                 # The engine (this repo)
├── src/
│   ├── core/                # Engine, game loop, input
│   ├── ecs/                 # ECS framework
│   │   ├── World.ts         # Entity manager, system runner
│   │   ├── Entity.ts        # Entity type/helpers
│   │   └── System.ts        # Base system class
│   ├── components/          # Component definitions
│   ├── systems/             # Movement, render, triggers, dialogue, etc.
│   ├── loaders/             # Map loading, asset loading
│   └── ui/                  # Dialogue boxes, inventory, journal
├── package.json
└── ...

rackwick-city/               # A game using the engine
├── maps/                    # Exported from Sugarbuilder
│   ├── town-square/
│   │   ├── geometry.glb
│   │   └── map.json
│   └── bakery/
├── dialogue/                # Conversation JSON files
├── quests/                  # Quest definitions
├── npcs/                    # NPC definitions and schedules
├── audio/                   # Music and sound effects
└── game.json                # Game config (start map, title, etc.)

another-cozy-game/           # Another game, same engine
├── maps/
├── dialogue/
└── game.json
```

### Usage

Games import and configure the engine:

```ts
import { SugarEngine } from 'sugarengine';

const game = new SugarEngine({
  contentPath: './rackwick-city/',
  startMap: 'town-square',
  camera: {
    style: 'isometric',
    zoom: { min: 0.5, max: 2.0, default: 1.0 }
  }
});

game.run();
```

### What the Engine Provides
- All core systems (rendering, input, audio, save/load)
- Dialogue, quest, NPC, and trigger systems
- UI components (dialogue box, inventory, journal)
- Map and asset loading

### What Games Provide
- Maps exported from Sugarbuilder
- Dialogue trees (JSON)
- Quest definitions (JSON)
- NPC definitions and schedules (JSON)
- Audio assets
- Game-specific configuration

## Tech Stack

### Core Engine (Browser-Compatible)
- **Three.js** - 3D rendering (same as Sugarbuilder for compatibility)
- **TypeScript** - Type safety
- **Vite** - Build tool (fast, simple)
- **No React** - Pure game runtime, no UI framework overhead
- **Simple HTML/CSS** - For dialogue boxes, inventory UI, etc.

### Native Wrapper (Optional)
- **Tauri** - Native app shell (no web console, native dialogs, clean distribution)
- **Rust** - Asset generation, preprocessing, build-time computation only

### Important Constraint
The core engine must remain **100% browser-compatible**. Rust/Tauri features are for:
- Development tooling (asset pipelines, map preprocessing)
- Native distribution (standalone app without browser chrome)
- Native dialogs (file pickers, save dialogs)

Rust code **cannot** be part of the game runtime - it won't exist when running in a browser. Any computation that happens at runtime must be TypeScript.

## Import Format from Sugarbuilder

Sugarbuilder will need an "Export for Game" feature that outputs:

```
my-map/
├── geometry.glb          # Optimized merged mesh (or JSON)
├── map.json              # Metadata: spawn points, triggers, NPC markers
└── navmesh.json          # Walkable area data (optional, could derive from ground)
```

### map.json structure (draft)
```json
{
  "name": "town-square",
  "playerSpawn": { "x": 0, "y": 0, "z": 0 },
  "npcs": [
    {
      "id": "baker-tom",
      "position": { "x": 5, "y": 0, "z": 3 },
      "dialogue": "baker-tom-default"
    }
  ],
  "triggers": [
    {
      "id": "enter-bakery",
      "type": "box",
      "bounds": { "min": [10, 0, 5], "max": [12, 2, 8] },
      "event": { "type": "transition", "target": "bakery-interior" }
    }
  ]
}
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Project setup (Vite + TypeScript + Three.js)
- [ ] Basic scene with fixed isometric camera (bounded zoom)
- [ ] Load a test .glb or Sugarbuilder export
- [ ] Player cube that moves with WASD + controller support

### Phase 2: World Interaction
- [ ] Trigger zone system
- [ ] Map transitions
- [ ] NPC placeholders (static meshes you can click)

### Phase 3: Dialogue
- [ ] Dialogue data format
- [ ] Dialogue UI (text box, choices)
- [ ] Branching conversation flow
- [ ] Story state variables

### Phase 4: Quests
- [ ] Quest definition format
- [ ] Quest state tracking
- [ ] Objectives and completion
- [ ] Journal UI

### Phase 5: Polish
- [ ] NPC schedules and pathfinding
- [ ] Inventory system
- [ ] Audio integration
- [ ] Save/load game state

## Parallel Work in Sugarbuilder

To support Sugarengine, Sugarbuilder will need:

1. **Export for Game** button - outputs optimized .glb + map.json
2. **NPC Marker tool** - place spawn points for NPCs
3. **Trigger Zone tool** - draw invisible boxes that fire events
4. **Player Spawn marker** - where player starts

These are just data authoring tools - no game logic in Sugarbuilder.

## Open Questions

1. ~~**Movement style**~~ **Decided: WASD + controller** (no click-to-move)
2. ~~**Camera**~~ **Decided: Fixed isometric with bounded zoom** (no rotation)
3. **NPC visuals** - 3D models, 2D sprites, or stylized low-poly?
4. **Dialogue format** - Custom JSON, Ink, Yarn Spinner, or other?
5. **Map transitions** - Fade to black, or seamless streaming?

## Getting Started

```bash
cd /Users/nikki/projects/sugarengine
npm create vite@latest . -- --template vanilla-ts
npm install three @types/three
npm run dev
```

Then we build from there!
