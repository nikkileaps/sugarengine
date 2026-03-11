/**
 * Deterministic banded turn generation (Phase 3 of Plan 004).
 *
 * Takes DerivedInteraction objects (from Phase 2 quest sync) and produces
 * per-band SceneBandRealization turn bundles via deterministic lexical
 * substitution. No LLM needed.
 *
 * Pure function, no React, no side effects.
 */

import type { DialogueTree, DialogueNode } from '../../../engine/dialogue/types';
import { PLAYER, PLAYER_VO, NARRATOR, EXCERPT } from '../../../engine/dialogue/types';
import type { ResponseContractMode } from '../../../engine/conversation/types';
import type {
  DerivedInteraction,
  LearnerBandId,
  LexiconEntry,
  LexiconPack,
  RepairOption,
  SceneBandRealization,
  SceneTurn,
} from '../types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BandedTurnGenerationInput {
  interaction: DerivedInteraction;
  dialogueLines: DialogueLine[];
  lexicon: LexiconPack;
  targetLanguage: string;
  supportLanguage: string;
  bands: LearnerBandId[];
  npcName?: string;
}

export interface DialogueLine {
  nodeId: string;
  speaker?: string;
  speakerId?: string;
  text: string;
  isPlayerLine: boolean;
  isNarrator: boolean;
  isExcerpt: boolean;
  choiceLabels: string[];
}

export interface VocabMatch {
  entry: LexiconEntry;
  matchedGloss: string;
}

export interface BandedTurnGenerationResult {
  bands: SceneBandRealization[];
  vocabMatches: VocabMatch[];
  warnings: string[];
}

