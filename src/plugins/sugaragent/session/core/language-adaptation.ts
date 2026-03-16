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
} from './turn-contracts';
import type { SugarAgentTurnOutput } from '../../contracts/turn';
import type { PluginPedagogyContext } from '../../../../engine/plugins/types';

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

function normalizeSupportPolicy(
  value: unknown,
): PluginPedagogyContext['supportLanguagePolicy'] | undefined {
  return value === 'full_support'
    || value === 'heavy_support'
    || value === 'light_support'
    || value === 'target_dominant'
    || value === 'target_only'
    ? value
    : undefined;
}

function deriveCodeSwitchPolicy(
  supportLanguagePolicy: PluginPedagogyContext['supportLanguagePolicy'],
): LanguageAdaptationContext['codeSwitchPolicy'] {
  if (supportLanguagePolicy === 'full_support' || supportLanguagePolicy === 'heavy_support' || supportLanguagePolicy === 'light_support') {
    return 'gloss_only';
  }
  return 'none';
}

function deriveBandBounds(
  learnerBand: string | undefined,
): Pick<LanguageAdaptationContext, 'maxSentenceLength' | 'maxClauseDepth'> {
  switch (learnerBand) {
    case 'B0':
      return { maxSentenceLength: 8, maxClauseDepth: 1 };
    case 'B1':
      return { maxSentenceLength: 10, maxClauseDepth: 1 };
    case 'B2':
      return { maxSentenceLength: 12, maxClauseDepth: 2 };
    case 'B3':
      return { maxSentenceLength: 16, maxClauseDepth: 2 };
    case 'B4':
      return { maxSentenceLength: 22, maxClauseDepth: 3 };
    default:
      return {};
  }
}

function deriveFocusVocabulary(
  pedagogyContext: PluginPedagogyContext,
): string[] | undefined {
  const groundingScope = Array.isArray(pedagogyContext.groundingScope)
    ? pedagogyContext.groundingScope
    : [];
  const focusIds = new Set(pedagogyContext.teachingSubset?.focusLexicalEntryIds ?? []);
  const preferredEntries = focusIds.size > 0
    ? groundingScope.filter((entry) => focusIds.has(entry.lexicalEntryId))
    : groundingScope;
  const forms = Array.from(new Set(
    preferredEntries
      .map((entry) => entry.targetForm?.trim())
      .filter((entry): entry is string => Boolean(entry)),
  ));
  return forms.length > 0 ? forms.slice(0, 8) : undefined;
}

export function buildSugarlangLanguageAdaptationContext(
  pedagogyContext: PluginPedagogyContext | null | undefined,
): LanguageAdaptationContext | null {
  if (!pedagogyContext?.targetLanguage) return null;

  const learnerBand = typeof pedagogyContext.learnerBand === 'string'
    ? pedagogyContext.learnerBand
    : undefined;
  const supportLanguagePolicy = normalizeSupportPolicy(pedagogyContext.supportLanguagePolicy);
  const focusVocabulary = deriveFocusVocabulary(pedagogyContext);
  const bandBounds = deriveBandBounds(learnerBand);

  return {
    schemaVersion: 1,
    source: 'sugarlang',
    targetLanguage: pedagogyContext.targetLanguage,
    learnerLevel: learnerBand,
    cefrBand: learnerBand,
    codeSwitchPolicy: deriveCodeSwitchPolicy(supportLanguagePolicy),
    glossBudget: supportLanguagePolicy === 'full_support'
      ? 3
      : supportLanguagePolicy === 'heavy_support'
        ? 2
        : supportLanguagePolicy === 'light_support'
          ? 1
          : 0,
    focusVocabulary,
    ...bandBounds,
  };
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
