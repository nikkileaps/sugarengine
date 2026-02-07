# Sugarengine API Overview

Sugarengine is a lightweight, browser-compatible Three.js-based game engine for creating cozy isometric 3D narrative games. It focuses on storytelling, exploration, and quests without combat mechanics.

## Architecture

The engine uses an **Entity-Component-System (ECS)** architecture for maximum flexibility:

- **Entities**: Simple numeric IDs that serve as containers
- **Components**: Pure data containers (Position, Velocity, NPC, etc.)
- **Systems**: Logic that operates on entities with specific components

## Core Modules

| Module | Description |
|--------|-------------|
| `SugarEngine` | Main engine class - rendering, input, region loading |
| `World` | ECS world managing entities, components, and systems |
| `DialogueManager` | Branching dialogue trees with choices |
| `QuestManager` | Multi-stage quests with objectives |
| `InventoryManager` | Item collection and management |
| `InspectionManager` | Examine world objects (newspapers, signs, lore) |
| `SaveManager` | Save/load with multiple storage backends |
| `SceneManager` | Title screen, pause menu, save/load screens |
| `WorldStateEvaluator` | Unified condition evaluation across all systems |
| `FlagsManager` | Typed key-value flags with change notification |

## Quick Start

```typescript
import { SugarEngine } from './core/Engine';
import { QuestManager } from './quests/QuestManager';
import { InventoryManager } from './inventory/InventoryManager';
import { DialogueManager } from './dialogue/DialogueManager';
import { SaveManager } from './save/SaveManager';
import { SceneManager } from './scenes/SceneManager';

// 1. Get container element
const container = document.getElementById('app')!;

// 2. Create engine
const engine = new SugarEngine({
  container,
  camera: {
    style: 'isometric',
    zoom: { min: 5, max: 30, default: 15 }
  }
});

// 3. Create managers
const dialogue = new DialogueManager(container);
const quests = new QuestManager();
const inventory = new InventoryManager();
const saveManager = new SaveManager();
const scenes = new SceneManager(container);

// 4. Initialize
await inventory.init();
await saveManager.init();
saveManager.setGameSystems(engine, quests, inventory);
scenes.setGameSystems(engine, saveManager);

// 5. Load initial region
await engine.loadRegion('/regions/starting-area/');

// 6. Start the game loop
engine.run();
```

## Data-Driven Design

Game content is defined in JSON files:

```
public/
├── dialogue/       # Dialogue trees (*.json)
├── items/          # Item definitions (items.json)
├── quests/         # Quest definitions (*.json)
└── regions/        # Region data and geometry
    └── my-region/
        ├── map.json      # NPCs, triggers, lighting
        └── geometry.glb  # 3D models
```

## Event-Driven Communication

Systems communicate through callbacks:

```typescript
// React to player interactions
engine.onInteract((npcId, dialogueId) => {
  quests.triggerObjective('talk', npcId);
  if (dialogueId) dialogue.start(dialogueId);
});

// React to trigger zones
engine.onTriggerEnter((event, triggerId) => {
  if (event.type === 'transition') {
    engine.loadRegion(event.target);
  }
});

// React to quest events
quests.setOnQuestComplete((event) => {
  saveManager.autoSave('quest-complete');
});
```

## Platform Support

- **Browser**: Works in any modern browser with WebGL
- **Desktop**: Optional Tauri wrapper for native apps

The save system automatically detects the platform and uses the appropriate storage backend (localStorage for browser, filesystem for Tauri).

## Next Steps

- [Engine API](./02-engine.md) - Core engine methods
- [ECS API](./03-ecs.md) - Entity-Component-System
- [Components](./04-components.md) - Available components
- [Systems](./05-systems.md) - Built-in systems
- [Dialogue System](./06-dialogue.md) - Branching dialogue
- [Quest System](./07-quests.md) - Quest management
- [Inventory System](./08-inventory.md) - Item management
- [Save System](./09-save.md) - Save/load functionality
- [Scene Management](./10-scenes.md) - UI screens
- [Data Formats](./11-data-formats.md) - JSON file formats
- [Inspection System](./12-inspection.md) - Examining world objects
- [NPC System](./013-npc.md) - NPC behavior trees and beat graph actions
- [World State](./014-world-state.md) - Unified conditions, flags, and state notifications
