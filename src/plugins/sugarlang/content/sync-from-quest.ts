/**
 * Sync From Quest — derives interactions from quest graph traversal.
 *
 * Walks the quest beat graph in authored order (stage order → topological
 * order within each stage) and promotes communicative nodes (talk, narrative
 * dialogue, voiceover, collect) into DerivedInteraction objects.
 *
 * Pure function, no React, no side effects.
 */

import type { QuestDefinition, QuestObjective } from '../../../engine/quests/types';
import type { DialogueTree, DialogueNode } from '../../../engine/dialogue/types';
import type { DerivedInteraction, InteractionGroundingContext, QuestSuccessHook } from '../types';
import { ObjectiveGraph } from '../../../engine/quests/ObjectiveGraph';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SyncFromQuestInput {
  quest: QuestDefinition;
  dialogues: DialogueTree[];
  npcs: Array<{ id: string; name: string }>;
  scenarioId: string;
}

export interface SyncFromQuestResult {
  interactions: DerivedInteraction[];
  warnings: string[];
}

/**
 * Traverse the quest graph and derive interactions from communicative nodes.
 *
 * One quest node = one DerivedInteraction (1:1 rule). Nodes without
 * communicative content (conditions, branches, pure-location, pure-trigger)
 * are skipped.
 */
export function syncInteractionsFromQuest(input: SyncFromQuestInput): SyncFromQuestResult {
  const { quest, dialogues, npcs, scenarioId } = input;
  const interactions: DerivedInteraction[] = [];
  const warnings: string[] = [];

  // Build lookup maps
  const dialogueMap = new Map<string, DialogueTree>(dialogues.map((d) => [d.id, d]));
  const npcMap = new Map<string, string>(npcs.map((n) => [n.id, n.name]));

  // Walk quest graph in authored stage order
  for (const stage of quest.stages) {
    const graph = ObjectiveGraph.fromObjectives(stage.objectives);
    const sorted = graph.topologicalSort();

    for (const graphNode of sorted) {
      const obj = graphNode.objective;

      const promoted = tryPromoteNode(obj, dialogueMap);
      if (!promoted) continue;

      const { dialogueId, kind } = promoted;

      // Walk dialogue tree (if applicable)
      let sourceDialogueNodeIds: string[] = [];
      let sourceDialogueText: string[] = [];
      let dialogueSpeakerId: string | undefined;
      let dialogueSpeakerName: string | undefined;

      if (kind === 'voiceover') {
        sourceDialogueText = obj.voiceoverText ? [obj.voiceoverText] : [];
      } else if (dialogueId) {
        const tree = dialogueMap.get(dialogueId);
        if (!tree) {
          warnings.push(`Missing dialogue tree "${dialogueId}" referenced by node "${obj.id}"`);
        } else {
          const walkResult = walkDialogueTree(tree);
          sourceDialogueNodeIds = walkResult.nodeIds;
          sourceDialogueText = walkResult.lines;
          dialogueSpeakerId = walkResult.firstSpeakerId;
          dialogueSpeakerName = walkResult.firstSpeakerName;
        }
      }

      // Resolve NPC
      const npcId = resolveNpcId(obj, dialogueSpeakerId);
      const npcName = npcId ? (npcMap.get(npcId) ?? dialogueSpeakerName) : dialogueSpeakerName;

      if (npcId && !npcMap.has(npcId)) {
        warnings.push(`NPC "${npcId}" referenced by node "${obj.id}" not found in NPC list`);
      }

      // World object refs
      const worldObjectRefs = kind === 'collect' && obj.target ? [obj.target] : [];

      // Grounding context
      const grounding: InteractionGroundingContext = {
        npcId,
        npcName,
        worldObjectRefs: worldObjectRefs.map((ref) => ({ objectId: ref, label: ref })),
        attributes: [],
        questBindingRefs: [],
      };

      // Quest-success hook
      const questSuccessHook: QuestSuccessHook = {
        sourceNodeId: obj.id,
        action: 'complete_objective',
        questId: quest.id,
      };

      interactions.push({
        interactionId: `${scenarioId}--${obj.id}`,
        sourceQuestNodeId: obj.id,
        sourceStageId: stage.id,
        sourceDialogueId: dialogueId,
        sourceDialogueNodeIds,
        npcId,
        npcName,
        worldObjectRefs,
        grounding,
        questSuccessHook,
        sourceDialogueText,
      });
    }
  }

  return { interactions, warnings };
}

