/**
 * LLM Refinement Packet Assembler (ADR-015 Phase 4).
 *
 * Assembles whole-scenario context packets for LLM refinement of turn
 * surface language. The packet gives the LLM enough context to produce
 * natural target-language rendering while staying within vocabulary and
 * structural constraints.
 *
 * Pure function, no React, no side effects.
 */

import type {
  ScenarioBrief,
  SceneLanguagePack,
  SceneBandRealization,
  SceneTurn,
  LexiconPack,
  LexiconEntry,
  LearnerBandId,
  BandPolicyPack,
  EditStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Vocabulary entry summary included in the refinement packet. */
export interface RefinementVocabEntry {
  lexicalEntryId: string;
  targetForm: string;
  gloss: string;
  category: string;
  role: 'focus' | 'reinforcement' | 'ambient';
}

/** A turn in the conversation flow included in the refinement packet. */
export interface RefinementFlowTurn {
  turnId: string;
  turnRole?: string;
  sourceEnglishText?: string;
  currentRenderedText: string;
  editStatus: EditStatus;
  responseMode: string;
  speakerName?: string;
  isTarget: boolean;
}

/** Band-level context included in the refinement packet. */
export interface RefinementBandContext {
  bandId: LearnerBandId;
  mixingLevel?: string;
  showSupportStrip?: boolean;
  showGlosses?: boolean;
}

/** The complete refinement packet sent to the LLM. */
export interface RefinementPacket {
  packetVersion: 1;
  operation: 'refine_turn' | 'refine_band' | 'refine_scenario';
  createdAt: string;

  scenarioContext: {
    scenarioId: string;
    npcNames: string[];
    activeReferents: string[];
    targetLanguage: string;
    supportLanguage: string;
  };

  bandContext: RefinementBandContext;

  vocabularyPlan: RefinementVocabEntry[];

  conversationFlow: RefinementFlowTurn[];

  /** The specific turn(s) to refine. For per-turn, a single entry. */
  targetTurnIds: string[];

  instruction: string;
}

/** Structured proposal returned by the LLM. */
export interface RefinementProposal {
  packetVersion: 1;
  /** Turn-level proposals. */
  turns: RefinementTurnProposal[];
  /** Optional overall note from the LLM. */
  note?: string;
}

/** Per-turn proposal. */
export interface RefinementTurnProposal {
  turnId: string;
  proposedTargetText: string;
  proposedDeliveryText?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Packet assembler
// ---------------------------------------------------------------------------

export interface AssemblePacketInput {
  scenario: ScenarioBrief;
  pack: SceneLanguagePack;
  bandId: LearnerBandId;
  bandPolicies?: BandPolicyPack;
  lexicon?: LexiconPack;
  /** For per-turn: the turn ID to refine. For per-band/scenario: omit. */
  targetTurnId?: string;
  /** Source English dialogue lines keyed by interaction ID. */
  sourceDialogueByInteraction?: Map<string, string[]>;
}

const DEFAULT_INSTRUCTION =
  'Improve the target-language rendering of the target turn(s). ' +
  'Preserve the meaning of the source English text. ' +
  'Use only vocabulary from the vocabulary plan for focus and reinforcement words. ' +
  'Maintain the mixing level appropriate for this band. ' +
  'Do not add vocabulary not in the plan. ' +
  'Do not change the turn structure or role. ' +
  'Return a JSON object matching the RefinementProposal schema.';

/**
 * Assemble a refinement packet for a single turn.
 */
export function assembleRefinementPacket(input: AssemblePacketInput): RefinementPacket {
  const { scenario, pack, bandId, bandPolicies, lexicon, targetTurnId, sourceDialogueByInteraction } = input;

  const band = pack.bands.find((b) => b.bandId === bandId);
  const turns = band?.turns ?? [];

  // Determine target turn IDs
  const targetTurnIds = targetTurnId
    ? [targetTurnId]
    : turns
        .filter((t) => (t.editStatus ?? 'generated') === 'generated')
        .map((t) => t.turnId);

  // Build vocabulary plan from all turns in this band
  const vocabPlan = buildVocabularyPlan(turns, lexicon);

  // Build conversation flow
  const flow = buildConversationFlow(turns, targetTurnIds, sourceDialogueByInteraction);

  // Build band context
  const bandPolicy = bandPolicies?.policies.find((p) => p.bandId === bandId);
  const bandContext: RefinementBandContext = {
    bandId,
    mixingLevel: bandPolicy?.supportLanguagePolicy.mixingLevel,
    showSupportStrip: bandPolicy?.supportLanguagePolicy.showSupportStrip,
    showGlosses: bandPolicy?.supportLanguagePolicy.showGlosses,
  };

  return {
    packetVersion: 1,
    operation: targetTurnId ? 'refine_turn' : 'refine_band',
    createdAt: new Date().toISOString(),
    scenarioContext: {
      scenarioId: scenario.scenarioId,
      npcNames: scenario.npcNames ?? [],
      activeReferents: scenario.activeReferents,
      targetLanguage: pack.targetLanguage,
      supportLanguage: pack.supportLanguage,
    },
    bandContext,
    vocabularyPlan: vocabPlan,
    conversationFlow: flow,
    targetTurnIds,
    instruction: DEFAULT_INSTRUCTION,
  };
}

/**
 * Assemble refinement packets for an entire scenario (all bands).
 * Returns one packet per band that has eligible turns.
 */
export function assembleScenarioRefinementPackets(
  input: Omit<AssemblePacketInput, 'bandId' | 'targetTurnId'> & { bands: LearnerBandId[] },
): RefinementPacket[] {
  const packets: RefinementPacket[] = [];

  for (const bandId of input.bands) {
    const band = input.pack.bands.find((b) => b.bandId === bandId);
    if (!band) continue;

    const eligibleTurns = band.turns.filter(
      (t) => (t.editStatus ?? 'generated') === 'generated',
    );
    if (eligibleTurns.length === 0) continue;

    const packet = assembleRefinementPacket({ ...input, bandId });
    packet.operation = 'refine_scenario';
    packets.push(packet);
  }

  return packets;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildVocabularyPlan(
  turns: SceneTurn[],
  lexicon?: LexiconPack,
): RefinementVocabEntry[] {
  if (!lexicon) return [];

  const entryMap = new Map<string, LexiconEntry>();
  for (const entry of lexicon.entries) {
    entryMap.set(entry.lexicalEntryId, entry);
  }

  const seen = new Set<string>();
  const result: RefinementVocabEntry[] = [];

  for (const turn of turns) {
    const addEntries = (ids: string[], role: 'focus' | 'reinforcement' | 'ambient') => {
      for (const id of ids) {
        const key = `${id}:${role}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const entry = entryMap.get(id);
        if (!entry) continue;

        result.push({
          lexicalEntryId: id,
          targetForm: entry.targetForm,
          gloss: entry.gloss,
          category: entry.category,
          role,
        });
      }
    };

    addEntries(turn.focusLexicalEntryIds, 'focus');
    addEntries(turn.reinforcementLexicalEntryIds ?? [], 'reinforcement');
    addEntries(turn.ambientLexicalEntryIds ?? [], 'ambient');
  }

  return result;
}

function buildConversationFlow(
  turns: SceneTurn[],
  targetTurnIds: string[],
  sourceDialogueByInteraction?: Map<string, string[]>,
): RefinementFlowTurn[] {
  const targetSet = new Set(targetTurnIds);

  return turns.map((turn) => {
    // Try to find source English text from the interaction's dialogue
    let sourceEnglishText: string | undefined;
    if (sourceDialogueByInteraction) {
      const interactionId = extractInteractionId(turn.turnId);
      if (interactionId) {
        const lines = sourceDialogueByInteraction.get(interactionId);
        if (lines) {
          // Turn index within this interaction's turns
          const turnIndex = extractTurnIndex(turn.turnId);
          if (turnIndex !== null && turnIndex < lines.length) {
            sourceEnglishText = lines[turnIndex];
          }
        }
      }
    }

    return {
      turnId: turn.turnId,
      turnRole: turn.turnRole,
      sourceEnglishText,
      currentRenderedText: turn.initialDelivery ?? turn.targetText,
      editStatus: turn.editStatus ?? 'generated',
      responseMode: turn.responseMode,
      speakerName: turn.speakerName,
      isTarget: targetSet.has(turn.turnId),
    };
  });
}

/**
 * Extract the interaction ID from a turn ID.
 * Turn IDs follow the pattern: `{interactionId}--{bandId}--t{n}`
 */
function extractInteractionId(turnId: string): string | null {
  const match = turnId.match(/^(.+?)--B\d+--t\d+$/);
  return match?.[1] ?? null;
}

/**
 * Extract the zero-based turn index from a turn ID.
 * Turn IDs follow the pattern: `{interactionId}--B{n}--t{n}`
 */
function extractTurnIndex(turnId: string): number | null {
  const match = turnId.match(/--t(\d+)$/);
  if (!match) return null;
  return parseInt(match[1]!, 10) - 1; // t1 = index 0
}

// ---------------------------------------------------------------------------
// Proposal validation
// ---------------------------------------------------------------------------

/**
 * Parse and validate a refinement proposal JSON string.
 * Returns the parsed proposal or an error message.
 */
export function parseRefinementProposal(json: string): {
  proposal: RefinementProposal | null;
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { proposal: null, error: `Invalid JSON: ${e}` };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { proposal: null, error: 'Root value is not an object' };
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.turns)) {
    return { proposal: null, error: 'Missing "turns" array' };
  }

  for (let i = 0; i < obj.turns.length; i++) {
    const turn = obj.turns[i] as Record<string, unknown>;
    if (typeof turn.turnId !== 'string') {
      return { proposal: null, error: `turns[${i}]: missing "turnId"` };
    }
    if (typeof turn.proposedTargetText !== 'string') {
      return { proposal: null, error: `turns[${i}]: missing "proposedTargetText"` };
    }
  }

  return {
    proposal: {
      packetVersion: 1,
      turns: (obj.turns as Array<Record<string, unknown>>).map((t) => ({
        turnId: t.turnId as string,
        proposedTargetText: t.proposedTargetText as string,
        proposedDeliveryText: typeof t.proposedDeliveryText === 'string' ? t.proposedDeliveryText : undefined,
        note: typeof t.note === 'string' ? t.note : undefined,
      })),
      note: typeof obj.note === 'string' ? obj.note : undefined,
    },
    error: null,
  };
}

/**
 * Apply a refinement proposal to a scene language pack band.
 * Sets accepted turns to editStatus 'reviewed'.
 * Returns a new band with proposals applied and a list of applied turn IDs.
 */
export function applyRefinementProposal(
  band: SceneBandRealization,
  proposal: RefinementProposal,
): { band: SceneBandRealization; appliedTurnIds: string[] } {
  const proposalMap = new Map<string, RefinementTurnProposal>();
  for (const p of proposal.turns) {
    proposalMap.set(p.turnId, p);
  }

  const appliedTurnIds: string[] = [];

  const updatedTurns = band.turns.map((turn) => {
    const prop = proposalMap.get(turn.turnId);
    if (!prop) return turn;

    appliedTurnIds.push(turn.turnId);
    return {
      ...turn,
      targetText: prop.proposedTargetText,
      initialDelivery: prop.proposedDeliveryText ?? turn.initialDelivery,
      editStatus: 'reviewed' as EditStatus,
      generationNote: prop.note ?? 'LLM refinement accepted',
      stale: false,
    };
  });

  return {
    band: { ...band, turns: updatedTurns },
    appliedTurnIds,
  };
}
