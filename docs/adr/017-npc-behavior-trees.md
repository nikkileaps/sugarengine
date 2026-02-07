# ADR-017: NPC Behavior Tree System

## Status

Accepted (Implemented, phase 5 polish pending)

## Context

ADR-016 introduced the beats graph for quest/narrative flow. During design, we identified a gap: how do NPCs react to quest state and world conditions?

Initial approaches considered:
1. **Dialogue overrides from quests** - Quest tells NPC what to say. Makes quests puppet NPCs.
2. **Flag-based dialogue conditions** - NPCs check flags. Leads to spaghetti, hard to debug.
3. **Rule-based NPC behavior** - NPCs have condition→action rules. Doesn't scale.

The industry-standard solution is **behavior trees**. Games like Skyrim, Witcher 3, Halo, and most AAA titles use behavior trees for NPC decision-making.

### Why Behavior Trees?

Behavior trees provide:
- **Visual, debuggable** - Tree structure is easy to understand and trace
- **Composable** - Subtrees can be reused across NPCs
- **Clear semantics** - Nodes return success/failure/running
- **Scalable** - Handle complex decision-making without spaghetti
- **Reactive** - Re-evaluate when world state changes

### Separation of Concerns

| System | Responsibility |
|--------|----------------|
| Beats Graph (ADR-016) | Quest/story flow, objectives, narrative triggers |
| Behavior Trees (this ADR) | NPC decision-making, dialogue selection, movement |
| World State (ADR-018) | Shared state that both systems read/write |

NPCs are **autonomous agents** that make decisions based on world state. Quests don't puppet NPCs - they modify world state, and NPCs react.

## Decision

Implement a behavior tree system for NPC AI with the following characteristics:

### Core Node Types

**Control Nodes** (have children):

| Node | Behavior |
|------|----------|
| **Selector** | Try children in order, return first success (OR logic) |
| **Sequence** | Run children in order, fail on first failure (AND logic) |
| **Parallel** | Run all children simultaneously, configurable success policy |

**Decorator Nodes** (single child, modify behavior):

| Node | Behavior |
|------|----------|
| **Inverter** | Flip child's success/failure |
| **Repeater** | Repeat child N times or until fail |
| **Succeeder** | Always return success regardless of child |
| **UntilFail** | Keep running child until it fails |

**Leaf Nodes** (no children, do work):

| Node | Behavior |
|------|----------|
| **Condition** | Check world state, return success/failure |
| **Action** | Perform an action, return success/failure/running |

### Node Return States

```typescript
type BTStatus = 'success' | 'failure' | 'running';
```

- **success**: Node completed successfully
- **failure**: Node failed
- **running**: Node is still executing (async actions like walking)

### Data Model

```typescript
// Base node interface
interface BTNode {
  id: string;
  type: BTNodeType;
  name?: string;  // Human-readable label for debugging
}

type BTNodeType =
  // Control
  | 'selector'
  | 'sequence'
  | 'parallel'
  // Decorators
  | 'inverter'
  | 'repeater'
  | 'succeeder'
  | 'untilFail'
  // Leaves
  | 'condition'
  | 'action';

// Control nodes
interface BTControlNode extends BTNode {
  type: 'selector' | 'sequence' | 'parallel';
  children: BTNode[];
}

interface BTParallelNode extends BTControlNode {
  type: 'parallel';
  policy: 'requireAll' | 'requireOne';  // Success policy
}

// Decorator nodes
interface BTDecoratorNode extends BTNode {
  type: 'inverter' | 'repeater' | 'succeeder' | 'untilFail';
  child: BTNode;
  count?: number;  // For repeater
}

// Condition node - checks world state
interface BTConditionNode extends BTNode {
  type: 'condition';
  condition: WorldStateCondition;  // Defined in ADR-018
}

// Action node - performs an action
interface BTActionNode extends BTNode {
  type: 'action';
  action: BTAction;
}

// Actions NPCs can perform
type BTAction =
  | { type: 'dialogue'; dialogueId: string }
  | { type: 'moveTo'; target: string | Vec3 }  // Entity UUID or position
  | { type: 'wait'; seconds: number }
  | { type: 'animate'; animation: string }
  | { type: 'lookAt'; target: string }
  | { type: 'setFlag'; flag: string; value: unknown }
  | { type: 'emitEvent'; event: string; data?: unknown }
  | { type: 'custom'; handler: string; params?: unknown };
```

