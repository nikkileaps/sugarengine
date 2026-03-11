/**
 * Sugarlang Scripted Provider.
 *
 * A ConversationProvider that handles sugarlang-enabled NPCs. Two modes:
 *
 * 1. **Tree-walking** (primary): when the content bundle has a dialogue tree
 *    for the interaction, walks the tree per-node with band-specific lexical
 *    substitution. Preserves branching — player choices route to the correct
 *    dialogue branch via DialogueNext.
 *
 * 2. **Flat turns** (fallback): when no dialogue tree is available (e.g., demo
 *    bundles with hand-authored scene packs), walks pre-generated SceneTurn[]
 *    with the existing cursor-based approach.
 *
 * This provider does NOT require SugarAgent or any LLM.
 */

import type {
  ConversationProvider,
  ConversationProviderDescriptor,
  ConversationSession,
  ProviderConstraintBundle,
  ProviderSelectionContext,
  ProviderTurnOutput,
  PlayerInput,
  ResponseContract,
} from '../../engine/conversation/types';
import type { DialogueNode, DialogueNext, DialogueTree } from '../../engine/dialogue/types';
import { PLAYER, PLAYER_VO, NARRATOR, EXCERPT } from '../../engine/dialogue/types';
import type {
  SugarlangContentBundle,
  SceneTurn,
  LearnerBandId,
  LexiconEntry,
} from './types';
import { resolveSceneBandContent } from './content/loader';
import {
  matchVocabulary,
  assignVocabularyRoles,
  renderLineForBand,
  type RolePlan,
  type VocabMatch,
} from './content/generate-banded-turns';

// ---------------------------------------------------------------------------
// Session-local state (stored on session.middlewareState)
// ---------------------------------------------------------------------------

const PROVIDER_KEY = 'sugarlang-provider';

/** Tree-walking session state (primary path). */
interface TreeWalkState {
  mode: 'tree';
  scenarioId: string;
  nodeMap: Map<string, DialogueNode>;
  currentNodeId: string | null;
  /** The DialogueNext[] from the last rendered node (for resolving player choice). */
  pendingChoices: DialogueNext[];
  rolePlan: RolePlan;
  vocabMatches: VocabMatch[];
  bandId: LearnerBandId;
  targetLanguage: string;
  /** Speaker UUID → display name map built from scenario npcIds/npcNames. */
  speakerNameMap: Map<string, string>;
  complete: boolean;
}

/** Flat-turn session state (fallback for demo/hand-authored content). */
interface FlatTurnState {
  mode: 'flat';
  scenarioId: string;
  turns: SceneTurn[];
  turnCursor: number;
  complete: boolean;
}

type ProviderSessionState = TreeWalkState | FlatTurnState;

function getProviderState(session: ConversationSession): ProviderSessionState | undefined {
  return session.middlewareState[PROVIDER_KEY] as ProviderSessionState | undefined;
}

function setProviderState(session: ConversationSession, state: ProviderSessionState): void {
  session.middlewareState[PROVIDER_KEY] = state;
}

// ---------------------------------------------------------------------------
// Speaker classification
// ---------------------------------------------------------------------------

function isNarratorOrExcerpt(speakerId?: string, speaker?: string): boolean {
  return (
    speakerId === NARRATOR.id ||
    speakerId === EXCERPT.id ||
    speaker === 'Narrator' ||
    speaker === 'Excerpt'
  );
}

// ---------------------------------------------------------------------------
// Player line response contract
// ---------------------------------------------------------------------------

/**
 * Build the response contract for a player delivery node based on the
 * learner band. At low bands the player composes the line from word chips;
 * at higher bands they type it.
 */
/**
 * Build a sentence template with ___ blanks for the given target entries,
 * returning the template string, blank definitions, and the unique chip forms.
 */
