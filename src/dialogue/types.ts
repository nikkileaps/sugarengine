/**
 * A single dialogue node - one "screen" of conversation
 */
export interface DialogueNode {
  id: string;
  speaker?: string;         // Who's talking (NPC name, "Player", etc.)
  text: string;             // The dialogue text
  choices?: DialogueChoice[];  // Player choices (if any)
  next?: string;            // ID of next node (if no choices)
  onEnter?: string;         // Event to fire when entering this node
}

/**
 * A player choice in dialogue
 */
export interface DialogueChoice {
  text: string;             // Choice text shown to player
  next: string;             // ID of node to go to
  condition?: string;       // Optional condition (for future use)
}

/**
 * A complete dialogue tree
 */
export interface DialogueTree {
  id: string;               // Dialogue ID (e.g., "baker-greeting")
  startNode: string;        // ID of first node
  nodes: DialogueNode[];    // All nodes in this dialogue
}

/**
 * Loaded dialogue data with quick node lookup
 */
export interface LoadedDialogue {
  tree: DialogueTree;
  nodeMap: Map<string, DialogueNode>;
}
