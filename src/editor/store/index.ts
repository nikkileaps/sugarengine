// Zustand store (new)
export { useEditorStore } from './useEditorStore';

// Legacy stores (for migration)
export { Store } from './Store';
export type { Listener } from './Store';

export { editorStore } from './EditorStore';
export type { EditorTab, EditorState, ValidationError } from './EditorStore';

export { HistoryManager } from './HistoryManager';
export type { HistorySnapshot, HistoryChangeCallback } from './HistoryManager';
