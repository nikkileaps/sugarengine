/**
 * ObjectiveGraph - Directed graph representation of quest objectives
 *
 * This is a pure domain model with no UI/presentation concerns.
 * Handles the logical structure of objectives and their relationships.
 *
 * Edges represent prerequisite relationships: A → B means "A must complete before B".
 * When A completes, B becomes eligible (if all of B's prerequisites are satisfied).
 */

/**
 * Minimal objective interface for graph construction
 * Only includes fields needed for graph structure, not runtime state
 */
export interface GraphableObjective {
  readonly id: string;
  readonly prerequisites?: readonly string[];
}

/**
 * Edge type - currently only prerequisite edges
 * (Triggering is implicit: when all prerequisites complete, the objective activates)
 */
export type ObjectiveEdgeType = 'prerequisite';

/**
 * A directed edge in the objective graph
 */
export interface ObjectiveEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly type: ObjectiveEdgeType;
}

/**
 * A node in the objective graph
 */
export interface ObjectiveNode<T extends GraphableObjective = GraphableObjective> {
  readonly id: string;
  readonly objective: T;
  readonly incomingEdges: readonly ObjectiveEdge[];
  readonly outgoingEdges: readonly ObjectiveEdge[];
  readonly isEntry: boolean;
}

/**
 * Immutable directed graph of objectives
 */
export class ObjectiveGraph<T extends GraphableObjective = GraphableObjective> {
  private readonly _nodes: ReadonlyMap<string, ObjectiveNode<T>>;
  private readonly _edges: readonly ObjectiveEdge[];

  private constructor(
    nodes: ReadonlyMap<string, ObjectiveNode<T>>,
    edges: readonly ObjectiveEdge[]
  ) {
    this._nodes = nodes;
    this._edges = edges;
  }

  /**
   * Build a graph from a list of objectives
   */
  static fromObjectives<T extends GraphableObjective>(objectives: T[]): ObjectiveGraph<T> {
    const edges = ObjectiveGraph.extractEdges(objectives);
    const nodes = ObjectiveGraph.buildNodes(objectives, edges);
    return new ObjectiveGraph(nodes, edges);
  }

  /**
   * Extract all edges from objectives based on prerequisites
   *
   * Edge: prerequisite → dependent (A → B means "A must complete before B")
   * When A completes, B becomes eligible if all B's prerequisites are satisfied.
   */
  private static extractEdges<T extends GraphableObjective>(objectives: T[]): ObjectiveEdge[] {
    const edges: ObjectiveEdge[] = [];
    const objectiveIds = new Set(objectives.map(o => o.id));

    for (const obj of objectives) {
      if (obj.prerequisites) {
        for (const prereqId of obj.prerequisites) {
          if (objectiveIds.has(prereqId)) {
            edges.push({ fromId: prereqId, toId: obj.id, type: 'prerequisite' });
          }
        }
      }
    }

    return edges;
  }

  /**
   * Build node map with computed edge references
   */
  private static buildNodes<T extends GraphableObjective>(
    objectives: T[],
    edges: ObjectiveEdge[]
  ): ReadonlyMap<string, ObjectiveNode<T>> {
    // Index edges by node
    const incomingByNode = new Map<string, ObjectiveEdge[]>();
    const outgoingByNode = new Map<string, ObjectiveEdge[]>();

    for (const edge of edges) {
      if (!incomingByNode.has(edge.toId)) incomingByNode.set(edge.toId, []);
      if (!outgoingByNode.has(edge.fromId)) outgoingByNode.set(edge.fromId, []);
      incomingByNode.get(edge.toId)!.push(edge);
      outgoingByNode.get(edge.fromId)!.push(edge);
    }

    // Build nodes
    const nodes = new Map<string, ObjectiveNode<T>>();

    for (const obj of objectives) {
      const incoming = incomingByNode.get(obj.id) || [];
      const outgoing = outgoingByNode.get(obj.id) || [];

      // Entry = no incoming prerequisite edges
      const isEntry = !incoming.some(e => e.type === 'prerequisite');

      nodes.set(obj.id, {
        id: obj.id,
        objective: obj,
        incomingEdges: incoming,
        outgoingEdges: outgoing,
        isEntry,
      });
    }

    return nodes;
  }

