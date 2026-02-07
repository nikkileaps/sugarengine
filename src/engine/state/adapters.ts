import type { WorldStateCondition } from './types';
import type { ConditionExpression } from '../quests/types';
import type { BTCondition } from '../behavior/types';

/**
 * Adapter functions (ADR-018)
 *
 * Bridge existing condition types (ConditionExpression from beat graph,
 * BTCondition from behavior trees) to the unified WorldStateCondition.
 */

/**
 * Convert a beat graph ConditionExpression to a WorldStateCondition.
 * Handles the `negate` field by wrapping in a `not` condition.
 */
export function conditionExpressionToWorldState(expr: ConditionExpression): WorldStateCondition {
  let condition: WorldStateCondition;

  switch (expr.operator) {
    case 'hasItem':
      condition = { type: 'hasItem', itemId: expr.operand };
      break;

    case 'hasFlag':
      condition = { type: 'flag', key: expr.operand, value: expr.value };
      break;

    case 'questComplete':
      condition = { type: 'questCompleted', questId: expr.operand };
      break;

    case 'stageComplete': {
      // operand format: "questId:stageId"
      const parts = expr.operand.split(':');
      condition = { type: 'questStage', questId: parts[0] ?? '', stageId: parts[1] ?? '', state: 'completed' };
      break;
    }

    case 'custom':
      console.warn(`[adapters] Custom condition not supported: ${expr.operand}`);
      condition = { type: 'flag', key: `__unsupported_custom_${expr.operand}` };
      break;

    default:
      console.warn(`[adapters] Unknown condition operator: ${(expr as ConditionExpression).operator}`);
      condition = { type: 'flag', key: '__unsupported' };
      break;
  }

  if (expr.negate) {
    return { type: 'not', condition };
  }

  return condition;
}

/**
 * Convert a behavior tree BTCondition to a WorldStateCondition.
 * Unsupported types (timeOfDay, atLocation, custom) warn and return always-false.
 */
export function btConditionToWorldState(cond: BTCondition): WorldStateCondition {
  switch (cond.type) {
    case 'questStage':
      if (cond.nodeId) {
        return { type: 'questNode', questId: cond.questId, nodeId: cond.nodeId, state: cond.state };
      }
      return { type: 'questStage', questId: cond.questId, stageId: cond.stageId, state: cond.state };

    case 'hasItem':
      return { type: 'hasItem', itemId: cond.itemId, count: cond.count };

    case 'hasFlag':
      return { type: 'flag', key: cond.flag, value: cond.value };

    case 'timeOfDay':
      console.warn(`[adapters] timeOfDay condition not yet supported`);
      return { type: 'flag', key: '__unsupported_timeOfDay' };

    case 'atLocation':
      console.warn(`[adapters] atLocation condition not yet supported`);
      return { type: 'flag', key: '__unsupported_atLocation' };

    case 'custom':
      console.warn(`[adapters] Custom BT condition not supported: ${cond.check}`);
      return { type: 'flag', key: `__unsupported_custom_${cond.check}` };

    default:
      return { type: 'flag', key: '__unsupported' };
  }
}
