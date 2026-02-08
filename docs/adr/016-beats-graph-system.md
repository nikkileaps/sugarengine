# ADR-016: Beats Graph System

## Status

Accepted (Implemented)

## Context

ADR-015 introduced objective graphs within quest stages, allowing objectives to have prerequisites and form dependency chains. This works well for player-action objectives, but as we build more sophisticated quests, three limitations have emerged:

1. **No distinction between "do something" and "check something"**: A "collect item" objective requires the player to pick up an item *now*. But sometimes we want to check if the player *already has* an item. These are fundamentally different operations.

2. **Narrative beats require workarounds**: Voiceovers and auto-triggered dialogues use `autoStart: true`, but they're conceptually different from objectives - they're not something the player "completes", they're something the system triggers.

3. **Conditions as gates**: We need "wait until X is true" nodes that don't require player action - they just observe game state and unblock when satisfied.

### The Insight

We're not building an "objective graph" - we're building a **beats graph**. A beat is any discrete moment in the quest flow:

- **Player does something** (objective)
- **System triggers something** (narrative)
- **System gates on something** (condition) — waits until state is true
- **System routes on something** (branch) — one-shot if/else based on current state

### Industry Research

We analyzed implementations across game engines and narrative tools:

| System | Approach | Strengths | Fit for Us |
|--------|----------|-----------|------------|
| Unreal Blueprints | Typed execution pins, separate Gate/Branch nodes | Extremely flexible, Gate/Branch model adopted | Key influence |
| Unity Visual Scripting | Flow graphs with control nodes | Designer-friendly | Medium fit |
| Yarn Spinner / Ink | Text-first with branches/conditions | Writer-friendly | Good for dialogue |
| Behavior Trees | Sequence/Selector/Parallel composites | Proven for AI | Wrong semantics |
| Witcher 3 | Phase-gated quest threads + facts DB | Handles massive scale | Good patterns |
| articy:draft | Nested flow graphs with conditions | Industry standard | Best reference |

**Key finding**: Most systems that handle our requirements use **typed nodes** in a flow graph, not typed edges. The node's type determines its behavior when activated.

## Decision

Evolve the objective graph (ADR-015) into a **beats graph** by introducing **node types**:

### Node Types

| Type | Icon | When Active | Completes When | Example |
|------|------|-------------|----------------|---------|
| **objective** | Based on subtype | Shows in HUD, waits for player | Player performs action | "Talk to Ethan" |
| **narrative** | `N` | Auto-fires immediately | Playback/trigger completes | "Holly voiceover plays" |
| **condition** | `?` | Evaluates continuously | Condition becomes true | "Has key in inventory" |
| **branch** | `⑂` | Evaluates once, then done | Immediately (routes to pass or fail) | "Did player choose dark path?" |

#### Gate vs Branch (Unreal Model)

Condition and branch nodes both evaluate a `ConditionExpression`, but differ in behavior — following the same distinction Unreal Engine makes between Gate and Branch nodes:

- **Condition (gate)**: Blocks flow until the condition becomes true. Re-evaluates on every state change. Single output. Good for "wait until the player does X." Any hints while the gate is waiting (e.g., "you need the rug" dialogue) should use conditional dialogue (ADR-019) driven by world state, not the gate itself.
- **Branch (route)**: Evaluates once when activated, routes to pass OR fail path, then completes. Two outputs. Good for "did the player already do X? If yes go here, if no go there." The branch node itself is done regardless of which path fires.

Only branch nodes support **fail targets** — node IDs that activate when the condition is false:

```
Condition (gate):                            Branch with fail targets:

  ┌──────────┐                                ┌──────────┐
  │ ? Gate   │── pass ──▶ [next nodes]        │ ⑂ Branch │── pass ──▶ [path A]
  │          │                                │          │
  └──────────┘  (waits until true,            │          │╌╌ fail ╌╌▶ [path B]
                 single output)               └──────────┘  (evaluates once,
                                                             branch is done)
```

