# ADR-001: Narrative Design Editor

**Status:** Proposed
**Date:** 2026-01-22
**Author:** Claude + Nikki

## Context

Sugar Engine separates concerns between two tools:
- **SugarBuilder**: Procedural modeling, texturing, level geometry (replaces Blender/Substance)
- **Sugar Engine Editor**: Narrative and systems design (this document)

The editor needs to handle game content authoring for interconnected systems defined in `CORE_GAMEPLAY_PROPOSAL.md`. Unlike Unity-style scene editors, this is closer to **Articy:draft** - a narrative design tool for authoring dialogue, quests, characters, and game logic.

## Decision Drivers

1. **Interconnected Systems**: Dialogue, Quests, Inventory, and Inspection all reference each other
2. **Designer-Friendly**: Writers/designers should be able to work without touching JSON
3. **Validation**: Catch broken references and invalid conditions before runtime
4. **Preview**: Test narrative flows without launching the full game
5. **Version Control**: Output should be human-readable JSON (already the engine format)
6. **Future Systems**: Must accommodate Stamina, Resonance, Reputation, and Caster systems

## Research Summary

Analysis of narrative design tools (Articy:draft, Yarn Spinner, ink, Twine) revealed key patterns:

| Pattern | Application |
|---------|-------------|
| **Node-based visual editing** | Dialogue trees, quest flows |
| **Entity database** | NPCs, Items as reusable entries |
| **Conditions system** | Gates based on inventory, flags, reputation |
| **Instructions/effects** | What happens when nodes execute |
| **Real-time validation** | Check references immediately |
| **Playtest mode** | Test dialogue without full game |

## Decision

Build a **tabbed panel editor** with the following views:

```
┌─────────────────────────────────────────────────────────────────┐
│  🍬 Sugar Engine    [Dialogues] [Quests] [NPCs] [Items] [Inspect]  │  ▶ Preview  🚀 Publish  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐  │
│  │             │  │                                         │  │
│  │  Entry List │  │         Visual Editor / Canvas          │  │
│  │             │  │                                         │  │
│  │  - item 1   │  │    (node graph for dialogue/quests,     │  │
│  │  - item 2   │  │     form editor for NPCs/items)         │  │
│  │  - item 3   │  │                                         │  │
│  │             │  │                                         │  │
│  └─────────────┘  └─────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Inspector Panel - Properties of selected node/entity   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Status Bar: Validation warnings, save status, etc.]          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Panel Specifications

### 1. Dialogue Editor

**Purpose**: Create and edit branching dialogue trees.

**Layout**:
- **Left**: List of all dialogues (filterable, searchable)
- **Center**: Node-based canvas (drag to pan, scroll to zoom)
- **Right**: Inspector for selected node

**Node Types**:
```
┌─────────────────┐
│ 💬 Dialogue     │
│ Speaker: [___]  │
│ Text: [______]  │
│                 │
│ → next node     │
└─────────────────┘

┌─────────────────┐
│ ❓ Choice       │
│ [option 1] → A  │
│ [option 2] → B  │
│ [option 3] → C  │
└─────────────────┘

