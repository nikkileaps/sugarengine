# Dialogue System

The dialogue system provides branching conversations with NPCs, supporting multiple choices and event triggers.

**Source**: `src/dialogue/`

## DialogueManager

Main class for managing dialogue interactions.

**Source**: `src/dialogue/DialogueManager.ts`

### Constructor

```typescript
const dialogue = new DialogueManager(container: HTMLElement);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | DOM element to render dialogue UI into |

### Starting Dialogue

#### start()

Start a dialogue by ID. Loads the dialogue file if not cached.

```typescript
await dialogue.start(dialogueId: string): Promise<void>
```

The dialogue file is loaded from `/public/dialogue/{dialogueId}.json`.

**Example**:
```typescript
engine.onInteract(async (npcId, dialogueId) => {
  if (dialogueId) {
    engine.setMovementEnabled(false);
    await dialogue.start(dialogueId);
    engine.setMovementEnabled(true);
  }
});
```

#### end()

Force-end the current dialogue.

```typescript
dialogue.end(): void
```

### State Checking

#### isDialogueActive()

Check if a dialogue is currently playing.

```typescript
dialogue.isDialogueActive(): boolean
```

### Preloading

#### preload()

Preload dialogue files for faster access later.

```typescript
await dialogue.preload(dialogueIds: string[]): Promise<void>
```

**Example**:
```typescript
// Preload dialogues when entering a region
await dialogue.preload(['shopkeeper', 'guard', 'innkeeper']);
```

### Event Handlers

#### setOnStart()

Called when dialogue begins.

```typescript
dialogue.setOnStart(handler: () => void): void
```

#### setOnEnd()

Called when dialogue ends (naturally or via `end()`).

```typescript
dialogue.setOnEnd(handler: () => void): void
```

**Example**:
```typescript
dialogue.setOnStart(() => {
  engine.setMovementEnabled(false);
});

dialogue.setOnEnd(() => {
  engine.setMovementEnabled(true);
});
```

#### setOnEvent()

Called when a dialogue node with `onEnter` fires an event.

```typescript
dialogue.setOnEvent(handler: (eventName: string) => void): void
```

**Example**:
```typescript
dialogue.setOnEvent((eventName) => {
  if (eventName === 'start-quest-intro') {
    quests.startQuest('intro-quest');
  } else if (eventName === 'give-item-key') {
    inventory.addItem('old-key', 1);
  }
});
```

### Cleanup

#### dispose()

Clean up resources and remove UI elements.

```typescript
dialogue.dispose(): void
```

## Dialogue Data Format

Dialogue files are JSON located in `/public/dialogue/`.

### DialogueTree

```typescript
interface DialogueTree {
  id: string;           // Unique dialogue identifier
  startNode: string;    // ID of first node to display
  nodes: DialogueNode[];
}
```

### DialogueNode

```typescript
interface DialogueNode {
  id: string;              // Unique node identifier
  speaker?: string;        // Name shown above text
  text: string;            // Dialogue text to display
  choices?: DialogueChoice[];  // Player choices (if any)
  next?: string;           // Next node ID (if no choices)
  onEnter?: string;        // Event to fire when entering node
}
```

### DialogueChoice

```typescript
interface DialogueChoice {
  text: string;        // Choice button text
  next: string;        // Node to go to when selected
  condition?: string;  // Reserved for future conditional logic
}
```

## Example Dialogue File

`/public/dialogue/shopkeeper.json`:

```json
{
  "id": "shopkeeper",
  "startNode": "greeting",
  "nodes": [
    {
      "id": "greeting",
      "speaker": "Shopkeeper",
      "text": "Welcome to my shop! What can I help you with today?",
      "choices": [
        { "text": "What do you sell?", "next": "inventory" },
        { "text": "Any news?", "next": "rumors" },
        { "text": "Goodbye", "next": "farewell" }
      ]
    },
    {
      "id": "inventory",
      "speaker": "Shopkeeper",
      "text": "I have potions, bread, and various supplies. Take a look around!",
      "next": "greeting"
    },
    {
      "id": "rumors",
      "speaker": "Shopkeeper",
      "text": "I heard strange lights in the forest last night. Be careful if you venture there.",
      "onEnter": "heard-forest-rumor",
      "next": "greeting"
    },
    {
      "id": "farewell",
      "speaker": "Shopkeeper",
      "text": "Come back anytime!"
    }
  ]
}
```

## Dialogue Flow

1. `start()` loads dialogue JSON (or uses cache)
2. UI displays the `startNode`
3. If node has `choices`, player selects one
4. If node has `next` (no choices), auto-advances after click
5. If node has neither, dialogue ends
6. `onEnter` events fire when entering each node

## Integration Example

```typescript
const dialogue = new DialogueManager(container);

// Connect to quest system
dialogue.setOnEvent((event) => {
  if (event.startsWith('start-quest-')) {
    const questId = event.replace('start-quest-', '');
    quests.startQuest(questId);
  }
});

// Connect to engine
engine.onInteract(async (npcId, dialogueId) => {
  if (dialogueId && !dialogue.isDialogueActive()) {
    engine.setMovementEnabled(false);
    quests.triggerObjective('talk', npcId);
    await dialogue.start(dialogueId);
    engine.setMovementEnabled(true);
  }
});
```
