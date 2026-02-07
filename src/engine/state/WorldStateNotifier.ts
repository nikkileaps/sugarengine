import type { StateChange, StateChangeListener } from './types';

/**
 * Pub/sub for state changes (ADR-018)
 *
 * Systems subscribe to be notified when world state changes.
 * FlagsManager, inventory handlers, and quest callbacks all
 * push notifications through here.
 */
export class WorldStateNotifier {
  private listeners: Set<StateChangeListener> = new Set();

  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(change: StateChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
