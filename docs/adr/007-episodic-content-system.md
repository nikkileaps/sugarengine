# ADR 007: Episodic Content System

## Status
Proposed

## Context

Sugar Engine is building a narrative-driven game released episodically on the web. The content model mirrors streaming services like Netflix:

- **Seasons** contain multiple **Episodes**
- Episodes are released over time
- Players progress through episodes linearly
- Content is web-delivered - episodes describe what they need, server provides it

### Key Insight

**The manifest is derived, not manually managed.** When you create quests that use NPCs, reference items, and take place in regions - the editor tracks those dependencies. Publishing computes the manifest from what you actually used.

### Research Insights

**From Indiana Jones: The Great Circle DLC:**
- DLC functions as "its own chapter" that slots into existing story
- Content deepens understanding of main campaign
- Dynamic systems adapt to player progression

**From Telltale/Life is Strange episodic model:**
- Episodes build toward a whole but function individually
- Player decisions carry across episodes via save data
- Digital distribution makes episodic releases viable

**From Unity Asset Bundle architecture:**
- Manifest systems track content dependencies
- Content loads on-demand
- Dependency graphs computed at build time

### Current Sugar Engine State

- Content loads on-demand with caching (good foundation)
- Quest system exists with objectives, stages, rewards
- Save system tracks quest states, inventory, player position
- Editor saves to `.sgrgame` project files
- Regions already exist as geographic chunks

## Decision

Implement a **dependency-driven episode system** built on the existing ECS (Entity Component System) architecture with **three content tiers**:

### ECS Foundation

The engine uses a standard ECS with:
- **Entities**: Numeric IDs created via `world.createEntity()`
- **Components**: Data containers (Position, NPC, ItemPickup, Renderable, NPCMovement, etc.)
- **Systems**: Logic that operates on entities with specific component combinations
- **World**: Manages entity lifecycle, component storage, and system updates

### Content Classification

| Tier | Content Type | Owned By | ECS Mapping |
|------|-------------|----------|-------------|
| **Narrative** | Episode-specific story | Episode | Quest/Dialogue data (not entities) |
| **World** | Entity spawn definitions | Region | RegionData arrays → entities created on load |
| **Definitions** | Component templates | Project | Prefab data for entity creation |

### Core Principles

1. **Episode = working context** - you're editing Episode 1's content
2. **Regions own entity spawns** - "what entities to create when this region loads"
3. **Dependencies cascade** - Episode → Quests → Regions → Entity Spawns → Definitions
4. **Manifest is derived** - publish computes what the episode needs
5. **Runtime fetches dependencies** - server provides required content

## Design

### Mental Model

```
DEVELOPMENT (Editor)                    RUNTIME (Game)
─────────────────────                   ──────────────

Working on: S1-E1                       Player starts game
    │                                       │
    ├─ Create Quest "Meet Mayor"            ├─ Fetch manifest.json
    │   └─ uses: npc:mayor,                 │
    │           region:town-hall            ├─ Check: Episode 1 released? ✓
    │                                       │
    ├─ Create Mayor's Dialogue              ├─ Server assembles .sgrplay
    │   └─ uses: npc:mayor                  │   (from published files)
    │                                       │
    └─ [Publish Episode]                    └─ Load content, play
            │
            ▼
    Manifest computed:
    {
      "seasonId": "<uuid>",
      "episodeId": "<uuid>",
      "requires": {
        "npcs": ["<uuid>"],
        "regions": ["<uuid>"],
        "quests": ["<uuid>"],
        "dialogues": ["<uuid>"]
      }
    }
```

### Data Model

#### Region Entity Spawns (World Tier)

Regions define what entities to spawn when loaded. This aligns with the existing `RegionData` structure used by `RegionLoader`.

