# ADR-015: Objective Graph System

## Status

Proposed

## Context

The quest system currently organizes objectives as a flat list within each stage. As we added features like `autoTrigger` (conditions on objective entry) and `onComplete` actions (actions on objective exit, including `triggerObjective`), a pattern emerged: objectives are naturally forming a **graph structure** with:

- **Incoming edges**: Conditions/prerequisites that must be met before an objective activates
- **Outgoing edges**: Actions that trigger when an objective completes (including triggering other objectives)

This is exactly how professional narrative tools like [articy:draft](https://www.articy.com/en/) structure quest/dialogue flows. Rather than fight this pattern with workarounds, we should embrace it with proper graph-based authoring.

### Current Pain Points

1. `triggerObjective` action feels like a hack - it's really just an edge in a graph
2. No visual representation of objective dependencies
3. Hard to author parallel objectives (A and B must both complete before C)
4. Sequential chains require manually setting up `onComplete` → `triggerObjective` for each step

## Decision

Implement a **hybrid approach**:

1. **Stages remain linear** - Quest progresses through stages sequentially (Stage 1 → Stage 2 → ...)
2. **Objectives within a stage form a graph** - Objectives can have prerequisites and trigger other objectives
3. **Visual node editor** - Reuse existing `NodeCanvas` component for graph authoring

### Data Model Changes

```typescript
// Updated QuestObjective
interface QuestObjective {
  id: string;
  type: 'talk' | 'voiceover' | 'location' | 'collect' | 'trigger' | 'custom';
  target?: string;
  description: string;
  dialogue?: string;
  optional?: boolean;
  hidden?: boolean;
  completeOn?: 'interact' | 'dialogueEnd';

  // Graph structure (NEW)
  prerequisites?: string[];        // Objective IDs that must complete first

  // Existing - kept for non-graph actions
  autoTrigger?: { ... };          // Auto-start conditions (entry node behavior)
  onComplete?: ObjectiveAction[]; // Post-completion actions (non-trigger actions only)
}

// Stage gains entry point concept
interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  startObjectives?: string[];     // Entry points (objectives with no prerequisites)
  next?: string;
  onComplete?: 'success' | 'failure';
}
```

### Graph Semantics

1. **Entry objectives**: Objectives with no prerequisites (or listed in `startObjectives`) activate when stage begins
2. **Prerequisites**: An objective only activates when ALL prerequisites are complete
3. **Parallel paths**: Multiple objectives can be active simultaneously
4. **Convergence**: An objective can require multiple prerequisites (join node)
5. **Branching**: An objective completing can satisfy prerequisites of multiple other objectives (fork)

### Visual Representation

```
Stage 1: "Meet the Stranger"
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐                                               │
│  │ 📖 Read  │──┬──────────────────────────────────────┐    │
│  │ Handbook │  │                                      │    │
│  └──────────┘  │                                      ▼    │
│       ▶        │    ┌───────────┐    ┌─────────────────┐   │
│   (start)      └───▶│ 🎤 Holly  │───▶│ 💬 Talk to     │   │
│                     │ Voiceover │    │    Ethan       │   │
│                     └───────────┘    └─────────────────┘   │
│                                             │              │
│                                             ▼              │
│                                      [Stage Complete]      │
└─────────────────────────────────────────────────────────────┘

Legend:
▶ = Entry point (no prerequisites)
→ = Prerequisite relationship
```

## Architecture

### Reusing NodeCanvas

The existing `NodeCanvas` component (used for dialogue trees) provides:

- Pan/zoom canvas
- Draggable nodes
- Connection drawing (bezier curves)
- Drag-to-connect between ports
- Mini-map navigation
- Node selection

We create `ObjectiveNodeCanvas.tsx` as a React wrapper (following the `DialogueNodeCanvas` pattern).

### File Structure

```
src/editor/panels/quest/
├── QuestPanel.tsx              # Main panel (existing)
├── QuestDetail.tsx             # Stage overview (modified)
├── QuestInspector.tsx          # Quest properties (existing)
├── ObjectiveModal.tsx          # Objective editor modal (existing)
└── ObjectiveNodeCanvas.tsx     # NEW: Graph editor for objectives
```

### ObjectiveNodeCanvas Component

```typescript
interface ObjectiveNodeCanvasProps {
  stage: QuestStage;
  objectives: QuestObjective[];
  selectedObjectiveId: string | null;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  dialogues: { id: string; name: string }[];
  onObjectiveSelect: (id: string | null) => void;
  onStageChange: (stage: QuestStage) => void;
  onObjectiveChange: (objective: QuestObjective) => void;
  onAddObjective: () => void;
  onDeleteObjective: (id: string) => void;
}
```

### Node Rendering

Each objective renders as a node with:

```
┌─────────────────────────────────┐
│ ● [input port]                  │
├─────────────────────────────────┤
│ 💬 Talk to Ethan                │  ← Type icon + description
│ ─────────────────────────────── │
│ Target: npc_ethan               │  ← Target (if applicable)
│ Dialogue: intro_ethan           │  ← Dialogue (if applicable)
├─────────────────────────────────┤
│ [OPT] [AUTO]                    │  ← Badges (optional, auto-trigger)
├─────────────────────────────────┤
│                  [output port] ●│
└─────────────────────────────────┘
```

### Connection Logic

- **Creating connection**: Drag from output port → input port
  - Adds target objective ID to source's... wait, we model prerequisites on the TARGET
  - So: dragging A→B adds A to B's `prerequisites[]`

- **Deleting connection**: Click connection line → delete button
  - Removes prerequisite from target objective

### Auto-Layout

When opening a stage's graph for the first time (no saved positions):

1. Find entry objectives (no prerequisites)
2. BFS from entries, assigning depth levels
3. Position nodes in columns by depth, rows within each depth
4. Save positions to stage data for persistence

```typescript
interface QuestStage {
  // ... existing fields
  objectivePositions?: Record<string, { x: number; y: number }>;
}
```

## Engine Changes

### QuestManager Updates

```typescript
class QuestManager {
  // Track which objectives are "active" (prerequisites met, not yet complete)
  private activeObjectives: Map<string, Set<string>> = new Map();

  // When stage starts, activate entry objectives
  private activateStage(questId: string, stageId: string): void {
    const stage = this.getStage(questId, stageId);
    const entryObjectives = stage.objectives.filter(
      obj => !obj.prerequisites || obj.prerequisites.length === 0
    );
    for (const obj of entryObjectives) {
      this.activateObjective(questId, obj);
    }
  }

  // When objective completes, check if it unlocks others
  completeObjective(questId: string, objectiveId: string): void {
    // ... existing completion logic ...

    // Check if this completion unlocks other objectives
    const stage = this.getCurrentStage(questId);
    for (const obj of stage.objectives) {
      if (obj.prerequisites?.includes(objectiveId)) {
        // Check if ALL prerequisites are now met
        const allMet = obj.prerequisites.every(
          preReqId => this.isObjectiveComplete(questId, preReqId)
        );
        if (allMet) {
          this.activateObjective(questId, obj);
        }
      }
    }
  }
}
```

### Backward Compatibility

- Objectives without `prerequisites` behave as before (active immediately)
- `triggerObjective` action still works but is deprecated for intra-stage triggers
- `onComplete` actions still fire (for non-trigger actions like `moveNpc`)

## Implementation Phases

### Phase 1: Data Model & Engine

1. Add `prerequisites?: string[]` to `QuestObjective` type (editor + engine)
2. Add `startObjectives?: string[]` and `objectivePositions?` to `QuestStage`
3. Update `QuestManager` to track active objectives and check prerequisites
4. Update objective completion to cascade-activate dependent objectives

### Phase 2: Node Canvas Component

1. Create `ObjectiveNodeCanvas.tsx` following `DialogueNodeCanvas` pattern
2. Implement `renderNode` callback for objective visualization
3. Implement connection creation (prerequisite relationships)
4. Implement auto-layout algorithm
5. Add position persistence

### Phase 3: QuestDetail Integration

1. Add "Open Graph" button to stage cards
2. When clicked, expand to show `ObjectiveNodeCanvas` for that stage
3. Side panel for editing selected objective (reuse `ObjectiveModal` content)
4. Toolbar: Add Objective, Fit View, Auto-Layout

### Phase 4: Polish

1. Entry point indicators (▶ icon on nodes with no prerequisites)
2. Completion state visualization (completed objectives grayed/checked)
3. Validation warnings (orphan objectives, cycles, unreachable objectives)
4. Minimap for large graphs

## Verification

### Manual Testing

1. **Create graph**:
   - Add 3 objectives to a stage
   - Connect A → B → C (sequential)
   - Verify B doesn't activate until A completes
   - Verify C doesn't activate until B completes

2. **Parallel paths**:
   - Create A → C and B → C (both required)
   - Verify C only activates after BOTH A and B complete

3. **Branching**:
   - Create A → B and A → C (one unlocks two)
   - Verify both B and C activate after A completes

4. **Persistence**:
   - Arrange nodes, save project
   - Reload, verify positions preserved

### Build Verification

```bash
npm run build  # Should complete without errors
npm run dev    # Editor should load with graph capability
```

## Consequences

### Positive

- Visual authoring matches mental model of quest flow
- Parallel objectives become trivial to author
- Sequential chains are a simple line of connections
- Reuses existing NodeCanvas infrastructure
- Matches industry-standard tools (articy:draft pattern)
- Backward compatible with existing quests

### Negative

- More complex than flat list for simple quests
- Requires learning graph-based authoring
- Position data adds to save file size
- Potential for authoring errors (cycles, orphans)

### Neutral

- `triggerObjective` action becomes redundant for intra-stage triggers (kept for cross-stage)
- Stage boundaries remain the primary quest structure

## Future Considerations

1. **Cross-stage prerequisites**: Objective in Stage 2 requires objective from Stage 1
2. **Conditional edges**: Prerequisites with conditions (e.g., "only if player has item X")
3. **Edge labels**: Display what the connection means ("requires", "unlocks")
4. **Subgraphs**: Collapse groups of objectives into a single node
5. **Playtest mode**: Step through graph in editor to test flow
6. **Import/export**: Share objective graphs between quests
