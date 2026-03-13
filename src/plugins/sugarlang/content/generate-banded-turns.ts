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
import { computeSourceHash, computeLexiconFingerprint } from './source-hash';

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
  const lexiconFingerprint = computeLexiconFingerprint(lexicon.entries);

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
          editStatus: 'generated',
          sourceHash: computeSourceHash({
            sourceText: expandContractions(line.text),
            speakerId: line.speakerId,
            speakerName: line.speaker,
            bandId,
            targetLanguage,
            questNodeId: interaction.sourceQuestNodeId,
            lexiconFingerprint,
          }),
          speakerId: line.speakerId,
          speakerName: line.speaker,
        });
        continue;
      }

      // NPC delivery turn — no response contract unless the line has choices
      const renderedText = renderLineForBand(line.text, targetLanguage, bandId, rolePlan, lexicon);
      const lineHash = computeSourceHash({
        sourceText: line.text,
        speakerId: line.speakerId,
        speakerName: line.speaker,
        choiceLabels: line.choiceLabels.length > 0 ? line.choiceLabels : undefined,
        bandId,
        targetLanguage,
        questNodeId: interaction.sourceQuestNodeId,
        lexiconFingerprint,
      });
      const npcTurn: SceneTurn = {
        turnId,
        targetText: renderLineForBand(line.text, targetLanguage, bandId, rolePlan, lexicon, true),
        initialDelivery: renderedText,
        focusLexicalEntryIds: rolePlan.focus.map((e) => e.lexicalEntryId),
        reinforcementLexicalEntryIds: rolePlan.reinforcement.map((e) => e.lexicalEntryId),
        ambientLexicalEntryIds: rolePlan.ambient.map((e) => e.lexicalEntryId),
        responseMode: 'free_form',
        turnRole: 'npc_delivery',
        editStatus: 'generated',
        sourceHash: lineHash,
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

        // Learner response hash is based on choice labels only (not parent
        // NPC text). This ensures the response turn is only flagged stale
        // when the actual choices change, not when the upstream NPC line is
        // edited independently.
        const responseHash = computeSourceHash({
          sourceText: line.choiceLabels.map((l) => expandContractions(l)).join('|'),
          bandId,
          targetLanguage,
          questNodeId: interaction.sourceQuestNodeId,
          lexiconFingerprint,
        });

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
          editStatus: 'generated',
          sourceHash: responseHash,
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
  const lowerText = expandContractions(englishText).toLowerCase();
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
// Contraction expansion
// ---------------------------------------------------------------------------

const CONTRACTIONS: Array<[RegExp, string]> = [
  // Pronoun + be
  [/\bI'm\b/gi, 'I am'],
  [/\byou're\b/gi, 'you are'],
  [/\bhe's\b/gi, 'he is'],
  [/\bshe's\b/gi, 'she is'],
  [/\bit's\b/gi, 'it is'],
  [/\bwe're\b/gi, 'we are'],
  [/\bthey're\b/gi, 'they are'],
  [/\bthat's\b/gi, 'that is'],
  [/\bthere's\b/gi, 'there is'],
  [/\bhere's\b/gi, 'here is'],
  [/\bwhat's\b/gi, 'what is'],
  [/\bwho's\b/gi, 'who is'],
  [/\bhow's\b/gi, 'how is'],
  [/\bwhere's\b/gi, 'where is'],
  // Pronoun + have
  [/\bI've\b/gi, 'I have'],
  [/\byou've\b/gi, 'you have'],
  [/\bwe've\b/gi, 'we have'],
  [/\bthey've\b/gi, 'they have'],
  // Pronoun + will
  [/\bI'll\b/gi, 'I will'],
  [/\byou'll\b/gi, 'you will'],
  [/\bhe'll\b/gi, 'he will'],
  [/\bshe'll\b/gi, 'she will'],
  [/\bit'll\b/gi, 'it will'],
  [/\bwe'll\b/gi, 'we will'],
  [/\bthey'll\b/gi, 'they will'],
  // Pronoun + would/had
  [/\bI'd\b/gi, 'I would'],
  [/\byou'd\b/gi, 'you would'],
  [/\bhe'd\b/gi, 'he would'],
  [/\bshe'd\b/gi, 'she would'],
  [/\bwe'd\b/gi, 'we would'],
  [/\bthey'd\b/gi, 'they would'],
  // Negations
  [/\bdon't\b/gi, 'do not'],
  [/\bdoesn't\b/gi, 'does not'],
  [/\bdidn't\b/gi, 'did not'],
  [/\bisn't\b/gi, 'is not'],
  [/\baren't\b/gi, 'are not'],
  [/\bwasn't\b/gi, 'was not'],
  [/\bweren't\b/gi, 'were not'],
  [/\bwon't\b/gi, 'will not'],
  [/\bcan't\b/gi, 'cannot'],
  [/\bcouldn't\b/gi, 'could not'],
  [/\bshouldn't\b/gi, 'should not'],
  [/\bwouldn't\b/gi, 'would not'],
  [/\bhaven't\b/gi, 'have not'],
  [/\bhasn't\b/gi, 'has not'],
  [/\bhadn't\b/gi, 'had not'],
  // Other
  [/\blet's\b/gi, 'let us'],
];

export function expandContractions(text: string): string {
  let result = text;
  for (const [pattern, expansion] of CONTRACTIONS) {
    result = result.replace(pattern, expansion);
  }
  return result;
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

  // Entries above the current band don't participate in substitution —
  // they haven't been "introduced" to the learner yet.

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
 * - B3-B4 (target_dominant/target_only): swap all matched vocabulary
 *
 * When `fullTarget` is true, always renders everything swapped (for targetText).
 */
export function renderLineForBand(
  englishLine: string,
  _targetLanguage: string,
  band: LearnerBandId,
  rolePlan: RolePlan,
  _lexicon: LexiconPack,
  fullTarget = false,
  /** Swap all matched vocab entries regardless of band budget. Used for
   *  choice labels so short text always gets the target-language treatment
   *  even at B0. */
  allVocab = false,
): string {
  let result = expandContractions(englishLine);

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
// 5. selectResponseModeForBand
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
