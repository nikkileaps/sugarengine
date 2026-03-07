/**
 * EditorStore - Central state for the editor UI
 */

import { Store } from './Store';

export type EditorTab = 'dialogues' | 'quests' | 'npcs' | 'items' | 'inspections' | 'regions';

export interface EditorState {
  activeTab: EditorTab;
  selectedEntryId: string | null;
  isDirty: boolean;
  validationErrors: ValidationError[];
  searchQuery: string;
  // Project context
  projectLoaded: boolean;
  projectName: string | null;
  gameId: string | null;
  gameRootPath: string | null;
  projectFilePath: string | null;
  projectCreatedAt: string | null;
  projectVersion: string | null;
  defaultEpisodeId: string | null;
  // Episode context
  currentSeasonId: string | null;
  currentEpisodeId: string | null;
  episodeFilter: 'all' | 'current';
}

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  entryId?: string;
  field?: string;
}

const initialState: EditorState = {
  activeTab: 'dialogues',
  selectedEntryId: null,
  isDirty: false,
  validationErrors: [],
  searchQuery: '',
  projectLoaded: false,
  projectName: null,
  gameId: null,
  gameRootPath: null,
  projectFilePath: null,
  projectCreatedAt: null,
  projectVersion: null,
  defaultEpisodeId: null,
  currentSeasonId: null,
  currentEpisodeId: null,
  episodeFilter: 'all',
};

class EditorStoreClass extends Store<EditorState> {
  constructor() {
    super(initialState);
  }

  setActiveTab(tab: EditorTab): void {
    this.setState({ activeTab: tab, selectedEntryId: null });
  }

  selectEntry(entryId: string | null): void {
    this.setState({ selectedEntryId: entryId });
  }

  setDirty(isDirty: boolean): void {
    this.setState({ isDirty });
  }

  setSearchQuery(query: string): void {
    this.setState({ searchQuery: query });
  }

  addValidationError(error: ValidationError): void {
    const errors = [...this.getState().validationErrors, error];
    this.setState({ validationErrors: errors });
  }

  clearValidationErrors(): void {
    this.setState({ validationErrors: [] });
  }

  setCurrentSeason(seasonId: string | null): void {
    this.setState({ currentSeasonId: seasonId });
  }

  setCurrentEpisode(episodeId: string | null): void {
    this.setState({ currentEpisodeId: episodeId });
  }

  setEpisodeFilter(filter: 'all' | 'current'): void {
    this.setState({ episodeFilter: filter });
  }

  setProjectLoaded(loaded: boolean, name: string | null = null): void {
    this.setState({ projectLoaded: loaded, projectName: name });
  }

  setProjectContext(context: {
    loaded: boolean;
    name?: string | null;
    gameId?: string | null;
    gameRootPath?: string | null;
    projectFilePath?: string | null;
    projectCreatedAt?: string | null;
    projectVersion?: string | null;
    defaultEpisodeId?: string | null;
  }): void {
    this.setState({
      projectLoaded: context.loaded,
      projectName: context.name ?? null,
      gameId: context.gameId ?? null,
      gameRootPath: context.gameRootPath ?? null,
      projectFilePath: context.projectFilePath ?? null,
      projectCreatedAt: context.projectCreatedAt ?? null,
      projectVersion: context.projectVersion ?? null,
      defaultEpisodeId: context.defaultEpisodeId ?? null,
    });
  }
}

export const editorStore = new EditorStoreClass();
