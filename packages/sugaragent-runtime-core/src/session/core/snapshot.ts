import type { NpcStateSnapshot } from './turn-contracts.js';

interface BuildNpcStateSnapshotInput {
  npcId?: unknown;
  npcName?: unknown;
  selfEntityId?: unknown;
  mode?: unknown;
  locationId?: unknown;
  currentActivity?: unknown;
  currentGoal?: unknown;
  activeBeatId?: unknown;
}

export function buildNpcStateSnapshot(input: BuildNpcStateSnapshotInput): NpcStateSnapshot {
  const npcId = typeof input.npcId === 'string' ? input.npcId : '';
  const npcName = typeof input.npcName === 'string' ? input.npcName : '';
  const selfEntityId = typeof input.selfEntityId === 'string' ? input.selfEntityId : undefined;
  const mode = input.mode === 'narrative' || input.mode === 'hybrid' ? input.mode : 'character';

  return {
    npcId,
    npcName,
    selfEntityId,
    mode,
    locationId: typeof input.locationId === 'string' ? input.locationId : undefined,
    currentActivity: typeof input.currentActivity === 'string' ? input.currentActivity : undefined,
    currentGoal: typeof input.currentGoal === 'string' ? input.currentGoal : undefined,
    activeBeatId: typeof input.activeBeatId === 'string' ? input.activeBeatId : undefined,
    deliveryLanguageContext: null,
  };
}
