/**
 * @fileoverview Cross-plugin delivery-language context and diagnostics.
 *
 * Implements: ADR-SA-031
 *
 * SugarAgent and SugarLang cooperate only through host-mediated, optional
 * capability contracts. This module owns:
 * - validation and construction of delivery-language context
 * - delivery-contract derived bounds for final realization
 * - lightweight language estimation for runtime diagnostics
 *
 * It does not own post-hoc translation. Grounded replies are realized directly
 * in the target language by the runtime plan-realization path.
 */

import type {
  LanguageAdaptationContext,
} from './turn-contracts';
import type { PluginPedagogyContext } from '../../../../engine/plugins/types';
import { normalizeDeliveryContract } from './delivery-contract';

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
  if (record.supportLanguage !== undefined && typeof record.supportLanguage !== 'string') return false;
  if (record.supportLanguagePolicy !== undefined && typeof record.supportLanguagePolicy !== 'string') return false;
  if (record.correctionPosture !== undefined && typeof record.correctionPosture !== 'string') return false;
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

function deriveDeliveryBounds(
  pedagogyContext: PluginPedagogyContext,
): Pick<LanguageAdaptationContext, 'maxSentenceLength' | 'maxClauseDepth'> {
  const deliveryContract = normalizeDeliveryContract(pedagogyContext.deliveryContract);
  if (!deliveryContract) return {};
  return {
    maxSentenceLength: deliveryContract.maxSentenceLength,
    maxClauseDepth: deliveryContract.maxClauseDepth,
  };
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
  const deliveryBounds = deriveDeliveryBounds(pedagogyContext);

  return {
    schemaVersion: 1,
    source: 'sugarlang',
    targetLanguage: pedagogyContext.targetLanguage,
    supportLanguage: normalizeOptionalString(pedagogyContext.supportLanguage),
    supportLanguagePolicy,
    correctionPosture: normalizeOptionalString(pedagogyContext.correctionPosture),
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
    ...deliveryBounds,
  };
}

export async function resolveLanguageAdaptationContext(
  hostContext: PluginHostContext | null,
  sugarAgentPlayerModel: SugarAgentPlayerModel | null,
): Promise<LanguageAdaptationContext | null> {
  // Try host-mediated provider first (SugarLang if present).
  if (hostContext?.findCapabilityProvider) {
    const provider = hostContext.findCapabilityProvider('language_adaptation_context');
    if (provider) {
      try {
        const provided = await provider.getCapabilityPayload('language_adaptation_context');
        if (isValidLanguageAdaptationContext(provided)) return provided;
      } catch {
        // Fall through to SugarAgent-local delivery language context.
      }
    }
  }

  // Fall back to SugarAgent-local delivery language context from player model.
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

const LANGUAGE_ESTIMATE_STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'are', 'is', 'we', 'you', 'do', 'about', 'right', 'now', 'where', 'anything'],
  es: ['el', 'la', 'los', 'las', 'y', 'de', 'del', 'en', 'que', 'no', 'lo', 'se', 'como', 'bien', 'mucho', 'gusto', 'estoy', 'estas', 'esta', 'estamos', 'justo', 'fuera', 'pueblo', 'hola', 'soy', 'tu', 'claro', 'entiendo'],
  fr: ['le', 'la', 'les', 'et', 'de', 'des', 'est', 'bonjour', 'je', 'tu', 'nous', 'ou'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ich', 'du', 'wir', 'wo', 'hallo'],
  it: ['il', 'lo', 'la', 'e', 'di', 'che', 'sono', 'sei', 'ciao', 'noi', 'dove'],
  pt: ['o', 'a', 'os', 'as', 'e', 'de', 'que', 'ola', 'eu', 'voce', 'onde', 'estamos'],
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value.trim().toLowerCase().split(/[-_]/)[0] ?? null;
}

function tokenizeForLanguageEstimate(text: unknown): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export interface LanguageEstimate {
  estimatedLanguage: string;
  scoreByLanguage: Record<string, number>;
  mismatchSuspected: boolean;
}

export function estimateTextLanguage(
  text: unknown,
  targetLanguage?: unknown,
): LanguageEstimate {
  const target = normalizeLanguageCode(targetLanguage);
  const tokens = tokenizeForLanguageEstimate(text);
  if (tokens.length === 0) {
    return {
      estimatedLanguage: 'unknown',
      scoreByLanguage: {},
      mismatchSuspected: false,
    };
  }

  const scoreByLanguage: Record<string, number> = {};
  for (const [language, stopwords] of Object.entries(LANGUAGE_ESTIMATE_STOPWORDS)) {
    const stopwordSet = new Set(stopwords);
    scoreByLanguage[language] = tokens.reduce((score, token) => (
      stopwordSet.has(token) ? score + 1 : score
    ), 0);
  }

  const ranked = Object.entries(scoreByLanguage).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] <= 0) {
    return {
      estimatedLanguage: 'unknown',
      scoreByLanguage,
      mismatchSuspected: false,
    };
  }

  const second = ranked[1];
  const estimatedLanguage = second && second[1] === top[1]
    ? `ambiguous:${top[0]}|${second[0]}`
    : top[0];

  return {
    estimatedLanguage,
    scoreByLanguage,
    mismatchSuspected: Boolean(
      target
      && estimatedLanguage !== 'unknown'
      && !estimatedLanguage.startsWith('ambiguous:')
      && estimatedLanguage !== target
    ),
  };
}