┌─────────────────┐
│ 🎯 Event        │
│ Fire: [______]  │
│ → next node     │
└─────────────────┘
```

**Features**:
- Drag to connect nodes
- Color-coded by speaker
- Inline text editing
- Condition badges (shows if choice requires item/reputation)
- Mini-map for large trees
- Playtest mode: step through dialogue in editor

**Output Format**: Existing `DialogueTree` JSON (no changes needed)

**Future Enhancements** (for CORE_GAMEPLAY_PROPOSAL):
- Stamina cost per choice
- Reputation gates on choices
- Reputation changes as effects

---

### 2. Quest Editor

**Purpose**: Design quest flows with stages and objectives.

**Layout**:
- **Left**: List of all quests
- **Center**: Stage flow diagram (linear/branching)
- **Right**: Inspector for selected stage/objective

**Visual Structure**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Stage 1     │ ──► │ Stage 2     │ ──► │ Stage 3     │
│ ○ Obj A     │     │ ○ Obj C     │     │ ○ Obj E     │
│ ○ Obj B     │     │ ◐ Obj D     │     │             │
│ (optional)  │     │             │     │ [REWARDS]   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Objective Types** (existing):
| Type | Target | Description |
|------|--------|-------------|
| `talk` | NPC ID | Speak with specific NPC |
| `location` | Trigger ID | Enter a location |
| `collect` | Item ID | Obtain item(s) |
| `trigger` | Trigger ID | Fire a trigger |
| `custom` | Custom ID | Script-defined |

**Features**:
- Drag stages to reorder
- Click objective to edit in inspector
- Link to NPC/Item/Dialogue via dropdowns (validates references)
- Preview: simulate quest progression

**Output Format**: Existing `QuestDefinition` JSON

**Future Enhancements**:
- Branching stages (A or B paths)
- Reputation requirements per stage
- Resonance challenge objectives
- Stamina-gated objectives

---

### 3. NPC Database

**Purpose**: Central registry of all characters.

**Layout**:
- **Left**: NPC list with search/filter
- **Center**: NPC detail form
- **Right**: Linked content (dialogues, quests referencing this NPC)

**NPC Entry Fields**:
```typescript
interface NPCEntry {
  id: string;              // Unique identifier
  name: string;            // Display name
  portrait?: string;       // Path to portrait image
  description?: string;    // Designer notes
  defaultDialogue?: string; // Dialogue ID for generic greeting
  faction?: string;        // For reputation system (future)

  // Links (computed, not stored)
  dialogues: string[];     // Dialogues where this NPC speaks
  quests: string[];        // Quests involving this NPC
}
```

**Features**:
- Auto-detect dialogues/quests referencing NPC
- Warn if NPC has no dialogue
- Portrait preview
- Quick-create dialogue for NPC

**Output Format**: New `npcs.json` database file
```json
{
  "npcs": [
    {
      "id": "friendly-npc",
      "name": "Friendly NPC",
      "defaultDialogue": "greeting-01"
    }
  ]
}
```

**Future Enhancements**:
- Reputation tracks per NPC
- Gift preferences
- Schedule/location data

---

### 4. Item Database

**Purpose**: Define all items and their properties.

**Layout**:
- **Left**: Item list (filterable by category)
- **Center**: Item detail form
- **Right**: Usage info (quests requiring this item, NPCs who want it)

**Item Entry Fields** (existing):
```typescript
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

**Features**:
- Icon preview/upload
- Category color-coding
- Show where item is used (quests, dialogue conditions)
- Duplicate item button

**Output Format**: Existing `items.json`

**Future Enhancements**:
- Stamina cost modifiers
- Resonance difficulty modifiers
- Spell components (for Caster system)

---

### 5. Inspection Editor

**Purpose**: Create inspectable content (signs, newspapers, documents).

**Layout**:
- **Left**: Inspection list
- **Center**: Rich text editor with sections
- **Right**: Preview panel

**Inspection Fields** (existing):
```typescript
interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  headerImage?: string;
  content?: string;
  sections?: InspectionSection[];
}
```

**Features**:
- WYSIWYG text editing
- Image upload/preview
- Section management for multi-part documents
- Link to inspectable objects in regions

**Output Format**: Existing inspection JSON files

**Future Enhancements**:
- Reputation requirements to view
- Stamina cost to inspect
- Quest flag triggers

---

## Cross-System Features

### Reference Validation

The editor validates all cross-references:
- Dialogue choice → next node exists
- Quest objective → target NPC/item exists
- NPC → linked dialogue exists

Broken references shown as warnings in status bar.

### Global Search

`Cmd+K` / `Ctrl+K` opens quick search:
- Search all dialogues, quests, NPCs, items
- Jump directly to any entry
- Search within text content

### Undo/Redo

Full undo stack per session. Changes auto-save to browser storage, explicit save to disk.

### Export

All data exports to `public/` directories in existing JSON format:
- `public/dialogue/*.json`
- `public/quests/*.json`
- `public/items/items.json`
- `public/inspections/*.json`
- `public/npcs/npcs.json` (new)