```typescript
// src/engine/loaders/RegionLoader.ts (existing pattern, extended)

// Entity spawn definitions - each creates an entity with components
interface NPCSpawn {
  id: string;                   // UUID for this spawn instance
  npcId: string;                // UUID reference to NPC definition
  position: Vec3;               // Creates Position component
  movement?: {                  // Creates NPCMovement component
    waypoints: Waypoint[];
    behavior: 'patrol' | 'ping-pong' | 'one-way';
    speed: number;
  };
  schedule?: Schedule;          // Optional time-based availability
}

interface ItemSpawn {
  id: string;                   // UUID for this spawn instance
  itemId: string;               // UUID reference to Item definition
  position: Vec3;               // Creates Position component
  quantity?: number;            // Creates ItemPickup component
  respawn?: boolean;            // Does it come back after pickup?
}

interface InspectableSpawn {
  id: string;                   // UUID for this spawn instance
  inspectionId: string;         // UUID reference to Inspection content
  position: Vec3;               // Creates Position component
  promptText?: string;          // Creates Inspectable component
}

interface TriggerSpawn {
  id: string;                   // UUID for this spawn instance
  bounds: { min: Vec3; max: Vec3 };  // Creates TriggerZone component
  event: TriggerEvent;          // Event payload when triggered
}

interface VendorSpawn {
  id: string;                   // UUID for this spawn instance
  npcId: string;                // UUID reference to NPC definition
  position: Vec3;               // Creates Position + NPC components
  inventory: string[];          // Item UUIDs available for sale
}

// Extended RegionData for episodic system
interface RegionData {
  id: string;                   // UUID
  name: string;
  version: number;              // For versioning across episodes
  geometryRef: string;          // Path to geometry file

  // Entity spawn arrays (creates entities on region load)
  npcs: NPCSpawn[];
  pickups: ItemSpawn[];
  inspectables: InspectableSpawn[];
  triggers: TriggerSpawn[];
  vendors: VendorSpawn[];

  playerSpawn: Vec3;

  // Optional episode gating
  availability?: {
    fromEpisode?: string;       // First episode this region is accessible
    untilEpisode?: string;      // Last episode (for temporary areas)
  };
}
```

#### Episodes & Seasons (Narrative Tier)

```typescript
// src/engine/episodes/types.ts

interface Season {
  id: string;           // UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")
  name: string;         // "Season 1: The Awakening"
  order: number;
}

interface Episode {
  id: string;           // UUID (e.g., "7c9e6679-7425-40de-944b-e07fc1f90ae7")
  seasonId: string;     // UUID reference to parent season
  name: string;         // "Episode 1: New Beginnings"
  order: number;        // 1, 2, 3... within season

  // What marks this episode complete
  completionCondition: CompletionCondition;

  // Rare: content not reachable via quest/region chains
  manualIncludes?: {
    npcs?: string[];    // UI-only NPCs, narrators
    items?: string[];   // Global system items
    regions?: string[]; // Always-loaded areas
  };
}

type CompletionCondition =
  | { type: "quest"; questId: string }                    // Single quest
  | { type: "allQuests"; questIds: string[] }             // All of these quests
  | { type: "anyQuest"; questIds: string[] }              // Any of these quests
  | { type: "questCount"; questIds: string[]; count: number }; // N of these quests

// Computed at publish time, not manually authored
interface EpisodeManifest {
  seasonId: string;     // UUID of season
  episodeId: string;    // UUID of episode
  version: number;

  // Dependencies - derived from content analysis
  requires: {
    npcs: string[];
    items: string[];
    regions: string[];
    quests: string[];
    dialogues: string[];
    inspections: string[];
  };

  // What must be complete to access next episode
  completionCondition: CompletionCondition;
}

// Master manifest - what's available
interface GameManifest {
  gameId: string;
  version: number;

  seasons: Season[];
  episodes: Episode[];

  // Server-controlled release state
  released: {
    latestSeason: string;
    latestEpisode: string;
  };

  // Where to fetch episode content
  episodeUrls: Record<string, string>;
}
```

### Editor Changes

**Episode Selector** (in toolbar, not a separate panel):
```
[Season 1 ▾] [Episode 1: New Beginnings ▾] [+ New Episode]
```

When you select an episode:
- Editor loads/shows content FOR that episode
- Creating new content auto-associates with current episode
- Existing shared content (NPCs, items) remains accessible

**Dependency Tracking** (automatic, bidirectional):

The editor maintains a **bidirectional dependency graph** in memory:

```
Forward (what does X need?):
  Episode S1-E1 → [quest-1, quest-2, region-town-hall, npc-mayor]

Reverse (what uses X?):
  NPC Mayor → [Episode S1-E1, S1-E2, S1-E3]
  Region Town Hall → [Episode S1-E1, S1-E2]
  Item Brass Key → [Region Town Hall, Quest main-quest-e1]
```