### NPC Definition

Each NPC has a behavior tree definition:

```typescript
interface NPCDefinition {
  id: string;
  name: string;
  portrait?: string;

  // Behavior
  behaviorTree?: BTNode;           // Root of behavior tree
  defaultDialogue?: string;        // Fallback if no BT or BT doesn't select dialogue

  // Interaction
  interactionRange?: number;       // How close player must be
  interactionPrompt?: string;      // "Press E to talk"
}
```

### Example: Guard NPC

```
Guard Behavior Tree:

Selector
├── Sequence [Quest-specific behavior]
│   ├── Condition: quest.stage("flying-home", "build-resonance") == active
│   └── Action: dialogue(<brush-off-dialogue-uuid>)
│
├── Sequence [Night patrol]
│   ├── Condition: world.timeOfDay == "night"
│   └── Selector
│       ├── Sequence [At post?]
│       │   ├── Condition: self.atLocation(<guardhouse-uuid>)
│       │   └── Action: dialogue(<night-guard-dialogue-uuid>)
│       └── Action: moveTo(<guardhouse-uuid>)
│
├── Sequence [Player has bribe]
│   ├── Condition: player.hasItem(<bribe-item-uuid>)
│   └── Action: dialogue(<bribe-dialogue-uuid>)
│
└── Action: dialogue(<default-dialogue-uuid>) [Fallback]
```

In JSON:

```json
{
  "type": "selector",
  "children": [
    {
      "type": "sequence",
      "name": "Quest: Flying Home - Build Resonance",
      "children": [
        {
          "type": "condition",
          "condition": {
            "type": "questStage",
            "questId": "<quest-uuid>",
            "stageId": "<stage-uuid>",
            "state": "active"
          }
        },
        {
          "type": "action",
          "action": { "type": "dialogue", "dialogueId": "<dialogue-uuid>" }
        }
      ]
    },
    {
      "type": "sequence",
      "name": "Night behavior",
      "children": [
        {
          "type": "condition",
          "condition": { "type": "timeOfDay", "value": "night" }
        },
        {
          "type": "selector",
          "children": [
            {
              "type": "sequence",
              "children": [
                {
                  "type": "condition",
                  "condition": { "type": "atLocation", "locationId": "<loc-uuid>" }
                },
                {
                  "type": "action",
                  "action": { "type": "dialogue", "dialogueId": "<dialogue-uuid>" }
                }
              ]
            },
            {
              "type": "action",
              "action": { "type": "moveTo", "target": "<loc-uuid>" }
            }
          ]
        }
      ]
    },
    {
      "type": "action",
      "name": "Default",
      "action": { "type": "dialogue", "dialogueId": "<default-dialogue-uuid>" }
    }
  ]
}
```

### Execution Model

**When does the tree run?**

Two modes:

1. **On Interaction**: Tree runs when player interacts with NPC
   - Used for dialogue selection
   - Tree runs to completion (no `running` states for dialogue)

2. **Continuous (Ticked)**: Tree runs every frame/tick
   - Used for autonomous behavior (patrolling, schedules)
   - Handles `running` states for movement, waiting

```typescript
interface NPCBehaviorComponent {
  tree: BTNode;
  mode: 'onInteraction' | 'continuous';
  tickInterval?: number;  // ms between ticks for continuous mode

  // Runtime state
  runningNode?: string;   // ID of node that returned 'running'
  blackboard: Map<string, unknown>;  // Per-NPC local state
}
```

**Blackboard**

Each NPC has a blackboard for local state (e.g., "last player seen at", "current patrol point"). This is separate from world state.

### ECS Integration

**Components:**

