/**
 * Sugarlang plugin — language-learning overlay for SugarEngine.
 *
 * Sugarlang participates in the ConversationHost pipeline as middleware.
 * It does NOT produce turns (that's the provider's job). Instead it:
 *   - Hydrates pedagogical context (scenario, grounding, learner band)
 *   - Applies support-language and grounding policy
 *   - Shapes response contracts for the provider
 *   - Validates and evaluates player responses
 *   - Extracts learning evidence and analytics
 */

import { PLUGIN_API_VERSION } from '../../engine/plugins/types';
import type { EnginePlugin, PluginContext, PluginEvent } from '../../engine/plugins/types';
import type { SugarlangContentBundle, LearnerState, PlacementOutcome, TurnEvidence } from './types';
import { createEmptyBundle } from './content/loader';
import { createSugarlangMiddleware } from './middleware';
import { createSugarlangScriptedProvider } from './provider';
import { LearnerStateManager } from './learner';
import type { ConversationMiddleware, ConversationProvider } from '../../engine/conversation/types';

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface SugarlangPluginOptions {
  id?: string;
  contentBundle?: SugarlangContentBundle;
  /** Map from NPC ID to the scenario ID that NPC belongs to. */
  npcScenarioMap?: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

interface SugarlangPluginState {
  targetLanguage?: string;
  supportLanguage?: string;
  learnerBandOverride?: string;
  learnerState?: Record<string, unknown>;
  evidence?: TurnEvidence[];
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export function createSugarlangPlugin(options: SugarlangPluginOptions = {}): EnginePlugin & {
  /** Conversation middleware instance for host registration. */
  getMiddleware(): ConversationMiddleware;
  /** Conversation provider instance for host registration. */
  getProvider(): ConversationProvider;
  /** Update runtime language context. */
  setLanguageContext(target?: string, support?: string, bandOverride?: string): void;
  /** Get the content bundle for external access. */
  getContentBundle(): SugarlangContentBundle;
  /** Update NPC-to-scenario mapping. */
  setNpcScenarioMap(map: Map<string, string>): void;
  /** Get the learner state manager. */
  getLearnerStateManager(): LearnerStateManager;
  /** Get the current learner state. */
  getLearnerState(): Readonly<LearnerState>;
  /** Apply a placement outcome to set the learner state. */
  setPlacement(placement: PlacementOutcome): void;
} {
  const id = options.id ?? 'sugarlang';
  const contentBundle = options.contentBundle ?? createEmptyBundle();
  let npcScenarioMap = options.npcScenarioMap ?? new Map<string, string>();
  // Name-based lookup (case-insensitive) for NPC matching when ids are UUIDs.
  let npcNameScenarioMap = new Map<string, string>();

  const state: SugarlangPluginState = {};
  const learnerStateManager = new LearnerStateManager();

  const getScenarioForNpc = (npcId: string, npcName?: string) => {
    // Try id first, then name.
    const byId = npcScenarioMap.get(npcId);
    if (byId) return byId;
    if (npcName) {
      return npcNameScenarioMap.get(npcName.toLowerCase());
    }
    return undefined;
  };

  // Build the middleware.
  const middleware = createSugarlangMiddleware({
    contentBundle,
    getScenarioForNpc,
    learnerStateManager,
  });

  // Build the scripted provider.
  const provider = createSugarlangScriptedProvider({
    contentBundle,
    getScenarioForNpc,
  });

  // -------------------------------------------------------------------------
  // Plugin lifecycle hooks
  // -------------------------------------------------------------------------

  function init(_context: PluginContext): void {
    // Build NPC → scenario mapping from loaded scenarios if not provided.
    if (npcScenarioMap.size === 0) {
      for (const [scenarioId, scenario] of contentBundle.scenarios) {
        for (const npcId of scenario.npcIds) {
          npcScenarioMap.set(npcId, scenarioId);
        }
      }
    }
    // Build name-based lookup for UUID-based NPC ids.
    npcNameScenarioMap = new Map();
    for (const [scenarioId, scenario] of contentBundle.scenarios) {
      if (scenario.npcNames) {
        for (const name of scenario.npcNames) {
          npcNameScenarioMap.set(name.toLowerCase(), scenarioId);
        }
      }
    }
  }

  function onEvent(_event: PluginEvent): void {
    // Phase 2: handle state changes, scene transitions, etc.
  }

  function serializeState(): Record<string, unknown> {
    return {
      ...state,
      learnerState: learnerStateManager.serialize(),
    };
  }

  function loadState(saved: Record<string, unknown>): void {
    if (typeof saved.targetLanguage === 'string') state.targetLanguage = saved.targetLanguage;
    if (typeof saved.supportLanguage === 'string') state.supportLanguage = saved.supportLanguage;
    if (typeof saved.learnerBandOverride === 'string') state.learnerBandOverride = saved.learnerBandOverride;
    if (saved.learnerState && typeof saved.learnerState === 'object') {
      learnerStateManager.loadSerialized(saved.learnerState as Record<string, unknown>);
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    descriptor: {
      id,
      version: '0.1.0',
      apiVersion: PLUGIN_API_VERSION,
    },

    init,
    dispose: () => {},
    onEvent,
    serializeState,
    loadState,

    getMiddleware() {
      return middleware;
    },

    getProvider() {
      return provider;
    },

    setLanguageContext(target?: string, support?: string, bandOverride?: string) {
      state.targetLanguage = target;
      state.supportLanguage = support;
      state.learnerBandOverride = bandOverride;
    },

    getContentBundle() {
      return contentBundle;
    },

    setNpcScenarioMap(map: Map<string, string>) {
      npcScenarioMap = map;
    },

    getLearnerStateManager() {
      return learnerStateManager;
    },

    getLearnerState() {
      return learnerStateManager.getState();
    },

    setPlacement(placement: PlacementOutcome) {
      learnerStateManager.applyPlacement(placement);
    },
  };
}
