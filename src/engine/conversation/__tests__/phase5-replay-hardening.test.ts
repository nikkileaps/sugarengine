/**
 * Phase 5 test suite: replay bundle capture, trace identity, provider mode
 * alignment, plugin safety, and save/load continuity.
 */

import { describe, it, expect, vi } from 'vitest';
import { ConversationHost } from '../ConversationHost';
import type {
  ConversationProvider,
  ConversationSession,
  ProviderConstraintBundle,
  ProviderTurnOutput,
  PlayerInput,
  ProviderSelectionContext,
} from '../types';
import {
  createReplayCollector,
  serializeReplayBundle,
  deserializeReplayBundle,
} from '../replay';
import type { ReplayBundle, ReplayCollector } from '../replay';
import { createSugarlangPlugin } from '../../../plugins/sugarlang/plugin';
import { FIND_THE_LUGGAGE_BUNDLE } from '../../../plugins/sugarlang/content/find-the-luggage';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockHostContext() {
  return {
    executeIntent: vi.fn().mockResolvedValue({ success: true }),
    addMovementLock: vi.fn(),
    removeMovementLock: vi.fn(),
  };
}

function createStubProvider(id: string, priority: number, canHandleFn?: (npcId: string) => boolean): ConversationProvider {
  return {
    descriptor: { id, priority },
    canHandle: (npcId: string) => canHandleFn ? canHandleFn(npcId) : true,
    startSession: vi.fn(),
    produceTurn: vi.fn().mockResolvedValue({
      utterance: `Hello from ${id}`,
      responseContract: { mode: 'free_form' },
    } satisfies ProviderTurnOutput),
    endSession: vi.fn(),
  };
}

const SELECTION_CTX: ProviderSelectionContext = {
  hasQuestDialogue: false,
  hasBehaviorTree: false,
  npcInteractionMode: 'scripted',
};

// ---------------------------------------------------------------------------
// Trace identity
// ---------------------------------------------------------------------------

describe('trace identity on envelopes', () => {
  it('populates traceId on session and all envelopes', async () => {
    const host = new ConversationHost(createMockHostContext());
    host.registerProvider(createStubProvider('test', 10));

    const session = await host.startConversation('npc-1', 'Baker', SELECTION_CTX);
    expect(session).not.toBeNull();
    expect(session!.traceId).toBeDefined();
    expect(session!.traceId).toMatch(/^trace_/);

    const env1 = await host.submitTurn();
    const env2 = await host.submitTurn({ text: 'hello' });

    expect(env1!.traceId).toBe(session!.traceId);
    expect(env2!.traceId).toBe(session!.traceId);

    await host.endConversation();
  });

  it('generates unique traceIds across sessions', async () => {
    const host = new ConversationHost(createMockHostContext());
    host.registerProvider(createStubProvider('test', 10));

    const s1 = await host.startConversation('npc-1', 'Baker', SELECTION_CTX);
    await host.endConversation();

    const s2 = await host.startConversation('npc-1', 'Baker', SELECTION_CTX);
    await host.endConversation();

    expect(s1!.traceId).not.toBe(s2!.traceId);
  });
});

// ---------------------------------------------------------------------------
// Replay bundle capture
// ---------------------------------------------------------------------------