### Nodes vs Actions: The Principle

Beyond node types, there's a fundamental distinction between **nodes** and **actions**:

> **Node**: Something the player experiences as a discrete moment. Has duration or waits for something.
> **Action**: Instant, fire-and-forget side effect. Invisible bookkeeping or immediate feedback.

**The test**: "Does flow need to pause until this finishes?"
- Yes → **Node**
- No → **Action**

| Thing | Node or Action | Why |
|-------|----------------|-----|
| Voiceover plays | Node | Player listens, takes time |
| Dialogue plays | Node | Player engages, takes time |
| Cutscene plays | Node | Player watches, takes time |
| NPC walks to location (wait) | Node | Player watches, takes time |
| Wait 3 seconds | Node | Has duration |
| Check if player has item | Node (condition) | Waits for state |
| Set a flag | Action | Instant bookkeeping |
| Give item to player | Action | Instant state change |
| Play sound effect | Action | Fire-and-forget |
| Spawn particle effect | Action | Fire-and-forget |
| Teleport NPC instantly | Action | Instant state change |
| Update a variable | Action | Instant bookkeeping |

### Actions: onEnter and onComplete

Every node can have two action lists:

- **`onEnter`**: Fires when the node **activates** (prerequisites met), *before* the node starts
- **`onComplete`**: Fires when the node **completes**, *before* flow continues to dependent nodes

```
Prerequisites met
       │
       ▼
   ┌───────────────┐
   │   onEnter     │ ◄── Actions fire here (instant)
   │   actions     │
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │               │
   │  Node runs    │ ◄── Node does its thing (may have duration)
   │               │
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │  onComplete   │ ◄── Actions fire here (instant)
   │   actions     │
   └───────┬───────┘
           │
           ▼
   Flow continues to
   dependent nodes
```

**Action types**:

```typescript
type ActionType =
  | 'setFlag'        // Set a world flag
  | 'giveItem'       // Add item to inventory
  | 'removeItem'     // Remove item from inventory
  | 'playSound'      // Fire-and-forget sound
  | 'spawnVFX'       // Fire-and-forget particle effect
  | 'teleportNPC'    // Instant NPC position change
  | 'setNPCState'    // Change NPC state/behavior
  | 'emitEvent'      // Fire a custom event
  | 'custom';        // Escape hatch

interface BeatAction {
  type: ActionType;
  target?: string;   // Flag name, item ID, NPC ID, etc.
  value?: unknown;   // Flag value, quantity, position, etc.
}
```

**Example: Talk to guard, then guard moves**

```
┌───────────────────────────────────┐
│ 💬 Talk to Guard                  │
│                                   │
│ onComplete:                       │
│   - setFlag: "guard_bribed"       │  ← flag name (string)
│   - teleportNPC:                  │
│       <guard-npc-uuid> → position │  ← NPC ID (UUID)
│   - playSound: "sfx/coins"        │  ← asset path (string)
└───────────────────────────────────┘
```

The actions are instant side effects. If you wanted the player to *watch* the guard walk to the gate, that would be a separate node:

```
[💬 Talk to Guard] ──▶ [🚶 Guard walks to gate] ──▶ [📍 Go to gate]
                              (node - blocks flow)
```

**When to use onEnter vs onComplete**:

| Use Case | When |
|----------|------|
| `onEnter` | Set up state before node runs. "When player starts talking to guard, play ambient music." |
| `onComplete` | React to completion. "When player finishes talking, set flag and play sound." |

Most actions go in `onComplete`. Use `onEnter` for setup that must happen before the node's main behavior.

### Data Model

