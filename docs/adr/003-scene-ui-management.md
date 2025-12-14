# ADR 003: Hybrid Scene/UI Management System

## Status
Accepted

## Context
Sugarengine now has save/load functionality but no way for players to access it. The game currently boots straight into gameplay with no title screen, pause menu, or save slot selection. We need a system to manage different game states (screens) and their associated UI.

## Decision
Implement a **hybrid Scene/UI management system** that uses:
1. **Full HTML screens** for menus (Title, Save/Load) - no 3D rendering needed
2. **HTML overlays** on top of paused 3D world (Pause menu)
3. **Existing UI pattern** preserved for gameplay overlays (dialogue, inventory, etc.)

## Architecture

### Scene Types
```
┌─────────────────────────────────────────────────────────┐
│  Title Screen (z:500)     │  Save/Load Screen (z:500)  │
│  - New Game               │  - Slot list with metadata │
│  - Continue               │  - Save or Load mode       │
│  - Settings               │  - Back navigation         │
│  - Quit                   │                            │
├─────────────────────────────────────────────────────────┤
│                  Pause Screen (z:400)                   │
│         (overlay on paused 3D world)                    │
│  Resume | Save | Load | Settings | Quit to Title       │
├─────────────────────────────────────────────────────────┤
│                    Gameplay                             │
│  3D World + Existing UI Overlays (z:100-310)           │
│  DialogueBox, InventoryUI, QuestJournal, etc.          │
└─────────────────────────────────────────────────────────┘
```

### Z-Index Layering
| Layer | Z-Index | Components |
|-------|---------|------------|
| Gameplay UI | 100-310 | Existing overlays |
| Pause Overlay | 400 | PauseScreen |
| Full Screens | 500 | TitleScreen, SaveLoadScreen |
| Modals | 600 | Confirm dialogs |

## File Structure
```
src/scenes/
  index.ts              # Public exports
  types.ts              # SceneId, MenuItem, events
  SceneManager.ts       # Orchestrates scene transitions
  Screen.ts             # Base class with keyboard nav
  TitleScreen.ts        # Main menu
  SaveLoadScreen.ts     # Save slot selection
  PauseScreen.ts        # Pause overlay
```

## Key Components

### SceneManager
- Tracks current scene state
- Routes keyboard input (Escape for pause)
- Coordinates with Engine (pause/resume) and SaveManager
- Provides event callbacks: `onNewGame`, `onSave`, `onLoad`

### Screen Base Class
- Self-contained CSS injection (existing pattern)
- Keyboard navigation (arrows + enter + escape)
- Show/hide lifecycle methods
- Menu item selection tracking

### Engine Changes
Add pause/resume to `Engine.ts`:
```typescript
pause(): void    // Stop game loop updates, keep rendering
resume(): void   // Resume game loop
```

## Keyboard Controls
- **Arrow Up/Down**: Navigate menu items
- **Enter/Space**: Activate selection
- **Escape**: Back/Close/Pause toggle

## Consequences

### Positive
- Clean separation between menu screens and gameplay
- Reuses existing UI patterns (familiar code)
- Full keyboard navigation for cozy experience
- Easy to add new screens later

### Negative
- More code to maintain
- Need to coordinate input between SceneManager and existing UI

## Alternatives Considered

1. **Pure ECS Scenes** - Treat screens as ECS entities. Rejected: overcomplicated for menus.
2. **Single UI Layer** - All screens as overlays. Rejected: title screen doesn't need 3D rendering.
3. **External UI Framework** - Use React/Vue. Rejected: adds dependency, existing pattern works well.
