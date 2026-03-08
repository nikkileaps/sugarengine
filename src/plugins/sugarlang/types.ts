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

/** A single NPC turn in a scene language pack. */
export interface SceneTurn {
  turnId: string;
  /** NPC utterance in the target language. */
  targetText: string;
  /** NPC utterance in the support language. */
  supportText: string;
  /** Active teaching concepts for this turn. */
  teachingConcepts: string[];
  /** Response contract mode for the player's reply. */
  responseMode: ResponseContractMode;
  /** Response contract details. */
  responseData?: {
    choices?: string[];
    blanks?: Array<{ id: string; acceptedAnswers: string[] }>;
    wordBank?: string[];
    maxLength?: number;
    hintText?: string;
  };
  /** Expected correct answers for deterministic evaluation. */
  evaluation?: {
    /** Accepted answers (case-insensitive). */
    acceptedAnswers?: string[];
    /** For object selection: accepted object IDs. */
    acceptedObjectIds?: string[];
    /** For yes/no: expected answer. */
    expectedYesNo?: boolean;
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
}

/** Scene language pack for one scenario + target language. */
export interface SceneLanguagePack {
  scenarioId: string;
  targetLanguage: string;
  supportLanguage: string;
  bands: SceneBandRealization[];
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
}
