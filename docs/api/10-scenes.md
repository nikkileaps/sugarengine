# Scene Management

The scene system manages UI screens like title, pause, and save/load menus.

**Source**: `src/scenes/`

## SceneManager

Main class for managing game screens.

**Source**: `src/scenes/SceneManager.ts`

### Constructor

```typescript
const scenes = new SceneManager(container: HTMLElement);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | DOM element to render screens into |

### Initialization

#### setGameSystems()

Connect the scene manager to game systems.

```typescript
scenes.setGameSystems(engine: SugarEngine, saveManager: SaveManager): void
```

## Scene Control

### showTitle()

Show the title screen.

```typescript
await scenes.showTitle(): Promise<void>
```

The title screen provides:
- **New Game**: Start a fresh game
- **Continue**: Load most recent save (if saves exist)
- **Quit**: Exit application (Tauri only)

### showGameplay()

Switch to gameplay (hide all menus).

```typescript
scenes.showGameplay(): void
```

### showPause()

Show the pause menu.

```typescript
scenes.showPause(): void
```

The pause menu provides:
- **Resume**: Return to gameplay
- **Save**: Open save screen
- **Quit to Title**: Return to title screen

### togglePause()

Toggle pause menu visibility.

```typescript
scenes.togglePause(): void
```

### showSaveLoad()

Show the save/load screen.

```typescript
await scenes.showSaveLoad(mode: 'save' | 'load', returnTo: SceneId): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | `'save' \| 'load'` | Whether to save or load |
| `returnTo` | `SceneId` | Scene to return to on cancel |

## State Queries

### getCurrentScene()

Get the currently active scene.

```typescript
scenes.getCurrentScene(): SceneId
```

### SceneId

| Value | Description |
|-------|-------------|
| `'title'` | Title screen |
| `'gameplay'` | Main gameplay (no overlay) |
| `'save-load'` | Save/load slot selection |
| `'pause'` | Pause menu |

### isBlocking()

Check if a blocking UI is active (should pause game logic).

```typescript
scenes.isBlocking(): boolean
```

Returns `true` for title, pause, and save-load screens.

## Event Handlers

### onNewGame()

Called when player selects "New Game" on title screen.

```typescript
scenes.onNewGame(handler: () => void): void
```

### onSave()

Called when player saves to a slot.

```typescript
scenes.onSave(handler: (slotId: string) => void): void
```

### onLoad()

Called when player loads from a slot.

```typescript
scenes.onLoad(handler: (slotId: string) => void): void
```

### onQuit()

Called when player quits to title or exits.

```typescript
scenes.onQuit(handler: () => void): void
```

## Cleanup

### dispose()

Clean up all screens and event listeners.

```typescript
scenes.dispose(): void
```

## Screen Components

Individual screen classes (typically not used directly).

**Source**: `src/scenes/screens/`

### Base Screen

All screens extend `Screen`:

```typescript
abstract class Screen {
  show(): void;
  hide(): void;
  isVisible(): boolean;
  dispose(): void;
}
```

### TitleScreen

Title/main menu screen.

- New Game button
- Continue button (hidden if no saves)
- Quit button (hidden in browser)

### PauseScreen

In-game pause menu.

- Resume button
- Save button
- Quit to Title button

### SaveLoadScreen

Slot selection for save/load operations.

- Displays all save slots with metadata
- Shows play time, region, quest count
- Supports both save and load modes

## Integration Example

```typescript
const scenes = new SceneManager(container);
scenes.setGameSystems(engine, saveManager);

// Handle new game
scenes.onNewGame(async () => {
  inventory.clear();
  quests.clearAllQuests();
  saveManager.clearCollectedPickups();

  await engine.loadRegion('/regions/starting-area/');
  inventory.addItem('village-map');
  await quests.startQuest('intro-quest');

  scenes.showGameplay();
  engine.run();
});

// Handle load
scenes.onLoad(async (slotId) => {
  const result = await saveManager.load(slotId);
  if (result.success) {
    scenes.showGameplay();
    engine.run();
  }
});

// Handle save
scenes.onSave(async (slotId) => {
  await saveManager.save(slotId);
});

// Handle quit
scenes.onQuit(() => {
  engine.pause();
});

// Toggle pause with Escape
function gameLoop() {
  if (engine.isEscapePressed()) {
    scenes.togglePause();
    if (scenes.isBlocking()) {
      engine.pause();
    } else {
      engine.resume();
    }
  }
}

// Start at title screen
await scenes.showTitle();
```

## Typical Game Flow

```
┌─────────────────────────────────────────────────────────┐
│                     TITLE SCREEN                        │
│                                                         │
│   [New Game]  →  Initialize fresh state → GAMEPLAY      │
│   [Continue]  →  Load most recent save  → GAMEPLAY      │
│   [Quit]      →  Exit application                       │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      GAMEPLAY                           │
│                                                         │
│   Press Escape → PAUSE MENU                             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     PAUSE MENU                          │
│                                                         │
│   [Resume]        →  Back to GAMEPLAY                   │
│   [Save]          →  SAVE/LOAD SCREEN (save mode)       │
│   [Quit to Title] →  TITLE SCREEN                       │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   SAVE/LOAD SCREEN                      │
│                                                         │
│   Select slot → Save/Load → Return to previous scene    │
│   [Back]      → Return to previous scene                │
└─────────────────────────────────────────────────────────┘
```
