/**
 * EditorStore - Central state for the editor UI
 */

import { Store } from './Store';

export type EditorTab = 'dialogues' | 'quests' | 'npcs' | 'items' | 'inspections';

export interface EditorState {
  activeTab: EditorTab;
  selectedEntryId: string | null;
  isDirty: boolean;
  validationErrors: ValidationError[];
  searchQuery: string;
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
}

export const editorStore = new EditorStoreClass();
