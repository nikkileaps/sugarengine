# ADR 008: Region Streaming System

## Status
Proposed

## Context

Sugar Engine needs to support multiple contiguous regions that stream in/out as the player moves through the world. Currently, the engine only supports loading one region at a time with explicit transitions.

**Requirements from user:**
1. All regions are the same size (fixed grid from Sugarbuilder)
2. Fixed streaming radius (since regions are uniform)
3. World positioning defined in Sugar Engine, not Sugarbuilder
4. True seamless streaming - see neighboring regions while in current one

## Decision

### Grid-Based Region System

All regions are placed on a 2D grid. Each region occupies one grid cell.

```typescript
// Engine configuration (set once per project)
interface RegionStreamingConfig {
  regionSize: number;      // Width/depth in world units (e.g., 64)
  streamingDistance: number; // In grid cells (e.g., 2 = load current + 2 cells in each direction)
}

// RegionData changes
interface RegionData {
  id: string;
  name: string;
  geometry: RegionGeometry;

  // NEW: Grid position instead of arbitrary world offset
  gridPosition: { x: number; z: number };  // e.g., { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: -1 }

  playerSpawn: Vec3;       // Local coordinates within region (0 to regionSize)
  npcs: NPCDefinition[];
  triggers: TriggerDefinition[];
  pickups?: PickupDefinition[];
  inspectables?: InspectableDefinition[];
  availability?: RegionAvailability;
}

// Episode changes
interface Episode {
  id: string;
  seasonId: string;
  name: string;
  order: number;
  startRegion: string;     // NEW: Region ID where player spawns
  completionCondition?: CompletionCondition;
}
```

### World Position Calculation

Grid (0,0) is **centered** at world origin. A region's world offset is:

```typescript
function getRegionWorldOffset(region: RegionData, config: RegionStreamingConfig): Vec3 {
  const halfSize = config.regionSize / 2;
  return {
    x: (region.gridPosition.x * config.regionSize) - halfSize,
    y: 0,  // Regions are 2D grid, Y is always 0
    z: (region.gridPosition.z * config.regionSize) - halfSize
  };
}

// Example with regionSize = 64:
// Grid (0,0)  -> world offset (-32, 0, -32), spans to (32, 0, 32)
// Grid (1,0)  -> world offset (32, 0, -32),  spans to (96, 0, 32)
// Grid (-1,0) -> world offset (-96, 0, -32), spans to (-32, 0, 32)
```

This means player spawn at local (0,0,0) in grid (0,0) = world origin (0,0,0).
Player spawn at local (32,0,32) in grid (0,0) = world (0,0,0) as well (center of region).

### Streaming Logic

**Important: Sparse Grid**

Not every grid cell needs a region. The system only loads regions that actually exist. If you only have one region at (0,0), that's all that loads. Game design (walls, barriers, narrative blocks) keeps players within valid areas.

```typescript
class RegionStreamingSystem {
  private loadedRegions: Map<string, LoadedRegion> = new Map();
  private regionsByGrid: Map<string, RegionData> = new Map(); // "x,z" -> RegionData

  // Called every frame (or throttled to every N frames)
  update(playerWorldPos: Vec3): void {
    const playerGridX = Math.floor(playerWorldPos.x / this.config.regionSize);
    const playerGridZ = Math.floor(playerWorldPos.z / this.config.regionSize);

    const neededRegions = this.getRegionsInRange(playerGridX, playerGridZ);

    // Load regions that should be loaded but aren't
    for (const regionId of neededRegions) {
      if (!this.loadedRegions.has(regionId)) {
        this.loadRegion(regionId);
      }
    }

    // Unload regions that are loaded but shouldn't be
    for (const regionId of this.loadedRegions.keys()) {
      if (!neededRegions.has(regionId)) {
        this.unloadRegion(regionId);
      }
    }
  }

  private getRegionsInRange(gridX: number, gridZ: number): Set<string> {
    const needed = new Set<string>();
    const dist = this.config.streamingDistance;

    for (let dx = -dist; dx <= dist; dx++) {
      for (let dz = -dist; dz <= dist; dz++) {
        const key = `${gridX + dx},${gridZ + dz}`;
        const region = this.regionsByGrid.get(key);
        if (region) {
          // Only add if region exists - sparse grid!
          needed.add(region.id);
        }
      }
    }

    return needed;
  }
}
```

### Loading a Region

When a region loads:
1. Load geometry from `public/regions/{geometry.path}/geometry.glb`
2. Load lighting/fog from `public/regions/{geometry.path}/map.json`
3. Position geometry at `gridPosition * regionSize`
4. Spawn entities (NPCs, pickups, etc.) at local position + world offset
5. Add to scene

### Unloading a Region

When a region unloads:
1. Remove geometry from scene
2. Remove all entities belonging to that region
3. Remove lights from that region
4. Free memory

### Episode Start

