/**
 * Sugarlang V1 content model types.
 *
 * These types represent the authoring artifacts and runtime content for the
 * Sugarlang language-learning overlay. See the V1 authoring artifact model
 * and language content model docs for product-level definitions.
 */

import type { DeliveryContract } from '../../engine/conversation/deliveryContract';
import type { ResponseContractMode } from '../../engine/conversation/types';

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

export type LexiconCategory =
  | 'object'
  | 'color'
  | 'location'
  | 'verb'
  | 'adjective'
  | 'phrase'
  | 'function';

export type SceneVocabularyRole = 'focus' | 'reinforcement' | 'ambient';

/** Per-target-language realization of one tracked vocabulary entry. */
export interface LexiconEntry {
  lexicalEntryId: string;
  /** Primary target-language surface form. */
  targetForm: string;
  /** Alternate forms (plural, conjugated, etc.). */
  alternates?: string[];
  /** Plain-English gloss. */
  gloss: string;
  category: LexiconCategory;
  /** First band where this item is actively taught. */
  introductionBand: LearnerBandId;
  /** Is this for active production, passive recognition, or support-only? */
  usage: 'active' | 'passive' | 'support';
  /** Can this item be grounded to a visible world object? */
  groundable: boolean;
}

/** Shared lexicon for one target language. */
export interface LexiconPack {
  targetLanguage: string;
  entries: LexiconEntry[];
}

// ---------------------------------------------------------------------------
// Learner Bands
// ---------------------------------------------------------------------------

export type LearnerBandId = 'B0' | 'B1' | 'B2' | 'B3' | 'B4';

/** Support-language mixing policy for a band. */
export interface SupportLanguagePolicy {
  /** How much of the NPC utterance is in the support language. */
  mixingLevel: 'full_support' | 'heavy_support' | 'light_support' | 'target_dominant' | 'target_only';
  /** Whether to show support-language scaffolding strips under target text. */
  showSupportStrip: boolean;
  /** Whether to show support-language glosses on tap/hover. */
  showGlosses: boolean;
}

/** Band-level policy defaults. */
export interface BandPolicy {
  bandId: LearnerBandId;
  supportLanguagePolicy: SupportLanguagePolicy;
  /** Grounding intensity for this band. */
  groundingIntensity: 'always' | 'on_first_encounter' | 'on_request' | 'none';
  /** Default response modes available in this band. */
  allowedResponseModes: string[];
  /** Correction posture. */
  correctionPosture: 'immediate' | 'delayed' | 'on_request' | 'none';
  /** Generic NPC delivery budget for this band. */
  deliveryContract: DeliveryContract;
}

/** Shared band policy defaults. */
export interface BandPolicyPack {
  policies: BandPolicy[];
}

// ---------------------------------------------------------------------------
// Scenario Brief
// ---------------------------------------------------------------------------

/** Defines the semantic learning scenario for one authored scene or objective. */
export interface ScenarioBrief {
  scenarioId: string;
  /** Source quest this scenario is derived from, when one exists. */
  associatedQuestId?: string;
  /** What counts as task success. */
  successCriteria: string[];
  /** World referents active in this scenario. */
  activeReferents: string[];
  /** Bands this scenario supports. */
  supportedBands: LearnerBandId[];
  /** NPC IDs involved in this scenario (matches engine NPC id). */
  npcIds: string[];
  /**
   * NPC display names involved in this scenario. Used for name-based matching
   * when NPC ids are auto-generated UUIDs. Case-insensitive lookup.
   */
  npcNames?: string[];
  /** Derived interactions from quest traversal (populated by Sync From Quest). */
  interactions?: DerivedInteraction[];
}

// ---------------------------------------------------------------------------
// Derived Interaction (ADR-014)
// ---------------------------------------------------------------------------

export type TurnRole = 'npc_delivery' | 'player_delivery' | 'learner_response';
export type EditStatus = 'generated' | 'reviewed' | 'manual';
export type ResponseSource = 'explicit_choice' | 'generic';

/** Quest-success hook: how interaction success recommends quest progression. */
export interface QuestSuccessHook {
  sourceNodeId: string;
  action: 'complete_objective';
  questId: string;
}

/** Resolved grounding context for one interaction. */
export interface InteractionGroundingContext {
  npcId?: string;
  npcName?: string;
  worldObjectRefs: Array<{ objectId: string; label: string; category?: string }>;
  attributes: Array<{ key: string; value: string; lexicalEntryId?: string }>;
  questBindingRefs: string[];
}

