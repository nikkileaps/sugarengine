import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageProvider } from './LocalStorageProvider';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('LocalStorageProvider legacy save migration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MockStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies legacy unscoped slots into the namespace when missing', async () => {
    localStorage.setItem('sugarengine_save_autosave', '{"version":4}');
    localStorage.setItem('sugarengine_save_slot1', '{"version":4}');

    const provider = new LocalStorageProvider('rackwick-city');
    const initResult = await provider.init();
    expect(initResult.success).toBe(true);

    await provider.migrateLegacySaves(['autosave', 'slot1', 'slot2']);

    expect(localStorage.getItem('sugarengine_save_rackwick-city_autosave')).toBe('{"version":4}');
    expect(localStorage.getItem('sugarengine_save_rackwick-city_slot1')).toBe('{"version":4}');
    expect(localStorage.getItem('sugarengine_save_rackwick-city_slot2')).toBeNull();
    expect(localStorage.getItem('sugarengine_save_rackwick-city_legacy_migrated_v1')).toBe('1');
  });

  it('does not overwrite existing namespaced saves during migration', async () => {
    localStorage.setItem('sugarengine_save_slot1', '{"version":4,"source":"legacy"}');
    localStorage.setItem('sugarengine_save_rackwick-city_slot1', '{"version":4,"source":"new"}');

    const provider = new LocalStorageProvider('rackwick-city');
    await provider.init();
    await provider.migrateLegacySaves(['slot1']);

    expect(localStorage.getItem('sugarengine_save_rackwick-city_slot1')).toBe('{"version":4,"source":"new"}');
  });
});