```typescript
// Beat node types
type BeatNodeType = 'objective' | 'narrative' | 'condition' | 'branch';

// Objective subtypes (player actions)
type ObjectiveSubtype = 'talk' | 'collect' | 'location' | 'interact' | 'custom';

// Narrative subtypes (auto-triggered)
type NarrativeSubtype = 'voiceover' | 'dialogue' | 'cutscene' | 'event';

// Condition operators
type ConditionOperator = 'hasItem' | 'hasFlag' | 'questComplete' | 'stageComplete' | 'custom';

// Action types (instant, fire-and-forget side effects)
type ActionType =
  | 'setFlag'        // Set a world flag
  | 'giveItem'       // Add item to inventory
  | 'removeItem'     // Remove item from inventory
  | 'playSound'      // Fire-and-forget sound
  | 'spawnVFX'       // Fire-and-forget particle effect
  | 'teleportNPC'    // Instant NPC position change
  | 'setNPCState'    // Change NPC state/behavior
  | 'emitEvent'      // Fire a custom event
  | 'custom';        // Escape hatch

interface BeatAction {
  type: ActionType;
  target?: string;              // See "ID Types" below
  value?: unknown;              // Flag value, quantity, position, state, etc.
}

// ID Types - what uses UUIDs vs human-readable strings:
//
// UUIDs (references to entities/assets defined in editor):
//   - NPC IDs, Item IDs, Dialogue IDs, Quest IDs
//   - Trigger IDs, Region IDs, VFX Definition IDs
//   - All node IDs, stage IDs, objective IDs
//
// Human-readable strings (runtime keys, not editor-defined):
//   - Flag names (e.g., "chapter1_complete", "met_wizard")
//   - Event names (e.g., "door_opened", "boss_defeated")
//   - Sound asset paths (e.g., "sfx/coins.wav")
//

interface BeatNode {
  id: string;
  nodeType: BeatNodeType;
  description: string;

  // Graph structure (from ADR-015)
  prerequisites?: string[];

  // === Actions (instant side effects) ===
  onEnter?: BeatAction[];       // Fires when node activates, before it runs
  onComplete?: BeatAction[];    // Fires when node completes, before flow continues

  // === Objective-specific ===
  objectiveType?: ObjectiveSubtype;
  target?: string;              // NPC ID, item ID, trigger ID
  dialogue?: string;            // For talk objectives
  count?: number;               // For "collect 5 items"
  showInHUD?: boolean;          // Default true for objectives

  // === Narrative-specific ===
  narrativeType?: NarrativeSubtype;
  voiceoverText?: string;       // For voiceover
  dialogueId?: string;          // For dialogue trigger
  eventName?: string;           // For custom events

  // === Condition/Branch-specific ===
  condition?: ConditionExpression;
  failTargets?: string[];           // Node IDs activated on condition failure

  // === Common ===
  optional?: boolean;
}

// Condition expressions
interface ConditionExpression {
  operator: ConditionOperator;
  operand: string;              // Item ID, flag name, quest ID, etc.
  value?: string | number | boolean;  // For comparisons
  negate?: boolean;             // NOT modifier
}

// Compound conditions (future)
interface CompoundCondition {
  type: 'and' | 'or';
  conditions: (ConditionExpression | CompoundCondition)[];
}
```

### Execution Semantics

**Objective nodes**:
- Activate when all prerequisites complete
- Show in HUD (unless `showInHUD: false`)
- Wait for player to perform the action
- Complete when `QuestManager.triggerObjective()` called with matching type/target

**Narrative nodes**:
- Activate when all prerequisites complete
- **Immediately fire** their trigger (voiceover, dialogue, event)
- Complete when the triggered content finishes
- Never show in HUD

**Condition nodes** (gate):
- Activate when all prerequisites complete
- **Continuously evaluate** their condition on state changes
- Complete instantly when condition is true
- If condition already true when activated, complete immediately
- If condition is false, keep waiting — no fail path (use conditional dialogue via ADR-019 for hints)
- Never show in HUD
- Re-evaluate on relevant state changes (inventory, flags, quest state)