function buildBlankTemplate(
  renderedText: string,
  targetEntries: LexiconEntry[],
): {
  template: string;
  blanks: Array<{ id: string; acceptedAnswers: string[] }>;
  correctChips: string[];
} {
  let template = renderedText;
  const blanks: Array<{ id: string; acceptedAnswers: string[] }> = [];
  const correctChips: string[] = [];

  for (const entry of targetEntries) {
    const form = entry.targetForm;
    const regex = new RegExp(`\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    template = template.replace(regex, (match) => {
      const blankId = `blank_${blanks.length}`;
      blanks.push({ id: blankId, acceptedAnswers: [match] });
      if (!correctChips.includes(form)) correctChips.push(form);
      return '___';
    });
  }

  return { template, blanks, correctChips };
}

function buildPlayerLineContract(
  renderedText: string,
  bandId: LearnerBandId,
  rolePlan: RolePlan,
): ResponseContract {
  switch (bandId) {
    case 'B0':
    case 'B1': {
      // Word bank fill-in — sentence with ___ blanks, player taps chips to fill.
      // B0 = focus only, B1 = focus + reinforcement.
      const targetEntries = bandId === 'B0'
        ? rolePlan.focus
        : [...rolePlan.focus, ...rolePlan.reinforcement];

      const { template, blanks, correctChips } = buildBlankTemplate(renderedText, targetEntries);

      if (blanks.length === 0) return { mode: 'free_form' };

      // Add a few ambient distractors so it's not trivially obvious.
      const distractors = rolePlan.ambient
        .filter((e) => !correctChips.includes(e.targetForm))
        .slice(0, Math.max(2, correctChips.length))
        .map((e) => e.targetForm);

      // Merge and deterministically shuffle.
      const allChips = [...correctChips, ...distractors];
      for (let i = allChips.length - 1; i > 0; i--) {
        const j = (i * 7 + renderedText.length) % (i + 1);
        [allChips[i], allChips[j]] = [allChips[j]!, allChips[i]!];
      }

      return {
        mode: 'word_bank',
        wordBank: allChips,
        blanks,
        hintText: template,
      };
    }
    case 'B2':
    case 'B3': {
      // Typed fill-in — same sentence template with blanks, but the player
      // types each word instead of picking from a chip bank.
      const targetEntries = rolePlan.focus;
      const { template, blanks } = buildBlankTemplate(renderedText, targetEntries);

      if (blanks.length === 0) return { mode: 'free_form' };

      return {
        mode: 'blank_fill',
        blanks,
        hintText: template,
      };
    }
    case 'B4':
      // Open text — player types freely
      return {
        mode: 'open_text',
        maxLength: renderedText.length + 80,
      };
    default:
      return { mode: 'free_form' };
  }
}

// ---------------------------------------------------------------------------
// Flat turn helpers (kept for fallback path)
// ---------------------------------------------------------------------------

function turnToResponseContract(turn: SceneTurn): ResponseContract {
  const contract: ResponseContract = {
    mode: turn.responseMode,
  };
  if (turn.responseData?.choices) contract.choices = turn.responseData.choices;
  if (turn.responseData?.blanks) contract.blanks = turn.responseData.blanks;
  if (turn.responseMode === 'chip_composition' && turn.responseData?.chips) {
    contract.wordBank = turn.responseData.chips;
  } else if (turn.responseData?.wordBank) {
    contract.wordBank = turn.responseData.wordBank;
  }
  if (turn.responseData?.maxLength) contract.maxLength = turn.responseData.maxLength;
  if (turn.responseData?.hintText) contract.hintText = turn.responseData.hintText;
  return contract;
}

// ---------------------------------------------------------------------------
// Tree-walking helpers
// ---------------------------------------------------------------------------

/**
 * Collect all reachable text from a dialogue tree (BFS).
 * Used for vocabulary matching against the lexicon.
 */
function collectAllDialogueText(tree: DialogueTree): string {
  const nodeMap = new Map(tree.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue = [tree.startNode];
  const texts: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) continue;
    if (node.text) texts.push(node.text);
    // Also collect choice labels
    if (node.next) {
      for (const conn of node.next) {
        if (conn.text) texts.push(conn.text);
        if (!visited.has(conn.nodeId)) queue.push(conn.nodeId);
      }
    }
  }

  return texts.join(' ');
}

/**
 * Render a dialogue node into a ProviderTurnOutput using band-specific
 * lexical substitution.
 */
function renderNodeForBand(
  node: DialogueNode,
  rolePlan: RolePlan,
  lexicon: { targetLanguage: string; entries: unknown[] },
  bandId: LearnerBandId,
  targetLanguage: string,
  constraints: ProviderConstraintBundle,
  speakerNameMap: Map<string, string>,
): ProviderTurnOutput {
  // Apply lexical substitution
  const renderedText = renderLineForBand(
    node.text,
    targetLanguage,
    bandId,
    rolePlan,
    lexicon as import('./types').LexiconPack,
  );

  // Also generate the full target-language text for diagnostics
  const targetText = renderLineForBand(
    node.text,
    targetLanguage,
    bandId,
    rolePlan,
    lexicon as import('./types').LexiconPack,
    true,
  );

  // Detect choices (branching node): multiple connections = player choice
  const connections = node.next ?? [];
  const hasChoices = connections.length > 1;

  let responseContract: ResponseContract;

  // Detect player speaker for band-specific response modes
  const isPlayerLine =
    node.speaker === PLAYER.id ||
    node.speaker === PLAYER_VO.id ||
    node.speakerId === PLAYER.id ||
    node.speakerId === PLAYER_VO.id;

  if (hasChoices) {
    // Branching choices — always multiple_choice (player picks a branch).
    // Choice labels use allVocab=true so short labels get target-language treatment.
    const translatedChoices = connections.map((c, i) => {
      const label = c.text || `Choice ${i + 1}`;
      return renderLineForBand(
        label,
        targetLanguage,
        bandId,
        rolePlan,
        lexicon as import('./types').LexiconPack,
        false,
        true,
      );
    });

    responseContract = {
      mode: 'multiple_choice',
      choices: translatedChoices,
    };
  } else if (isPlayerLine) {
    // Player delivery node — band-specific language exercise.
    // The player composes/types the rendered text instead of just reading it.
    responseContract = buildPlayerLineContract(renderedText, bandId, rolePlan);
  } else {
    // NPC delivery or end node — E to advance
    responseContract = { mode: 'free_form' };
  }

  // Resolve speaker name: UUID → display name via scenario npcIds/npcNames
  const speakerId = node.speakerId ?? node.speaker;
  const speakerName = speakerNameMap.get(node.speaker ?? '')
    ?? speakerNameMap.get(speakerId ?? '')
    ?? node.speakerLabel
    ?? node.name
    ?? node.speaker;

  return {
    utterance: renderedText,
    speakerId,
    speakerName,
    responseContract,
    groundingMetadata: constraints.groundingScope
      ? { references: constraints.groundingScope }
      : undefined,
    diagnostics: {
      targetText,
      nodeId: node.id,
      focusLexicalEntryIds: rolePlan.focus.map((e) => e.lexicalEntryId),
    },
  };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export interface SugarlangProviderConfig {
  contentBundle: SugarlangContentBundle;
  /** Resolve the scenario ID for a given NPC (by id or name). */
  getScenarioForNpc(npcId: string, npcName?: string): string | undefined;
  /** Resolve a dialogue tree by ID from the game's loaded dialogues. */
  getDialogueTree(dialogueId: string): DialogueTree | undefined;
}

export function createSugarlangScriptedProvider(
  config: SugarlangProviderConfig,
): ConversationProvider {
  const { contentBundle } = config;

  const descriptor: ConversationProviderDescriptor = {
    id: 'sugarlang-scripted',
    // Below scripted dialogue (10) so sugarlang wins when it has content.
    // Above SugarAgent (100). NPCs without a scenario fall through to scripted dialogue.
    priority: 5,
  };

  function canHandle(npcId: string, context: ProviderSelectionContext): boolean {
    const scenarioId = config.getScenarioForNpc(npcId, context.npcName);
    if (!scenarioId) return false;

    // If the NPC supports agent mode and the active band prefers agent interaction,
    // decline so SugarAgentProviderAdapter can handle it instead.
    if (context.npcInteractionMode === 'agent' || context.npcInteractionMode === 'hybrid') {
      const bandId = (context.learnerBandOverride ?? 'B0') as LearnerBandId;
      const targetLang = context.targetLanguage ?? 'es';
      const bandContent = resolveSceneBandContent(contentBundle, scenarioId, targetLang, bandId);
      if (bandContent?.providerPolicy === 'agent_preferred') {
        console.log(
          `[SL·provider] declining NPC "${npcId}" — band=${bandId} providerPolicy=agent_preferred` +
          ` mode=${context.npcInteractionMode}, deferring to SugarAgent`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Try to set up tree-walking mode by finding a dialogue tree for this NPC's
   * scenario. Returns the state if successful, or null to fall back to flat turns.
   */
  function tryInitTreeWalk(
    session: ConversationSession,
    scenarioId: string,
  ): TreeWalkState | null {
    const scenario = contentBundle.scenarios.get(scenarioId);
    if (!scenario?.interactions || scenario.interactions.length === 0) {
      console.warn(
        `[SL·provider] tryInitTreeWalk: no interactions for scenario "${scenarioId}"` +
        ` (scenarios in bundle: ${Array.from(contentBundle.scenarios.keys()).join(', ')})`,
      );
      return null;
    }

    // Find the first interaction with a dialogue tree resolvable from the game
    for (const interaction of scenario.interactions) {
      if (!interaction.sourceDialogueId) {
        console.log(`[SL·provider] tryInitTreeWalk: interaction "${interaction.interactionId}" has no sourceDialogueId, skipping`);
        continue;
      }
      const tree = config.getDialogueTree(interaction.sourceDialogueId);
      if (!tree || tree.nodes.length === 0) {
        console.warn(
          `[SL·provider] tryInitTreeWalk: dialogue tree "${interaction.sourceDialogueId}" not found via getDialogueTree`,
        );
        continue;
      }

      const targetLang = session.targetLanguage ?? 'es';
      const bandId = (session.learnerBandOverride ?? 'B0') as LearnerBandId;
      const lexicon = contentBundle.lexicons.get(targetLang);
      if (!lexicon) {
        console.warn(
          `[SL·provider] tryInitTreeWalk: no lexicon for "${targetLang}"` +
          ` (available: ${Array.from(contentBundle.lexicons.keys()).join(', ')})`,
        );
        continue;
      }

      // Collect all reachable text for vocabulary matching
      const allText = collectAllDialogueText(tree);
      const vocabMatches = matchVocabulary(allText, lexicon);
      const rolePlan = assignVocabularyRoles(vocabMatches, bandId);

      // Build node map
      const nodeMap = new Map(tree.nodes.map((n) => [n.id, n]));

      // Build speaker name map from scenario npcIds/npcNames + session npc
      const speakerNameMap = new Map<string, string>();
      const npcNames = scenario.npcNames ?? [];
      for (let i = 0; i < scenario.npcIds.length; i++) {
        const id = scenario.npcIds[i];
        const name = npcNames[i];
        if (id && name) {
          speakerNameMap.set(id, name);
        }
      }
      // Session NPC as fallback
      if (session.npcId && session.npcName) {
        speakerNameMap.set(session.npcId, session.npcName);
      }
      // "Player" for any speaker matching typical player conventions
      speakerNameMap.set('Player', 'Player');

      console.log(
        `[SL·provider] tree-walk mode for "${scenarioId}" dialogue=${interaction.sourceDialogueId}` +
        ` nodes=${tree.nodes.length} vocabMatches=${vocabMatches.length} band=${bandId}` +
        ` speakerNames=[${Array.from(speakerNameMap.entries()).map(([k, v]) => `${k.substring(0, 8)}→${v}`).join(', ')}]`,
      );

      return {
        mode: 'tree',
        scenarioId,
        nodeMap,
        currentNodeId: tree.startNode,
        pendingChoices: [],
        rolePlan,
        vocabMatches,
        bandId,
        targetLanguage: targetLang,
        speakerNameMap,
        complete: false,
      };
    }

    return null;
  }

  async function startSession(
    session: ConversationSession,
    _context: ProviderSelectionContext,
  ): Promise<void> {
    const scenarioId = config.getScenarioForNpc(session.npcId, session.npcName);
    if (!scenarioId) return;

    // Try tree-walking mode first
    const treeState = tryInitTreeWalk(session, scenarioId);
    if (treeState) {
      setProviderState(session, treeState);
      return;
    }

    // Fall back to flat turns from scene language packs
    const targetLang = session.targetLanguage ?? 'es';
    const band = (session.learnerBandOverride ?? 'B0') as LearnerBandId;
    const bandContent = resolveSceneBandContent(contentBundle, scenarioId, targetLang, band);

    console.log(
      `[SL·provider] flat-turn mode for "${scenarioId}" band=${band} turns=${bandContent?.turns.length ?? 0}`,
    );

    setProviderState(session, {
      mode: 'flat',
      scenarioId,
      turns: bandContent?.turns ?? [],
      turnCursor: 0,
      complete: false,
    });
  }

  // -------------------------------------------------------------------------
  // Tree-walking produceTurn
  // -------------------------------------------------------------------------

  function produceTreeTurn(
    session: ConversationSession,
    state: TreeWalkState,
    constraints: ProviderConstraintBundle,
    playerInput?: PlayerInput,
  ): ProviderTurnOutput {
    // Re-resolve band if middleware changed it
    if (constraints.learnerBand && constraints.learnerBand !== state.bandId) {
      const newBand = constraints.learnerBand as LearnerBandId;
      const lexicon = contentBundle.lexicons.get(state.targetLanguage);
      if (lexicon) {
        state.bandId = newBand;
        state.rolePlan = assignVocabularyRoles(state.vocabMatches, newBand);
        console.log(`[SL·provider] band re-resolved to ${newBand}`);
      }
    }

    // Handle player input → advance to next node
    if (playerInput && state.pendingChoices.length > 0) {
      let selectedNext: DialogueNext | undefined;

      if (state.pendingChoices.length > 1) {
        // Player picked a choice — resolve by index or text matching
        const choiceIndex = playerInput.choiceIndex ?? -1;
        if (choiceIndex >= 0 && choiceIndex < state.pendingChoices.length) {
          selectedNext = state.pendingChoices[choiceIndex];
        } else {
          // Try text matching as fallback
          const inputText = (playerInput.text ?? '').trim().toLowerCase();
          selectedNext = state.pendingChoices.find((c) =>
            c.text?.toLowerCase() === inputText,
          );
        }
      }

      // Default to first connection (linear advance or fallback)
      if (!selectedNext) {
        selectedNext = state.pendingChoices[0];
      }

      if (selectedNext) {
        state.currentNodeId = selectedNext.nodeId;
      } else {
        // No next — end
        state.complete = true;
        state.currentNodeId = null;
      }
    } else if (playerInput) {
      // Player advanced past an end node (no pending choices) — close
      state.complete = true;
      state.currentNodeId = null;
    }

    // If complete or no current node, signal end
    if (state.complete || !state.currentNodeId) {
      state.complete = true;
      setProviderState(session, state);
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    // Get the current node
    const node = state.nodeMap.get(state.currentNodeId);
    if (!node) {
      state.complete = true;
      setProviderState(session, state);
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    // Skip narrator/excerpt nodes — auto-advance to next
    if (isNarratorOrExcerpt(node.speakerId, node.speaker)) {
      const nextConn = node.next?.[0];
      if (nextConn) {
        state.currentNodeId = nextConn.nodeId;
        state.pendingChoices = [];
        setProviderState(session, state);
        // Recurse to produce the next non-narrator node
        return produceTreeTurn(session, state, constraints);
      }
      // No next after narrator — end
      state.complete = true;
      setProviderState(session, state);
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    // Store pending choices for next player input resolution
    state.pendingChoices = node.next ?? [];

    console.log(
      `[SL·provider] rendering node "${node.id}" speaker="${node.speaker}"` +
      ` text="${node.text?.substring(0, 40)}..."` +
      ` next=${JSON.stringify(state.pendingChoices.map(c => ({ nodeId: c.nodeId?.substring(0, 8), text: c.text })))}`,
    );

    // If no connections, this is the last node — mark for end after this turn
    if (state.pendingChoices.length === 0) {
      // Will complete on next produceTurn call
    }

    const lexicon = contentBundle.lexicons.get(state.targetLanguage);
    const output = renderNodeForBand(
      node,
      state.rolePlan,
      lexicon ?? { targetLanguage: state.targetLanguage, entries: [] },
      state.bandId,
      state.targetLanguage,
      constraints,
      state.speakerNameMap,
    );

    // End nodes (no next) show their text first — closeConversation fires
    // on the subsequent advance when produceTurn is called with playerInput
    // and no pendingChoices.

    setProviderState(session, state);
    return output;
  }

  // -------------------------------------------------------------------------
  // Flat-turn produceTurn (fallback)
  // -------------------------------------------------------------------------

  function produceFlatTurn(
    session: ConversationSession,
    state: FlatTurnState,
    constraints: ProviderConstraintBundle,
    playerInput?: PlayerInput,
  ): ProviderTurnOutput {
    // Re-resolve turns if middleware changed band/language
    if (constraints.learnerBand && constraints.targetLanguage) {
      const currentBand = constraints.learnerBand as LearnerBandId;
      const currentLang = constraints.targetLanguage;
      const bandContent = resolveSceneBandContent(
        contentBundle,
        state.scenarioId,
        currentLang,
        currentBand,
      );
      if (bandContent && state.turns !== bandContent.turns) {
        state.turns = bandContent.turns;
        if (session.turnIndex === 0) state.turnCursor = 0;
      }
    }

    if (state.turns.length === 0) {
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    // With player input, advance past the current turn
    if (playerInput && state.turnCursor > 0) {
      // Simple advance — evaluation deferred per plan
    }

    // Produce the next turn
    if (state.turnCursor >= state.turns.length) {
      state.complete = true;
      setProviderState(session, state);
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    const currentTurn = state.turns[state.turnCursor]!;
    state.turnCursor++;

    setProviderState(session, state);

    const responseContract = turnToResponseContract(currentTurn);
    const renderedUtterance = currentTurn.initialDelivery ?? currentTurn.targetText;

    console.log(
      `[SL·provider] flat turn → id=${currentTurn.turnId}` +
      ` mode=${currentTurn.responseMode}`,
    );

    return {
      utterance: renderedUtterance,
      speakerId: currentTurn.speakerId,
      speakerName: currentTurn.speakerName,
      emotion: currentTurn.emotion,
      responseContract,
      groundingMetadata: constraints.groundingScope
        ? { references: constraints.groundingScope }
        : undefined,
      diagnostics: {
        supportText: currentTurn.supportText,
        targetText: currentTurn.targetText,
        turnId: currentTurn.turnId,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Main produceTurn dispatcher
  // -------------------------------------------------------------------------

  async function produceTurn(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
    playerInput?: PlayerInput,
  ): Promise<ProviderTurnOutput> {
    const state = getProviderState(session);

    if (!state) {
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    if (state.mode === 'tree') {
      return produceTreeTurn(session, state, constraints, playerInput);
    }
    return produceFlatTurn(session, state, constraints, playerInput);
  }

  async function endSession(session: ConversationSession): Promise<void> {
    delete session.middlewareState[PROVIDER_KEY];
  }

  return {
    descriptor,
    canHandle,
    startSession,
    produceTurn,
    endSession,
  };
}
