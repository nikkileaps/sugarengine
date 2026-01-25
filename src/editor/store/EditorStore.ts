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
}

export const editorStore = new EditorStoreClass();
