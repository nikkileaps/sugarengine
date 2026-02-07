/**
 * BehaviorTreeEvaluator - Evaluates a behavior tree and returns a result.
 *
 * Pure evaluation logic, no ECS dependency. Given a tree and a context,
 * walks the tree and returns success/failure/running + the chosen action.
 */

import {
  BTNode,
  BTControlNode,
  BTParallelNode,
  BTDecoratorNode,
  BTConditionNode,
  BTActionNode,
  BTResult,
  BTContext,
} from './types';

export class BehaviorTreeEvaluator {
  /**
   * Evaluate a behavior tree from the root.
   * Returns the first successful action found, or failure.
   */
  evaluate(node: BTNode, context: BTContext): BTResult {
    switch (node.type) {
      case 'selector':
        return this.evaluateSelector(node as BTControlNode, context);
      case 'sequence':
        return this.evaluateSequence(node as BTControlNode, context);
      case 'parallel':
        return this.evaluateParallel(node as BTParallelNode, context);
      case 'inverter':
      case 'repeater':
      case 'succeeder':
      case 'untilFail':
        return this.evaluateDecorator(node as BTDecoratorNode, context);
      case 'condition':
        return this.evaluateCondition(node as BTConditionNode, context);
      case 'action':
        return this.evaluateAction(node as BTActionNode, context);
      default:
        return { status: 'failure' };
    }
  }

  /**
   * Selector (OR): Try children in order, return first success.
   * Like a priority list - "try this, then this, then this..."
   */
  private evaluateSelector(node: BTControlNode, context: BTContext): BTResult {
    for (const child of node.children) {
      const result = this.evaluate(child, context);
      if (result.status === 'success' || result.status === 'running') {
        return result;
      }
    }
    return { status: 'failure' };
  }

  /**
   * Sequence (AND): Run children in order, fail on first failure.
   * Like a checklist - "do this AND this AND this..."
   */
  private evaluateSequence(node: BTControlNode, context: BTContext): BTResult {
    let lastAction: BTResult['action'];

    for (const child of node.children) {
      const result = this.evaluate(child, context);
      if (result.status === 'failure') {
        return { status: 'failure' };
      }
      if (result.status === 'running') {
        return result;
      }
      // Track the last action from successful children
      if (result.action) {
        lastAction = result.action;
      }
    }

    return { status: 'success', action: lastAction };
  }

  /**
   * Parallel: Run all children, success depends on policy.
   * - requireAll: all must succeed
   * - requireOne: any one succeeding is enough
   */
  private evaluateParallel(node: BTParallelNode, context: BTContext): BTResult {
    let successCount = 0;
    let failureCount = 0;
    let lastAction: BTResult['action'];

    for (const child of node.children) {
      const result = this.evaluate(child, context);
      if (result.status === 'success') {
        successCount++;
        if (result.action) lastAction = result.action;
      } else if (result.status === 'failure') {
        failureCount++;
      }
      // running counts as neither
    }

    if (node.policy === 'requireOne' && successCount > 0) {
      return { status: 'success', action: lastAction };
    }
    if (node.policy === 'requireAll' && failureCount === 0) {
      return { status: 'success', action: lastAction };
    }
    if (failureCount > 0 && node.policy === 'requireAll') {
      return { status: 'failure' };
    }

    return { status: 'running' };
  }

  /**
   * Decorators: modify single child's behavior.
   */
  private evaluateDecorator(node: BTDecoratorNode, context: BTContext): BTResult {
    switch (node.type) {
      case 'inverter': {
        const result = this.evaluate(node.child, context);
        if (result.status === 'success') return { status: 'failure' };
        if (result.status === 'failure') return { status: 'success' };
        return result; // running passes through
      }

      case 'succeeder': {
        this.evaluate(node.child, context);
        return { status: 'success' };
      }

      case 'repeater': {
        const count = node.count ?? 1;
        let lastResult: BTResult = { status: 'success' };
        for (let i = 0; i < count; i++) {
          lastResult = this.evaluate(node.child, context);
          if (lastResult.status === 'running') return lastResult;
        }
        return lastResult;
      }

      case 'untilFail': {
        // In synchronous evaluation, run once and check
        const result = this.evaluate(node.child, context);
        if (result.status === 'failure') return { status: 'success' };
        return { status: 'running' };
      }

      default:
        return { status: 'failure' };
    }
  }

  /**
   * Condition: Check game state via the context's condition checker.
   */
  private evaluateCondition(node: BTConditionNode, context: BTContext): BTResult {
    const passed = context.checkCondition(node.condition);
    return { status: passed ? 'success' : 'failure' };
  }

  /**
   * Action: Return the action for the caller to execute.
   */
  private evaluateAction(node: BTActionNode, _context: BTContext): BTResult {
    return { status: 'success', action: node.action };
  }
}