/**
 * One derived interaction inside a scenario.
 * Produced by Sync From Quest. One quest node = one interaction (1:1 rule).
 */
export interface DerivedInteraction {
  interactionId: string;
  sourceQuestNodeId: string;
  sourceStageId: string;
  sourceDialogueId?: string;
  sourceDialogueNodeIds: string[];
  npcId?: string;
  npcName?: string;
  worldObjectRefs: string[];
  grounding: InteractionGroundingContext;
  questSuccessHook?: QuestSuccessHook;
  /** Original English dialogue lines (for re-sync dirty detection). */
  sourceDialogueText: string[];
}

// ---------------------------------------------------------------------------
// Grounding Map
// ---------------------------------------------------------------------------

/** Persisted grounding link between one vocabulary entry and a world object. */
export interface GroundingEntry {
  lexicalEntryId: string;
  /** World object ID to highlight. */
  worldObjectId: string;
  /** Specific attribute of the object (e.g. "color"). */
  worldAttribute?: string;
  /** Stable scenario referent resolved through this grounding link, when one exists. */
  scenarioReferentId?: string;
  /** Allowed highlight actions for this referent. */
  highlightActions: Array<'highlight' | 'camera_focus' | 'tap_inspect'>;
}

/** Scene-level grounding map. */
export interface GroundingMap {
  scenarioId: string;
  entries: GroundingEntry[];
}

// ---------------------------------------------------------------------------
// Scene Language Pack
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Repair Options
// ---------------------------------------------------------------------------

/** A single authored repair option available on a turn. */
export interface RepairOption {
  /** Unique id for this repair option within the turn. */
  repairId: string;
  /** Player-facing label shown as a tappable repair response. */
  label: string;
  /** First failed-attempt count at which this repair becomes visible. */
  minAttempt?: number;
  /** Last failed-attempt count at which this repair stays visible. */
  maxAttempt?: number;
  /**
   * Repair type. Determines behavior:
   * - 'fixed': player taps, NPC replies with the authored repairReply.
   * - 'clarification_template': player taps a target-language word to
   *   prefill the blank (e.g. "¿Qué significa '__' en inglés?").
   */
  type: 'fixed' | 'clarification_template';
  /** Authored NPC reply when this repair is used. */
  repairReply: string;
  /** Optional grounding action triggered by this repair. */
  groundingAction?: {
    type: 'highlight' | 'camera_focus' | 'point';
    worldObjectId: string;
  };
  /** Optional response-contract override after this repair fires. */
  responseContractOverride?: {
    mode: ResponseContractMode;
    choices?: string[];
    wordBank?: string[];
    hintText?: string;
  };
  /** Vocabulary entries this repair keeps visible or explicitly addresses. */
  protectedLexicalEntryIds?: string[];
}

export interface AmbientHaloAllowance {
  allowHigherBandTracked: boolean;
  allowUntrackedFlavor: boolean;
  maxTrackedLookahead?: number;
  maxUntrackedPhrases?: number;
}

