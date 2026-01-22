# ADR 004: Inspection System for World Objects

## Status

Accepted

## Context

Sugarengine is a narrative-focused game engine where players explore and learn about the world. Currently, players can:
- Talk to NPCs (triggers dialogue)
- Pick up items (adds to inventory)

There's a missing interaction type: **examining objects without picking them up**. Players should be able to:
- Read a newspaper on a table
- Examine a bulletin board with notices
- Look at a painting and read its description
- Read a sign or plaque
- Inspect an object to learn lore

This supports the "cozy, story-first" design philosophy by letting world objects tell stories without cluttering the inventory with non-collectible items.

## Decision

Implement an **Inspection System** that lets players examine world objects to view rich content (text, images, formatted sections).

### Key Design Decisions

#### 1. Unified Interaction Key (E)

Use the same E key for both NPC interaction and object inspection. The system finds the nearest "interactable" entity (either NPC or Inspectable) and fires the appropriate callback.

**Rationale**: Simpler for players - one interaction key for all nearby interactions. The prompt text changes based on what's nearby ("Talk to Baker" vs "Read newspaper").

#### 2. Separate Content Files

Inspection content lives in `/public/inspections/{id}.json`, similar to dialogue files.

**Rationale**:
- Supports longer content (newspaper articles, lore entries)
- Rich content format (images, multiple sections)
- Cacheable and preloadable
- Consistent with existing dialogue/quest patterns

#### 3. Rich Content Format

Support text, optional images, and multiple sections for content like newspapers or magazines.

```json
{
  "id": "daily-tribune-01",
  "title": "The Daily Tribune",
  "subtitle": "March 15th Edition",
  "headerImage": "/images/newspaper-header.png",
  "sections": [
    {
      "headline": "Mayor Announces New Park",
      "content": "The mayor announced plans for a new community park in the west district..."
    }
  ]
}
```

Simple format for signs/plaques:
```json
{
  "id": "old-sign",
  "title": "Weathered Sign",
  "content": "Beware the forest path at night."
}
```

### Architecture

#### New Component: Inspectable

```typescript
class Inspectable implements Component {
  constructor(
    public id: string,           // Unique instance ID
    public inspectionId: string, // Reference to content file
    public promptText?: string   // Custom prompt (default: "Inspect")
  ) {}
}
```

#### Extended InteractionSystem

Modify to query both `NPC + Position` and `Inspectable + Position` entities. Track the nearest interactable of either type, with type information to route to the correct handler.

#### InspectionManager

Similar pattern to DialogueManager:
- Loads content from JSON files
- Caches loaded content
- Manages InspectionUI visibility
- Provides `start(inspectionId)` and `end()` methods

#### InspectionUI

Full-screen modal overlay displaying:
- Title and optional subtitle
- Optional header image
- Scrollable content area
- Multiple sections with headlines
- Close on E or Escape

Styled consistently with other UI components (dark semi-transparent background, warm borders).

### Region Data Extension

Add `inspectables` array to region `map.json`:

```json
{
  "inspectables": [
    {
      "id": "newspaper-01",
      "position": { "x": 5, "y": 0.5, "z": 3 },
      "inspectionId": "daily-tribune-01",
      "promptText": "Read newspaper"
    }
  ]
}
```

## Consequences

### Positive

- **Rich world-building** - Objects can tell stories without dialogue trees
- **Consistent UX** - Same interaction pattern as NPCs
- **Flexible content** - Simple text to rich multi-section documents
- **No inventory clutter** - Examine things without collecting them
- **Cacheable** - Content files loaded once, reused

### Negative

- **More content files** - Each inspectable needs a JSON file
- **Extended InteractionSystem** - Slightly more complex proximity detection
- **UI overlap potential** - Need to handle cases where NPC and inspectable are close

### Edge Cases

- **NPC and Inspectable at same position**: Nearest wins (by distance). Could add priority if needed.
- **Inspectable during dialogue**: Inspection disabled when dialogue/journal/inventory open.
- **Save/Load**: Inspectables are static world objects, no state to save.

## Files Changed

**New:**
- `src/components/Inspectable.ts`
- `src/inspection/types.ts`
- `src/inspection/InspectionLoader.ts`
- `src/inspection/InspectionManager.ts`
- `src/inspection/index.ts`
- `src/ui/InspectionUI.ts`
- `public/inspections/` (directory for content files)

**Modified:**
- `src/systems/InteractionSystem.ts` - Query Inspectable entities alongside NPCs
- `src/core/Engine.ts` - Add inspection callbacks, create Inspectable entities from region data
- `src/components/index.ts` - Export Inspectable

**Documentation:**
- `docs/api/04-components.md` - Document Inspectable component
- `docs/api/11-data-formats.md` - Document inspection content format
- New: `docs/api/12-inspection.md` - Full inspection system docs
