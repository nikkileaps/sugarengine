# ADR-019: Conditional Dialogue Branching

## Status

Accepted (Implemented)

## Context

When designing quests, a common need is for dialogue to adapt to game state. For example:

- A guard mentions the key if the player already has it
- A shopkeeper offers a discount if a flag is set
- A dialogue choice is only available if the player completed a quest
- An NPC's greeting changes based on how far the player is in a quest stage

Currently, the only way to handle this is in the **beat graph** or **behavior tree**: create multiple dialogue trees and use conditions/branches to select which one to start. This works for "which conversation to have" but not for "what to say within a conversation."

### The Problem

Consider: the player talks to a merchant. The merchant always starts with a greeting, always offers rumors, but should only offer to sell a map if the player has completed a quest. Right now you'd need:

**Option A: Multiple dialogue trees** - `merchant-dialogue-before-quest` and `merchant-dialogue-after-quest`. The BT or beat graph picks between them. Problem: 90% of the dialogue is identical, duplicated across two files.

**Option B: Separate the conversation** - The beat graph has a condition node that gates a second dialogue. Problem: this breaks the natural flow of a single conversation into awkward pieces.

Neither is good. The right answer: **put the condition in the dialogue itself**.

### Prior Art

| System | Approach |
|--------|----------|
| Yarn Spinner | `<<if $has_key>>` inline conditionals in dialogue script |
| Ink | `{flag: text}` conditional text, `{flag}` choice gating |
| Disco Elysium | Skill checks on choices, hidden choices based on stats |
| articy:draft | Conditions on connections between dialogue nodes |

All of these put conditions **on the connections** or **inline in the dialogue**, not in external flow control.

### Why Now

ADR-018 implemented the `WorldStateEvaluator` - a single `check()` method that can evaluate any game state condition (flags, inventory, quests, caster stats). The dialogue system has a `condition?: string` placeholder on `DialogueNext` that was never wired up. The infrastructure is ready.

## Decision

Add world-state-aware condition evaluation to dialogue connections (`DialogueNext`). When a dialogue node is shown, connections whose conditions evaluate to false are filtered out before the player sees them.

### How It Works

```
DialogueNode
  text: "What can I do for you?"
  next:
    ├── { nodeId: "buy-map", text: "I'd like to buy a map", condition: { type: "questCompleted", questId: "ask-around" } }
    ├── { nodeId: "rumors", text: "Heard any rumors?" }
    └── { nodeId: "bye", text: "Goodbye" }
```

If `ask-around` quest is not complete, the player sees:
1. Heard any rumors?
2. Goodbye

If it is complete:
1. I'd like to buy a map
2. Heard any rumors?
3. Goodbye

### Condition Type

`DialogueNext.condition` changes from `string` (unused placeholder) to `WorldStateCondition` (the unified condition type from ADR-018).

```typescript
interface DialogueNext {
  nodeId: string;
  text?: string;
  condition?: WorldStateCondition;   // was: string
}
```

This gives full access to all condition types: flags, inventory, quest state, caster stats, and compound `and`/`or`/`not` conditions.

### Filtering Logic

In `DialogueManager.showNode()`, filter `node.next` before the node is stored or passed to the panel:

```typescript
private showNode(node: DialogueNode): void {
  const filteredNext = (node.next ?? []).filter(n => {
    if (!n.condition || !this.conditionChecker) return true;
    return this.conditionChecker(n.condition);
  });

  // Store node with filtered connections
  this.currentNode = { ...node, next: filteredNext };

  // ... rest of showNode uses this.currentNode
}
```

This means both the UI (which choices to render) and `handleAdvance()` (which node to auto-advance to) see the filtered version.

### Condition Checker Callback

Same pattern as the quest system and BT system - the dialogue manager gets a setter, Game.ts wires it to the evaluator:

```typescript
// DialogueManager
private conditionChecker: ((condition: WorldStateCondition) => boolean) | null = null;

setConditionChecker(checker: (condition: WorldStateCondition) => boolean): void {
  this.conditionChecker = checker;
}
```

```typescript
// Game.ts, in wireUpSystems()
this.dialogue.setConditionChecker((condition) => {
  return this.worldStateEvaluator.check(condition);
});
```

### Edge Cases

**All connections filtered out**: The node becomes a dead end. Dialogue ends naturally (same as a node with no `next`).

**Single connection filtered to zero**: Same - dialogue ends. This is intentional. If you want a guaranteed fallback, add an unconditional connection.

**Conditional routing (no choices)**: Multiple `next` entries without `text` act as conditional routing. The first connection whose condition passes (or has no condition) is used for auto-advance. This gives "if/else" logic inside dialogue without player-visible choices.

```
DialogueNode
  text: "Let me check if you're ready..."
  next:
    ├── { nodeId: "ready-path",     condition: { type: "flag", key: "prepared" } }
    └── { nodeId: "not-ready-path" }   // unconditional fallback
```

If `prepared` flag is set: routes to `ready-path`. Otherwise: routes to `not-ready-path`. The player sees no choice - it's automatic routing based on state.

**Conditions evaluated once per node visit**: Conditions are checked when `showNode` fires, not continuously. If state changes while the player is reading a dialogue node, the choices won't update mid-screen. This is intentional - updating choices while the player is reading would be jarring.

### What This Does NOT Do

- **Conditional text within a node**: No inline `{if flag}` text substitution. A node always shows the same text. Use conditional routing to different nodes instead.
- **Conditional start nodes**: The `startNode` on `DialogueTree` is always the same. Use a "router" start node with conditional connections to branch from the top.
- **Skill checks with UI**: No "roll" or percentage display like Disco Elysium. Conditions are boolean pass/fail. Skill-check-style UI would be a separate feature.

## Changes

### Modified Files

**`src/engine/dialogue/types.ts`**
- `DialogueNext.condition`: `string` → `WorldStateCondition`
- Deprecated `DialogueChoice.condition`: `string` → `WorldStateCondition`

**`src/engine/dialogue/DialogueManager.ts`**
- Add `conditionChecker` field and `setConditionChecker()` method
- `showNode()`: filter `node.next` through condition checker before storing/displaying

**`src/engine/core/Game.ts`**
- In `wireUpSystems()`: add `this.dialogue.setConditionChecker((c) => this.worldStateEvaluator.check(c))`

**`src/engine/index.ts`**
- No changes needed (WorldStateCondition is already exported)

### Editor Changes (Future)

- Dialogue connection properties panel: add condition builder (reuse the condition UI pattern from the BT condition editor)
- Visual indicator on connections that have conditions (e.g., `?` badge or dashed line)

## Implementation Phases

### Phase 1: Engine - Condition Filtering
1. Update `DialogueNext.condition` type from `string` to `WorldStateCondition`
2. Add `setConditionChecker` to `DialogueManager`
3. Filter connections in `showNode()`
4. Wire checker in `Game.ts`

### Phase 2: Editor - Condition UI
1. Add condition editor to dialogue connection properties
2. Visual indicators for conditional connections
3. Preview: test conditions in dialogue preview mode

## Consequences

### Positive

- Dialogue content adapts to game state without duplicating dialogue trees
- Reuses the existing `WorldStateCondition` type and `WorldStateEvaluator` - no new condition system
- Same condition types available everywhere: beat graph, behavior trees, dialogue
- Simple filtering model - easy to reason about
- Router nodes enable complex branching without player-visible choices

### Negative

- Conditions evaluated once per node visit (no live updates mid-node)
- No inline text substitution (must use separate nodes for text variants)
- Editor needs a condition builder for dialogue connections

### Neutral

- Condition format is the same `WorldStateCondition` used by ADR-018
- Dialogue trees get slightly more complex data (conditions on connections)
- Router nodes are a convention, not a built-in node type