/** A single NPC turn in a scene language pack. */
export interface SceneTurn {
  turnId: string;
  /** Canonical full target-language utterance (for pedagogy, analytics, replay). */
  targetText: string;
  /**
   * The actual first line shown to the player. May be mixed-language at
   * low bands (e.g. "Do you see la maleta roja?"). If omitted the
   * provider renders targetText.
   */
  initialDelivery?: string;
  /** Optional full support-language paraphrase / fallback helper text. No longer the primary low-band surface. */
  supportText?: string;
  /** Current teaching subset for this turn. */
  focusLexicalEntryIds: string[];
  reinforcementLexicalEntryIds?: string[];
  ambientLexicalEntryIds?: string[];
  /** Optional per-turn allowance for richer ambient language at the edges. */
  ambientHaloAllowance?: AmbientHaloAllowance;
  /** Response contract mode for the player's reply. */
  responseMode: ResponseContractMode;
  /** Response contract details. */
  responseData?: {
    choices?: string[];
    blanks?: Array<{ id: string; acceptedAnswers: string[] }>;
    wordBank?: string[];
    /** Chips for chip_composition mode. */
    chips?: string[];
    maxLength?: number;
    hintText?: string;
  };
  /** Authored per-turn repair options (repair responses shown alongside the primary response mode). */
  repairOptions?: RepairOption[];
  /** Expected correct answers for deterministic evaluation. */
  evaluation?: {
    /** Accepted answers (case-insensitive). Used by B0/B1 modes. */
    acceptedAnswers?: string[];
    /** Accepted composed outputs for chip_composition evaluation. */
    acceptedCompositions?: string[];
    /** For object selection: accepted object IDs. */
    acceptedObjectIds?: string[];
    /** For yes/no: expected answer. */
    expectedYesNo?: boolean;
    /** Intent families for B2-B4 text evaluation. */
    intents?: IntentFamily[];
    /** Morphology tolerance rules for text evaluation. */
    morphologyTolerance?: MorphologyTolerance;
  };
  /** Emotion hint for the NPC. */
  emotion?: string;
  /** Speaker NPC ID override (for multi-NPC scenarios). */
  speakerId?: string;
  speakerName?: string;
  /** Role of this turn in the interaction sequence. */
  turnRole?: TurnRole;
  /** How the response options were sourced. */
  responseSource?: ResponseSource;
  /** Original English source text this turn was derived from. */
  sourceEnglishText?: string;
  /** Source content fingerprint for change detection (ADR-015). */
  sourceHash?: string;
  /** Provenance status: generated (safe to overwrite), reviewed (human-approved), manual (hand-edited). */
  editStatus?: EditStatus;
  /** Optional note explaining manual edit or LLM refinement. */
  generationNote?: string;
  /** True when the source content has changed since this turn was reviewed/manually edited. */
  stale?: boolean;
  /** True when the source quest node no longer exists. */
  orphaned?: boolean;
}

/** Band-specific scene realization. */
export interface SceneBandRealization {
  bandId: LearnerBandId;
  turns: SceneTurn[];
  /**
   * Provider policy for this band realization.
   * - 'scripted': always use scripted provider (default)
   * - 'agent_preferred': prefer SugarAgent when available, fall back to scripted
   * - 'agent_only': require SugarAgent (skip this band if unavailable)
   */
  providerPolicy?: 'scripted' | 'agent_preferred' | 'agent_only';
  /** Which interaction this band realization belongs to (for generated content). */
  interactionId?: string;
}

/** Scene language pack for one scenario + target language. */
export interface SceneLanguagePack {
  scenarioId: string;
  targetLanguage: string;
  supportLanguage: string;
  bands: SceneBandRealization[];
}

// ---------------------------------------------------------------------------
// Learner State
// ---------------------------------------------------------------------------

/** Multidimensional learner state model. */
export interface LearnerState {
  targetLanguage: string;
  supportLanguage: string;
  /** Comprehension ability (0–1 scale). */
  comprehension: number;
  /** Production ability (0–1 scale). */
  production: number;
  /** Vocabulary control (0–1 scale). */
  vocabulary: number;
  /** Grammar control (0–1 scale). */
  grammar: number;
  /** Repair / self-correction ability (0–1 scale). */
  repair: number;
  /** Learner confidence (0–1 scale). */
  confidence: number;
  /** How much the learner depends on support-language aids (0–1 scale, lower = less dependent). */
  supportUsage: number;
  /** Vocabulary entries the learner has demonstrated reliably. */
  knownLexicalEntryIds: string[];
  /** Vocabulary entries the learner has shown inconsistently. */
  unstableLexicalEntryIds: string[];
  /** Per-entry progress record keyed by lexicalEntryId. */
  trackedLexicalEntries: Record<string, TrackedLexicalEntryProgress>;
}