export function generateBandedTurns(input: BandedTurnGenerationInput): BandedTurnGenerationResult {
  const { interaction, dialogueLines, lexicon, targetLanguage, bands, npcName } = input;
  const warnings: string[] = [];

  // Collect all non-narrator/excerpt text for vocabulary matching
  const matchableText = dialogueLines
    .filter((l) => !l.isNarrator && !l.isExcerpt)
    .map((l) => l.text)
    .join(' ');

  const vocabMatches = matchVocabulary(matchableText, lexicon);

  const bandRealizations: SceneBandRealization[] = [];

  for (const bandId of bands) {
    const rolePlan = assignVocabularyRoles(vocabMatches, bandId);
    const turns: SceneTurn[] = [];
    let turnCounter = 0;

    for (const line of dialogueLines) {
      // Skip narrator and excerpt lines
      if (line.isNarrator || line.isExcerpt) continue;

      turnCounter += 1;
      const turnId = `${interaction.interactionId}--${bandId}--t${turnCounter}`;

      if (line.isPlayerLine) {
        // Player delivery turn — band-substituted, no response contract
        const renderedText = renderLineForBand(line.text, targetLanguage, bandId, rolePlan, lexicon);
        turns.push({
          turnId,
          targetText: renderLineForBand(line.text, targetLanguage, bandId, rolePlan, lexicon, true),
          initialDelivery: renderedText,
          focusLexicalEntryIds: rolePlan.focus.map((e) => e.lexicalEntryId),
          reinforcementLexicalEntryIds: rolePlan.reinforcement.map((e) => e.lexicalEntryId),
          ambientLexicalEntryIds: rolePlan.ambient.map((e) => e.lexicalEntryId),
          responseMode: 'free_form',
          turnRole: 'player_delivery',
          generationSource: 'derived',
          speakerId: line.speakerId,
          speakerName: line.speaker,
        });
        continue;
      }

      // NPC delivery turn — no response contract unless the line has choices
      const renderedText = renderLineForBand(line.text, targetLanguage, bandId, rolePlan, lexicon);
      const npcTurn: SceneTurn = {
        turnId,
        targetText: renderLineForBand(line.text, targetLanguage, bandId, rolePlan, lexicon, true),
        initialDelivery: renderedText,
        focusLexicalEntryIds: rolePlan.focus.map((e) => e.lexicalEntryId),
        reinforcementLexicalEntryIds: rolePlan.reinforcement.map((e) => e.lexicalEntryId),
        ambientLexicalEntryIds: rolePlan.ambient.map((e) => e.lexicalEntryId),
        responseMode: 'free_form',
        turnRole: 'npc_delivery',
        generationSource: 'derived',
        speakerId: line.speakerId ?? interaction.npcId,
        speakerName: npcName ?? line.speaker,
      };
      turns.push(npcTurn);

      // If this NPC line has choices → emit a learner_response turn
      if (line.choiceLabels.length > 0) {
        turnCounter += 1;
        const responseTurnId = `${interaction.interactionId}--${bandId}--t${turnCounter}`;
        const responseMode = selectResponseModeForBand(bandId);

        // Translate choice labels for the band — allVocab so short labels
        // always get the target-language treatment even at B0.
        const translatedChoices = line.choiceLabels.map((label) =>
          renderLineForBand(label, targetLanguage, bandId, rolePlan, lexicon, false, true),
        );

        const evaluation = deriveEvaluation(bandId, rolePlan, line.choiceLabels, translatedChoices);

        const responseData = buildResponseData(responseMode, translatedChoices);

        turns.push({
          turnId: responseTurnId,
          targetText: translatedChoices.join(' / '),
          focusLexicalEntryIds: rolePlan.focus.map((e) => e.lexicalEntryId),
          reinforcementLexicalEntryIds: rolePlan.reinforcement.map((e) => e.lexicalEntryId),
          ambientLexicalEntryIds: rolePlan.ambient.map((e) => e.lexicalEntryId),
          responseMode,
          responseData,
          evaluation,
          repairOptions: buildRepairLadder(bandId, rolePlan, npcName),
          turnRole: 'learner_response',
          responseSource: 'explicit_choice',
          generationSource: 'derived',
        });
      }
    }

    // No generic learner_response — if the dialogue has no player choices,
    // the NPC just speaks and the conversation advances without a response.

    bandRealizations.push({
      bandId,
      turns,
      providerPolicy: 'scripted',
      interactionId: interaction.interactionId,
    });
  }

  return {
    bands: bandRealizations,
    vocabMatches,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 1. walkDialogueForTurnDerivation
// ---------------------------------------------------------------------------

/**
 * Enhanced dialogue walk that returns structured DialogueLine objects.
 * Classifies speakers and collects choice labels.
 */
export function walkDialogueForTurnDerivation(
  tree: DialogueTree,
): DialogueLine[] {
  const nodeMap = new Map<string, DialogueNode>(tree.nodes.map((n) => [n.id, n]));
  const startNode = nodeMap.get(tree.startNode);
  if (!startNode) return [];

  const visited = new Set<string>();
  const queue: string[] = [tree.startNode];
  const lines: DialogueLine[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) continue;

    // Classify speaker
    const isPlayerLine = isPlayerSpeaker(node.speakerId, node.speaker);
    const isNarrator = isNarratorSpeaker(node.speakerId, node.speaker);
    const isExcerpt = isExcerptSpeaker(node.speakerId, node.speaker);

    // Detect choices
    const choiceLabels: string[] = [];
    if (node.next && node.next.length > 1) {
      for (const conn of node.next) {
        if (conn.text) choiceLabels.push(conn.text);
      }
    }

    if (node.text) {
      lines.push({
        nodeId: node.id,
        speaker: node.speaker,
        speakerId: node.speakerId,
        text: node.text,
        isPlayerLine,
        isNarrator,
        isExcerpt,
        choiceLabels,
      });
    }

    // Enqueue next nodes
    if (node.next) {
      for (const conn of node.next) {
        if (!visited.has(conn.nodeId)) {
          queue.push(conn.nodeId);
        }
      }
    }
  }

  return lines;
}

function isPlayerSpeaker(speakerId?: string, speaker?: string): boolean {
  return (
    speakerId === PLAYER.id ||
    speakerId === PLAYER_VO.id ||
    speaker === 'Player' ||
    speaker === 'Holly'
  );
}

function isNarratorSpeaker(speakerId?: string, speaker?: string): boolean {
  return speakerId === NARRATOR.id || speaker === 'Narrator';
}

function isExcerptSpeaker(speakerId?: string, speaker?: string): boolean {
  return speakerId === EXCERPT.id || speaker === 'Excerpt';
}

// ---------------------------------------------------------------------------
// 2. matchVocabulary
// ---------------------------------------------------------------------------

/**
 * Match English dialogue text against the lexicon.
 * Multi-word glosses match first (sorted by length descending).
 */
export function matchVocabulary(englishText: string, lexicon: LexiconPack): VocabMatch[] {
  const lowerText = englishText.toLowerCase();
  const matches: VocabMatch[] = [];
  const matchedEntryIds = new Set<string>();

  // Sort entries by gloss length descending (multi-word first)
  const sortedEntries = [...lexicon.entries].sort((a, b) => {
    const aLen = a.gloss.length;
    const bLen = b.gloss.length;
    return bLen - aLen;
  });

  for (const entry of sortedEntries) {
    if (matchedEntryIds.has(entry.lexicalEntryId)) continue;

    // Split on slash variants
    const glossVariants = entry.gloss.split('/').map((v) => v.trim().toLowerCase());

    for (const variant of glossVariants) {
      if (!variant) continue;

      // Check if the variant appears as a word boundary match in the text
      const regex = new RegExp(`\\b${escapeRegex(variant)}\\b`, 'i');
      if (regex.test(lowerText)) {
        matches.push({ entry, matchedGloss: variant });
        matchedEntryIds.add(entry.lexicalEntryId);
        break;
      }
    }
  }

  return matches;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 3. assignVocabularyRoles
// ---------------------------------------------------------------------------

export interface RolePlan {
  focus: LexiconEntry[];
  reinforcement: LexiconEntry[];
  ambient: LexiconEntry[];
}

const BAND_FOCUS_BUDGET: Record<LearnerBandId, { min: number; max: number }> = {
  B0: { min: 1, max: 2 },
  B1: { min: 2, max: 4 },
  B2: { min: 6, max: 8 },
  B3: { min: 8, max: 10 },
  B4: { min: 8, max: 12 },
};

const VALID_BANDS: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];

function bandRank(band: LearnerBandId): number {
  return VALID_BANDS.indexOf(band);
}

export function assignVocabularyRoles(matches: VocabMatch[], band: LearnerBandId): RolePlan {
  const currentRank = bandRank(band);
  const budget = BAND_FOCUS_BUDGET[band];

  // Sort by introductionBand ascending (earlier = more central)
  const eligible = matches
    .filter((m) => bandRank(m.entry.introductionBand) <= currentRank)
    .sort((a, b) => bandRank(a.entry.introductionBand) - bandRank(b.entry.introductionBand));

  const focus: LexiconEntry[] = [];
  const reinforcement: LexiconEntry[] = [];
  const ambient: LexiconEntry[] = [];

  for (const match of eligible) {
    if (focus.length < budget.max) {
      focus.push(match.entry);
    } else if (bandRank(match.entry.introductionBand) < currentRank) {
      reinforcement.push(match.entry);
    } else {
      ambient.push(match.entry);
    }
  }

  // Everything not eligible (above current band) goes to ambient
  for (const match of matches) {
    if (bandRank(match.entry.introductionBand) > currentRank) {
      ambient.push(match.entry);
    }
  }

  return { focus, reinforcement, ambient };
}

// ---------------------------------------------------------------------------
// 4. renderLineForBand
// ---------------------------------------------------------------------------

/**
 * Band-based lexical substitution on an English line.
 *
 * - B0 (full_support): swap only focus entries
 * - B1 (heavy_support): swap focus + reinforcement
 * - B2 (light_support): swap all matched vocabulary
 * - B3-B4 (target_dominant/target_only): swap all + function words
 *
 * When `fullTarget` is true, always renders everything swapped (for targetText).
 */
export function renderLineForBand(
  englishLine: string,
  targetLanguage: string,
  band: LearnerBandId,
  rolePlan: RolePlan,
  _lexicon: LexiconPack,
  fullTarget = false,
  /** Swap all matched vocab entries regardless of band budget, but keep
   *  function-word rules band-gated. Used for choice labels so short text
   *  always gets the target-language treatment even at B0. */
  allVocab = false,
): string {
  let result = englishLine;

  // Determine which entries to substitute based on band
  let entriesToSwap: LexiconEntry[];
  if (fullTarget || allVocab) {
    entriesToSwap = [...rolePlan.focus, ...rolePlan.reinforcement, ...rolePlan.ambient];
  } else {
    switch (band) {
      case 'B0':
        entriesToSwap = [...rolePlan.focus];
        break;
      case 'B1':
        entriesToSwap = [...rolePlan.focus, ...rolePlan.reinforcement];
        break;
      case 'B2':
        entriesToSwap = [...rolePlan.focus, ...rolePlan.reinforcement, ...rolePlan.ambient];
        break;
      case 'B3':
      case 'B4':
        entriesToSwap = [...rolePlan.focus, ...rolePlan.reinforcement, ...rolePlan.ambient];
        break;
      default:
        entriesToSwap = [...rolePlan.focus];
    }
  }

  // Build substitution pairs (gloss → targetForm), sorted longest-first
  const substitutions: Array<{ pattern: string; replacement: string }> = [];

  for (const entry of entriesToSwap) {
    const glossVariants = entry.gloss.split('/').map((v) => v.trim());
    for (const variant of glossVariants) {
      if (!variant) continue;
      substitutions.push({
        pattern: variant,
        replacement: entry.targetForm,
      });
    }
  }

  // Add function words at B3-B4 (or fullTarget)
  if (fullTarget || band === 'B3' || band === 'B4') {
    const funcWords = FUNCTION_WORDS[targetLanguage];
    if (funcWords) {
      for (const [en, tl] of Object.entries(funcWords)) {
        substitutions.push({ pattern: en, replacement: tl });
      }
    }
  }

  // Sort longest-first for correct multi-word matching
  substitutions.sort((a, b) => b.pattern.length - a.pattern.length);

  // Apply substitutions with word-boundary matching
  for (const sub of substitutions) {
    const regex = new RegExp(`\\b${escapeRegex(sub.pattern)}\\b`, 'gi');
    result = result.replace(regex, sub.replacement);
  }

  // Re-capitalize after sentence boundaries
  result = result.replace(/(^|[.!?]\s+)([a-záéíóúñü])/g, (_, boundary, char) =>
    boundary + char.toUpperCase(),
  );

  return result;
}

// ---------------------------------------------------------------------------
// 5. FUNCTION_WORDS
// ---------------------------------------------------------------------------

export const FUNCTION_WORDS: Record<string, Record<string, string>> = {
  es: {
    'I am': 'soy',
    "I'm": 'soy',
    'my name is': 'me llamo',
    'you are': 'eres',
    "you're": 'eres',
    'he is': 'él es',
    'she is': 'ella es',
    'it is': 'es',
    'we are': 'somos',
    'they are': 'son',
    'do you have': 'tienes',
    'I have': 'tengo',
    'do you see': 'ves',
    'I see': 'veo',
    'I need': 'necesito',
    'I want': 'quiero',
    'can you': 'puedes',
    'I can': 'puedo',
    'thank you': 'gracias',
    'good morning': 'buenos días',
    'good afternoon': 'buenas tardes',
    'good evening': 'buenas noches',
    'excuse me': 'disculpe',
    'the': 'el',
    'a': 'un',
    'an': 'un',
    'is': 'es',
    'are': 'son',
    'am': 'soy',
    'my': 'mi',
    'your': 'tu',
    'his': 'su',
    'her': 'su',
    'our': 'nuestro',
    'their': 'su',
    'this': 'este',
    'that': 'ese',
    'in': 'en',
    'on': 'en',
    'at': 'en',
    'of': 'de',
    'to': 'a',
    'for': 'para',
    'with': 'con',
    'from': 'de',
    'and': 'y',
    'but': 'pero',
    'or': 'o',
    'not': 'no',
    'yes': 'sí',
    'no': 'no',
    'please': 'por favor',
    'where': 'donde',
    'what': 'qué',
    'how': 'cómo',
    'who': 'quién',
    'when': 'cuándo',
    'why': 'por qué',
    'I': 'yo',
    'you': 'tú',
    'he': 'él',
    'she': 'ella',
    'we': 'nosotros',
    'they': 'ellos',
    'here': 'aquí',
    'there': 'allí',
  },
  it: {
    'I am': 'sono',
    "I'm": 'sono',
    'my name is': 'mi chiamo',
    'you are': 'sei',
    "you're": 'sei',
    'he is': 'lui è',
    'she is': 'lei è',
    'it is': 'è',
    'we are': 'siamo',
    'they are': 'sono',
    'do you have': 'hai',
    'I have': 'ho',
    'do you see': 'vedi',
    'I see': 'vedo',
    'I need': 'ho bisogno di',
    'I want': 'voglio',
    'can you': 'puoi',
    'I can': 'posso',
    'thank you': 'grazie',
    'good morning': 'buongiorno',
    'good afternoon': 'buon pomeriggio',
    'good evening': 'buonasera',
    'excuse me': 'scusi',
    'the': 'il',
    'a': 'un',
    'an': 'un',
    'is': 'è',
    'are': 'sono',
    'am': 'sono',
    'my': 'mio',
    'your': 'tuo',
    'his': 'suo',
    'her': 'sua',
    'our': 'nostro',
    'their': 'loro',
    'this': 'questo',
    'that': 'quello',
    'in': 'in',
    'on': 'su',
    'at': 'a',
    'of': 'di',
    'to': 'a',
    'for': 'per',
    'with': 'con',
    'from': 'da',
    'and': 'e',
    'but': 'ma',
    'or': 'o',
    'not': 'non',
    'yes': 'sì',
    'no': 'no',
    'please': 'per favore',
    'where': 'dove',
    'what': 'che',
    'how': 'come',
    'who': 'chi',
    'when': 'quando',
    'why': 'perché',
    'I': 'io',
    'you': 'tu',
    'he': 'lui',
    'she': 'lei',
    'we': 'noi',
    'they': 'loro',
    'here': 'qui',
    'there': 'lì',
  },
};

// ---------------------------------------------------------------------------
// 6. selectResponseModeForBand
// ---------------------------------------------------------------------------

export function selectResponseModeForBand(band: LearnerBandId): ResponseContractMode {
  switch (band) {
    case 'B0': return 'chip_composition';
    case 'B1': return 'word_bank';
    case 'B2': return 'short_text';
    case 'B3': return 'short_text';
    case 'B4': return 'open_text';
    default: return 'short_text';
  }
}

// ---------------------------------------------------------------------------
// 7. deriveEvaluation
// ---------------------------------------------------------------------------

export function deriveEvaluation(
  band: LearnerBandId,
  rolePlan: RolePlan,
  choiceLabels?: string[],
  translatedChoices?: string[],
): SceneTurn['evaluation'] {
  // For explicit choices
  if (choiceLabels && translatedChoices && translatedChoices.length > 0) {
    if (band === 'B0') {
      return { acceptedCompositions: translatedChoices };
    }
    return { acceptedAnswers: translatedChoices };
  }

  // For generic responses — focus targetForms as accepted
  return {
    acceptedAnswers: rolePlan.focus.map((e) => e.targetForm),
  };
}

// ---------------------------------------------------------------------------
// 8. buildRepairLadder
// ---------------------------------------------------------------------------

export function buildRepairLadder(
  band: LearnerBandId,
  rolePlan: RolePlan,
  npcName?: string,
): RepairOption[] {
  switch (band) {
    case 'B0':
      return [{
        repairId: 'repeat',
        label: 'Say it again',
        type: 'fixed',
        repairReply: npcName
          ? `${npcName} repeats what they said.`
          : 'The speaker repeats what they said.',
      }];

    case 'B1':
      return [{
        repairId: 'more-words',
        label: 'Show more words',
        type: 'fixed',
        repairReply: rolePlan.focus.map((e) => `${e.targetForm} = ${e.gloss}`).join(', '),
      }];

    case 'B2':
      return [
        {
          repairId: 'more-words',
          label: 'Show more words',
          type: 'fixed',
          minAttempt: 1,
          maxAttempt: 1,
          repairReply: rolePlan.focus.map((e) => `${e.targetForm} = ${e.gloss}`).join(', '),
        },
        {
          repairId: 'simpler',
          label: 'Say it simpler',
          type: 'fixed',
          minAttempt: 1,
          maxAttempt: 2,
          repairReply: npcName
            ? `${npcName} says it in simpler words.`
            : 'The speaker says it in simpler words.',
        },
        {
          repairId: 'support-language',
          label: 'Say it in English',
          type: 'fixed',
          minAttempt: 3,
          repairReply: npcName
            ? `${npcName} switches to English to help you understand.`
            : 'The speaker switches to English to help you understand.',
        },
      ];

    case 'B3':
      return [{
        repairId: 'more-words',
        label: 'Show more words',
        type: 'fixed',
        minAttempt: 2,
        repairReply: rolePlan.focus.map((e) => `${e.targetForm} = ${e.gloss}`).join(', '),
      }];

    case 'B4':
      return [];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildResponseData(
  mode: ResponseContractMode,
  choices: string[],
): SceneTurn['responseData'] {
  switch (mode) {
    case 'chip_composition':
      return { chips: choices };
    case 'word_bank':
      return { wordBank: choices };
    case 'multiple_choice':
      return { choices };
    default:
      return choices.length > 0 ? { hintText: choices.join(', ') } : undefined;
  }
}
