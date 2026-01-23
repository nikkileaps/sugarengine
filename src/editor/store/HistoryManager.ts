/**
 * HistoryManager - Undo/Redo system for the editor
 *
 * Uses a snapshot-based approach to track changes.
 * Supports Cmd+Z (undo) and Cmd+Shift+Z (redo).
 */

export interface HistorySnapshot {
  timestamp: number;
  label: string;
  data: string; // JSON stringified state
}

export type HistoryChangeCallback = (canUndo: boolean, canRedo: boolean) => void;

export class HistoryManager {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private maxHistory = 50;
  private listeners: Set<HistoryChangeCallback> = new Set();
  private getState: () => unknown;
  private setState: (state: unknown) => void;
  private isRestoring = false;

  constructor(
    getState: () => unknown,
    setState: (state: unknown) => void
  ) {
    this.getState = getState;
    this.setState = setState;
    this.setupKeyboardShortcuts();
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return; // Let browser handle undo/redo in inputs
      }

      // Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }

      // Cmd+Shift+Z (Mac) or Ctrl+Shift+Z / Ctrl+Y (Windows/Linux) for redo
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        this.redo();
      }
    });
  }

  /**
   * Record a new state snapshot
   */
  recordChange(label: string): void {
    if (this.isRestoring) return;

    const snapshot: HistorySnapshot = {
      timestamp: Date.now(),
      label,
      data: JSON.stringify(this.getState()),
    };

    this.undoStack.push(snapshot);
    this.redoStack = []; // Clear redo stack on new change

    // Trim history if too long
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.notifyListeners();
  }

  /**
   * Undo the last change
   */
  undo(): boolean {
    if (this.undoStack.length < 2) return false; // Need at least 2 items (current + previous)

    // Move current state to redo stack
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    // Restore previous state
    const previous = this.undoStack[this.undoStack.length - 1];
    if (previous) {
      this.restoreState(previous);
    }

    this.notifyListeners();
    return true;
  }

  /**
   * Redo the last undone change
   */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;

    const snapshot = this.redoStack.pop()!;
    this.undoStack.push(snapshot);
    this.restoreState(snapshot);

    this.notifyListeners();
    return true;
  }

  private restoreState(snapshot: HistorySnapshot): void {
    this.isRestoring = true;
    try {
      const state = JSON.parse(snapshot.data);
      this.setState(state);
    } catch (error) {
      console.error('Failed to restore state:', error);
    }
    this.isRestoring = false;
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(callback: HistoryChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();
    for (const listener of this.listeners) {
      listener(canUndo, canRedo);
    }
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  /**
   * Initialize with current state
   */
  initialize(): void {
    this.recordChange('Initial state');
  }
}
