# ADR 009: Project Manager Dialog

## Status
Implemented

## Context

Currently, Sugar Engine's editor has season/episode selection embedded in the toolbar with dropdowns. This creates several UX issues:

1. No clear "project" concept - users jump straight into editing
2. No way to edit episode metadata (like `startRegion`) without code
3. Cluttered toolbar with multiple dropdowns
4. No guided onboarding for new users

Modern creative tools (Adobe, Unity, Unreal) use a Project Manager pattern where users must first open or create a project before accessing the editor.

## Decision

### Project Manager Dialog

Implement a modal Project Manager dialog that:

1. **Opens automatically on app launch**
2. **Handles project lifecycle**: Create, Open, Save, Save As
3. **Manages narrative structure**: Seasons and Episodes (CRUD)
4. **Provides episode selection**: User must select an episode to edit

### Dialog Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Project Manager                                       ✕    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  + New Project  │  │  📂 Open Project │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│  Project: My Game                                    [Save] │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  ┌────────────┬─────────────────┬──────────────────────┐   │
│  │ Seasons    │ Episodes        │ Episode Details      │   │
│  │        [+] │             [+] │                      │   │
│  ├────────────┼─────────────────┤ Name                 │   │
│  │ Season 1   │ E1: Intro       │ [_______________]    │   │
│  │ Season 2 ● │ E2: Rising  ●   │                      │   │
│  │            │ E3: Climax      │ Order                │   │
│  │            │                 │ [2]                  │   │
│  │            │                 │                      │   │
│  │            │                 │ Start Region         │   │
│  │            │                 │ [▼ Cafe Nollie    ]  │   │
│  │            │                 │                      │   │
│  │            │                 │ [Delete Episode]     │   │
│  └────────────┴─────────────────┴──────────────────────┘   │
│                                                             │
│                                        ┌─────────────────┐  │
│                                        │  Open Episode → │  │
│                                        └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Toolbar Changes

**Before:**
```
🍬 Sugar Engine | [Season ▼] [Episode ▼] [Start: ▼] [+] | Tabs... | Preview | Project ▼
```

**After (no project):**
```
🍬 Sugar Engine | 📁 Open Project | [disabled tabs...] | [disabled]
```

**After (project loaded):**
```
🍬 Sugar Engine | 📁 Season 1, Episode 2 ▾ | Tabs... | ▶ Preview
```

### Application States

| State | Toolbar | Panels | Project Manager |
|-------|---------|--------|-----------------|
| No project | "Open Project" button only | Disabled/grayed | Auto-opens on launch |
| Project loaded, no episode | Project name shown | Disabled | Must select episode |
| Project + episode selected | "Season X, Episode Y ▾" | Fully active | Closed, can reopen |

### User Flows

**First Launch:**
1. App opens → Project Manager dialog appears
2. User clicks "New Project" or "Open Project"
3. For new: enters project name, creates first season/episode
4. For open: file picker, loads .sgrgame
5. User selects episode → dialog closes → editor active

**Navigate to Different Episode:**
1. Click "📁 Season 1, Episode 2 ▾" in toolbar
2. Project Manager opens with current project loaded
3. Select different episode
4. Click "Open Episode" → dialog closes → editor shows new episode

**Create New Episode:**
1. Open Project Manager
2. Select season, click [+] in Episodes column
3. Edit episode details (name, startRegion)
4. Click "Open Episode" or continue creating more

### Implementation

**New Files:**
- `src/editor/components/ProjectManagerDialog.ts` - Main dialog component

**Modified Files:**
- `src/editor/Toolbar.ts` - Replace dropdowns with collapsible Project button
- `src/editor/EditorApp.ts` - Show dialog on launch, manage project state
- `src/editor/store.ts` - Add `projectLoaded` state

**Removed:**
- `src/editor/components/EpisodeSelector.ts` - Functionality moves to dialog

### Component API

```typescript
interface ProjectManagerDialogConfig {
  onProjectCreate: (name: string) => void;
  onProjectOpen: () => void;  // Triggers file picker
  onProjectSave: () => void;
  onEpisodeSelect: (seasonId: string, episodeId: string) => void;
  onSeasonsChange: (seasons: Season[]) => void;
  onEpisodesChange: (episodes: Episode[]) => void;
  getRegions: () => { id: string; name: string }[];
}

class ProjectManagerDialog {
  open(): void;
  close(): void;
  setProject(name: string, seasons: Season[], episodes: Episode[]): void;
  clearProject(): void;
}
```

## Consequences

### Positive
- Clear project lifecycle management
- Guided onboarding for new users
- Single place to manage narrative structure
- Cleaner toolbar
- Episode metadata (startRegion) easily editable
- Familiar pattern from other creative tools

### Negative
- Extra click to switch episodes (dialog instead of dropdown)
- More complex initial implementation

### Neutral
- Save/Load moves from Project menu to Project Manager dialog
- Project menu in toolbar removed entirely

## Implementation Phases

### Phase 1: ProjectManagerDialog Component ✓ COMPLETE
- ✓ Create dialog with seasons/episodes browser
- ✓ Episode details editing (name, order, startRegion)
- ✓ Create/delete seasons and episodes
- ✓ Welcome screen for new users
- ✓ Open Episode button

### Phase 2: Toolbar Integration ✓ COMPLETE
- ✓ Replace EpisodeSelector with Project button
- ✓ Show "Season X, Episode Y" when loaded
- ✓ Click opens Project Manager
- ✓ Disable tabs/preview when no project loaded

### Phase 3: App Launch Flow ✓ COMPLETE
- ✓ Auto-open dialog on launch
- ✓ Disable editor until project + episode selected
- ✓ Wire up New/Open/Save project actions
- ✓ EditorStore tracks projectLoaded state

### Phase 4: Cleanup
- Remove EpisodeSelector component (can be deprecated, kept for reference)
- Project dropdown menu kept for Save/Load/Publish actions
- Update keyboard shortcuts if needed
