# ADR-SA-031: Cross-Plugin Language Adaptation Boundary

## Status

Proposed

## Date

2026-03-13

## Context

SugarAgent is intended to support language-aware NPC conversation, and future work may combine it with SugarLang.

That combination is useful, but only if the boundary remains clean:

1. SugarAgent owns factual planning and conversational grounding,
2. SugarLang may provide language-learning context and adaptation hints,
3. SugarEngine remains the broker and deterministic authority.

Direct plugin-to-plugin imports would create an undesirable dependency chain and blur responsibilities.

## Decision

SugarAgent and SugarLang may cooperate only through host-mediated, optional capability contracts.

Language adaptation must happen after factual planning and before final semantic verification.

Resolving or fetching adaptation context may happen earlier in the turn as ordinary context gathering. What is forbidden is applying adaptation before planning and validation.

## Capability Contract

### Provider side

SugarLang may optionally provide a language adaptation payload.

### Consumer side

SugarAgent may optionally consume that payload.

### Host side

SugarEngine owns:

1. capability discovery,
2. payload transport,
3. lifecycle and error isolation.

## Domain Model

```ts
interface LanguageAdaptationContext {
  schemaVersion: 1;
  source: 'sugaragent' | 'sugarlang' | 'engine';
  targetLanguage: string;
  learnerLevel?: string;
  cefrBand?: string;
  allowedRegisters?: string[];
  bannedRegisters?: string[];
  maxSentenceLength?: number;
  maxClauseDepth?: number;
  codeSwitchPolicy?: 'none' | 'gloss_only' | 'learner_choice';
  glossBudget?: number;
  focusGrammar?: string[];
  focusVocabulary?: string[];
}

interface PluginCapabilityEnvelope {
  provides?: string[];
  consumes?: string[];
}
```

## Ordering Rule

Language adaptation occurs in this order:

1. route,
2. retrieve,
3. plan,
4. validate plan,
5. realize,
6. apply language adaptation,
7. semantic verify,
8. persist.

This ensures language adaptation cannot modify:

1. evidence selection,
2. claim mode,
3. access policy,
4. engine authority.

## Adaptation Rules

1. Adaptation may simplify or restyle wording.
2. Adaptation may adjust sentence length, vocabulary, register, and gloss behavior.
3. Adaptation may not:
   - add claims,
   - remove required hedges,
   - increase specificity,
   - reveal forbidden information,
   - alter beat progression semantics.

## Host-Mediated Algorithm

```ts
async function resolveLanguageAdaptationContext(
  host: PluginHostContext,
  sugarAgentPlayerModel: SugarAgentPlayerModel | null,
): Promise<LanguageAdaptationContext | null> {
  const provider = host.findCapabilityProvider('language_adaptation_context');
  if (provider) {
    const provided = await provider.getCapabilityPayload('language_adaptation_context');
    if (isValidLanguageAdaptationContext(provided)) return provided;
  }

  return sugarAgentPlayerModel
    ? buildLocalLanguageAdaptationContext(sugarAgentPlayerModel)
    : null;
}
```

## Boundary Rules

### SugarEngine

SugarEngine remains the only allowed broker of cross-plugin data.

### SugarAgent

SugarAgent:

1. consumes optional adaptation context,
2. may emit response diagnostics useful to other plugins,
3. does not import or call SugarLang directly.

### SugarLang

SugarLang:

1. may provide adaptation context,
2. may consume SugarAgent response metadata if the host exposes it,
3. does not control SugarAgent retrieval, planning, or verification.

## Failure Policy

If the adaptation payload is:

1. missing,
2. invalid,
3. stale,
4. contradictory to current turn constraints,

SugarAgent must fall back to its local adaptation behavior or to no adaptation at all. Turn correctness must not depend on the external plugin.

## Consequences

Positive:

1. future SugarLang tandem use is possible,
2. plugin roles stay coherent,
3. SugarAgent remains independently usable.

Tradeoff:

1. capability envelopes and host plumbing need versioning,
2. post-adaptation semantic verification is mandatory to keep the boundary safe.

## Acceptance Criteria

1. SugarAgent can operate fully without SugarLang.
2. SugarLang integration, when present, flows only through host-mediated capability payloads.
3. Language adaptation never precedes factual planning.
4. Post-adaptation output still passes SugarAgent semantic verification.
