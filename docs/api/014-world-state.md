# World State System

The world state system is the centralized condition evaluation and change notification layer that connects the beats graph (ADR-016), behavior trees (ADR-017), inventory, and caster systems. It replaces the duplicated condition checking that previously lived in `Game.ts`.

**Source**: `src/engine/state/`

## Overview

Before ADR-018, condition evaluation was split across two methods in `Game.ts`: one for beat graph conditions (`ConditionExpression`) and one for BT conditions (`BTCondition`). Both checked the same underlying state (flags, inventory, quests) but with separate code paths. Flags were a raw `Map<string, unknown>` with no change tracking.

The world state system unifies this into three pieces:

| Piece | What it does |
|-------|-------------|
| `WorldStateEvaluator` | Single `check()` method that evaluates any condition against game state |
| `FlagsManager` | Typed key-value store replacing raw flag maps, with change callbacks |
| `WorldStateNotifier` | Pub/sub that re-evaluates conditions when any state changes |

Existing condition types (`ConditionExpression` for beats, `BTCondition` for BTs) are unchanged. Adapter functions translate them into `WorldStateCondition` before evaluation.

## How It Fits Together

```
Beat Graph                              Behavior Trees
(ConditionExpression)                   (BTCondition)
        |                                      |
        v                                      v
conditionExpressionToWorldState()    btConditionToWorldState()
        |                                      |
        +---------------+  +-------------------+
                        |  |
                        v  v
              WorldStateEvaluator.check()
                        |
            +-----------+-----------+----------+
            |           |           |          |
        QuestManager  Inventory  Caster  FlagsManager
```

State changes flow in the other direction:

```
FlagsManager.set()  ──┐
Inventory add/remove ─┤──> WorldStateNotifier.notify()
Quest complete/stage ──┘            |
                                    v
                        QuestManager.evaluateConditions()
                        (re-checks all pending condition nodes)
```

## WorldStateCondition

The unified condition type that all conditions are translated into before evaluation.

```typescript
type WorldStateCondition =
  // Quest state
  | { type: 'questActive'; questId: string }
  | { type: 'questCompleted'; questId: string }
  | { type: 'questStage'; questId: string; stageId: string; state: 'active' | 'completed' }
  | { type: 'questNode'; questId: string; nodeId: string; state: 'active' | 'completed' }

  // Inventory
  | { type: 'hasItem'; itemId: string; count?: number }

  // Caster
  | { type: 'resonance'; comparison: 'eq' | 'gte' | 'lte'; value: number }
  | { type: 'battery'; comparison: 'eq' | 'gte' | 'lte'; value: number }
  | { type: 'hasSpell'; spellId: string }

  // Flags
  | { type: 'flag'; key: string; value?: unknown }

  // Compound
  | { type: 'and'; conditions: WorldStateCondition[] }
  | { type: 'or'; conditions: WorldStateCondition[] }
  | { type: 'not'; condition: WorldStateCondition };
```

The `flag` condition with no `value` returns true if the flag is set to anything truthy (not `undefined`, `false`, or `null`). With a `value`, it checks strict equality.

Compound conditions (`and`, `or`, `not`) allow combining any conditions. The adapter layer uses `not` to handle the `negate` field on `ConditionExpression`.

## WorldStateEvaluator

Evaluates a `WorldStateCondition` against live game state.

**Source**: `src/engine/state/WorldStateEvaluator.ts`

```typescript
const evaluator = new WorldStateEvaluator(quests, inventory, caster, flags);

evaluator.check({ type: 'hasItem', itemId: 'old-key' });           // true/false
evaluator.check({ type: 'questStage', questId: 'q1', stageId: 's2', state: 'active' });
evaluator.check({ type: 'flag', key: 'guard_bribed' });
evaluator.check({
  type: 'and',
  conditions: [
    { type: 'hasItem', itemId: 'old-key' },
    { type: 'flag', key: 'door_unlocked', value: false },
  ]
});
```

The constructor takes lightweight interfaces (`QuestManagerLike`, `InventoryManagerLike`, `CasterManagerLike`) rather than concrete classes, so there are no circular dependency issues.

### `check(condition)`

```typescript
evaluator.check(condition: WorldStateCondition): boolean
```

Evaluates recursively. `and`/`or`/`not` conditions nest arbitrarily.

## FlagsManager

Typed replacement for the old `beatFlags: Map<string, unknown>`.

**Source**: `src/engine/state/FlagsManager.ts`

Accessed on Game as `game.flags`.

```typescript
game.flags.set('guard_bribed', true);
game.flags.get('guard_bribed');          // true
game.flags.has('guard_bribed');          // true
game.flags.delete('guard_bribed');

// Typed getters (return typed defaults if flag is missing or wrong type)
game.flags.getBoolean('guard_bribed');   // false (deleted above)
game.flags.getNumber('bribe_count');     // 0
game.flags.getString('mood');            // ''
```

