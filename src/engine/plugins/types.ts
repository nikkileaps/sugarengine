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

export type PluginInteractionResolution =
  | { type: 'startDialogue'; dialogueId: string }
  | { type: 'intent'; intent: PluginIntent }
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