When an episode begins:
1. Look up `episode.startRegion`
2. Get that region's `gridPosition` and `playerSpawn`
3. Calculate world position: `(gridPosition * regionSize) + playerSpawn`
4. Place player at that position
5. Streaming system will load that region + neighbors

### Editor UI Changes

**Region Panel:**
- Replace "Spawn X/Y/Z" with "Grid X" and "Grid Z" (integers)
- Keep "Player Spawn X/Y/Z" as local coordinates within the region (0 to regionSize)
- Add visual indicator showing grid layout?

**Episode Panel:**
- Add "Start Region" dropdown to select which region the episode begins in

### Engine Changes Summary

| Current | New |
|---------|-----|
| `currentRegion: LoadedRegion \| null` | `loadedRegions: Map<string, LoadedRegion>` |
| `loadRegion(path)` loads one, unloads previous | `RegionStreamingSystem` manages multiple |
| Player spawn from region | Player spawn from episode's startRegion |
| Manual region transitions | Automatic streaming + optional manual transitions |

### Trigger-Based Transitions (Still Supported)

For indoor areas or non-contiguous jumps, triggers can still force region changes:
- Trigger event: `{ type: 'region-transition', target: 'indoor-cafe', spawnPoint: {...} }`
- This bypasses streaming and explicitly loads a specific region

## Visual Example

```
Grid Layout (regionSize = 64, centered at origin):

Grid (0,0) is CENTERED at world origin (0,0,0).
It spans from (-32, 0, -32) to (32, 0, 32) in world coordinates.

     z
     ^
     |
  (-1,1)  (0,1)   (1,1)
     +------+------+------+
     |      |      |      |
     | park | cafe | alley|
     |      |      |      |
  (-1,0)  (0,0)   (1,0)
     +------+------+------+
     |      |  *   |      |    * = world origin (0,0,0)
     |plaza |start | shop |        player spawns here
     |      |      |      |
     +------+------+------+----> x
  (-1,-1) (0,-1)  (1,-1)

Player at world (0, 0, 0):
  - Player is in CENTER of grid cell (0, 0)
  - With streamingDistance=1, WOULD load up to 9 regions
  - But only regions that EXIST get loaded
  - If only "start" region exists, only 1 region loads

Single region example:
     +------+
     |      |
     |start |  <- Only region in episode
     |  *   |     Player blocked by walls/barriers at edges
     +------+
```

## Consequences

### Positive
- Seamless world traversal
- Simple grid math for positioning
- Uniform region sizes simplify streaming logic
- Works well with Sugarbuilder's fixed grid

### Negative
- More memory usage (multiple regions loaded)
- More complex entity management (track which region owns each entity)
- Need to handle edge cases (player exactly on boundary)

### Neutral
- Triggers still work for explicit transitions (indoor areas)
- Sugarbuilder unchanged - still exports single regions at origin

## Implementation Phases

### Phase 1: Data Model ✓ COMPLETE
- ✓ Add `gridPosition` to RegionData
- ✓ Add `startRegion` to Episode
- ✓ Update RegionPanel UI (Grid X/Z fields)
- ✓ Update Episode types
- ✓ Add grid utility functions with unit tests (27 tests)
- ✓ Add Start Region selector in EpisodeSelector toolbar

### Phase 2: Multi-Region Engine ✓ COMPLETE
- ✓ Added `loadedRegions: Map<string, LoadedRegionState>` for multiple regions
- ✓ Added `LoadedRegionState` interface to track region entities
- ✓ Added `loadRegionById()` - loads region at grid position, spawns entities with world offset
- ✓ Added `unloadRegionById()` - removes region and all its entities
- ✓ Added `setActiveRegion()` - sets lighting/fog from specific region
- ✓ Added `regionsByGridKey` map for fast grid lookup
- ✓ Entity positions offset by region's world position
- ✓ Legacy `loadRegion()` preserved for backward compatibility

### Phase 3: Streaming System ✓ COMPLETE
- ✓ Implemented `RegionStreamingSystem` class
- ✓ Automatic load/unload based on player grid position
- ✓ Sparse grid support - only loads regions that exist
- ✓ `forceLoadRegion()` for teleports/episode starts
- ✓ Active region tracking for lighting/fog
- ✓ 14 unit tests for streaming logic

### Phase 4: Episode Integration ✓ COMPLETE
- ✓ Added `getEpisodeStartInfo()` to EpisodeManager
- ✓ Calculates player world position from region grid position + spawn
- ✓ Added `getEpisodeRegions()` for episode region dependencies
- ✓ Added `EpisodeStartInfo` type
- ✓ 8 unit tests for episode-region integration

## Decisions

1. **Region height**: Y is unbounded. Regions are a 2D X/Z grid only.

2. **Entity persistence**: Entities reset to original spawn positions when a region reloads. Future work: persist entity state when server-side sessions are implemented.

3. **Cross-region entities**: NPCs cannot cross region boundaries. Entities belong to their region and are removed when the region unloads.