```typescript
// The behavior tree definition and runtime state
class NPCBehavior implements Component {
  static readonly type = 'NPCBehavior';
  readonly type = NPCBehavior.type;

  constructor(
    public tree: BTNode,
    public mode: 'onInteraction' | 'continuous' = 'onInteraction',
    public blackboard: Map<string, unknown> = new Map()
  ) {}

  runningNodeId?: string;
}
```

**System:**

```typescript
class BehaviorTreeSystem extends System {
  constructor(
    private worldState: WorldState  // From ADR-018
  ) {}

  update(world: World, delta: number): void {
    // Only tick continuous behavior trees
    const npcs = world.query<[NPC, NPCBehavior, Position]>(NPC, NPCBehavior, Position);

    for (const { entity, components: [npc, behavior, pos] } of npcs) {
      if (behavior.mode !== 'continuous') continue;

      const context: BTContext = {
        entity,
        npc,
        position: pos,
        world,
        worldState: this.worldState,
        blackboard: behavior.blackboard,
        delta,
      };

      this.tick(behavior.tree, context, behavior);
    }
  }

  // Called by interaction system for on-demand evaluation
  evaluateForInteraction(entity: Entity, world: World): BTAction | null {
    const behavior = world.getComponent<NPCBehavior>(entity, NPCBehavior);
    if (!behavior) return null;

    const context = this.buildContext(entity, world);
    const result = this.evaluate(behavior.tree, context);

    if (result.status === 'success' && result.action) {
      return result.action;
    }
    return null;
  }

  private tick(node: BTNode, context: BTContext, behavior: NPCBehavior): BTStatus {
    // If we have a running node, resume from there
    if (behavior.runningNodeId) {
      // ... resume logic
    }
    return this.evaluate(node, context).status;
  }

  private evaluate(node: BTNode, context: BTContext): BTResult {
    switch (node.type) {
      case 'selector':
        return this.evaluateSelector(node as BTControlNode, context);
      case 'sequence':
        return this.evaluateSequence(node as BTControlNode, context);
      case 'condition':
        return this.evaluateCondition(node as BTConditionNode, context);
      case 'action':
        return this.evaluateAction(node as BTActionNode, context);
      // ... etc
    }
  }

  private evaluateSelector(node: BTControlNode, context: BTContext): BTResult {
    for (const child of node.children) {
      const result = this.evaluate(child, context);
      if (result.status === 'success' || result.status === 'running') {
        return result;
      }
    }
    return { status: 'failure' };
  }

  private evaluateSequence(node: BTControlNode, context: BTContext): BTResult {
    for (const child of node.children) {
      const result = this.evaluate(child, context);
      if (result.status === 'failure' || result.status === 'running') {
        return result;
      }
    }
    return { status: 'success' };
  }

  private evaluateCondition(node: BTConditionNode, context: BTContext): BTResult {
    const passed = context.worldState.check(node.condition);
    return { status: passed ? 'success' : 'failure' };
  }

  private evaluateAction(node: BTActionNode, context: BTContext): BTResult {
    // For interaction mode, just return the action
    return { status: 'success', action: node.action };
  }
}
```

### Interaction Flow

When player presses E near an NPC:

```typescript
// In InteractionSystem or Game.ts
handleNPCInteraction(npcEntity: Entity): void {
  // 1. Evaluate behavior tree
  const action = this.behaviorTreeSystem.evaluateForInteraction(npcEntity, this.world);

  // 2. Execute the resulting action
  if (action) {
    switch (action.type) {
      case 'dialogue':
        this.dialogue.start(action.dialogueId);
        break;
      // ... other action types
    }
  } else {
    // Fallback to NPC's default dialogue
    const npc = this.world.getComponent<NPC>(npcEntity, NPC);
    if (npc.dialogueId) {
      this.dialogue.start(npc.dialogueId);
    }
  }
}
```

### Editor Integration

**Behavior Tree Editor:**

Visual node-based editor for building behavior trees. Similar to the beats graph editor but with BT-specific nodes.

