# Data Formats Reference

All game content is defined in JSON files. This document consolidates all data formats.

## Directory Structure

```
public/
├── dialogue/           # Dialogue trees
│   └── {dialogueId}.json
├── inspections/        # Inspection content (newspapers, signs, lore)
│   └── {inspectionId}.json
├── items/              # Item definitions
│   └── items.json
├── quests/             # Quest definitions
│   └── {questId}.json
├── models/             # 3D models (GLTF/GLB)
│   └── {modelName}.glb
└── regions/            # Region data
    └── {regionName}/
        ├── map.json        # Region metadata
        └── geometry.glb    # 3D geometry
```

## Region Format

**Location**: `/public/regions/{regionName}/map.json`

```typescript
interface RegionData {
  version: number;
  name: string;
  playerSpawn: Position;
  lighting?: LightingDefinition;
  postProcessing?: PostProcessingDefinition;
  npcs: NPCDefinition[];
  triggers: TriggerDefinition[];
  pickups?: PickupDefinition[];
  inspectables?: InspectableDefinition[];
}
```

### Position

```typescript
interface Position {
  x: number;
  y: number;
  z: number;
}
```

### NPCDefinition

```typescript
interface NPCDefinition {
  id: string;              // Unique NPC identifier
  position: Position;      // Spawn position
  dialogue?: string;       // Dialogue tree ID
  model?: string;          // Model path (optional override)
  movement?: NPCMovementDefinition;
}

interface NPCMovementDefinition {
  behavior: 'patrol' | 'ping-pong' | 'one-way';
  speed?: number;          // Default: 2
  waypoints: WaypointDefinition[];
}

interface WaypointDefinition {
  x: number;
  y: number;
  z: number;
  pauseDuration?: number;  // Seconds to pause
}
```

### TriggerDefinition

```typescript
interface TriggerDefinition {
  id: string;
  type: 'box';
  bounds: {
    min: [number, number, number];  // [x, y, z]
    max: [number, number, number];
  };
  event: TriggerEvent;
}

interface TriggerEvent {
  type: string;            // 'transition', 'quest', or custom
  target?: string;         // Target region for transitions
  [key: string]: unknown;  // Additional custom data
}
```

### PickupDefinition

```typescript
interface PickupDefinition {
  id: string;              // Unique pickup instance ID
  itemId: string;          // Item definition ID
  position: Position;
  quantity?: number;       // Default: 1
}
```

### InspectableDefinition

```typescript
interface InspectableDefinition {
  id: string;              // Unique inspectable instance ID
  position: Position;
  inspectionId: string;    // Reference to inspection content file
  promptText?: string;     // Custom interaction prompt (default: "Inspect")
}
```

### LightingDefinition

```typescript
interface LightingDefinition {
  preset: string;
  backgroundColor: number;     // Hex color (e.g., 0x87CEEB)
  lights: LightDefinition[];
  fog: FogDefinition;
  adjustments: LightingAdjustments;
}

interface LightDefinition {
  type: 'hemisphere' | 'directional' | 'ambient' | 'point';
  color?: number;              // Hex color
  groundColor?: number;        // For hemisphere lights
  intensity?: number;
  position?: [number, number, number];
  castShadow?: boolean;
}

interface FogDefinition {
  enabled: boolean;
  color: number;               // Hex color
  density: number;
}

interface LightingAdjustments {
  ambientIntensity: number;
  keyIntensity: number;
  shadowDarkness: number;
  warmth: number;
}
```

### PostProcessingDefinition

```typescript
interface PostProcessingDefinition {
  bloom?: BloomDefinition;
}

interface BloomDefinition {
  enabled: boolean;
  threshold: number;
  strength: number;
  radius: number;
}
```

### Example Region

