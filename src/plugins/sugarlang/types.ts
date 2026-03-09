/**
 * Sugarlang V1 content model types.
 *
 * These types represent the authoring artifacts and runtime content for the
 * Sugarlang language-learning overlay. See the V1 authoring artifact model
 * and language content model docs for product-level definitions.
 */

// ---------------------------------------------------------------------------
// Semantic Concepts
// ---------------------------------------------------------------------------

/** Language-neutral teaching concept. */
export interface SemanticConcept {
  /** Stable concept ID, e.g. "object.suitcase", "color.red". */
  conceptId: string;
  /** Content category for organizing in the lexicon. */
  category: 'object' | 'color' | 'location' | 'verb' | 'adjective' | 'phrase' | 'function';
  /** Plain-English gloss. */
  gloss: string;
  /** Whether the concept can be grounded to a visible world object. */
  groundable: boolean;
}

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

/** Per-target-language realization of a semantic concept. */
export interface LexiconEntry {
  conceptId: string;
  /** Primary target-language surface form. */
  targetForm: string;
  /** Alternate forms (plural, conjugated, etc.). */
  alternates?: string[];
  /** Plain-English gloss. */
  gloss: string;
  category: SemanticConcept['category'];
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
  /** The communicative task the learner must accomplish. */
  communicativeTask: string;
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
}

// ---------------------------------------------------------------------------
// Grounding Map
// ---------------------------------------------------------------------------

/** Maps a semantic concept to a world object for scene grounding. */
export interface GroundingEntry {
  conceptId: string;
  /** World object ID to highlight. */
  worldObjectId: string;
  /** Specific attribute of the object (e.g. "color"). */
  worldAttribute?: string;
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

import type { ResponseContractMode } from '../../engine/conversation/types';

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
  /** Active teaching concepts for this turn. */
  teachingConcepts: string[];
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
  /** Structures the learner has demonstrated reliably. */
  knownStructures: string[];
  /** Structures the learner has shown inconsistently. */
  unstableStructures: string[];
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
  /** Teaching concepts active for this turn. */
  teachingConcepts: string[];
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
  conceptId: string;
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
  /** Teaching concepts actively highlighted at this band. */
  teachingConcepts: string[];
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
