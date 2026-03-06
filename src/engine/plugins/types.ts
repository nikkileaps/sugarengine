import type { ObjectiveType } from '../quests/types';
import type { NearbyInteractable } from '../systems';
import type { StateChange } from '../state';

export const PLUGIN_API_VERSION = 1;

export interface PluginDescriptor {
  id: string;
  version: string;
  apiVersion: number;
}

export type PluginIntent =
  | { type: 'startDialogue'; dialogueId: string }
  | { type: 'setFlag'; flag: string; value: unknown }
  | { type: 'emitEvent'; eventName: string; data?: unknown }
  | { type: 'moveNpc'; npcId: string; target: { x: number; y: number; z: number } }
  | { type: 'triggerObjective'; objectiveType: ObjectiveType; targetId: string };

export interface PluginIntentResult {
  success: boolean;
  error?: string;
}

export interface PluginAgentTurnRequest {
  npcId: string;
  npcName?: string;
  playerMessage: string;
  beatContract?: PluginAgentBeatContract;
  beatTurnCount?: number;
  npcProfile?: PluginAgentProfile;
  globalSafetyBounds?: string[];
  context?: PluginAgentContext;
}

export interface PluginAgentProfile {
  persona?: string;
  tone?: string;
  constraints?: string[];
  loreScopes?: string[];
  selfEntityId?: string;
  selfLoreScopes?: string[];
  relatedLoreScopes?: string[];
}

export interface PluginAgentContext {
  gameId?: string;
  regionPath?: string;
  episodeId?: string;
  runtimeMode?: 'llama' | 'auto' | 'mock';
  interactionMode?: 'scripted' | 'agent' | 'hybrid';
  interactionPolicy?: 'scripted-first' | 'agent-first' | 'fallback';
  isFirstMeeting?: boolean;
  turnIndexWithNpc?: number;
  topicCoverage?: {
    activeTopic?: string;
    activeTopicNovelty?: number;
    exhaustedTopics?: string[];
    trackedTopicCount?: number;
    exhausted?: boolean;
  };
}

export type PluginAgentConversationMode = 'character' | 'narrative' | 'hybrid' | 'unknown';
export type PluginAgentInitiativeAction =
  | 'npc_initiate'
  | 'player_respond'
  | 'clarify'
  | 'abstain'
  | 'close'
  | 'unknown';
export type PluginAgentGoalType =
  | 'beat_goal'
  | 'character_goal'
  | 'social_goal'
  | 'repair_goal'
  | 'closure_goal'
  | 'unknown';
export type PluginAgentExpectedPlayerResponseType =
  | 'free_text'
  | 'ack'
  | 'choice'
  | 'action'
  | 'unknown';
export type PluginAgentValidationDecision = 'accept' | 'repair' | 'fallback' | 'reject' | 'abstain' | 'unknown';
export type PluginAgentBeatEvaluationStatus = 'passed' | 'failed' | 'not_applicable';

export interface PluginAgentTurnDiagnostics {
  mode?: PluginAgentConversationMode;
  modeReason?: string;
  modeResolution?: {
    interactionMode?: 'scripted' | 'agent' | 'hybrid' | 'unknown';
    interactionPolicy?: 'scripted-first' | 'agent-first' | 'fallback' | 'unknown';
    hasBeatContract?: boolean;
  };
  modeTransition?: {
    from?: PluginAgentConversationMode;
    to?: PluginAgentConversationMode;
    changed?: boolean;
    reason?: string;
  };
  initiative?: {
    initiator?: 'npc' | 'player' | 'system';
    action?: PluginAgentInitiativeAction;
    primaryGoal?: PluginAgentGoalType;
    secondaryGoals?: PluginAgentGoalType[];
    expectedPlayerResponseType?: PluginAgentExpectedPlayerResponseType;
    reason?: string;
    policyBounded?: boolean;
  };
  conversation?: {
    topicCoverage?: {
      activeTopic?: string;
      activeTopicNovelty?: number;
      exhausted?: boolean;
      exhaustedTopics?: string[];
      trackedTopicCount?: number;
    };
  };
  evidenceBudget?: {
    usage?: {
      facts?: number;
      spans?: number;
      contextTokens?: number;
      memoryItems?: number;
      beatFacts?: number;
    };
    budget?: {
      facts?: number;
      spans?: number;
      contextTokens?: number;
      memoryItems?: number;
      beatFacts?: number;
    };
    withinBudget?: boolean;
  };
  retrieval?: {
    attempted?: boolean;
    candidateCount?: number;
    selectedCount?: number;
    qualityPath?: string;
    qualityReason?: string;
    correctiveAttempted?: boolean;
  };
  validation?: {
    decision?: PluginAgentValidationDecision;
    errors?: string[];
    unsupportedClaims?: number;
    requiresRepair?: boolean;
  };
  beatEvaluator?: {
    status?: PluginAgentBeatEvaluationStatus;
    beatId?: string;
    questId?: string;
    objectiveId?: string;
    coveragePassed?: boolean;
    rulePassed?: boolean;
    beatIdMatched?: boolean;
    forbiddenPassed?: boolean;
    confidencePassed?: boolean;
    missingRequiredFacts?: string[];
    forbiddenFactMentions?: string[];
    confidence?: number;
    completionSignal?: 'none' | 'player_ack' | 'player_action' | 'engine_flag';
    reason?: string;
  };
  pipelineVersion?: string;
  timestampMs?: number;
}