**Branch nodes** (route):
- Activate when all prerequisites complete
- **Evaluate once** immediately
- If true: complete normally → dependent nodes (pass targets) activate via prerequisites
- If false: activate `failTargets`, then complete **without cascading** to pass dependents
- Never show in HUD
- Do not re-evaluate — the branch is a one-shot decision

### Visual Representation

```
┌─────────────────────────────────────────────────────────────────────┐
│ Stage: "Escape the Manor"                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐                                                    │
│  │ N Voiceover │──────────────────┐                                 │
│  │ "I need to  │                  │                                 │
│  │ find a key" │                  │                                 │
│  └─────────────┘                  │                                 │
│        ▶                          │                                 │
│                                   ▼                                 │
│                            ┌─────────────┐     ┌─────────────────┐  │
│                            │ ? Has Key   │────▶│ 📍 Go to Door   │  │
│                            │ <item-uuid> │     │                 │  │
│                            └─────────────┘     └─────────────────┘  │
│                                   ▲                    │            │
│                                   │                    ▼            │
│  ┌─────────────┐                  │            [Stage Complete]     │
│  │ 📦 Collect  │──────────────────┘                                 │
│  │ <item-uuid> │                                                    │
│  └─────────────┘                                                    │
│        ▶                                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Legend:
▶ = Entry point (no prerequisites)
N = Narrative node (auto-triggers)
? = Condition node (gate — waits until true)
⑂ = Branch node (route — evaluates once, pass or fail)
📦 = Collect objective
📍 = Location objective
── = Pass connection (prerequisite)
╌╌ = Fail connection (activates when condition is false)
```

### Key Patterns

**Pattern 1: Item Gate**
```
[Collect Key] ──▶ [? Has Key] ──▶ [Go to Door]
```
The condition node allows the key to be collected at any time. If the player already has it, the gate passes immediately.

**Pattern 2: Narrative Sandwich**
```
[N: "Here we go"] ──▶ [Talk to NPC] ──▶ [N: "That went well"]
```
Voiceovers bookend a player action.

**Pattern 3: Parallel with Join**
```
[Find Clue A] ───┐
                 ├──▶ [? All clues found] ──▶ [Confront Suspect]
[Find Clue B] ───┘
```
Both clues needed. The condition node acts as an explicit join point.

**Pattern 4: Any-of Gate**
```
[Talk to Guard] ───┐
                   ├──▶ [? Has permission] ──▶ [Enter Castle]
[Bribe Guard]  ───┘
```
Either path grants access. Condition checks a flag set by either.

**Pattern 5: Actions on Completion**
```
┌──────────────────────────────┐
│ 💬 Talk to Merchant          │
│                              │
│ onComplete:                  │
│   - giveItem: <map-item-uuid>│
│   - setFlag: "received_map"  │  ← flag name (human-readable)
│   - playSound: "sfx/paper"   │  ← asset path (human-readable)
└──────────────────────────────┘
          │
          ▼
    [📍 Go to Forest]
```
When dialogue ends, player gets map (UUID reference), flag is set (string key), sound plays (asset path). All instant, then flow continues.

**Pattern 6: Blocking vs Non-blocking NPC Movement**

*Non-blocking (action) - NPC teleports instantly:*
```
┌─────────────────────────────────┐
│ 💬 Talk to Guard                │
│                                 │
│ onComplete:                     │
│   - teleportNPC:                │
│       <npc-uuid> → {x,y,z}      │
└─────────────────────────────────┘
          │
          ▼
    [📍 Go to <trigger-uuid>]
```

*Blocking (node) - Player watches guard walk:*
```
[💬 Talk to Guard] ──▶ [🚶 Guard walks to gate] ──▶ [📍 Go to Gate]
                              │
                              └─ Node with duration
                                 (narrativeType: 'cutscene'
                                  or custom node type)
```

Choose based on whether the player should experience the movement as a moment.

