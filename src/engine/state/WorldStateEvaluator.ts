import type { WorldStateCondition } from './types';
import type { FlagsManager } from './FlagsManager';

// ============================================
// Forward-declared interfaces to avoid circular deps
// ============================================

export interface QuestManagerLike {
  isQuestActive(questId: string): boolean;
  isQuestCompleted(questId: string): boolean;
  getStageState(questId: string, stageId: string): 'active' | 'completed' | null;
  getObjectiveState(questId: string, objectiveId: string): 'active' | 'completed' | null;
}

export interface InventoryManagerLike {
  hasItem(itemId: string, quantity?: number): boolean;
}

export interface CasterManagerLike {
  getResonance(): number;
  getBattery(): number;
  getSpell(spellId: string): unknown | undefined;
}

// ============================================
// Evaluator
// ============================================

/**
 * Centralized condition evaluator (ADR-018)
 *
 * Replaces the duplicated evaluateCondition/evaluateBTCondition methods
 * in Game.ts with a single check() that handles all condition types.
 */
export class WorldStateEvaluator {
  constructor(
    private quests: QuestManagerLike,
    private inventory: InventoryManagerLike,
    private caster: CasterManagerLike,
    private flags: FlagsManager,
  ) {}

  check(condition: WorldStateCondition): boolean {
    switch (condition.type) {
      case 'questActive':
        return this.quests.isQuestActive(condition.questId);

      case 'questCompleted':
        return this.quests.isQuestCompleted(condition.questId);

      case 'questStage':
        return this.quests.getStageState(condition.questId, condition.stageId) === condition.state;

      case 'questNode':
        return this.quests.getObjectiveState(condition.questId, condition.nodeId) === condition.state;

      case 'hasItem':
        return this.inventory.hasItem(condition.itemId, condition.count);

      case 'resonance':
        return this.compare(this.caster.getResonance(), condition.comparison, condition.value);

      case 'battery':
        return this.compare(this.caster.getBattery(), condition.comparison, condition.value);

      case 'hasSpell':
        return this.caster.getSpell(condition.spellId) !== undefined;

      case 'flag': {
        const flagValue = this.flags.get(condition.key);
        if (condition.value !== undefined) {
          return flagValue === condition.value;
        }
        return flagValue !== undefined && flagValue !== false && flagValue !== null;
      }

      case 'and':
        return condition.conditions.every(c => this.check(c));

      case 'or':
        return condition.conditions.some(c => this.check(c));

      case 'not':
        return !this.check(condition.condition);

      default:
        return false;
    }
  }

  private compare(actual: number, comparison: 'eq' | 'gte' | 'lte', expected: number): boolean {
    switch (comparison) {
      case 'eq': return actual === expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
    }
  }
}
