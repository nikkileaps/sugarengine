export type ConversationEngagementKind = 'scenario' | 'chat' | 'default';
export type ConversationPresentationKind = 'chat_panel' | 'dialogue_panel';
export type ConversationDriverKind = 'host_turn_driven' | 'dialogue_manager_driven';

export type LegacyNPCInteractionMode = 'scripted' | 'agent' | 'hybrid';
export type AgentInteractionPolicy = 'scripted-first' | 'agent-first' | 'fallback';

export interface NPCInteractionCapabilities {
  scenario: {
    enabled: boolean;
    agentAssist: 'disallow' | 'allow';
  };
  chat: {
    enabled: boolean;
  };
}

export const DEFAULT_NPC_INTERACTION_CAPABILITIES: NPCInteractionCapabilities = {
  scenario: {
    enabled: true,
    agentAssist: 'disallow',
  },
  chat: {
    enabled: false,
  },
};

export function createDefaultNPCInteractionCapabilities(): NPCInteractionCapabilities {
  return {
    scenario: {
      enabled: DEFAULT_NPC_INTERACTION_CAPABILITIES.scenario.enabled,
      agentAssist: DEFAULT_NPC_INTERACTION_CAPABILITIES.scenario.agentAssist,
    },
    chat: {
      enabled: DEFAULT_NPC_INTERACTION_CAPABILITIES.chat.enabled,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildInteractionCapabilitiesFromLegacyMode(
  rawMode: unknown,
): NPCInteractionCapabilities {
  if (rawMode === 'agent') {
    return {
      scenario: {
        enabled: false,
        agentAssist: 'disallow',
      },
      chat: {
        enabled: true,
      },
    };
  }

  if (rawMode === 'hybrid') {
    return {
      scenario: {
        enabled: true,
        agentAssist: 'allow',
      },
      chat: {
        enabled: false,
      },
    };
  }

  return createDefaultNPCInteractionCapabilities();
}

export function normalizeNPCInteractionCapabilities(
  raw: unknown,
): NPCInteractionCapabilities {
  if (!isRecord(raw)) {
    return createDefaultNPCInteractionCapabilities();
  }

  const scenarioRaw = isRecord(raw.scenario) ? raw.scenario : {};
  const chatRaw = isRecord(raw.chat) ? raw.chat : {};

  return {
    scenario: {
      enabled: scenarioRaw.enabled === false
        ? false
        : DEFAULT_NPC_INTERACTION_CAPABILITIES.scenario.enabled,
      agentAssist: scenarioRaw.agentAssist === 'allow'
        ? 'allow'
        : DEFAULT_NPC_INTERACTION_CAPABILITIES.scenario.agentAssist,
    },
    chat: {
      enabled: chatRaw.enabled === true,
    },
  };
}

export function normalizeNPCInteractionCapabilitiesFromDocument(
  rawCapabilities: unknown,
  rawLegacyMode?: unknown,
): NPCInteractionCapabilities {
  if (isRecord(rawCapabilities)) {
    return normalizeNPCInteractionCapabilities(rawCapabilities);
  }
  return buildInteractionCapabilitiesFromLegacyMode(rawLegacyMode);
}

export function deriveLegacySugarAgentInteraction(
  capabilities: NPCInteractionCapabilities,
  engagementKind: ConversationEngagementKind,
): {
  interactionMode: LegacyNPCInteractionMode;
  interactionPolicy: AgentInteractionPolicy;
} {
  if (engagementKind === 'chat') {
    return {
      interactionMode: 'agent',
      interactionPolicy: 'agent-first',
    };
  }

  if (capabilities.scenario.agentAssist === 'allow') {
    return {
      interactionMode: 'hybrid',
      interactionPolicy: 'scripted-first',
    };
  }

  return {
    interactionMode: 'scripted',
    interactionPolicy: 'fallback',
  };
}

export function supportsScenarioEngagement(capabilities: NPCInteractionCapabilities): boolean {
  return capabilities.scenario.enabled;
}

export function supportsChatEngagement(capabilities: NPCInteractionCapabilities): boolean {
  return capabilities.chat.enabled;
}