**Pattern 7: Gate Chain with Conditional Dialogue Hints**
```
[? Has Rug] ──pass──▶ [? Has Resonance] ──pass──▶ [💬 Talk to Ethan]
```
Gate nodes block flow until conditions are met. While gates are waiting, use conditional dialogue (ADR-019) driven by world state to show context-sensitive hints (e.g., "You need the rug" or "You need more resonance"). The gates themselves have no fail path — they just wait.

**Pattern 8: Story Branch (Permanent Choice)**
```
[⑂ Chose Dark Path?] ──pass──▶ [💬 Dark Mentor Dialogue] ──▶ [📍 Go to Shadow Temple]
         ╲
          ╌╌ fail ╌╌▶ [💬 Light Mentor Dialogue] ──▶ [📍 Go to Sun Temple]
```
Branch evaluates once. Player's earlier choice permanently routes the quest. Both paths are valid — only one activates.

**Pattern 9: Branch + Gate Combo**
```
[⑂ Has Lockpick?] ──pass──▶ [📍 Pick the lock]  ───┐
         ╲                                          ├──▶ [📍 Enter Tower]
          ╌╌ fail ╌╌▶ [💬 Talk to Locksmith] ──▶ [? Has Key] ──pass──┘
```
Branch routes immediately: if player already has a lockpick, they can pick the lock. Otherwise, they need to find the locksmith and get a key (gate waits until they have it). Both paths converge.

## Architecture

### ECS Integration

Sugar Engine uses an Entity-Component-System (ECS) architecture. The beats graph system integrates with ECS as follows:

**QuestManager is a Manager, not a System**

