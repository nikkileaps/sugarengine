/**
 * World State types (ADR-018)
 *
 * Unified condition system that replaces the duplicated evaluation logic
 * in Game.ts (evaluateCondition + evaluateBTCondition).
 */

// ============================================
// State Namespaces
// ============================================

export type StateNamespace = 'flags' | 'quest' | 'inventory' | 'caster';

// ============================================
// Unified Condition Type
// ============================================

/**
 * Discriminated union of all conditions the world state system can evaluate.
 * Covers conditions from both beat graph (ConditionExpression) and
 * behavior trees (BTCondition).
 */
export type WorldStateCondition =
  | { type: 'questActive'; questId: string }
  | { type: 'questCompleted'; questId: string }
  | { type: 'questStage'; questId: string; stageId: string; state: 'active' | 'completed' }
  | { type: 'questNode'; questId: string; nodeId: string; state: 'active' | 'completed' }
  | { type: 'hasItem'; itemId: string; count?: number }
  | { type: 'resonance'; comparison: 'eq' | 'gte' | 'lte'; value: number }
  | { type: 'battery'; comparison: 'eq' | 'gte' | 'lte'; value: number }
  | { type: 'hasSpell'; spellId: string }
  | { type: 'flag'; key: string; value?: unknown }
  | { type: 'and'; conditions: WorldStateCondition[] }
  | { type: 'or'; conditions: WorldStateCondition[] }
  | { type: 'not'; condition: WorldStateCondition };

// ============================================
// State Change Notification
// ============================================

export interface StateChange {
  namespace: StateNamespace;
  key: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export type StateChangeListener = (change: StateChange) => void;