  // ============================================
  // Accessors
  // ============================================

  get nodes(): ReadonlyMap<string, ObjectiveNode<T>> {
    return this._nodes;
  }

  get edges(): readonly ObjectiveEdge[] {
    return this._edges;
  }

  getNode(id: string): ObjectiveNode<T> | undefined {
    return this._nodes.get(id);
  }

  /**
   * Get all entry nodes (no incoming prerequisite edges)
   */
  getEntryNodes(): ObjectiveNode<T>[] {
    return Array.from(this._nodes.values()).filter(n => n.isEntry);
  }

  /**
   * Get nodes that depend on the given node (outgoing edges)
   */
  getDependents(nodeId: string): ObjectiveNode<T>[] {
    const node = this._nodes.get(nodeId);
    if (!node) return [];

    return node.outgoingEdges
      .map(e => this._nodes.get(e.toId))
      .filter((n): n is ObjectiveNode<T> => n !== undefined);
  }

  /**
   * Get nodes that the given node depends on (incoming prerequisite edges)
   */
  getPrerequisites(nodeId: string): ObjectiveNode<T>[] {
    const node = this._nodes.get(nodeId);
    if (!node) return [];

    return node.incomingEdges
      .filter(e => e.type === 'prerequisite')
      .map(e => this._nodes.get(e.fromId))
      .filter((n): n is ObjectiveNode<T> => n !== undefined);
  }

  /**
   * Check if completing nodeId would unlock targetId
   * (i.e., nodeId is a prerequisite of targetId)
   */
  wouldUnlock(nodeId: string, targetId: string): boolean {
    const target = this._nodes.get(targetId);
    if (!target) return false;

    return target.incomingEdges.some(
      e => e.type === 'prerequisite' && e.fromId === nodeId
    );
  }

  /**
   * Topological sort of nodes (for layout, execution order, etc.)
   * Returns nodes in dependency order (prerequisites before dependents)
   */
  topologicalSort(): ObjectiveNode<T>[] {
    const result: ObjectiveNode<T>[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>(); // For cycle detection

    const visit = (nodeId: string): boolean => {
      if (visited.has(nodeId)) return true;
      if (visiting.has(nodeId)) return false; // Cycle detected

      visiting.add(nodeId);

      const node = this._nodes.get(nodeId);
      if (node) {
        // Visit prerequisites first
        for (const edge of node.incomingEdges) {
          if (edge.type === 'prerequisite') {
            if (!visit(edge.fromId)) return false;
          }
        }

        visiting.delete(nodeId);
        visited.add(nodeId);
        result.push(node);
      }

      return true;
    };

    for (const nodeId of this._nodes.keys()) {
      if (!visit(nodeId)) {
        // Cycle detected - return partial result
        break;
      }
    }

    return result;
  }

  /**
   * Compute depth of each node (for layout)
   * Entry nodes have depth 0, others have max(prerequisite depths) + 1
   */
  computeDepths(): Map<string, number> {
    const depths = new Map<string, number>();

    const computeDepth = (nodeId: string): number => {
      if (depths.has(nodeId)) return depths.get(nodeId)!;

      const node = this._nodes.get(nodeId);
      if (!node) return 0;

      const prereqEdges = node.incomingEdges.filter(e => e.type === 'prerequisite');
      if (prereqEdges.length === 0) {
        depths.set(nodeId, 0);
        return 0;
      }

      const maxPrereqDepth = Math.max(
        ...prereqEdges.map(e => computeDepth(e.fromId))
      );
      const depth = maxPrereqDepth + 1;
      depths.set(nodeId, depth);
      return depth;
    };

    for (const nodeId of this._nodes.keys()) {
      computeDepth(nodeId);
    }

    return depths;
  }
}
