import type { PluginIntent } from '../plugins/types';

// ---------------------------------------------------------------------------
// Session & Identity
// ---------------------------------------------------------------------------

export interface ConversationSession {
  sessionId: string;
  /** Stable trace ID shared by all turns in this session. */
  traceId: string;
  npcId: string;
  npcName?: string;
  providerId: string;
  turnIndex: number;
  /** Language context for this session. */
  targetLanguage?: string;
  supportLanguage?: string;
  /** Learner band override for preview. */
  learnerBandOverride?: string;
  /** Opaque middleware-contributed state kept for the session lifetime. */
  middlewareState: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Response Contract
// ---------------------------------------------------------------------------

/**
 * Describes the kind of player response expected for a turn.
 * Drives both UI rendering and evaluator selection.
 */
export type ResponseContractMode =
  | 'yes_no'
  | 'multiple_choice'
  | 'object_selection'
  | 'single_blank'
  | 'blank_fill'
  | 'phrase_assembly'
  | 'chip_composition'
  | 'word_bank'
  | 'short_text'
  | 'open_text'
  | 'hint_request'
  | 'repeat_request'
  | 'free_form';

export interface ResponseContract {
  mode: ResponseContractMode;
  /** Choices for choice-based modes. */
  choices?: string[];
  /** Blanks for fill-in modes. */
  blanks?: Array<{ id: string; acceptedAnswers?: string[] }>;
  /** Word bank tokens for assembly modes. */
  wordBank?: string[];
  /** Max characters for text modes. */
  maxLength?: number;
  /** Hint text available to the player. */
  hintText?: string;
}

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

export interface GroundingReference {
  lexicalEntryId: string;
  targetForm: string;
  worldObjectId?: string;
  worldAttribute?: string;
  highlightAction?: 'highlight' | 'camera_focus' | 'tap_inspect';
}

export interface GroundingMetadata {
  references: GroundingReference[];
  /** Which references were shown to the player this turn. */
  shownReferences?: string[];
}

export interface TeachingSubset {
  focusLexicalEntryIds: string[];
  reinforcementLexicalEntryIds: string[];
  ambientLexicalEntryIds: string[];
  protectedLexicalEntryIds: string[];
}

export interface AmbientHaloAllowance {
  allowHigherBandTracked: boolean;
  allowUntrackedFlavor: boolean;
  maxTrackedLookahead?: number;
  maxUntrackedPhrases?: number;
}

// ---------------------------------------------------------------------------
// Provider Constraint Bundle (middleware → provider)
// ---------------------------------------------------------------------------

/**
 * Engine-mediated constraint bundle passed from middleware into the provider.
 * Allows sugarlang to influence sugaragent without direct plugin calls.
 */
export interface ProviderConstraintBundle {
  /** Stable session and trace identifiers. */
  sessionId: string;
  turnId: string;

  /** Language context. */
  targetLanguage?: string;
  supportLanguage?: string;

  /** Learner band context (populated by sugarlang middleware). */
  learnerBand?: string;
  supportLanguagePolicy?: string;

  /** Response contract the provider should aim to satisfy. */
  responseContract?: ResponseContract;

  sceneSemantics?: Record<string, unknown>;

  /** Grounding scope — what referents the turn may use. */
  groundingScope?: GroundingReference[];
  /** Full tracked vocabulary available to the learner at the current band. */
  availableTrackedLexicalEntryIds?: string[];
  /** Current teaching subset for this turn or scene slice. */
  teachingSubset?: TeachingSubset;
  /** Ambient language allowance around the tracked teaching subset. */
  ambientHaloAllowance?: AmbientHaloAllowance;

  /** Failure and recovery posture. */
  failureRecoveryPosture?: {
    retriesRemaining?: number;
    escalationAction?: string;
  };

  /**
   * Hard constraints the provider must respect.
   * Violation may cause middleware to reject the turn.
   */
  hardConstraints: Record<string, unknown>;

  /**
   * Advisory preferences the provider should follow when capable.
   * Violation does not cause rejection.
   */
  advisoryPreferences: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Turn Envelope (normalized across all providers)
// ---------------------------------------------------------------------------

/**
 * Normalized turn produced by a provider and annotated by middleware.
 * Both scripted dialogue and agent conversation produce this same shape.
 */
export interface ConversationTurnEnvelope {
  // Identity
  sessionId: string;
  turnId: string;
  turnIndex: number;

  // Provider
  providerId: string;

  // Content
  utterance: string;
  speakerId?: string;
  speakerName?: string;
  emotion?: string;
  intent?: string;

  // Response contract for the player's reply
  responseContract: ResponseContract;

