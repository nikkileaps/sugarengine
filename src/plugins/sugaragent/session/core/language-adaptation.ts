/**
 * @fileoverview Cross-plugin language adaptation boundary.
 *
 * Implements: ADR-SA-031
 *
 * Language adaptation occurs after factual planning and before final semantic verification.
 * SugarAgent and SugarLang cooperate only through host-mediated, optional capability contracts.
 *
 * Ordering rule:
 * 1. route → 2. retrieve → 3. plan → 4. validate plan →
 * 5. realize → 6. apply language adaptation → 7. semantic verify → 8. persist
 */

import type {
  LanguageAdaptationContext,
  NpcStateSnapshot,
} from './turn-contracts';
import type { SugarAgentTurnOutput } from '../../contracts/turn';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidLanguageAdaptationContext(
  value: unknown,
): value is LanguageAdaptationContext {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return false;
  if (typeof record.targetLanguage !== 'string' || record.targetLanguage.trim().length === 0) return false;
  if (typeof record.source !== 'string') return false;
  if (record.source !== 'sugaragent' && record.source !== 'sugarlang' && record.source !== 'engine') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Context resolution
// ---------------------------------------------------------------------------

interface PluginHostCapabilityProvider {
  getCapabilityPayload(capabilityId: string): Promise<unknown>;
}

interface PluginHostContext {
  findCapabilityProvider?(capabilityId: string): PluginHostCapabilityProvider | null;
}

interface SugarAgentPlayerModel {
  targetLanguage?: string;
  estimatedLevel?: string;
  confidence?: number;
}

export async function resolveLanguageAdaptationContext(
  hostContext: PluginHostContext | null,
  sugarAgentPlayerModel: SugarAgentPlayerModel | null,
): Promise<LanguageAdaptationContext | null> {
  // Try host-mediated provider first (SugarLang if present)
  if (hostContext?.findCapabilityProvider) {
    const provider = hostContext.findCapabilityProvider('language_adaptation_context');
    if (provider) {
      try {
        const provided = await provider.getCapabilityPayload('language_adaptation_context');
        if (isValidLanguageAdaptationContext(provided)) return provided;
      } catch {
        // Fall through to local adaptation
      }
    }
  }

  // Fall back to SugarAgent-local adaptation from player model
  if (sugarAgentPlayerModel?.targetLanguage) {
    return buildLocalLanguageAdaptationContext(sugarAgentPlayerModel);
  }

  return null;
}

function buildLocalLanguageAdaptationContext(
  playerModel: SugarAgentPlayerModel,
): LanguageAdaptationContext | null {
  if (!playerModel.targetLanguage) return null;

  return {
    schemaVersion: 1,
    source: 'sugaragent',
    targetLanguage: playerModel.targetLanguage,
    learnerLevel: playerModel.estimatedLevel,
    codeSwitchPolicy: 'none',
  };
}

// ---------------------------------------------------------------------------
// Adaptation application
// ---------------------------------------------------------------------------

/**
 * Applies language adaptation to a realized turn output.
 * This is a post-plan, pre-verification step.
 *
 * For the initial rollout, adaptation is lightweight:
 * - No LLM call (that's reserved for future online helper)
 * - Just metadata attachment so downstream verification knows adaptation was applied
 *
 * Full adaptation with wording changes would require an LLM call and is deferred
 * to Plan 002 (online advanced LLM follow-up).
 */
export function applyLanguageAdaptation(
  turnOutput: SugarAgentTurnOutput,
  adaptationContext: LanguageAdaptationContext | null,
): SugarAgentTurnOutput {
  if (!adaptationContext) return turnOutput;

  // For the initial rollout, adaptation context is gathered but not actively
  // applied to wording. The context is available for:
  // 1. Diagnostic reporting
  // 2. Future realization integration
  // 3. Post-turn learning analysis by SugarLang (if present)
  return turnOutput;
}
