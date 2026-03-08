/**
 * Sugarlang conversation middleware.
 *
 * Participates in the ConversationHost pipeline to inject pedagogical context,
 * support-language policy, grounding metadata, and response contracts into
 * the provider constraint bundle and turn envelope.
 *
 * Stages:
 *   context_hydration  — load scenario brief, grounding map, lexicon for the active scene.
 *   learner_policy     — resolve learner band, apply band policy defaults.
 *   pre_provider       — set response contract, communicative task, grounding scope.
 *   post_provider      — annotate envelope with grounding references, support-language strips.
 *   analysis           — (Phase 2) turn evidence extraction.
 *   telemetry          — (Phase 2) analytics emission.
 */

import type {
  ConversationMiddleware,
  ConversationMiddlewareDescriptor,
  ConversationSession,
  ProviderConstraintBundle,
  ConversationTurnEnvelope,
  GroundingReference,
} from '../../engine/conversation/types';
import type {
  SugarlangContentBundle,
  LearnerBandId,
  BandPolicy,
  GroundingMap,
  ScenarioBrief,
  TurnEvidence,
} from './types';
import type { LearnerStateManager } from './learner';

export interface SugarlangMiddlewareConfig {
  contentBundle: SugarlangContentBundle;
  /** Resolve the active scenario ID for the given NPC (by id or name). */
  getScenarioForNpc(npcId: string, npcName?: string): string | undefined;
  /** Optional learner state manager for band resolution and evidence updates. */
  learnerStateManager?: LearnerStateManager;
}

/**
 * Key used to store sugarlang middleware state on the session.
 */
const MW_KEY = 'sugarlang';

interface SugarlangSessionState {
  scenarioId?: string;
  scenario?: ScenarioBrief;
  groundingMap?: GroundingMap;
  resolvedBand?: LearnerBandId;
  bandPolicy?: BandPolicy;
}

function getState(session: ConversationSession): SugarlangSessionState {
  return (session.middlewareState[MW_KEY] ?? {}) as SugarlangSessionState;
}

function setState(session: ConversationSession, state: SugarlangSessionState): void {
  session.middlewareState[MW_KEY] = state;
}

