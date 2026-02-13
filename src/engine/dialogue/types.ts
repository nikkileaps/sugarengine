import type { WorldStateCondition } from '../state';

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

/** Player voiceover / internal monologue - displays as "Holly" but italic */
export interface PlayerVO extends BaseSpeaker {
  readonly kind: 'player-vo';
}

export const PLAYER_VO: PlayerVO = {
  id: 'b4e9d2a1-6f3c-4b8e-a7d1-5c9e2f3a4b5c',
  displayName: 'Holly',
  kind: 'player-vo',
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

/** Excerpt - text read from an in-world source (book, handbook, sign, etc.) */
export interface ExcerptSpeaker extends BaseSpeaker {
  readonly kind: 'excerpt';
}

export const EXCERPT: ExcerptSpeaker = {
  id: 'a3f8c1d2-7e4b-4a9f-b6d5-1c2e3f4a5b6d',
  displayName: 'Excerpt',
  kind: 'excerpt',
};

/** NPC speaker (imported from NPC system, shares the shape) */
export interface NPCSpeaker extends BaseSpeaker {
  readonly kind: 'npc';
}

/** Union type for all possible speakers */
export type Speaker = Player | PlayerVO | Narrator | ExcerptSpeaker | NPCSpeaker;

/**
 * A connection to the next dialogue node
 * - When there's only one, it's a linear flow (no player choice)
 * - When there are multiple, player picks one (text becomes the choice label)
 */
export interface DialogueNext {
  nodeId: string;           // ID of the target node
  text?: string;            // Choice text (only needed when multiple options)
  condition?: WorldStateCondition;  // Optional condition - connection hidden if false (ADR-019)
}

/**
 * A single dialogue node - one "screen" of conversation
 */
export interface DialogueNode {
  id: string;
  name?: string;            // Human-readable name shown in UI
  speaker?: string;         // Who's talking (NPC name, "Player", etc.)
  speakerLabel?: string;    // Custom display name override (e.g., book title for Excerpt speaker)
  speakerId?: string;       // Original speaker UUID (set at display time for UI styling)
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
  condition?: WorldStateCondition;
}

/**
 * A complete dialogue tree
 */
export interface DialogueTree {
  id: string;               // Dialogue ID (UUID for uniqueness)
  name?: string;            // Human-readable name shown in UI
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
