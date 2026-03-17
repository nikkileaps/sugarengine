export { ConversationHost } from './ConversationHost';
export type {
  ConversationDriverKind,
  ConversationEngagementKind,
  ConversationPresentationKind,
  NPCInteractionCapabilities,
  LegacyNPCInteractionMode,
  AgentInteractionPolicy,
} from './interactionCapabilities';
export {
  DEFAULT_NPC_INTERACTION_CAPABILITIES,
  createDefaultNPCInteractionCapabilities,
  buildInteractionCapabilitiesFromLegacyMode,
  normalizeNPCInteractionCapabilities,
  normalizeNPCInteractionCapabilitiesFromDocument,
  deriveLegacySugarAgentInteraction,
  supportsScenarioEngagement,
  supportsChatEngagement,
} from './interactionCapabilities';
export type {
  ConversationHostContext,
  ConversationHostEventHandlers,
  LanguageContext,
} from './ConversationHost';

export { ScriptedDialogueProvider } from './ScriptedDialogueProvider';

export { SugarAgentProviderAdapter } from './SugarAgentProviderAdapter';
export type { SugarAgentAdapterContext } from './SugarAgentProviderAdapter';

export type {
  ConversationSession,
  ResponseContract,
  ResponseContractMode,
  GroundingReference,
  GroundingMetadata,
  TeachingSubset,
  AmbientHaloAllowance,
  ProviderConstraintBundle,
  ConversationTurnEnvelope,
  ConversationProvider,
  ConversationProviderDescriptor,
  ConversationEngagementOption,
  ProviderSelectionContext,
  PlayerInput,
  ProviderTurnOutput,
  ConversationMiddleware,
  ConversationMiddlewareDescriptor,
  ConversationMiddlewareStage,
  ConversationCapability,
} from './types';
