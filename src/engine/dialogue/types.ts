/**
 * Base speaker interface - all speaker types share this shape
 */
export interface BaseSpeaker {
  id: string;
  displayName: string;
}

/** The player character as a speaker */
export interface Player extends BaseSpeaker {
  readonly kind: 'player';
}

export const PLAYER: Player = {
  id: 'e095b3b2-3351-403a-abe1-88861fa489ad',
  displayName: 'Holly',
  kind: 'player',
};

/** Narrator - disembodied storytelling voice */
export interface Narrator extends BaseSpeaker {
  readonly kind: 'narrator';
}

export const NARRATOR: Narrator = {
  id: '1a44e7dd-fd2c-4862-a489-59692155e406',
  displayName: 'Narrator',
  kind: 'narrator',
};

/** NPC speaker (imported from NPC system, shares the shape) */
export interface NPCSpeaker extends BaseSpeaker {
  readonly kind: 'npc';
}

/** Union type for all possible speakers */
export type Speaker = Player | Narrator | NPCSpeaker;

/**
 * A connection to the next dialogue node
 * - When there's only one, it's a linear flow (no player choice)
 * - When there are multiple, player picks one (text becomes the choice label)
 */
export interface DialogueNext {
  nodeId: string;           // ID of the target node
  text?: string;            // Choice text (only needed when multiple options)
  condition?: string;       // Optional condition (for future use)
}

/**
 * A single dialogue node - one "screen" of conversation
 */
export interface DialogueNode {
  id: string;
  displayName?: string;     // Human-readable name shown in UI
  speaker?: string;         // Who's talking (NPC name, "Player", etc.)
  text: string;             // The dialogue text
  next?: DialogueNext[];    // Connections to next node(s). Empty/undefined = end of dialogue
  onEnter?: string;         // Event to fire when entering this node
}

/**
 * @deprecated Use DialogueNext instead
 */
export interface DialogueChoice {
  text: string;
  next: string;
  condition?: string;
}

/**
 * A complete dialogue tree
 */
export interface DialogueTree {
  id: string;               // Dialogue ID (UUID for uniqueness)
  displayName?: string;     // Human-readable name shown in UI
  startNode: string;        // ID of first node
  nodes: DialogueNode[];    // All nodes in this dialogue
  episodeId?: string;       // UUID of the episode this dialogue belongs to
}

/**
 * Loaded dialogue data with quick node lookup
 */
export interface LoadedDialogue {
  tree: DialogueTree;
  nodeMap: Map<string, DialogueNode>;
}