### Change Notification

Every `set()` and `delete()` fires the onChange callback, which Game wires to the notifier:

```typescript
flags.setOnChange((change) => notifier.notify(change));
```

This means setting a flag automatically re-evaluates all pending condition nodes. No manual `evaluateConditions()` calls needed.

### Serialization

For save/load (future work):

```typescript
const data = game.flags.serializeFlags();  // Record<string, unknown>
game.flags.loadFlags(data);
```

### `clear()`

Clears all flags without firing individual change events. Called on new game.

## WorldStateNotifier

Pub/sub that broadcasts state changes.

**Source**: `src/engine/state/WorldStateNotifier.ts`

```typescript
const notifier = new WorldStateNotifier();

const unsubscribe = notifier.subscribe((change) => {
  console.log(`${change.namespace}.${change.key}: ${change.oldValue} -> ${change.newValue}`);
});

notifier.notify({ namespace: 'flags', key: 'guard_bribed', newValue: true });

unsubscribe();  // Stop listening
```

### StateChange

```typescript
interface StateChange {
  namespace: 'flags' | 'quest' | 'inventory' | 'caster';
  key: string;
  oldValue?: unknown;
  newValue?: unknown;
}
```

### What fires notifications

| Source | Namespace | When |
|--------|-----------|------|
| `FlagsManager.set()` / `delete()` | `flags` | Any flag change |
| Inventory `onItemAdded` / `onItemRemoved` | `inventory` | Item gained or lost |
| `QuestManager` `completeQuest()` / `checkStageComplete()` | `quest` | Quest or stage completes |

All notifications trigger `QuestManager.evaluateConditions()` via the subscriber wired up in `Game.init()`.

## Adapters

Bridge functions that convert existing condition types to `WorldStateCondition`.

**Source**: `src/engine/state/adapters.ts`

### `conditionExpressionToWorldState(expr)`

Converts beat graph `ConditionExpression` (used by condition nodes in the beats graph).

| `ConditionExpression.operator` | Maps to |
|-------------------------------|---------|
| `hasItem` | `{ type: 'hasItem' }` |
| `hasFlag` | `{ type: 'flag' }` |
| `questComplete` | `{ type: 'questCompleted' }` |
| `stageComplete` | `{ type: 'questStage', state: 'completed' }` (parses `"questId:stageId"` operand) |
| `custom` | Warns, returns always-false flag check |

If `expr.negate` is true, wraps the result in `{ type: 'not' }`.

### `btConditionToWorldState(cond)`

Converts behavior tree `BTCondition`.

| `BTCondition.type` | Maps to |
|--------------------|---------|
| `questStage` (no nodeId) | `{ type: 'questStage' }` |
| `questStage` (with nodeId) | `{ type: 'questNode' }` |
| `hasItem` | `{ type: 'hasItem' }` |
| `hasFlag` | `{ type: 'flag' }` |
| `timeOfDay` | Warns, returns always-false (not yet implemented) |
| `atLocation` | Warns, returns always-false (not yet implemented) |
| `custom` | Warns, returns always-false |

## Wiring in Game.ts

Game.ts creates and connects everything:

```typescript
// Constructor: create flags + notifier
this.flags = new FlagsManager();
this.worldStateNotifier = new WorldStateNotifier();

// init(): create evaluator (needs all managers to exist), wire notifications
this.worldStateEvaluator = new WorldStateEvaluator(
  this.quests, this.inventory, this.caster, this.flags,
);
this.flags.setOnChange((change) => this.worldStateNotifier.notify(change));
this.worldStateNotifier.subscribe(() => this.quests.evaluateConditions());
this.quests.setOnStateChange(() => {
  this.worldStateNotifier.notify({ namespace: 'quest', key: 'stateChange' });
});
```

Condition checkers use the adapters:

```typescript
// Beat graph conditions
this.quests.setConditionChecker((condition) => {
  return this.worldStateEvaluator.check(conditionExpressionToWorldState(condition));
});

// Behavior tree conditions
this.engine.setBTConditionChecker((_npcId, condition) => {
  return this.worldStateEvaluator.check(btConditionToWorldState(condition));
});
```

## What Didn't Change

The world state system is an internal refactor. These things are identical from the outside:

- **Beat graph editor** - still creates `ConditionExpression` conditions; adapter handles translation
- **BT condition editor** - still creates `BTCondition` conditions; adapter handles translation
- **BehaviorTreeEvaluator** - still calls `context.checkCondition()`, which now goes through the adapter
- **BehaviorTreeSystem** - untouched
- **Save format** - no changes (flag save/load is future work)

## Exports

```typescript
import {
  WorldStateEvaluator, WorldStateNotifier, FlagsManager,
} from 'sugarengine';

import type {
  WorldStateCondition, StateChange, StateChangeListener, StateNamespace,
} from 'sugarengine';
```