export interface PluginAgentBeatContract {
  id: string;
  questId: string;
  npcId: string;
  objective: string;
  requiredFacts: string[];
  forbiddenFacts?: string[];
  completionRule: 'player_ack' | 'player_action' | 'engine_flag';
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
  stageId?: string;
  objectiveId?: string;
}

export interface PluginAgentBeatEvidence {
  beatId?: string;
  coveredFacts: string[];
  uncoveredFacts: string[];
  completionSignal: 'none' | 'player_ack' | 'player_action' | 'engine_flag';
  confidence: number;
}

export interface PluginAgentTurnResult {
  utterance: string;
  emotion?: string;
  intent?: string;
  citations?: Array<{ sourceId: string; snippet?: string }>;
  beatEvidence?: PluginAgentBeatEvidence;
  diagnostics?: PluginAgentTurnDiagnostics;
}

export type PluginInteractionResolution =
  | { type: 'startDialogue'; dialogueId: string }
  | { type: 'intent'; intent: PluginIntent }
  | { type: 'openAgentConversation'; npcId: string; npcName?: string }
  | { type: 'handled' };

export interface InteractionRequest {
  npcId: string;
  npcName?: string;
  npcDefaultDialogue?: string;
  hasQuestDialogue: boolean;
  hasBehaviorTree: boolean;
}

export type PluginInteractionSource =
  | 'quest'
  | 'behaviorTree'
  | 'plugin'
  | 'defaultDialogue'
  | 'none';

export type PluginEvent =
  | { type: 'interactionAttempt'; npcId: string; npcDefaultDialogue?: string }
  | { type: 'interactionHandled'; npcId: string; source: PluginInteractionSource; detail?: string }
  | { type: 'dialogueStarted'; dialogueId?: string }
  | { type: 'dialogueEnded' }
  | { type: 'dialogueEvent'; eventName: string }
  | { type: 'questStarted'; questId: string; questName: string }
  | { type: 'questCompleted'; questId: string; questName: string }
  | { type: 'objectiveCompleted'; questId: string; objectiveId?: string; description?: string }
  | { type: 'objectiveProgressed'; questId: string; objectiveId?: string }
  | { type: 'itemAdded'; itemId: string; quantity: number }
  | { type: 'itemRemoved'; itemId: string; quantity: number }
  | { type: 'itemPickedUp'; pickupId: string; itemId: string; quantity: number; regionPath: string }
  | { type: 'triggerEntered'; triggerId: string; triggerType: string; target?: string }
  | { type: 'nearbyInteractionChanged'; interaction: { type: string; id: string; promptText?: string; available: boolean } | null }
  | { type: 'stateChanged'; change: StateChange };

export interface PluginContext {
  getNearbyInteraction(): { type: string; id: string; promptText?: string; available: boolean } | null;
  getNearbyInteractable(): NearbyInteractable | null;
  getNPCInfo(npcId: string): { id: string; name: string; dialogueId?: string } | undefined;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getRegionInfo(): { path: string; name?: string } | null;
  executeIntent(intent: PluginIntent): Promise<PluginIntentResult>;
  emit(event: PluginEvent): void;
  subscribe(handler: (event: PluginEvent) => void): () => void;
}

export interface EnginePlugin {
  readonly descriptor: PluginDescriptor;
  init(ctx: PluginContext): Promise<void> | void;
  dispose(): Promise<void> | void;
  onUpdate?(delta: number): void;
  onEvent?(event: PluginEvent): void;
  resolveInteraction?(request: InteractionRequest): PluginInteractionResolution | null | Promise<PluginInteractionResolution | null>;
  runAgentTurn?(request: PluginAgentTurnRequest): PluginAgentTurnResult | null | Promise<PluginAgentTurnResult | null>;
  serializeState?(): unknown;
  loadState?(state: unknown): void;
}

export interface PluginHostContext {
  getNearbyInteraction(): { type: string; id: string; promptText?: string; available: boolean } | null;
  getNearbyInteractable(): NearbyInteractable | null;
  getNPCInfo(npcId: string): { id: string; name: string; dialogueId?: string } | undefined;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getRegionInfo(): { path: string; name?: string } | null;
  executeIntent(intent: PluginIntent): Promise<PluginIntentResult>;
}