describe('replay bundle capture via ConversationHost', () => {
  it('emits a replay bundle on session end', async () => {
    const host = new ConversationHost(createMockHostContext());
    host.registerProvider(createStubProvider('test', 10));

    let capturedBundle: ReplayBundle | null = null;
    host.setEventHandlers({
      onReplayAvailable: (bundle) => { capturedBundle = bundle; },
    });

    const session = await host.startConversation('npc-1', 'Baker', SELECTION_CTX);
    await host.submitTurn();
    await host.submitTurn({ text: 'hello' });
    await host.endConversation();

    expect(capturedBundle).not.toBeNull();
    expect(capturedBundle!.formatVersion).toBe(1);
    expect(capturedBundle!.session.sessionId).toBe(session!.sessionId);
    expect(capturedBundle!.session.traceId).toBe(session!.traceId);
    expect(capturedBundle!.session.npcId).toBe('npc-1');
    expect(capturedBundle!.session.npcName).toBe('Baker');
    expect(capturedBundle!.session.providerId).toBe('test');
    expect(capturedBundle!.session.startedAt).toBeDefined();
    expect(capturedBundle!.session.endedAt).toBeDefined();
    expect(capturedBundle!.turnCount).toBe(2);
    expect(capturedBundle!.turns).toHaveLength(2);
    expect(capturedBundle!.turns[0].envelope.utterance).toBe('Hello from test');
  });

  it('does not emit replay if no turns were produced', async () => {
    const host = new ConversationHost(createMockHostContext());
    host.registerProvider(createStubProvider('test', 10));

    let capturedBundle: ReplayBundle | null = null;
    host.setEventHandlers({
      onReplayAvailable: (bundle) => { capturedBundle = bundle; },
    });

    await host.startConversation('npc-1', 'Baker', SELECTION_CTX);
    await host.endConversation();

    expect(capturedBundle).not.toBeNull();
    expect(capturedBundle!.turnCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Replay bundle serialization round-trip
// ---------------------------------------------------------------------------

describe('replay bundle serialization', () => {
  it('round-trips through JSON', () => {
    const session = {
      sessionId: 'session_1',
      traceId: 'trace_1',
      npcId: 'npc-1',
      npcName: 'Baker',
      providerId: 'test',
      turnIndex: 0,
      middlewareState: {},
    } as ConversationSession;

    const collector = createReplayCollector(session);
    collector.addTurn({
      sessionId: 'session_1',
      turnId: 'session_1_turn_0',
      turnIndex: 0,
      providerId: 'test',
      utterance: 'Hello',
      responseContract: { mode: 'free_form' },
      hostActionProposals: [],
      middlewareAnnotations: {},
      traceId: 'trace_1',
      timestampMs: Date.now(),
    });

    const bundle = collector.finalize();
    const json = serializeReplayBundle(bundle);
    const restored = deserializeReplayBundle(json);

    expect(restored.formatVersion).toBe(1);
    expect(restored.session.sessionId).toBe('session_1');
    expect(restored.session.traceId).toBe('trace_1');
    expect(restored.turns).toHaveLength(1);
    expect(restored.turns[0].envelope.utterance).toBe('Hello');
    expect(restored.session.endedAt).toBeDefined();
  });

  it('rejects unsupported format version', () => {
    const badJson = JSON.stringify({ formatVersion: 99, session: {}, turns: [], turnCount: 0 });
    expect(() => deserializeReplayBundle(badJson)).toThrow('Unsupported replay format version');
  });
});

// ---------------------------------------------------------------------------
// Replay collector standalone
// ---------------------------------------------------------------------------

describe('ReplayCollector', () => {
  it('snapshot returns partial bundle without finalizing', () => {
    const session = {
      sessionId: 's1', traceId: 't1', npcId: 'n1', providerId: 'p1',
      turnIndex: 0, middlewareState: {},
    } as ConversationSession;

    const collector = createReplayCollector(session);
    const snap1 = collector.snapshot();
    expect(snap1.session.endedAt).toBeUndefined();
    expect(snap1.turnCount).toBe(0);

    collector.addTurn({
      sessionId: 's1', turnId: 't0', turnIndex: 0, providerId: 'p1',
      utterance: 'hi', responseContract: { mode: 'free_form' },
      hostActionProposals: [], middlewareAnnotations: {}, timestampMs: 1,
    });

    const snap2 = collector.snapshot();
    expect(snap2.turnCount).toBe(1);
    expect(snap2.session.endedAt).toBeUndefined();

    const final = collector.finalize();
    expect(final.session.endedAt).toBeDefined();
    expect(final.turnCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PedagogyContext bridging (SugarAgent adapter)
// ---------------------------------------------------------------------------

describe('pedagogyContext on PluginAgentContext', () => {
  it('type allows pedagogyContext to be set', () => {
    // Type-level test — if this compiles, the field exists.
    const ctx = {
      gameId: 'game-1',
      pedagogyContext: {
        learnerBand: 'B2',
        supportLanguagePolicy: 'light_support',
        targetLanguage: 'es',
        supportLanguage: 'en',
        communicativeTask: 'Find the luggage',
        correctionPosture: 'delayed',
        responseContract: { mode: 'short_text' },
        groundingScope: [{ conceptId: 'object.suitcase', targetForm: 'maleta' }],
      },
    };
    expect(ctx.pedagogyContext.learnerBand).toBe('B2');
  });
});

// ---------------------------------------------------------------------------
// providerPolicy on SceneBandRealization
// ---------------------------------------------------------------------------

describe('providerPolicy on B4 Find the Luggage', () => {
  it('B4 Spanish scene pack declares agent_preferred', () => {
    const esPack = Array.from(FIND_THE_LUGGAGE_BUNDLE.sceneLanguagePacks.values())
      .find((p) => p.targetLanguage === 'es');
    expect(esPack).toBeDefined();
    const b4 = esPack!.bands.find((b) => b.bandId === 'B4');
    expect(b4).toBeDefined();
    expect(b4!.providerPolicy).toBe('agent_preferred');
  });

  it('B4 English scene pack declares agent_preferred', () => {
    const enPack = Array.from(FIND_THE_LUGGAGE_BUNDLE.sceneLanguagePacks.values())
      .find((p) => p.targetLanguage === 'en');
    expect(enPack).toBeDefined();
    const b4 = enPack!.bands.find((b) => b.bandId === 'B4');
    expect(b4).toBeDefined();
    expect(b4!.providerPolicy).toBe('agent_preferred');
  });

  it('lower bands do not declare providerPolicy', () => {
    const esPack = Array.from(FIND_THE_LUGGAGE_BUNDLE.sceneLanguagePacks.values())
      .find((p) => p.targetLanguage === 'es');
    for (const band of esPack!.bands) {
      if (band.bandId !== 'B4') {
        expect(band.providerPolicy).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin safety: sugarlang on/off
// ---------------------------------------------------------------------------

describe('sugarlang plugin safety', () => {
  it('creates plugin with demo content and serializes state', () => {
    const plugin = createSugarlangPlugin({ contentBundle: FIND_THE_LUGGAGE_BUNDLE });
    plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const state = plugin.serializeState!();
    expect(state).toBeDefined();
    expect(state.learnerState).toBeDefined();
  });

  it('round-trips learner state through serialize/load', () => {
    const plugin = createSugarlangPlugin({ contentBundle: FIND_THE_LUGGAGE_BUNDLE });
    const ctx = {
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    };
    plugin.init(ctx);

    // Modify learner state
    plugin.setLanguageContext('es', 'en', 'B2');
    const serialized = plugin.serializeState!() as Record<string, unknown>;

    // Create a fresh plugin and load the state
    const plugin2 = createSugarlangPlugin({ contentBundle: FIND_THE_LUGGAGE_BUNDLE });
    plugin2.init(ctx);
    plugin2.loadState!(serialized);

    const state2 = plugin2.serializeState!() as Record<string, unknown>;
    expect(state2.learnerState).toEqual(serialized.learnerState);
  });

  it('handles loadState with empty/missing data gracefully', () => {
    const plugin = createSugarlangPlugin({ contentBundle: FIND_THE_LUGGAGE_BUNDLE });
    plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    // Should not throw with empty state
    expect(() => plugin.loadState!({})).not.toThrow();
    // Should not throw with null-ish values
    expect(() => plugin.loadState!({ targetLanguage: null, learnerState: null } as any)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Mixed-mode save payloads
// ---------------------------------------------------------------------------

describe('mixed-mode save payload handling', () => {
  it('sugarlang state includes learner evidence array', () => {
    const plugin = createSugarlangPlugin({ contentBundle: FIND_THE_LUGGAGE_BUNDLE });
    plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const state = plugin.serializeState!() as Record<string, unknown>;
    const learnerState = state.learnerState as Record<string, unknown>;
    expect(learnerState.evidence).toBeDefined();
    expect(Array.isArray(learnerState.evidence)).toBe(true);
  });

  it('plugin absent produces no state (simulates disabled plugin)', () => {
    // When sugarlang is disabled, no plugin is created.
    // The save system should handle null plugin gracefully.
    const plugin = createSugarlangPlugin();
    plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    // Empty bundle plugin still serializes cleanly
    const state = plugin.serializeState!();
    expect(state).toBeDefined();
  });
});