// ---------------------------------------------------------------------------
// Inclusion test
// ---------------------------------------------------------------------------

interface PromotionResult {
  dialogueId?: string;
  kind: 'talk' | 'narrative_dialogue' | 'voiceover' | 'collect';
}

/**
 * Test whether a quest node should be promoted to a DerivedInteraction.
 * Returns promotion info if yes, undefined if skip.
 */
function tryPromoteNode(
  obj: QuestObjective,
  dialogueMap: Map<string, DialogueTree>,
): PromotionResult | undefined {
  // Skip condition and branch nodes
  if (obj.nodeType === 'condition' || obj.nodeType === 'branch') return undefined;

  // Narrative nodes are checked first — more specific than type-based checks
  if (obj.nodeType === 'narrative') {
    if (obj.narrativeType === 'dialogue' && obj.dialogueId) {
      return { dialogueId: obj.dialogueId, kind: 'narrative_dialogue' };
    }
    if (obj.narrativeType === 'voiceover' && obj.voiceoverText) {
      return { kind: 'voiceover' };
    }
    // Narrative node with no communicative content
    return undefined;
  }

  // Talk objective with resolvable dialogue
  if (obj.type === 'talk') {
    const dialogueId = obj.dialogue ?? obj.dialogueId;
    if (dialogueId) return { dialogueId, kind: 'talk' };
    // Talk with target but no explicit dialogue — check if target has dialogue in map
    if (obj.target && dialogueMap.has(obj.target)) {
      return { dialogueId: obj.target, kind: 'talk' };
    }
    // No resolvable dialogue
    return undefined;
  }

  // Collect objective with a target
  if (obj.type === 'collect' && obj.target) {
    return { kind: 'collect' };
  }

  // Everything else: location with no dialogue, trigger with no dialogue, etc.
  return undefined;
}

// ---------------------------------------------------------------------------
// Dialogue tree walk
// ---------------------------------------------------------------------------

/** Speakers to exclude from sourceDialogueText extraction. */
const EXCLUDED_SPEAKERS = new Set(['Narrator', 'Excerpt']);

interface DialogueWalkResult {
  nodeIds: string[];
  lines: string[];
  firstSpeakerId?: string;
  firstSpeakerName?: string;
}

/**
 * BFS walk of a dialogue tree starting from `tree.startNode`.
 * Collects all node IDs and non-narrator/excerpt dialogue lines.
 */
function walkDialogueTree(tree: DialogueTree): DialogueWalkResult {
  const nodeMap = new Map<string, DialogueNode>(tree.nodes.map((n) => [n.id, n]));
  const startNode = nodeMap.get(tree.startNode);
  if (!startNode) return { nodeIds: [], lines: [] };

  const visited = new Set<string>();
  const queue: string[] = [tree.startNode];
  const nodeIds: string[] = [];
  const lines: string[] = [];
  let firstSpeakerId: string | undefined;
  let firstSpeakerName: string | undefined;

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) continue;

    nodeIds.push(node.id);

    // Track first NPC speaker
    if (!firstSpeakerId && node.speakerId && !EXCLUDED_SPEAKERS.has(node.speaker ?? '')) {
      firstSpeakerId = node.speakerId;
      firstSpeakerName = node.speaker;
    }

    // Add text (skip narrators and excerpts)
    if (node.text && !EXCLUDED_SPEAKERS.has(node.speaker ?? '')) {
      lines.push(node.text);
    }

    // Process next connections
    if (node.next) {
      for (const conn of node.next) {
        // Add choice text labels (player choices)
        if (node.next.length > 1 && conn.text) {
          lines.push(conn.text);
        }
        if (!visited.has(conn.nodeId)) {
          queue.push(conn.nodeId);
        }
      }
    }
  }

  return { nodeIds, lines, firstSpeakerId, firstSpeakerName };
}

// ---------------------------------------------------------------------------
// NPC resolution
// ---------------------------------------------------------------------------

function resolveNpcId(obj: QuestObjective, dialogueSpeakerId?: string): string | undefined {
  // Talk and collect use obj.target as NPC/item target
  if (obj.type === 'talk' && obj.target) return obj.target;
  // For narrative nodes, use the dialogue speaker
  return dialogueSpeakerId;
}
