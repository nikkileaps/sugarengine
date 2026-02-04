import { PlayerCasterConfig, SpellDefinition } from './types';

/**
 * Loader for caster config and spell definitions from files or project data
 */
export class SpellLoader {
  /**
   * Load spell definitions from a JSON file
   */
  static async loadSpellsFromFile(path: string): Promise<SpellDefinition[]> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        console.warn(`[SpellLoader] Failed to load spells from ${path}`);
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : data.spells ?? [];
    } catch (error) {
      console.error(`[SpellLoader] Error loading spells from ${path}:`, error);
      return [];
    }
  }

  /**
   * Parse player caster config from raw project data
   */
  static parsePlayerCaster(data: unknown): PlayerCasterConfig | null {
    if (!data || typeof data !== 'object') {
      console.log('[SpellLoader] parsePlayerCaster: data is not an object', data);
      return null;
    }

    const project = data as { playerCaster?: unknown };
    console.log('[SpellLoader] parsePlayerCaster: project.playerCaster =', project.playerCaster);

    if (!project.playerCaster || typeof project.playerCaster !== 'object') {
      console.log('[SpellLoader] parsePlayerCaster: playerCaster missing or not object');
      return null;
    }

    const config = project.playerCaster as Record<string, unknown>;

    // Validate required fields
    if (typeof config.initialBattery !== 'number' || typeof config.rechargeRate !== 'number') {
      console.log('[SpellLoader] parsePlayerCaster: validation failed', {
        initialBattery: config.initialBattery,
        initialBatteryType: typeof config.initialBattery,
        rechargeRate: config.rechargeRate,
        rechargeRateType: typeof config.rechargeRate,
      });
      return null;
    }

    // Parse spawn position if present
    let initialSpawnPosition: { x: number; y: number; z: number } | undefined;
    if (config.initialSpawnPosition && typeof config.initialSpawnPosition === 'object') {
      const pos = config.initialSpawnPosition as Record<string, unknown>;
      if (typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number') {
        initialSpawnPosition = { x: pos.x, y: pos.y, z: pos.z };
      }
    }

    const result: PlayerCasterConfig = {
      initialBattery: config.initialBattery,
      rechargeRate: config.rechargeRate,
      initialResonance: typeof config.initialResonance === 'number' ? config.initialResonance : undefined,
      allowedSpellTags: Array.isArray(config.allowedSpellTags) ? config.allowedSpellTags : undefined,
      blockedSpellTags: Array.isArray(config.blockedSpellTags) ? config.blockedSpellTags : undefined,
      initialSpawnPosition,
      initialFacingAngle: typeof config.initialFacingAngle === 'number' ? config.initialFacingAngle : undefined,
    };
    console.log('[SpellLoader] parsePlayerCaster: success', result);
    return result;
  }

  /**
   * Parse spell definitions from raw project data
   */
  static parseSpells(data: unknown): SpellDefinition[] {
    if (!data || typeof data !== 'object') return [];

    const project = data as { spells?: unknown[] };
    if (!Array.isArray(project.spells)) return [];

    return project.spells.filter(isSpellDefinition);
  }

  /**
   * Validate a spell definition
   */
  static validateSpell(spell: unknown): spell is SpellDefinition {
    return isSpellDefinition(spell);
  }
}

/**
 * Type guard for SpellDefinition
 */
function isSpellDefinition(obj: unknown): obj is SpellDefinition {
  if (!obj || typeof obj !== 'object') return false;

  const spell = obj as Record<string, unknown>;

  return (
    typeof spell.id === 'string' &&
    typeof spell.name === 'string' &&
    Array.isArray(spell.tags) &&
    typeof spell.batteryCost === 'number' &&
    Array.isArray(spell.effects)
  );
}