export function createSugarlangMiddleware(
  config: SugarlangMiddlewareConfig,
): ConversationMiddleware {
  const { contentBundle } = config;

  const descriptor: ConversationMiddlewareDescriptor = {
    id: 'sugarlang',
    stages: [
      'context_hydration',
      'learner_policy',
      'pre_provider',
      'post_provider',
      'analysis',
    ],
    priority: 10,
  };

  function resolveBand(session: ConversationSession): LearnerBandId {
    // Preview override takes priority (for creator testing).
    if (session.learnerBandOverride) {
      return session.learnerBandOverride as LearnerBandId;
    }
    // Use learner state manager if available.
    if (config.learnerStateManager) {
      return config.learnerStateManager.getEffectiveBand();
    }
    return 'B0';
  }

  function findBandPolicy(bandId: LearnerBandId): BandPolicy | undefined {
    return contentBundle.bandPolicies.policies.find((p) => p.bandId === bandId);
  }

  function buildGroundingScope(
    groundingMap: GroundingMap | undefined,
  ): GroundingReference[] | undefined {
    if (!groundingMap || groundingMap.entries.length === 0) return undefined;
    return groundingMap.entries.map((entry) => ({
      conceptId: entry.conceptId,
      targetForm: '', // Resolved later from lexicon
      worldObjectId: entry.worldObjectId,
      worldAttribute: entry.worldAttribute,
      highlightAction: entry.highlightActions[0],
    }));
  }

  // -------------------------------------------------------------------------
  // Stage implementations
  // -------------------------------------------------------------------------

  function contextHydration(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
  ): void {
    const scenarioId = config.getScenarioForNpc(session.npcId, session.npcName);
    if (!scenarioId) return;

    const scenario = contentBundle.scenarios.get(scenarioId);
    const groundingMap = contentBundle.groundingMaps.get(scenarioId);

    const state: SugarlangSessionState = {
      scenarioId,
      scenario,
      groundingMap,
    };
    setState(session, state);

    // Set communicative task from the scenario brief.
    if (scenario) {
      constraints.communicativeTask = scenario.communicativeTask;
      constraints.sceneSemantics = {
        scenarioId,
        activeReferents: scenario.activeReferents,
      };
    }
  }

  function learnerPolicy(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
  ): void {
    const state = getState(session);
    if (!state.scenarioId) return;

    const bandId = resolveBand(session);
    const policy = findBandPolicy(bandId);

    state.resolvedBand = bandId;
    state.bandPolicy = policy;
    setState(session, state);

    constraints.learnerBand = bandId;
    if (policy) {
      constraints.supportLanguagePolicy = policy.supportLanguagePolicy.mixingLevel;
    }
  }

  function preProvider(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
  ): void {
    const state = getState(session);
    if (!state.scenarioId) return;

    // Set grounding scope from the grounding map.
    const scope = buildGroundingScope(state.groundingMap);
    if (scope) {
      constraints.groundingScope = scope;
    }

    // Apply band-specific constraints.
    if (state.bandPolicy) {
      // Set grounding intensity as a hard constraint.
      constraints.hardConstraints['groundingIntensity'] = state.bandPolicy.groundingIntensity;
      // Set allowed response modes as an advisory preference.
      constraints.advisoryPreferences['allowedResponseModes'] = state.bandPolicy.allowedResponseModes;
      // Set support language visibility.
      constraints.advisoryPreferences['showSupportStrip'] = state.bandPolicy.supportLanguagePolicy.showSupportStrip;
      constraints.advisoryPreferences['showGlosses'] = state.bandPolicy.supportLanguagePolicy.showGlosses;
    }
  }

  function postProvider(
    _session: ConversationSession,
    envelope: ConversationTurnEnvelope,
  ): void {
    const state = getState(_session);
    if (!state.scenarioId) return;

    // Extract support text from the provider diagnostics.
    const providerDiag = envelope.providerDiagnostics as
      | { supportText?: string; turnId?: string; teachingConcepts?: string[]; lastTurnEvidence?: TurnEvidence }
      | undefined;

    // Annotate the envelope with sugarlang metadata.
    envelope.middlewareAnnotations[MW_KEY] = {
      scenarioId: state.scenarioId,
      resolvedBand: state.resolvedBand,
      supportLanguagePolicy: state.bandPolicy?.supportLanguagePolicy.mixingLevel,
      showSupportStrip: state.bandPolicy?.supportLanguagePolicy.showSupportStrip ?? false,
      showGlosses: state.bandPolicy?.supportLanguagePolicy.showGlosses ?? false,
      supportText: providerDiag?.supportText,
      turnId: providerDiag?.turnId,
      teachingConcepts: providerDiag?.teachingConcepts,
    };
  }

  function analysis(
    _session: ConversationSession,
    envelope: ConversationTurnEnvelope,
  ): void {
    const state = getState(_session);
    if (!state.scenarioId) return;

    // Extract turn evidence from provider diagnostics.
    const providerDiag = envelope.providerDiagnostics as
      | { lastTurnEvidence?: TurnEvidence }
      | undefined;

    if (providerDiag?.lastTurnEvidence && config.learnerStateManager) {
      config.learnerStateManager.updateFromEvidence(providerDiag.lastTurnEvidence);
    }
  }

  // -------------------------------------------------------------------------
  // Middleware interface
  // -------------------------------------------------------------------------

  return {
    descriptor,

    beforeProvider(
      session: ConversationSession,
      constraints: ProviderConstraintBundle,
      stage: 'context_hydration' | 'learner_policy' | 'pre_provider',
    ): void {
      switch (stage) {
        case 'context_hydration':
          contextHydration(session, constraints);
          break;
        case 'learner_policy':
          learnerPolicy(session, constraints);
          break;
        case 'pre_provider':
          preProvider(session, constraints);
          break;
      }
    },

    afterProvider(
      session: ConversationSession,
      envelope: ConversationTurnEnvelope,
      stage: 'post_provider' | 'analysis' | 'telemetry',
    ): void {
      switch (stage) {
        case 'post_provider':
          postProvider(session, envelope);
          break;
        case 'analysis':
          analysis(session, envelope);
          break;
      }
    },
  };
}