```json
{
  "version": 1,
  "name": "Village Square",
  "playerSpawn": { "x": 0, "y": 0, "z": 0 },
  "lighting": {
    "preset": "daylight",
    "backgroundColor": 8900331,
    "lights": [
      {
        "type": "hemisphere",
        "color": 16777215,
        "groundColor": 4473924,
        "intensity": 0.6
      },
      {
        "type": "directional",
        "color": 16777200,
        "intensity": 1.0,
        "position": [5, 10, 5],
        "castShadow": true
      }
    ],
    "fog": {
      "enabled": true,
      "color": 13158600,
      "density": 0.02
    },
    "adjustments": {
      "ambientIntensity": 0.4,
      "keyIntensity": 1.0,
      "shadowDarkness": 0.3,
      "warmth": 0.1
    }
  },
  "npcs": [
    {
      "id": "shopkeeper",
      "position": { "x": 5, "y": 0, "z": 3 },
      "dialogue": "shopkeeper-dialogue"
    },
    {
      "id": "guard",
      "position": { "x": -3, "y": 0, "z": 0 },
      "dialogue": "guard-dialogue",
      "movement": {
        "behavior": "patrol",
        "speed": 2,
        "waypoints": [
          { "x": -3, "y": 0, "z": 0, "pauseDuration": 3 },
          { "x": 3, "y": 0, "z": 0, "pauseDuration": 3 },
          { "x": 3, "y": 0, "z": 6, "pauseDuration": 3 },
          { "x": -3, "y": 0, "z": 6, "pauseDuration": 3 }
        ]
      }
    }
  ],
  "triggers": [
    {
      "id": "to-forest",
      "type": "box",
      "bounds": {
        "min": [8, 0, -2],
        "max": [10, 3, 2]
      },
      "event": {
        "type": "transition",
        "target": "/regions/forest/"
      }
    },
    {
      "id": "shop-zone",
      "type": "box",
      "bounds": {
        "min": [4, 0, 2],
        "max": [8, 3, 6]
      },
      "event": {
        "type": "location",
        "name": "shop"
      }
    }
  ],
  "pickups": [
    {
      "id": "coin-1",
      "itemId": "gold-coin",
      "position": { "x": 2, "y": 0.5, "z": 4 },
      "quantity": 5
    }
  ]
}
```

## Dialogue Format

**Location**: `/public/dialogue/{dialogueId}.json`

```typescript
interface DialogueTree {
  id: string;
  startNode: string;
  nodes: DialogueNode[];
}

interface DialogueNode {
  id: string;
  speaker?: string;
  text: string;
  choices?: DialogueChoice[];
  next?: string;
  onEnter?: string;
}

interface DialogueChoice {
  text: string;
  next: string;
  condition?: string;
}
```

### Example Dialogue

```json
{
  "id": "shopkeeper-dialogue",
  "startNode": "greeting",
  "nodes": [
    {
      "id": "greeting",
      "speaker": "Shopkeeper",
      "text": "Welcome! What can I do for you?",
      "choices": [
        { "text": "What do you sell?", "next": "wares" },
        { "text": "Heard any rumors?", "next": "rumors" },
        { "text": "Goodbye", "next": "farewell" }
      ]
    },
    {
      "id": "wares",
      "speaker": "Shopkeeper",
      "text": "I have bread, potions, and various supplies.",
      "next": "greeting"
    },
    {
      "id": "rumors",
      "speaker": "Shopkeeper",
      "text": "Strange lights in the forest... be careful out there.",
      "onEnter": "heard-rumor",
      "next": "greeting"
    },
    {
      "id": "farewell",
      "speaker": "Shopkeeper",
      "text": "Come back soon!"
    }
  ]
}
```

## Quest Format

**Location**: `/public/quests/{questId}.json`

```typescript
interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  startStage: string;
  stages: QuestStage[];
  rewards?: QuestReward[];
  repeatable?: boolean;
}

interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  onComplete?: string;
  next?: string;
}

interface QuestObjective {
  id: string;
  type: 'talk' | 'location' | 'collect' | 'trigger' | 'custom';
  description: string;
  target?: string;
  count?: number;
  current?: number;
  completed: boolean;
  optional?: boolean;
}

interface QuestReward {
  type: 'xp' | 'item' | 'currency' | 'custom';
  id?: string;
  amount?: number;
  data?: Record<string, unknown>;
}
```

### Example Quest

```json
{
  "id": "gathering-herbs",
  "name": "Herb Gathering",
  "description": "Collect herbs for the healer.",
  "startStage": "collect",
  "stages": [
    {
      "id": "collect",
      "description": "Gather medicinal herbs",
      "objectives": [
        {
          "id": "herbs",
          "type": "collect",
          "description": "Collect herbs (0/5)",
          "target": "herb",
          "count": 5,
          "current": 0,
          "completed": false
        }
      ],
      "next": "deliver"
    },
    {
      "id": "deliver",
      "description": "Return to the healer",
      "objectives": [
        {
          "id": "talk-healer",
          "type": "talk",
          "description": "Speak to the Healer",
          "target": "healer-npc",
          "completed": false
        }
      ],
      "onComplete": "herbs-delivered"
    }
  ],
  "rewards": [
    { "type": "item", "id": "health-potion", "amount": 3 },
    { "type": "currency", "id": "gold", "amount": 50 }
  ]
}
```