  // Language context
  targetLanguage?: string;
  supportLanguage?: string;
  supportLanguagePolicy?: string;

  // Host action proposals from the provider
  hostActionProposals: PluginIntent[];

  // Grounding
  groundingMetadata?: GroundingMetadata;

  // Provider diagnostics (opaque to engine)
  providerDiagnostics?: unknown;

  // Structured turn evidence from pedagogical providers
  turnEvidence?: unknown;

  // Middleware annotations (each middleware writes under its own key)
  middlewareAnnotations: Record<string, unknown>;

  // Trace fields for replay and observability
  traceId?: string;
  timestampMs: number;
}

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface ConversationProviderDescriptor {
  id: string;
  /** Priority for provider selection. Lower = tried first. */
  priority: number;
}

/**
 * A conversation provider produces turns.
 * Exactly one provider owns turn production for a given turn.
 */
export interface ConversationProvider {
  readonly descriptor: ConversationProviderDescriptor;

  /**
   * Whether this provider can handle a conversation with the given NPC
   * in the current context.
   */
  canHandle(npcId: string, context: ProviderSelectionContext): boolean;

  /**
   * Start a new conversation session with this provider.
   * Called when the host selects this provider for a new interaction.
   * The selectionContext carries the same data used during canHandle().
   */
  startSession(session: ConversationSession, context: ProviderSelectionContext): void | Promise<void>;

  /**
   * Produce the next NPC turn given the constraint bundle and player input.
   * For the opening turn, playerInput is undefined.
   */
  produceTurn(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
    playerInput?: PlayerInput,
  ): Promise<ProviderTurnOutput>;

  /**
   * End the session. Cleanup any session-specific state.
   */
  endSession(session: ConversationSession): void | Promise<void>;
}

export interface ProviderSelectionContext {
  hasQuestDialogue: boolean;
  hasBehaviorTree: boolean;
  npcInteractionMode: 'scripted' | 'agent' | 'hybrid';
  targetLanguage?: string;
  supportLanguage?: string;
  /** Learner band override, used by providers to pre-resolve band policy. */
  learnerBandOverride?: string;
  /** Pre-resolved dialogue ID for scripted providers. */
  dialogueId?: string;
  /** NPC display name (for name-based provider matching). */
  npcName?: string;
}

export interface PlayerInput {
  text?: string;
  choiceIndex?: number;
  objectId?: string;
  blankFills?: Record<string, string>;
}

export interface ProviderTurnOutput {
  utterance: string;
  speakerId?: string;
  speakerName?: string;
  emotion?: string;
  intent?: string;
  responseContract: ResponseContract;
  hostActionProposals?: PluginIntent[];
  groundingMetadata?: GroundingMetadata;
  diagnostics?: unknown;
  /** Structured turn evidence from pedagogical providers. */
  turnEvidence?: unknown;
}

// ---------------------------------------------------------------------------
// Middleware Interface
// ---------------------------------------------------------------------------

export type ConversationMiddlewareStage =
  | 'context_hydration'
  | 'learner_policy'
  | 'pre_provider'
  | 'post_provider'
  | 'analysis'
  | 'telemetry';

export interface ConversationMiddlewareDescriptor {
  id: string;
  /** Stages this middleware participates in. */
  stages: ConversationMiddlewareStage[];
  /** Priority within each stage. Lower = runs first. */
  priority: number;
}

/**
 * Conversation middleware wraps provider execution.
 * Can contribute constraints, validate output, extract evidence, emit analytics.
 */
export interface ConversationMiddleware {
  readonly descriptor: ConversationMiddlewareDescriptor;

  /**
   * Called during context_hydration and learner_policy stages.
   * Middleware can enrich the constraint bundle before the provider sees it.
   */
  beforeProvider?(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
    stage: 'context_hydration' | 'learner_policy' | 'pre_provider',
  ): void | Promise<void>;

  /**
   * Called during post_provider, analysis, and telemetry stages.
   * Middleware can annotate, validate, or react to the provider's output.
   */
  afterProvider?(
    session: ConversationSession,
    envelope: ConversationTurnEnvelope,
    stage: 'post_provider' | 'analysis' | 'telemetry',
  ): void | Promise<void>;

  /**
   * Called when a session starts.
   */
  onSessionStart?(session: ConversationSession): void | Promise<void>;

  /**
   * Called when a session ends.
   */
  onSessionEnd?(session: ConversationSession): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Plugin Capability Extension
// ---------------------------------------------------------------------------

/**
 * Extended plugin descriptor that declares conversation capabilities.
 * Plugins can implement ConversationProvider and/or ConversationMiddleware
 * and declare them through capabilities.
 */
export type ConversationCapability = 'conversation.provider' | 'conversation.middleware';
