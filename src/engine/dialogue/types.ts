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
  // TODO: Rename `speaker` → `speakerId` (it stores a UUID, not a display name).
  // Drop the runtime-only `speakerId` field. DialogueManager.showNode() currently
  // mutates `speaker` from UUID → resolved name at display time, then copies the
  // original UUID into `speakerId`. This is confusing — the stored field should be
  // called `speakerId` and resolution should produce a separate `speakerDisplayName`.
  speaker?: string;         // Actually stores entity UUID — resolved to display name at runtime by DialogueManager
  speakerLabel?: string;    // Custom display name override (e.g., book title for Excerpt speaker)
  speakerId?: string;       // Runtime-only: original UUID copied here after speaker is resolved to a name
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
 * Pluggable presenter that drives the visual display of dialogue.
 *
 * The presenter manages four layout zones:
 *   - **History**:     past turns, scrollable, read-only
 *   - **Active**:      current turn (typewriter text or custom widget)
 *   - **Enrichment**:  plugin slot (support strip, glossary, etc.)
 *   - **Actions**:     choices, submit, "press E to continue"
 *
 * The game author picks the implementation (side panel, bottom box, floating,
 * etc.). Both the engine's DialogueManager and external systems like the
 * ConversationHost can drive it via the same interface.
 */
export interface DialoguePresenter {
  /**
   * When true (default), selecting a choice adds the choice text to history
   * as a player entry before firing onComplete. Set to false for flows where
   * the caller produces its own player turn (e.g., sugarlang).
   */
  echoPlayerChoice: boolean;

  /** Make the presenter visible. */
  show(): void;

  /** Hide the presenter and clean up active state. */
  hide(): void;

  /** Clear conversation history. */
  clearHistory(): void;

  /**
   * Display a dialogue node.
   *
   * The presenter graduates any current active entry to history, then shows
   * the node's text in the active zone with a typewriter effect. After the
   * typewriter finishes, choices or a continue hint appear in the actions zone.
   *
   * `onComplete` fires when the player acts (picks a choice or advances).
   * `onCancel` fires on Escape.
   */
  showNode(
    node: DialogueNode,
    onComplete: (selected?: DialogueNext) => void,
    onCancel?: () => void,
  ): void;

  /**
   * Container for plugin enrichment content (e.g., support strip, glossary).
   * Positioned between the active and actions zones. Hidden when empty.
   */
  getEnrichmentContainer(): HTMLElement;

  /**
   * Container for custom action buttons (e.g., submit for exotic response modes).
   * Content here replaces the standard choices/continue hint.
   */
  getActionsContainer(): HTMLElement;

  /**
   * Show a custom interactive widget in the active zone (e.g., chip composition).
   * The presenter creates the entry frame; `renderFn` fills the content area.
   * Standard choices are suppressed — use `getActionsContainer()` for custom actions.
   */
  showActiveWidget(
    speakerName: string,
    renderFn: (container: HTMLElement) => void,
  ): void;

  /**
   * Replace the active widget with finalized static text and graduate to history.
   */
  finalizeActiveWidget(text: string): void;

  /** Optional resource cleanup. */
  dispose?(): void;
}

/**
 * Loaded dialogue data with quick node lookup
 */
export interface LoadedDialogue {
  tree: DialogueTree;
  nodeMap: Map<string, DialogueNode>;
}