## Inspection Format

**Location**: `/public/inspections/{inspectionId}.json`

Inspections support two formats: simple (for signs/plaques) and rich (for newspapers/magazines).

### Simple Format

```typescript
interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
}
```

### Rich Format (with sections)

```typescript
interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  headerImage?: string;
  sections: InspectionSection[];
}

interface InspectionSection {
  headline?: string;
  content: string;
  image?: string;
}
```

### Example Simple Inspection

```json
{
  "id": "old-sign",
  "title": "Weathered Sign",
  "content": "The faded letters read: 'Beware the forest path at night.'"
}
```

### Example Rich Inspection

```json
{
  "id": "daily-tribune",
  "title": "The Daily Tribune",
  "subtitle": "March 15th Edition",
  "sections": [
    {
      "headline": "Mayor Announces New Park",
      "content": "The mayor announced plans yesterday for a new community park in the west district."
    },
    {
      "headline": "Weather Report",
      "content": "Expect sunny skies this weekend with temperatures reaching 72°F."
    }
  ]
}
```

## Items Format

**Location**: `/public/items/items.json`

```typescript
interface ItemsDatabase {
  items: ItemDefinition[];
}

interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: 'quest' | 'gift' | 'key' | 'misc';
  stackable: boolean;
  maxStack?: number;
  giftable: boolean;
}
```

### Example Items Database

```json
{
  "items": [
    {
      "id": "bread",
      "name": "Fresh Bread",
      "description": "Warm bread from the bakery.",
      "category": "gift",
      "stackable": true,
      "maxStack": 10,
      "giftable": true
    },
    {
      "id": "herb",
      "name": "Medicinal Herb",
      "description": "A healing herb found in the wild.",
      "category": "quest",
      "stackable": true,
      "maxStack": 20,
      "giftable": false
    },
    {
      "id": "old-key",
      "name": "Old Key",
      "description": "A rusty key that might open something.",
      "category": "key",
      "stackable": false,
      "giftable": false
    },
    {
      "id": "gold-coin",
      "name": "Gold Coin",
      "description": "Standard currency.",
      "category": "misc",
      "stackable": true,
      "maxStack": 999,
      "giftable": false
    },
    {
      "id": "health-potion",
      "name": "Health Potion",
      "description": "Restores health when consumed.",
      "category": "misc",
      "stackable": true,
      "maxStack": 10,
      "giftable": true
    }
  ]
}
```

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Dialogue | `{npc-id}-dialogue.json` or `{context}.json` | `shopkeeper-dialogue.json` |
| Quest | `{quest-name}.json` | `gathering-herbs.json` |
| Region | `{region-name}/map.json` | `village/map.json` |
| Models | `{model-name}.glb` | `player.glb` |

## Validation Tips

1. **Unique IDs**: All `id` fields must be unique within their category
2. **Valid References**: Ensure `target` values match existing IDs
3. **Node Links**: Dialogue `next` values must reference existing nodes
4. **Stage Links**: Quest `next` stages must exist
5. **Item References**: Pickup `itemId` must exist in items database
6. **Region Paths**: Transition `target` must be valid region paths

## Common Patterns

### Quest-Triggered Dialogue

Link quests to dialogue via `onEnter` events:

```json
// In dialogue
{
  "id": "quest-complete",
  "text": "Thank you for your help!",
  "onEnter": "complete-quest-gathering"
}
```

```typescript
// In game code
dialogue.setOnEvent((event) => {
  if (event === 'complete-quest-gathering') {
    quests.completeQuest('gathering-herbs');
  }
});
```

### Region Transitions

Use trigger zones for seamless transitions:

```json
{
  "id": "exit-east",
  "type": "box",
  "bounds": {
    "min": [15, 0, -3],
    "max": [17, 4, 3]
  },
  "event": {
    "type": "transition",
    "target": "/regions/forest/",
    "spawn": { "x": -14, "y": 0, "z": 0 }
  }
}
```

### Progressive Dialogue

Use node IDs to track dialogue state:

```json
{
  "nodes": [
    {
      "id": "first-meeting",
      "text": "Oh, a new face! Welcome to our village."
    },
    {
      "id": "returning",
      "text": "Back again? Good to see you."
    }
  ]
}
```

Track which node to start from in game state.
