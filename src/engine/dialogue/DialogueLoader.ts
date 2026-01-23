import { DialogueTree, LoadedDialogue, DialogueNode } from './types';

/**
 * Loads and caches dialogue trees from JSON files
 */
export class DialogueLoader {
  private cache: Map<string, LoadedDialogue> = new Map();

  /**
   * Load a dialogue tree from a JSON file
   */
  async load(dialogueId: string, basePath = '/dialogue/'): Promise<LoadedDialogue> {
    // Check cache first
    const cached = this.cache.get(dialogueId);
    if (cached) return cached;

    // Load from file
    const response = await fetch(`${basePath}${dialogueId}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load dialogue: ${dialogueId}`);
    }

    const tree: DialogueTree = await response.json();

    // Build node lookup map
    const nodeMap = new Map<string, DialogueNode>();
    for (const node of tree.nodes) {
      nodeMap.set(node.id, node);
    }

    const loaded: LoadedDialogue = { tree, nodeMap };
    this.cache.set(dialogueId, loaded);

    return loaded;
  }

  /**
   * Preload multiple dialogues
   */
  async preloadAll(dialogueIds: string[], basePath = '/dialogue/'): Promise<void> {
    await Promise.all(dialogueIds.map(id => this.load(id, basePath)));
  }

  /**
   * Get a cached dialogue (returns undefined if not loaded)
   */
  get(dialogueId: string): LoadedDialogue | undefined {
    return this.cache.get(dialogueId);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