The `QuestManager` is *not* an ECS `System` (it doesn't tick every frame via `World.update()`). Instead, it's an event-driven manager that:
- Responds to game events (dialogue ended, item collected, trigger entered)
- Executes actions that modify entity components
- Queries the World to check conditions

```
┌─────────────────────────────────────────────────────────────┐
│                         Game                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐       events        ┌─────────────────┐   │
│  │   World     │◄────────────────────│  QuestManager   │   │
│  │   (ECS)     │                     │  (Beats Graph)  │   │
│  │             │   queries/actions   │                 │   │
│  │  Entities:  │────────────────────►│  Nodes:         │   │
│  │  - NPC      │                     │  - Objectives   │   │
│  │  - Player   │                     │  - Narratives   │   │
│  │  - Items    │                     │  - Conditions   │   │
│  │  - Triggers │                     │                 │   │
│  └─────────────┘                     └─────────────────┘   │
│         ▲                                    │              │
│         │              actions               │              │
│         └────────────────────────────────────┘              │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Systems    │ ◄── Tick every frame (movement, physics)   │
│  │  (ECS)      │                                            │
│  └─────────────┘                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Actions Target Entities via ID**

Actions reference entities by their logical ID (NPC ID, item ID), not by Entity handle. The action executor resolves IDs to entities:

```typescript
// Action references NPC by UUID
{ type: 'teleportNPC', target: '<npc-uuid>', value: { x: 10, y: 0, z: 5 } }

// Executor finds entity with matching NPC component
private findNPCEntity(npcId: string): Entity | null {
  const results = this.world.query<[NPC]>(NPC);
  for (const { entity, components: [npc] } of results) {
    if (npc.id === npcId) return entity;
  }
  return null;
}

// Then modifies Position component
private teleportNPC(npcId: string, position: Vec3): void {
  const entity = this.findNPCEntity(npcId);
  if (!entity) return;

  const pos = this.world.getComponent<Position>(entity, Position);
  if (pos) {
    pos.x = position.x;
    pos.y = position.y;
    pos.z = position.z;
  }
}
```

**Actions Modify Components**

| Action | Component(s) Modified |
|--------|----------------------|
| `teleportNPC` | `Position` |
| `setNPCState` | `NPC`, potentially `NPCMovement` |
| `giveItem` | N/A (Inventory is not ECS) |
| `spawnVFX` | Creates entity with `VFXEmitter`, `Position` |
| `playSound` | N/A (Audio is not ECS) |

**Conditions Query the World**

Some conditions check ECS state:

```typescript
// Condition: NPC is at location (both are UUIDs)
{ operator: 'npcAtLocation', operand: '<npc-uuid>', value: '<trigger-uuid>' }

private checkNpcAtLocation(npcId: string, locationId: string): boolean {
  const entity = this.findNPCEntity(npcId);
  if (!entity) return false;

  const pos = this.world.getComponent<Position>(entity, Position);
  const trigger = this.getTriggerBounds(locationId);

  return trigger.contains(pos.x, pos.y, pos.z);
}
```

**Blocking Actions Create Components**

For actions that need to block flow (NPC walks to location), we add a component that a System processes:

```typescript
// "NPC walks to gate" node activates
// 1. Add NPCMovement component with target
this.world.addComponent(entity, new NPCMovement({
  target: gatePosition,
  onArrive: () => this.quests.completeNode(questId, nodeId)
}));

// 2. MovementSystem (ECS System) ticks every frame
class MovementSystem extends System {
  update(world: World, delta: number): void {
    for (const { entity, components: [pos, movement] } of world.query(Position, NPCMovement)) {
      // Move toward target
      // When arrived, fire callback and remove component
    }
  }
}
```

This keeps the beats graph event-driven while leveraging ECS for frame-by-frame simulation.

### Engine Changes

**QuestManager additions**:

```typescript
class QuestManager {
  // Track condition nodes that need evaluation
  private pendingConditions: Map<string, Set<string>> = new Map();

  // Called when game state changes (inventory, flags, etc.)
  evaluateConditions(): void {
    for (const [questId, conditionIds] of this.pendingConditions) {
      for (const condId of conditionIds) {
        if (this.checkCondition(questId, condId)) {
          this.completeObjective(questId, condId);
        }
      }
    }
  }

  private checkCondition(questId: string, nodeId: string): boolean {
    const node = this.getNode(questId, nodeId);
    if (!node.condition) return false;

    switch (node.condition.operator) {
      case 'hasItem':
        return this.inventory.has(node.condition.operand);
      case 'hasFlag':
        return this.flags.get(node.condition.operand) === (node.condition.value ?? true);
      case 'questComplete':
        return this.isQuestComplete(node.condition.operand);
      // ... etc
    }
  }

  // Execute instant actions (called by QuestManager, interacts with ECS World)
  private executeActions(actions: BeatAction[] | undefined): void {
    if (!actions) return;
    for (const action of actions) {
      switch (action.type) {
        case 'setFlag':
          this.flags.set(action.target!, action.value as boolean);
          break;

        case 'giveItem':
          // Inventory is a manager, not ECS
          this.inventory.add(action.target!, action.value as number ?? 1);
          break;

        case 'removeItem':
          this.inventory.remove(action.target!, action.value as number ?? 1);
          break;

        case 'playSound':
          // Audio is a manager, not ECS
          this.audio.playSound(action.target!);
          break;

        case 'spawnVFX':
          // Creates entity with VFXEmitter + Position components
          const vfxEntity = this.world.createEntity();
          this.world.addComponent(vfxEntity, new Position(
            (action.value as Vec3).x,
            (action.value as Vec3).y,
            (action.value as Vec3).z
          ));
          this.world.addComponent(vfxEntity, new VFXEmitter(action.target!));
          break;

        case 'teleportNPC':
          // Query for NPC entity, modify Position component
          const npcEntity = this.findEntityByNpcId(action.target!);
          if (npcEntity) {
            const pos = this.world.getComponent<Position>(npcEntity, Position);
            if (pos) {
              const target = action.value as Vec3;
              pos.x = target.x;
              pos.y = target.y;
              pos.z = target.z;
            }
          }
          break;

        case 'setNPCState':
          // Modify NPC component state
          const entity = this.findEntityByNpcId(action.target!);
          if (entity) {
            const npc = this.world.getComponent<NPC>(entity, NPC);
            if (npc) {
              Object.assign(npc, action.value);
            }
          }
          break;

        case 'emitEvent':
          this.events.emit(action.target!, action.value);
          break;
      }
    }
  }

  // Helper: find entity by NPC ID (queries ECS World)
  private findEntityByNpcId(npcId: string): Entity | null {
    const results = this.world.query<[NPC]>(NPC);
    for (const { entity, components: [npc] } of results) {
      if (npc.id === npcId) return entity;
    }
    return null;
  }

  // Activate a node (prerequisites already checked)
  private activateNode(questId: string, node: BeatNode): void {
    // Fire onEnter actions FIRST (instant)
    this.executeActions(node.onEnter);

    // Then handle node-type-specific activation
    switch (node.nodeType) {
      case 'objective':
        // Add to active objectives, show in HUD
        this.activeObjectives.get(questId)?.add(node.id);
        break;

      case 'narrative':
        // Fire immediately
        this.onNarrativeTrigger?.(questId, node);
        // Will complete when narrative finishes (async)
        break;

      case 'condition':
        // Register for evaluation
        this.pendingConditions.get(questId)?.add(node.id);
        // Check immediately in case already satisfied
        if (this.checkCondition(questId, node.id)) {
          this.completeNode(questId, node.id);
        }
        // Otherwise keeps waiting — no fail path (hints via ADR-019)
        break;

      case 'branch':
        // Evaluate once, route to pass or fail, then done
        if (this.checkCondition(questId, node.id)) {
          // True: complete normally (cascades to pass dependents)
          this.completeNode(questId, node.id);
        } else {
          // False: activate fail targets, complete without cascading
          this.activateFailTargets(questId, node);
          this.completeNode(questId, node.id, { skipCascade: true });
        }
        break;
    }
  }

  // Complete a node
  completeNode(questId: string, nodeId: string): void {
    const node = this.getNode(questId, nodeId);

    // Fire onComplete actions (instant)
    this.executeActions(node.onComplete);

    // Mark complete and cascade to dependents
    // ... existing completion logic ...
  }
}
```

**Game.ts integration**:

```typescript
// Hook condition evaluation to state changes
this.inventory.setOnItemAdded(() => {
  this.quests.evaluateConditions();
});

this.inventory.setOnItemRemoved(() => {
  this.quests.evaluateConditions();
});

this.flags.setOnFlagChanged(() => {
  this.quests.evaluateConditions();
});

// Handle narrative triggers
this.quests.setOnNarrativeTrigger((questId, node) => {
  switch (node.narrativeType) {
    case 'voiceover':
      this.voiceover.play(node.voiceoverText!, () => {
        this.quests.completeObjective(questId, node.id);
      });
      break;
    case 'dialogue':
      this.dialogue.start(node.dialogueId!, () => {
        this.quests.completeObjective(questId, node.id);
      });
      break;
    case 'event':
      this.events.emit(node.eventName!);
      this.quests.completeObjective(questId, node.id);
      break;
  }
});
```

### Editor Changes

**Visual node styling by type**:

| Type | Shape | Color | Icon | Ports |
|------|-------|-------|------|-------|
| Objective | Rounded rect | Blue (#89b4fa) | Subtype icon | 1 in, 1 out |
| Narrative | Rounded rect | Purple (#cba6f7) | `N` badge | 1 in, 1 out |
| Condition | Dashed border rect | Yellow (#f9e2af) | `?` badge | 1 in, 2 out (pass ✓ green, fail ✗ red) |
| Branch | Rounded rect | Orange (#fab387) | `⑂` badge | 1 in, 2 out (pass ✓ green, fail ✗ red) |

Fail connections render as **dashed red lines** to visually distinguish them from pass connections (solid blue lines).

**Node creation menu**:
```
+ Add Node
├── Objective
│   ├── Talk to NPC
│   ├── Collect Item
│   ├── Go to Location
│   └── Custom
├── Narrative
│   ├── Voiceover
│   ├── Trigger Dialogue
│   └── Fire Event
├── Condition (gate)
│   ├── Has Item
│   ├── Has Flag
│   ├── Quest Complete
│   └── Custom Expression
└── Branch (route)
    ├── Has Item
    ├── Has Flag
    ├── Quest Complete
    └── Custom Expression
```

## Implementation Phases

### Phase 1: Core Data Model
1. Add `nodeType` field to BeatNode (default: 'objective' for migration)
2. Add `onEnter?: BeatAction[]` and update `onComplete?: BeatAction[]`
3. Add `BeatAction` type with action types
4. Add `condition?: ConditionExpression` for condition nodes
5. Add `narrativeType` and related fields for narrative nodes
6. Update editor store types

### Phase 2: Engine - Actions
1. Implement `executeActions()` in QuestManager
2. Wire up action handlers (setFlag, giveItem, playSound, etc.)
3. Call `executeActions(onEnter)` on node activation
4. Call `executeActions(onComplete)` on node completion

### Phase 3: Engine - Node Types
1. Update `activateNode()` to handle all four node types (objective, narrative, condition, branch)
2. Add condition evaluation and `evaluateConditions()`
3. Hook state changes (inventory, flags) to condition re-evaluation
4. Add narrative trigger handler with completion callbacks
5. Implement fail target activation for condition and branch nodes
6. Implement branch one-shot evaluation with `skipCascade` on false path

### Phase 4: Editor - Visual Updates
1. Different node shapes/colors by node type
2. Action list editor (onEnter/onComplete)
3. Condition expression editor UI
4. Updated node creation menu with all types (including branch)
5. Type-specific property panels
6. Pass/fail output ports on condition and branch nodes
7. Dashed red fail connections, solid blue pass connections
8. Fail targets section in editor panel

### Phase 5: Polish
1. Condition preview (show current state in editor)
2. Action preview (show what will happen)
3. Validation (condition syntax, missing targets, orphan nodes)
4. Documentation and examples

## Migration

Existing objectives migrate cleanly:
- All current objectives get `nodeType: 'objective'`
- `type` field becomes `objectiveType`
- `autoStart: true` voiceovers become `nodeType: 'narrative'`
- Existing `onComplete` actions remain (already the right structure)
- No data loss, automatic migration on load

## Consequences

### Positive

- Clear separation: player actions vs system triggers vs state checks
- Condition nodes solve the "already have item" problem elegantly
- Narrative nodes are first-class, not objectives with flags
- Visual distinction makes graphs self-documenting
- Builds on ADR-015 rather than replacing it

### Negative

- More node types = more complexity
- Condition evaluation on every state change could be costly (mitigate with dirty flags)
- Need condition expression UI (could be complex)

### Neutral

- Stage boundaries remain (beats graph is per-stage)
- `QuestObjective` type gets more fields (but many are type-specific)

## Future Considerations

### Conditions
1. **Compound conditions**: AND/OR logic for complex gates
2. **Timed conditions**: "Wait 5 seconds", "Wait until night"
3. **Cross-stage conditions**: Reference state from other stages
4. **Condition editor**: Visual builder vs expression syntax

### Flow Control
5. ~~**Branch nodes**: Split flow based on condition (true → A, false → B)~~ — Implemented (see Gate vs Branch above)
6. **Loop nodes**: Repeat a subgraph until condition met
7. **Random selector**: Pick one of N paths randomly

### Actions
8. **Custom action handlers**: Plugin system for game-specific actions
9. **Action sequences**: Multiple actions with delays between them (still instant overall)
10. **Conditional actions**: Only fire action if condition met

### Editor
11. **Action palette**: Drag-and-drop action builder
12. **Live preview**: See actions fire in preview mode
13. **Undo/redo**: Full history for graph editing

### Persistence
14. **Save/restore**: Condition state and pending nodes must serialize
15. **Hot reload**: Update quest definitions without restart
