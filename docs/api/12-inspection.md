# Inspection System

The inspection system allows players to examine world objects (newspapers, signs, lore items) and view rich content without picking them up.

**Source**: `src/inspection/`

## InspectionManager

Main class for managing inspections.

**Source**: `src/inspection/InspectionManager.ts`

### Constructor

```typescript
const inspection = new InspectionManager(container: HTMLElement);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | DOM element to render inspection UI into |

### Starting an Inspection

#### start()

Start an inspection by ID. Loads the inspection file if not cached.

```typescript
await inspection.start(inspectionId: string): Promise<void>
```

The inspection file is loaded from `/public/inspections/{inspectionId}.json`.

**Example**:
```typescript
engine.onInspect(async (inspectableId, inspectionId, promptText) => {
  engine.setMovementEnabled(false);
  await inspection.start(inspectionId);
  engine.setMovementEnabled(true);
});
```

#### end()

Force-end the current inspection.

```typescript
inspection.end(): void
```

### State Checking

#### isInspectionActive()

Check if an inspection is currently displayed.

```typescript
inspection.isInspectionActive(): boolean
```

#### getCurrentInspection()

Get the currently displayed inspection data.

```typescript
inspection.getCurrentInspection(): InspectionData | null
```

### Preloading

#### preload()

Preload inspection files for faster access later.

```typescript
await inspection.preload(inspectionIds: string[]): Promise<void>
```

### Event Handlers

#### setOnStart()

Called when an inspection begins.

```typescript
inspection.setOnStart(handler: () => void): void
```

#### setOnEnd()

Called when an inspection ends.

```typescript
inspection.setOnEnd(handler: () => void): void
```

**Example**:
```typescript
inspection.setOnStart(() => {
  engine.setMovementEnabled(false);
});

inspection.setOnEnd(() => {
  engine.setMovementEnabled(true);
});
```

### Cleanup

#### dispose()

Clean up resources and remove UI elements.

```typescript
inspection.dispose(): void
```

## Inspection Data Format

Inspection files are JSON located in `/public/inspections/`.

### Simple Format (Signs, Plaques)

```typescript
interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
}
```

**Example**:
```json
{
  "id": "old-sign",
  "title": "Weathered Sign",
  "content": "Beware the forest path at night."
}
```

### Rich Format (Newspapers, Magazines)

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

**Example**:
```json
{
  "id": "daily-tribune",
  "title": "The Daily Tribune",
  "subtitle": "March 15th Edition",
  "headerImage": "/images/newspaper-header.png",
  "sections": [
    {
      "headline": "Mayor Announces New Park",
      "content": "The mayor announced plans for a new community park..."
    },
    {
      "headline": "Weather Report",
      "content": "Expect sunny skies this weekend..."
    }
  ]
}
```

## Inspectable Component

Marks an entity as inspectable in the ECS.

**Source**: `src/components/Inspectable.ts`

```typescript
import { Inspectable } from './components/Inspectable';

new Inspectable(id: string, inspectionId: string, promptText?: string)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | - | Unique inspectable instance ID |
| `inspectionId` | `string` | - | ID of inspection content file |
| `promptText` | `string` | `'Inspect'` | Custom prompt text |

## Region Data

Add inspectable objects to regions via `map.json`:

```json
{
  "inspectables": [
    {
      "id": "newspaper-01",
      "position": { "x": 5, "y": 0.5, "z": 3 },
      "inspectionId": "daily-tribune",
      "promptText": "Read newspaper"
    },
    {
      "id": "sign-01",
      "position": { "x": -2, "y": 1.5, "z": 0 },
      "inspectionId": "old-sign",
      "promptText": "Read sign"
    }
  ]
}
```

## Engine Integration

### Event Handlers

#### onInspect()

Called when player presses interact near an inspectable object.

```typescript
engine.onInspect(handler: (inspectableId: string, inspectionId: string, promptText: string) => void): void
```

#### onNearbyInteractableChange()

Called when the nearest interactable (NPC or inspectable) changes.

```typescript
engine.onNearbyInteractableChange(handler: (nearby: NearbyInteractable | null) => void): void
```

### NearbyInteractable

```typescript
interface NearbyInteractable {
  type: 'npc' | 'inspectable';
  id: string;
  dialogueId?: string;      // For NPCs
  inspectionId?: string;    // For inspectables
  promptText?: string;
}
```

### getNearbyInteractable()

Get the current nearest interactable entity.

```typescript
engine.getNearbyInteractable(): NearbyInteractable | null
```

## Unified Interaction

The inspection system shares the E key with NPC interaction. The nearest interactable entity (NPC or inspectable) will be activated.

```typescript
// Show unified prompt for both NPCs and inspectables
engine.onNearbyInteractableChange((nearby) => {
  if (nearby) {
    interactionPrompt.show(nearby.promptText || 'Interact');
  } else {
    interactionPrompt.hide();
  }
});

// Handle NPC interactions
engine.onInteract(async (npcId, dialogueId) => {
  if (dialogueId) {
    await dialogue.start(dialogueId);
  }
});

// Handle inspections
engine.onInspect(async (inspectableId, inspectionId) => {
  await inspection.start(inspectionId);
});
```

## Complete Integration Example

```typescript
import { SugarEngine } from './core/Engine';
import { InspectionManager } from './inspection';
import { DialogueManager } from './dialogue';

const engine = new SugarEngine({ container, camera: {...} });
const dialogue = new DialogueManager(container);
const inspection = new InspectionManager(container);

// Disable movement during inspection
inspection.setOnStart(() => {
  engine.setMovementEnabled(false);
});

inspection.setOnEnd(() => {
  engine.setMovementEnabled(true);
  engine.consumeInteract(); // Prevent immediate re-trigger
});

// Handle unified interaction prompt
engine.onNearbyInteractableChange((nearby) => {
  if (nearby) {
    interactionPrompt.show(nearby.promptText);
  } else {
    interactionPrompt.hide();
  }
});

// Handle NPC dialogue
engine.onInteract(async (npcId, dialogueId) => {
  interactionPrompt.hide();
  if (dialogueId) {
    await dialogue.start(dialogueId);
  }
});

// Handle object inspection
engine.onInspect(async (inspectableId, inspectionId, promptText) => {
  interactionPrompt.hide();
  await inspection.start(inspectionId);
});

// Load region with inspectables
await engine.loadRegion('/regions/town/');
engine.run();
```

## UI Styling

The `InspectionUI` component displays content in a modal overlay with:

- Dark semi-transparent background
- Centered panel with warm border
- Optional header image
- Title and subtitle
- Scrollable content area
- Multiple sections with headlines
- Close hint (E or ESC to close)

The styling matches the cozy aesthetic of other UI components like `DialogueBox`.
