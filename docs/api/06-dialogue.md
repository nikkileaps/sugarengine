# Dialogue System

The dialogue system provides branching conversations with NPCs. It supports multiple choices, event triggers, speaker name resolution, and conditional connections that adapt dialogue to game state.

**Source**: `src/engine/dialogue/`

## Overview

A dialogue is a tree of nodes. Each node shows text from a speaker and has zero or more connections (`next`) to other nodes:

- **No connections** = end of dialogue
- **One connection** = linear flow (player clicks to continue)
- **Multiple connections** = player choice (each connection's `text` becomes a choice button)

Connections can have **conditions** (ADR-019). When a node is shown, connections whose conditions evaluate to false are filtered out before the player sees them. This lets dialogue adapt to quest progress, inventory, flags, and other game state without duplicating entire dialogue trees.

## DialogueManager

Main class for managing dialogue interactions.

**Source**: `src/engine/dialogue/DialogueManager.ts`

### Constructor

```typescript
const dialogue = new DialogueManager(container: HTMLElement);
```

### Methods

#### start(dialogueId)

Start a dialogue by ID. Loads the dialogue file if not cached.

```typescript
await dialogue.start(dialogueId: string): Promise<void>
```

#### end()

Force-end the current dialogue.

```typescript
dialogue.end(): void
```

#### isDialogueActive()

Check if a dialogue is currently playing.

```typescript
dialogue.isDialogueActive(): boolean
```

#### preload(dialogueIds)

Preload dialogue files for faster access later.

```typescript
await dialogue.preload(dialogueIds: string[]): Promise<void>
```

#### registerDialogue(dialogueId, dialogue)

Register a dialogue directly (used in development mode to skip file loading).

```typescript
dialogue.registerDialogue(dialogueId: string, dialogue: DialogueTree): void
```

#### dispose()

Clean up resources and remove UI elements.

```typescript
dialogue.dispose(): void
```

### Event Handlers

#### setOnStart(handler)

Called when dialogue begins.

```typescript
dialogue.setOnStart(handler: () => void): void
```

#### setOnEnd(handler)

Called when dialogue ends (naturally or via `end()`).

```typescript
dialogue.setOnEnd(handler: () => void): void
```

#### setOnEvent(handler)

Called when a dialogue node with `onEnter` fires an event.

```typescript
dialogue.setOnEvent(handler: (eventName: string) => void): void
```

#### setOnNodeEnter(handler)

Called when any node is entered. Used by the quest system to track dialogue progress and complete objectives when specific nodes are visited.

```typescript
dialogue.setOnNodeEnter(handler: (nodeId: string) => void): void
```

#### setSpeakerNameResolver(resolver)

Set a resolver to convert speaker IDs (UUIDs) to display names. The engine uses this to translate NPC UUIDs, the Player ID, and the Narrator ID into readable names.

```typescript
dialogue.setSpeakerNameResolver(resolver: (speakerId: string) => string | undefined): void
```

#### setConditionChecker(checker)

Set the condition checker for filtering conditional connections (ADR-019). `Game.ts` wires this to the `WorldStateEvaluator`.

```typescript
dialogue.setConditionChecker(checker: (condition: WorldStateCondition) => boolean): void
```

## Data Types

### DialogueTree

```typescript
interface DialogueTree {
  id: string;             // Dialogue ID (UUID)
  name?: string;          // Human-readable name
  startNode: string;      // ID of first node
  nodes: DialogueNode[];  // All nodes in this dialogue
  episodeId?: string;     // Episode this dialogue belongs to
}
```

### DialogueNode

```typescript
interface DialogueNode {
  id: string;             // Unique node identifier
  name?: string;          // Human-readable name (shown in editor)
  speaker?: string;       // Speaker UUID (resolved to name at runtime)
  text: string;           // Dialogue text to display
  next?: DialogueNext[];  // Connections to next node(s)
  onEnter?: string;       // Event to fire when entering this node
}
```

### DialogueNext

A connection from one node to another. This is the core unit for both linear flow and player choices.

```typescript
interface DialogueNext {
  nodeId: string;                    // Target node ID
  text?: string;                     // Choice text (only needed with multiple connections)
  condition?: WorldStateCondition;   // If set, connection is hidden when condition is false
}
```

### Speakers

Three built-in speaker types with predefined UUIDs:

| Speaker | UUID | Usage |
|---------|------|-------|
| Player | `e095b3b2-3351-403a-abe1-88861fa489ad` | Player's internal monologue, voiceover |
| Narrator | `1a44e7dd-fd2c-4862-a489-59692155e406` | Disembodied storytelling voice |
| NPC | (varies) | Any NPC, referenced by their UUID |

Speaker UUIDs are resolved to display names at runtime via `setSpeakerNameResolver`.

## Conditional Connections (ADR-019)

Connections can have a `condition` field set to any `WorldStateCondition`. When a node is shown, each connection is checked:

- No `condition` = always shown
- `condition` present = evaluated via `WorldStateEvaluator.check()`, hidden if false

Conditions are evaluated **once per node visit** (not continuously). Available condition types: `flag`, `hasItem`, `questActive`, `questCompleted`, `questStage`, `questNode`, `resonance`, `battery`, `hasSpell`, and compound `and`/`or`/`not`.

See [World State](014-world-state.md) for the full list of condition types.

### Conditional Choices

The most common use case: show or hide player choices based on game state.

```json
{
  "id": "merchant-greeting",
  "speaker": "<merchant-uuid>",
  "text": "What can I do for you?",
  "next": [
    {
      "nodeId": "buy-map",
      "text": "I'd like to buy a map",
      "condition": { "type": "questCompleted", "questId": "<ask-around-quest-uuid>" }
    },
    { "nodeId": "rumors", "text": "Heard any rumors?" },
    { "nodeId": "bye", "text": "Goodbye" }
  ]
}
```

If the `ask-around` quest is **not** complete, the player sees:
1. Heard any rumors?
2. Goodbye

If it **is** complete:
1. I'd like to buy a map
2. Heard any rumors?
3. Goodbye

### Conditional Routing

Multiple `next` entries **without** `text` act as invisible routing. The first connection whose condition passes (or has no condition) is used for auto-advance. This gives if/else logic without visible player choices.

```json
{
  "id": "check-readiness",
  "speaker": "<npc-uuid>",
  "text": "Let me see if you're ready...",
  "next": [
    { "nodeId": "ready-path", "condition": { "type": "flag", "key": "prepared" } },
    { "nodeId": "not-ready-path" }
  ]
}
```

If the `prepared` flag is set: routes to `ready-path`. Otherwise: routes to `not-ready-path`. The player sees no choice.

### Negated Conditions

Use `{ "type": "not", "condition": ... }` to negate any condition:

```json
{
  "nodeId": "no-key-dialogue",
  "text": "I don't have the key yet...",
  "condition": { "type": "not", "condition": { "type": "hasItem", "itemId": "<key-uuid>" } }
}
```

### Edge Cases

- **All connections filtered out**: Dialogue ends naturally (same as a node with no `next`).
- **Single connection filtered to zero**: Same - dialogue ends. Add an unconditional connection as a fallback if you always want the conversation to continue.

## Dialogue Flow

1. `start()` loads dialogue JSON (or uses registered data in dev mode)
2. Node enter callback fires (for quest tracking via `setOnNodeEnter`)
3. `onEnter` event fires if present (via `setOnEvent`)
4. Connections are filtered through condition checker (ADR-019)
5. UI displays the node:
   - Multiple passing connections = player choice buttons
   - Single passing connection = "Press E to continue"
   - No passing connections = dialogue ends
6. Player advances, and the next node is shown (back to step 2)

## NPC Interaction Chain

When the player interacts with an NPC, `Game.ts` checks for dialogue in priority order:

1. **Quest dialogue** - Active quest has a specific dialogue for this NPC (`getQuestDialogueForNpc`)
2. **Behavior tree** - NPC's BT evaluates and returns a dialogue action (`evaluateNPCBehavior`)
3. **Default dialogue** - NPC's fallback dialogue ID

See [NPC System](013-npc.md) for details on behavior trees and [Quests](07-quests.md) for quest-triggered dialogue.

## Editor

The dialogue editor provides a visual node canvas for building dialogue trees.

### Node Canvas

- Nodes are displayed with speaker badges, text previews, and choice labels
- Connections are drawn as bezier curves between nodes
- Drag from a node's right edge to create a new connection
- Click a node to select it and open the property editor

### Node Properties

Select a node to edit in the right panel:
- **Name** - Human-readable label
- **Speaker** - Select from Player, Narrator, or any NPC
- **Dialogue Text** - What the speaker says
- **On Enter Event** - Optional event string fired when this node is shown
- **Next/Choices** - Add, remove, and configure connections

### Connection Conditions

Each connection has a **?** toggle button:
- Click to add a condition (connection is only shown when condition passes)
- Pick a condition type: Has Flag, Has Item, Quest Active, Quest Completed, Quest Stage
- Click **!** to negate the condition
- Click **?** again to remove the condition

Connections with conditions are displayed as **dashed yellow lines** on the canvas, and choice labels show a yellow **?** badge.

### Playtest Mode

Click **Playtest** to walk through the dialogue in the editor. The current node is highlighted with a yellow border, and you can click choices or continue to advance through the tree. Note: playtest mode does not evaluate conditions (no game state available in the editor).

## Example Dialogue JSON

```json
{
  "id": "d4f8a2b1-...",
  "name": "Shopkeeper Chat",
  "startNode": "greeting",
  "nodes": [
    {
      "id": "greeting",
      "name": "Greeting",
      "speaker": "<shopkeeper-uuid>",
      "text": "Welcome to my shop! What can I help you with today?",
      "next": [
        {
          "nodeId": "sell-map",
          "text": "I need a map",
          "condition": { "type": "questStage", "questId": "<quest-uuid>", "stageId": "<stage-uuid>", "state": "active" }
        },
        { "nodeId": "rumors", "text": "Heard any rumors?" },
        { "nodeId": "farewell", "text": "Goodbye" }
      ]
    },
    {
      "id": "sell-map",
      "name": "Sell Map",
      "speaker": "<shopkeeper-uuid>",
      "text": "Ah, you need directions? Here, take this map. You'll need it.",
      "onEnter": "quest:custom:got-map",
      "next": [{ "nodeId": "farewell" }]
    },
    {
      "id": "rumors",
      "name": "Rumors",
      "speaker": "<shopkeeper-uuid>",
      "text": "Strange lights in the forest last night. Be careful out there.",
      "onEnter": "heard-forest-rumor",
      "next": [{ "nodeId": "greeting" }]
    },
    {
      "id": "farewell",
      "name": "Farewell",
      "speaker": "<shopkeeper-uuid>",
      "text": "Come back anytime!"
    }
  ]
}
```