/** Result of a placement assessment. */
export interface PlacementOutcome {
  /** The multidimensional state snapshot from placement. */
  state: LearnerState;
  /** Derived CEFR-style label for reporting (not runtime control). */
  derivedCefrLabel: string;
  /** ISO timestamp of when placement was taken. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Turn Evidence
// ---------------------------------------------------------------------------

/** Structured evidence captured from a single learning turn. */
export interface TurnEvidence {
  turnId: string;
  timestamp: string;
  // Raw facts
  playerInput: string;
  responseMode: ResponseContractMode;
  bandUsed: LearnerBandId;
  policyUsed: string;
  supportShown: boolean;
  supportRequested: boolean;
  groundingShown: boolean;
  groundingUsed: boolean;
  retries: number;
  // Surface and delivery context
  /** Whether the player saw initialDelivery or targetText. */
  deliveryType: 'initialDelivery' | 'targetText';
  /** If a repair was used, which repair option ID. */
  repairId?: string;
  /** If a repair was used, the type of repair. */
  repairType?: 'fixed' | 'clarification_template';
  /** Focus entries active for this turn. */
  focusLexicalEntryIds: string[];
  /** Reinforcement entries active for this turn. */
  reinforcementLexicalEntryIds: string[];
  /** Tracked ambient entries visible for this turn. */
  ambientLexicalEntryIds: string[];
  /** Grounding references shown to the player this turn. */
  shownGroundingRefs?: string[];
  /** The band-variant world object ID resolved for this turn. */
  bandVariantObjectId?: string;
  // Derived scores
  taskSuccess: boolean;
  formAccuracy: number;
  /** 0 = fully independent, 1 = fully dependent on support. */
  supportDependence: number;
}

export interface TrackedLexicalEntryProgress {
  firstSeenAt: string;
  lastSeenAt: string;
  timesSeen: number;
  recognitionSuccesses: number;
  recognitionFailures: number;
  productionSuccesses: number;
  productionFailures: number;
  status: 'new' | 'practicing' | 'stable';
}

// ---------------------------------------------------------------------------
// Intent + Slot Evaluation (B2-B4)
// ---------------------------------------------------------------------------

/** A family of communicative intents for evaluation. */
export interface IntentFamily {
  intentId: string;
  /** Human-readable label. */
  label: string;
  /** Keyword patterns that signal this intent (checked against normalized input). */
  keywordPatterns: string[];
  /** Required slots — all must be present for intent match. */
  requiredSlots: SlotRequirement[];
  /** Optional slots — presence improves form accuracy score. */
  optionalSlots: SlotRequirement[];
}

/** A slot requirement for intent evaluation. */
export interface SlotRequirement {
  lexicalEntryId: string;
  /** Keywords that satisfy this slot (checked against normalized input). */
  keywords: string[];
}

/** Morphology tolerance rules for text evaluation. */
export interface MorphologyTolerance {
  /** Accept input with missing accents (e.g. "donde" for "dónde"). */
  acceptMissingAccents: boolean;
  /** Accept input with missing articles (e.g. "maleta negra" for "la maleta negra"). */
  acceptMissingArticles: boolean;
  /** Accept flexible word order. */
  acceptFlexibleWordOrder: boolean;
}

// ---------------------------------------------------------------------------
// Grounded Quest Binding
// ---------------------------------------------------------------------------

/** Band-specific variant of a quest world object. */
export interface QuestBindingBandVariant {
  bandId: LearnerBandId;
  /** World object ID the learner interacts with at this band. */
  worldObjectId: string;
  /** Vocabulary entries actively highlighted through this band-specific object. */
  highlightedLexicalEntryIds: string[];
}

/** Interaction affordances for a quest binding. */
export interface QuestBindingAffordances {
  /** Whether the object can be tapped/clicked to inspect. */
  tapInspect: boolean;
  /** Whether the object can be highlighted by grounding. */
  highlight: boolean;
  /** Whether the object can be focused by camera. */
  cameraFocus: boolean;
}

/**
 * Binds a stable scenario referent to per-band world object variants.
 *
 * The authoring model defines abstract referents (e.g. "target_luggage_primary")
 * that resolve to different world objects at different bands (B0=red suitcase,
 * B1=blue suitcase, etc.). This binding drives band-filtered grounding scope.
 */
export interface GroundedQuestBinding {
  /** Stable referent ID used in the scenario brief. */
  scenarioReferentId: string;
  /** Per-band world object variants. */
  bandVariants: QuestBindingBandVariant[];
  /** Interaction affordances for this referent. */
  affordances: QuestBindingAffordances;
  /** Identity shown when picked up (inventory item name). */
  pickupIdentity?: string;
  /** Identity shown in inventory UI. */
  inventoryIdentity?: string;
  /** Quest completion step this binding contributes to. */
  questCompletionStep?: string;
}

// ---------------------------------------------------------------------------
// Runtime Content Bundle
// ---------------------------------------------------------------------------

/** All loaded content for the sugarlang runtime. */
export interface SugarlangContentBundle {
  scenarios: Map<string, ScenarioBrief>;
  groundingMaps: Map<string, GroundingMap>;
  lexicons: Map<string, LexiconPack>;
  bandPolicies: BandPolicyPack;
  sceneLanguagePacks: Map<string, SceneLanguagePack>;
  /** Per-scenario quest bindings mapping referents to band-specific world objects. */
  questBindings: Map<string, GroundedQuestBinding[]>;
}
