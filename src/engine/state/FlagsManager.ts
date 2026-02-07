import type { StateChange } from './types';

/**
 * Typed flags manager (ADR-018)
 *
 * Replaces the raw `Map<string, unknown>` beatFlags in Game.ts
 * with typed accessors and change notification.
 */
export class FlagsManager {
  private flags: Map<string, unknown> = new Map();
  private onChange: ((change: StateChange) => void) | null = null;

  setOnChange(handler: (change: StateChange) => void): void {
    this.onChange = handler;
  }

  get(key: string): unknown {
    return this.flags.get(key);
  }

  set(key: string, value: unknown): void {
    const oldValue = this.flags.get(key);
    this.flags.set(key, value);
    this.onChange?.({ namespace: 'flags', key, oldValue, newValue: value });
  }

  delete(key: string): boolean {
    const oldValue = this.flags.get(key);
    const existed = this.flags.delete(key);
    if (existed) {
      this.onChange?.({ namespace: 'flags', key, oldValue, newValue: undefined });
    }
    return existed;
  }

  has(key: string): boolean {
    return this.flags.has(key);
  }

  clear(): void {
    this.flags.clear();
  }

  // Typed getters
  getBoolean(key: string): boolean {
    const v = this.flags.get(key);
    return v === true;
  }

  getNumber(key: string): number {
    const v = this.flags.get(key);
    return typeof v === 'number' ? v : 0;
  }

  getString(key: string): string {
    const v = this.flags.get(key);
    return typeof v === 'string' ? v : '';
  }

  // Tooling / serialization
  getAllFlags(): Map<string, unknown> {
    return new Map(this.flags);
  }

  serializeFlags(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.flags) {
      obj[k] = v;
    }
    return obj;
  }

  loadFlags(data: Record<string, unknown>): void {
    this.flags.clear();
    for (const [k, v] of Object.entries(data)) {
      this.flags.set(k, v);
    }
  }
}