```
┌─────────────────────────────────────────────────────────────┐
│ NPC: Town Guard                              [Save] [Test]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐                                               │
│  │ Selector │                                               │
│  └────┬─────┘                                               │
│       │                                                     │
│   ┌───┴───────────────┬─────────────────┐                  │
│   ▼                   ▼                 ▼                  │
│ ┌──────────┐    ┌──────────┐      ┌──────────┐            │
│ │ Sequence │    │ Sequence │      │  Action  │            │
│ │ "Quest"  │    │ "Night"  │      │ Default  │            │
│ └────┬─────┘    └────┬─────┘      │ Dialogue │            │
│      │               │            └──────────┘            │
│   ┌──┴──┐         ┌──┴──┐                                 │
│   ▼     ▼         ▼     ▼                                 │
│ ┌───┐ ┌───┐    ┌───┐ ┌───┐                               │
│ │ ? │ │ ! │    │ ? │ │...│                               │
│ └───┘ └───┘    └───┘ └───┘                               │
│                                                             │
│ Legend: ? = Condition, ! = Action, [...] = Subtree         │
└─────────────────────────────────────────────────────────────┘
```

**Node Palette:**
```
+ Add Node
├── Control
│   ├── Selector (OR)
│   ├── Sequence (AND)
│   └── Parallel
├── Decorator
│   ├── Inverter
│   ├── Repeater
│   └── Succeeder
├── Condition
│   ├── Quest Stage Active
│   ├── Has Item
│   ├── Has Flag
│   ├── Time of Day
│   ├── At Location
│   └── Custom
└── Action
    ├── Start Dialogue
    ├── Move To
    ├── Wait
    ├── Animate
    └── Custom
```

### Subtrees (Reusable Behaviors)

Define reusable behavior patterns:

```typescript
interface BTSubtreeLibrary {
  subtrees: Map<string, BTNode>;  // UUID → root node
}

// Reference a subtree
interface BTSubtreeRef extends BTNode {
  type: 'subtree';
  subtreeId: string;  // UUID of subtree in library
}
```

Example subtrees:
- "Shopkeeper Hours" - Open during day, closed at night
- "Scared of Combat" - Flee when combat nearby
- "Idle Chatter" - Random idle dialogue

## Implementation Phases

### Phase 1: Core Engine
1. Define BTNode types and data structures
2. Implement tree evaluation (selector, sequence, condition, action)
3. Add NPCBehavior component
4. Create BehaviorTreeSystem

### Phase 2: Interaction Integration
1. Hook behavior tree evaluation into NPC interaction
2. Implement dialogue action
3. Fallback to default dialogue

### Phase 3: Continuous Behaviors
1. Implement `running` state handling
2. Add movement actions (moveTo)
3. Add wait action
4. Tick continuous trees in system update

### Phase 4: Editor
1. Behavior tree visual editor
2. Node palette and property panels
3. Subtree library
4. Test/preview mode

### Phase 5: Polish
1. Debugging visualization (which node is active)
2. Performance optimization (dirty flags, caching)
3. Subtree hot-reload

## Consequences

### Positive

- NPCs feel autonomous, not scripted
- Scales to complex behaviors
- Industry-standard pattern, well-documented
- Visual editing matches mental model
- Reusable subtrees reduce duplication
- Clear debugging (trace tree execution)

### Negative

- More complex than simple dialogue selection
- Requires learning BT concepts
- Tree evaluation has performance cost (mitigate with caching)
- Another editor UI to build

### Neutral

- Quests and NPCs are decoupled (communicate via world state)
- Continuous behaviors need frame budget management
- Subtrees add indirection

## Future Considerations

1. **Utility AI**: Score-based action selection for more nuanced decisions
2. **GOAP**: Goal-oriented action planning for complex NPCs
3. **Hierarchical Tasks**: HTN planning for sophisticated behavior
4. **Crowd Behavior**: Shared trees for background NPCs
5. **Learning/Adaptation**: NPCs that remember player behavior
6. **Performance**: LOD for distant NPCs (simpler trees)