**Editor uses bidirectional graph for:**
- **Deletion validation** - "This NPC is used in 3 episodes"
- **Refactor safety** - "Renaming this region affects these quests"
- **Impact previews** - "Changing this item affects these episodes"
- **Orphan detection** - "This NPC isn't used anywhere"

This matters at scale - fast lookups in both directions.

**Episode Info Panel** (shows what's in current episode):
```
Episode 1: New Beginnings
━━━━━━━━━━━━━━━━━━━━━━━━━
Completion: Quest "main-quest-e1"

Dependencies (auto-detected):
  NPCs: Mayor Johnson, Shopkeeper
  Regions: town-hall, market
  Items: key-to-basement
  Quests: 2
  Dialogues: 5

[Publish Episode]
```

**Content Panels** - minimal changes:
- Show which episode each item belongs to (badge/tag)
- Filter option: "Show all" vs "Current episode only"
- New content defaults to current episode

**Region Editor** (new panel or integrated):
```
Region: Town Hall
━━━━━━━━━━━━━━━━
Geometry: town-hall.glb

Entity Spawns (created when region loads):
 [NPC]         Mayor Johnson    @ (12, 0, 5)
               └─ Components: Position, NPC, Renderable, WorldLabel
 [Item]        Brass Key        @ (10, 1, 3)
               └─ Components: Position, ItemPickup, Renderable
 [Inspectable] Notice Board     @ (8, 0, 3)
               └─ Components: Position, Inspectable, Renderable
 [Vendor]      Shopkeeper       @ (5, 0, 8)
               └─ Components: Position, NPC, Renderable, Vendor
               └─ Sells: Potion, Map, Torch
 [Trigger]     Entry Zone       @ bounds(0,0,0 → 5,3,5)
               └─ Components: TriggerZone
               └─ Event: region_enter

[+ Add Entity Spawn]

Availability:
 From Episode: (first episode)
 Until Episode: (none)
```

**Cross-Reference View** (in Item/NPC panels):
```
Item: Brass Key
━━━━━━━━━━━━━━
Category: Key Item

Entity Spawns (creates ItemPickup component):
 📍 Region: Town Hall @ (10, 1, 3)

Also Referenced By:
 📜 Quest: main-quest-e1 (reward)
 💬 Dialogue: mayor-quest (mentioned)
```

### File Structure

**Local development** (your machine):
```
my-game/
├── project.sgrgame           # Master project (all content, all episodes)
└── dist/                     # Generated on publish (upload to hosting)
    ├── manifest.json
    ├── shared/
    │   ├── npcs/
    │   │   └── mayor.json
    │   ├── items/
    │   │   └── sword.json
    │   └── regions/
    │       └── town-hall/
    │           ├── config.json
    │           └── model.glb
    └── episodes/
        └── s1/
            ├── e1/
            │   ├── manifest.json   # Episode manifest (what it requires)
            │   ├── quests/
            │   └── dialogues/
            └── e2/
                └── ...
```

**File formats:**
- `.sgrgame` = project file (local, for editing)
- `dist/` folder = published output (upload to Netlify/CDN)
- `.sgrplay` = runtime package (server assembles for player on-demand)

**Project file (.sgrgame)** - single source of truth:
```json
{
  "version": 2,
  "meta": {
    "gameId": "my-cozy-game",
    "name": "My Cozy Game"
  },
  "seasons": [
    { "id": "a1b2c3d4-...", "name": "Season 1", "order": 1 }
  ],
  "episodes": [
    {
      "id": "e5f6g7h8-...",
      "seasonId": "a1b2c3d4-...",
      "name": "Episode 1: New Beginnings",
      "order": 1,
      "completionCondition": { "type": "quest", "questId": "q9r0s1t2-..." }
    }
  ],
  "npcs": [
    { "id": "n3p4c5d6-...", "name": "Mayor Johnson", ... }
  ],
  "items": [...],
  "regions": [...],  // Region metadata, not geometry
  "quests": [
    {
      "id": "q9r0s1t2-...",
      "episodeId": "e5f6g7h8-...",  // UUID of the episode
      "name": "Meet the Mayor",
      ...
    }
  ],
  "dialogues": [
    {
      "id": "d7i8a9l0-...",
      "episodeId": "e5f6g7h8-...",
      ...
    }
  ],
  "inspections": [...]
}
```

**Episode manifest** (e.g., `dist/episodes/<seasonId>/<episodeId>/manifest.json`):
```json
{
  "seasonId": "a1b2c3d4-...",
  "episodeId": "e5f6g7h8-...",
  "version": 1,
  "requires": {
    "npcs": ["n3p4c5d6-..."],
    "regions": ["r1e2g3i4-..."],
    "items": ["i5t6e7m8-..."]
  },
  "completionCondition": { "type": "quest", "questId": "q9r0s1t2-..." }
}
```

**Content organization:**
- `shared/` folder → NPCs, items, regions (one copy each, referenced by ID)
- `episodes/s1/e1/` folder → quests, dialogues (episode-specific content)

### Dependency Computation

**The dependency chain (ECS perspective):**
```
Episode
  → Quests (narrative content)
    → Regions (where objectives happen)
      → Entity Spawns (what entities to create)
        → Component Templates (NPC/Item definitions)
  → Dialogues (narrative content)
    → Component Templates (NPC definitions for speakers)
```

When publishing Episode 1:

```typescript
function computeEpisodeDependencies(episode: Episode, project: Project): EpisodeManifest {
  const requires = {
    npcs: new Set<string>(),
    items: new Set<string>(),
    regions: new Set<string>(),
    quests: new Set<string>(),
    dialogues: new Set<string>(),
    props: new Set<string>(),
  };

  // 1. Gather episode quests (episodeId on content is the episode's UUID)
  const episodeQuests = project.quests.filter(q => q.episodeId === episode.id);

  for (const quest of episodeQuests) {
    requires.quests.add(quest.id);

    for (const stage of quest.stages) {
      for (const objective of stage.objectives) {
        if (objective.type === 'talk') {
          requires.npcs.add(objective.target);
          if (objective.dialogue) requires.dialogues.add(objective.dialogue);
        }
        if (objective.type === 'location') {
          requires.regions.add(objective.target);
        }
        if (objective.type === 'collect') {
          requires.items.add(objective.target);
        }
      }
    }

    // Quest rewards
    for (const reward of quest.rewards || []) {
      if (reward.type === 'item') requires.items.add(reward.itemId);
    }
  }

  // 2. Gather episode dialogues
  const episodeDialogues = project.dialogues.filter(d => d.episodeId === episode.id);
  for (const dialogue of episodeDialogues) {
    requires.dialogues.add(dialogue.id);

    for (const node of dialogue.nodes) {
      if (node.speaker && node.speaker !== PLAYER.id && node.speaker !== NARRATOR.id) {
        requires.npcs.add(node.speaker);
      }
    }
  }

  // 3. Walk regions → entity spawns → component templates
  for (const regionId of requires.regions) {
    const region = project.regions.find(r => r.id === regionId);
    if (!region) continue;

    // NPC spawns → need NPC component template
    for (const spawn of region.npcs || []) {
      requires.npcs.add(spawn.npcId);
    }

    // Item spawns → need Item component template
    for (const spawn of region.pickups || []) {
      requires.items.add(spawn.itemId);
    }

    // Inspectable spawns → need Inspection content
    for (const spawn of region.inspectables || []) {
      requires.inspections.add(spawn.inspectionId);
    }

    // Vendor spawns → need NPC template + Item templates for inventory
    for (const spawn of region.vendors || []) {
      requires.npcs.add(spawn.npcId);
      spawn.inventory.forEach(id => requires.items.add(id));
    }
  }

  return {
    seasonId: episode.seasonId,
    episodeId: episode.id,
    version: 1,
    requires: {
      npcs: Array.from(requires.npcs),
      items: Array.from(requires.items),
      regions: Array.from(requires.regions),
      quests: Array.from(requires.quests),
      dialogues: Array.from(requires.dialogues),
      props: Array.from(requires.props),
    },
    completionCondition: episode.completionCondition,
  };
}
```

**Why this works (ECS dependency flow):**
- Item spawn in town-hall region → region needs Item component template
- Quest objective in town-hall → episode depends on region
- Episode transitively depends on item template for entity creation
- No manual tracking needed - derived from spawn definitions

### Runtime Loading

**Game startup flow:**
```
Player enters web page
    │
    ├─ Fetch stored session → find user
    │
    ├─ Get user's progression → what episode are they on?
    │
    ├─ Check: Is that episode released?
    │   └─ If not: cap at latest released episode
    │
    ├─ Request episode content from server
    │   └─ POST /api/episode { seasonId: "<uuid>", episodeId: "<uuid>", userId: "..." }
    │
    ├─ Server looks up episode manifest
    │   └─ manifest.requires: { npcs, items, regions, quests, dialogues }
    │
    ├─ Server packages resources into .sgrplay
    │   ├─ Pull shared content (NPCs, items, regions) - latest versions
    │   ├─ Pull episode content (quests, dialogues)
    │   └─ Can pre-cache popular episodes or package on-demand
    │
    └─ Client downloads .sgrplay → loads content → plays
```

**Shared content deduplication:**
```
Hosting (Netlify/CDN):
├── shared/
│   ├── npcs/mayor/          ← ONE copy
│   │   ├── model.glb
│   │   ├── portrait.jpg
│   │   └── animations/
│   ├── items/
│   └── regions/
└── episodes/
    └── s1/
        ├── e1/              ← Episode-specific only
        │   ├── quests/
        │   └── dialogues/
        └── e2/
```

**Client-side caching:**
- If player has NPC Mayor from Episode 1, Episode 2 reuses cached version
- Only downloads updated content (version changed) or new content

**Runtime region loading (ECS entity creation):**
```
Player enters Episode 1
  └─ EpisodeManager loads episode manifest
      └─ Requires regions: town-hall, market
          └─ RegionLoader.load(regionData)
              └─ For each spawn definition, create entity with components:
                  ├─ NPC spawn → world.createEntity()
                  │   └─ addComponent(Position), addComponent(NPC),
                  │      addComponent(Renderable), addComponent(WorldLabel)
                  ├─ Item spawn → world.createEntity()
                  │   └─ addComponent(Position), addComponent(ItemPickup),
                  │      addComponent(Renderable)
                  └─ Vendor spawn → world.createEntity()
                      └─ addComponent(Position), addComponent(NPC),
                         addComponent(Renderable), addComponent(Vendor)
```

**EpisodeManager:**
```typescript
class EpisodeManager {
  private manifest: GameManifest;
  private loadedEpisodes: Map<string, EpisodeContent>;

  async initialize(): Promise<void> {
    this.manifest = await fetch('/manifest.json').then(r => r.json());
  }

  isEpisodeReleased(episodeId: string): boolean {
    // Compare episode order to released.latestEpisode
  }

  isEpisodeAccessible(episodeId: string, saveData: GameSaveData): boolean {
    if (!this.isEpisodeReleased(episodeId)) return false;

    // First episode always accessible
    const episode = this.getEpisode(episodeId);
    if (episode.order === 1) return true;

    // Check if previous episode's completion quest is done
    const prevEpisode = this.getPreviousEpisode(episodeId);
    return this.isConditionMet(prevEpisode.completionCondition, saveData);
  }

  async loadEpisodeContent(episodeId: string): Promise<void> {
    if (this.loadedEpisodes.has(episodeId)) return;

    const url = this.manifest.episodeUrls[episodeId];
    const episodePack = await fetch(url).then(r => r.json());

    // Load shared dependencies
    await this.loadSharedContent(episodePack.manifest.requires);

    // Register episode-specific content
    this.registerQuests(episodePack.content.quests);
    this.registerDialogues(episodePack.content.dialogues);

    this.loadedEpisodes.set(episodeId, episodePack);
  }
}
```

### Save Data

```typescript
interface GameSaveData {
  // ... existing fields ...

  episodes: {
    currentEpisodeId: string;      // UUID of current episode
    completedEpisodeIds: string[]; // UUIDs of completed episodes
  };
}
```

### Local Development / Preview

During development, content lives in the editor's memory (not published to dist/). The preview system needs to access this content without a server.

**Development flow:**
```
Editor (has .sgrgame in memory)
    │
    ├─ User clicks "Preview"
    │
    ├─ Opens preview.html in new window
    │
    ├─ Sends content to preview via postMessage:
    │   {
    │     type: 'LOAD_PROJECT',
    │     project: { /* full .sgrgame content */ },
    │     episodeId: 'current-episode-uuid'
    │   }
    │
    └─ Preview uses project data directly (no fetch)
```

**Preview modes:**

| Mode | Content Source | Use Case |
|------|---------------|----------|
| **Development** | Editor memory via postMessage | Local preview during editing |
| **Production** | Server-assembled .sgrplay | Published game |

**PreviewManager changes:**
```typescript
class PreviewManager {
  private previewWindow: Window | null = null;

  openPreview(project: ProjectData, episodeId: string): void {
    // Open window as before...

    // Wait for preview to be ready
    this.previewWindow.addEventListener('load', () => {
      // Send project data to preview
      this.previewWindow.postMessage({
        type: 'LOAD_PROJECT',
        project,
        episodeId,
      }, '*');
    });
  }

  // Called when user edits content in editor
  syncChanges(project: ProjectData): void {
    if (this.previewWindow && !this.previewWindow.closed) {
      this.previewWindow.postMessage({
        type: 'UPDATE_PROJECT',
        project,
      }, '*');
    }
  }
}
```

**Preview entry point changes:**
```typescript
// src/preview.ts

// Check for development mode (content from editor)
window.addEventListener('message', async (event) => {
  if (event.data.type === 'LOAD_PROJECT') {
    // Development mode: use project data directly
    const { project, episodeId } = event.data;

    const game = new Game({
      mode: 'development',
      projectData: project,      // Full project in memory
      currentEpisode: episodeId,
      // ... other options
    });

    await game.init();
    // ...
  }
});

// Fallback: production mode loads from server
if (!window.opener) {
  // No opener = standalone, load from server
  runProductionGame();
}
```

**Hot reload (optional):**
```typescript
// Editor sends update when content changes
window.addEventListener('message', async (event) => {
  if (event.data.type === 'UPDATE_PROJECT') {
    // Soft reload: update data without full restart
    game.updateProjectData(event.data.project);

    // Or hard reload if needed
    // location.reload();
  }
});
```

**What this enables:**
- Preview button works exactly as before (opens game window)
- Editor passes current episode and full project to preview
- No server or publishing needed during development
- Optional: live sync when you edit content in editor
- Production uses server-assembled content as designed

## Implementation Plan

### Phase 1: Data Model Foundation
- Add `episodeId` field to Quest and Dialogue types
- Add Season/Episode types
- Extend RegionData with entity spawn arrays (npcs, pickups, inspectables, vendors)
- Update .sgrgame format to version 2
- Migration for existing projects (assign to default episode)

### Phase 2: Region Entity Spawns
- Region editor panel for managing entity spawn definitions
- Spawn types: NPC, Item, Inspectable, Trigger, Vendor
- Position/transform editing
- Component preview (shows what components will be created)
- Region availability gating (fromEpisode/untilEpisode)

### Phase 3: Editor Episode Context
- Episode selector in toolbar (Season + Episode dropdowns)
- Track "current episode" in editor state
- New content defaults to current episode
- Show episode badge on content in lists
- Cross-reference views (where is this NPC/item used?)

### Phase 4: Dependency Tracking
- Build dependency graph: Episode → Quests → Regions → Entity Spawns → Templates
- Episode info sidebar showing auto-detected dependencies
- Validation: warn if references are broken (e.g., spawn references missing NPC)
- manualIncludes for edge cases

### Phase 5: Publish Workflow
- "Publish" generates `dist/` folder structure
- Computes episode manifests from dependency graph
- Outputs manifest.json + shared/ + episodes/ folders
- Ready to upload to Netlify/CDN

### Phase 6: Runtime Integration
- EpisodeManager for loading/checking episodes
- RegionLoader creates entities from spawn definitions on region load
- Integrate with existing ECS World for entity creation
- Server endpoint to assemble .sgrplay from published files
- Update save/load for episode state

### Phase 7: Local Development Preview
- Update PreviewManager to send project data via postMessage
- Update preview.ts to receive and use project data directly
- Add "development mode" to Game class that uses in-memory project
- Optional: live sync when content changes in editor

### Phase 7: Client Caching
- Cache shared content (NPCs, items, regions) between episodes
- Only re-download when version changes
- Episode-specific content fetched fresh each episode

## Versioning Strategy

**Principle:** Don't disrupt active play. Updates happen at episode boundaries.

### Content Versioning
- All shared content (NPCs, items, regions) has a version number
- Version increments on any change
- Format: `id@version` (e.g., `mayor@3`, `town-hall@7`)

### Region Versioning Across Episodes

**Rule:** Region geometry is versioned like any other shared content.

When a region changes layout across episodes:
- `town-hall@1` in Episode 1 (original layout)
- `town-hall@2` in Episode 3 (after renovations, new rooms)

Episode manifests request the appropriate version. This handles:
- Building renovations
- Areas opening up over time
- Seasonal/story changes to environments
- Destruction/reconstruction in narrative

### Update Flow
```
Player playing Episode 2:
  └─ Loaded: NPC Mayor v2, Region Town v1

Meanwhile, you release:
  └─ NPC Mayor v3 (bug fix)

Player keeps v2 for rest of Episode 2 (no disruption)

Player completes Episode 2, starts Episode 3:
  └─ System: "Checking for updates..."
  └─ Downloads: NPC Mayor v3 (mandatory)
  └─ Starts Episode 3 with latest versions
```

### Update Rules
- **Mandatory at episode boundaries** - always pull latest versions
- **No mid-episode updates** - stability during play
- **No rollback** - fail forward, ship fixes quickly

### Preventing Breaking Changes (Editor Validation)

The editor is the safety net. Before you break something:

```
⚠️ Warning: NPC "Mayor Johnson" is used in:
  - Episode 1: Dialogue "mayor-greeting"
  - Episode 2: Quest "find-mayor", Dialogue "mayor-quest"
  - Episode 3: Quest "mayor-finale"

Deleting this NPC will break these references.
[Cancel] [Delete Anyway]
```

**Editor tracks:**
- Which episodes use which shared content
- Cross-episode dependency graph
- Warns on deletion/breaking changes
- Validates references exist before publish

### Manual Includes (Escape Hatch)

For content that doesn't fit the automatic dependency model:

```typescript
interface Episode {
  // ... other fields ...

  // Rare: content not reachable via quest/region chains
  manualIncludes?: {
    npcs?: string[];    // UI-only NPCs, narrators
    items?: string[];   // Global system items
    regions?: string[]; // Always-loaded areas
  };
}
```

**Use sparingly for:**
- Narrator/radio host (no physical placement)
- Tutorial helpers that exist everywhere
- Global UI elements (mailbox, phone)
- System items (currency, tokens)

**Don't use for:**
- NPCs that exist in regions (use placements)
- Items that can be found/earned (use placements or quest rewards)
- Anything reachable via the normal dependency chain

## Consequences

**Positive:**
- Single project file - easy to work with
- Dependencies computed, not manually managed
- Familiar workflow - just edit content, episode is a "filter"
- Web-native - manifest describes what to fetch

**Negative:**
- Dependency computation needs to be robust
- Large projects may have slow publish step
- Need clear UX for "which episode am I editing"

## Files to Create/Modify

**New:**
- `src/engine/episodes/types.ts` - Season, Episode, EpisodeManifest
- `src/engine/episodes/EpisodeManager.ts` - Runtime episode loading
- `src/engine/components/Vendor.ts` - Vendor component for shop entities
- `src/editor/components/EpisodeSelector.ts` - Toolbar UI
- `src/editor/panels/RegionPanel.ts` - Region/entity spawn editor
- `src/editor/utils/dependencyGraph.ts` - Compute episode dependencies

**Modify:**
- `src/engine/quests/types.ts` - add episodeId
- `src/engine/dialogue/types.ts` - add episodeId
- `src/engine/loaders/RegionLoader.ts` - extend entity spawn handling, add vendor/inspection spawns
- `src/engine/core/Engine.ts` - integrate EpisodeManager, episode-aware region loading
- `src/engine/core/Game.ts` - add development mode, accept projectData
- `src/engine/ecs/World.ts` - (if needed) bulk entity operations
- `src/editor/EditorApp.ts` - episode selector, publish workflow
- `src/editor/PreviewManager.ts` - send project data via postMessage
- `src/editor/Toolbar.ts` - episode selector UI
- `src/editor/panels/*.ts` - episode badge, cross-reference views
- `src/engine/save/types.ts` - episode progression in save data
- `src/preview.ts` - receive project data from editor, development mode

## Verification

1. Create project with 2 episodes
2. Create quests/dialogues, verify episodeId assignment
3. Switch episodes, verify content filtering
4. Publish, verify dist/ folder structure is correct
5. Verify episode manifest lists correct dependencies
6. In game: verify Episode 2 content inaccessible until Episode 1 complete
7. Complete Episode 1 quest, verify Episode 2 unlocks