---

## Technical Architecture

```
src/editor/
  index.ts              # Exports
  EditorApp.ts          # Main shell, tab management
  Toolbar.ts            # Top bar with Preview/Publish
  PreviewManager.ts     # Opens game preview window

  # Shared components
  components/
    NodeCanvas.ts       # Reusable node graph editor
    EntryList.ts        # Left panel list with search
    Inspector.ts        # Right panel property editor
    StatusBar.ts        # Bottom validation/status

  # Panel implementations
  panels/
    DialoguePanel.ts    # Dialogue editor
    QuestPanel.ts       # Quest editor
    NPCPanel.ts         # NPC database
    ItemPanel.ts        # Item database
    InspectionPanel.ts  # Inspection editor

  # Data management
  store/
    EditorStore.ts      # Central state management
    DialogueStore.ts    # Dialogue data + operations
    QuestStore.ts       # Quest data + operations
    NPCStore.ts         # NPC data + operations
    ItemStore.ts        # Item data + operations
    InspectionStore.ts  # Inspection data + operations

  # Utilities
  utils/
    validation.ts       # Cross-reference validation
    export.ts           # Save to JSON files
    import.ts           # Load from JSON files
```

### State Management

Simple reactive store pattern (no external dependencies):
```typescript
class Store<T> {
  private state: T;
  private listeners: Set<(state: T) => void>;

  setState(partial: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
}
```

### File Watching

In dev mode, watch `public/` for external changes and reload.

---

## Implementation Phases

### Phase 1: Foundation (This PR)
- [ ] Tab navigation between panels
- [ ] Entry list component (left panel)
- [ ] Inspector component (right panel)
- [ ] Basic store architecture
- [ ] JSON import/export

### Phase 2: Dialogue Editor
- [ ] Node canvas with pan/zoom
- [ ] Dialogue node rendering
- [ ] Choice connections
- [ ] Inline text editing
- [ ] Playtest mode

### Phase 3: Quest Editor
- [ ] Stage flow visualization
- [ ] Objective editing
- [ ] Reference dropdowns (NPC/Item pickers)
- [ ] Validation warnings

### Phase 4: Database Panels
- [ ] NPC database panel
- [ ] Item database panel
- [ ] Inspection editor with rich text

### Phase 5: Polish
- [ ] Global search (Cmd+K)
- [ ] Undo/redo
- [ ] Keyboard shortcuts
- [ ] Mini-map for large graphs

---

## Future Systems (TODO)

These systems from `CORE_GAMEPLAY_PROPOSAL.md` are not yet implemented in the engine. When added, the editor will need corresponding features:

### Stamina System
- **Editor additions**:
  - Stamina cost field on dialogue choices
  - Stamina cost field on inspection actions
  - "Demanding action" flag on various interactions

### Resonance System
- **Editor additions**:
  - Resonance challenge designer (minigame config)
  - Link resonance challenges to quest objectives
  - Difficulty/accuracy curve editor

### Reputation System
- **Editor additions**:
  - Reputation track definitions
  - Per-NPC reputation values
  - Reputation gates on dialogue/quests
  - Reputation change effects

### Caster/Magic System
- **Editor additions**:
  - Spell database panel
  - Chaos effect table editor
  - Battery cost configuration
  - Spell-quest integration

---

## Alternatives Considered

### 1. External Tool (Articy/Yarn)
**Rejected**: Would require export/import pipeline, lose tight engine integration.

### 2. Text-Based Format (like ink)
**Considered for future**: Could add `.yarn` or `.ink` file support as alternative authoring mode for writers who prefer text.

### 3. Embedded in SugarBuilder
**Rejected**: SugarBuilder is focused on 3D/art pipeline. Narrative design is a different workflow.

---

## References

- [Articy:draft](https://www.articy.com/) - Professional narrative design tool
- [Yarn Spinner](https://yarnspinner.dev/) - Open source dialogue system
- [ink](https://www.inklestudios.com/ink/) - Inkle's narrative scripting language
- `docs/CORE_GAMEPLAY_PROPOSAL.md` - Game systems specification
