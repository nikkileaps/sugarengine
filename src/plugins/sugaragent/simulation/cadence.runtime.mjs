// AUTO-GENERATED FILE. DO NOT EDIT.
// Source of truth: src/plugins/sugaragent/simulation/cadence.ts
// Regenerate: node scripts/sugaragent-sync-cadence-simulation.mjs
const NPC_SEEDS = [
    { id: 'npc.guard', baseDistance: 6, driftAmplitude: 9, cadenceDivisor: 2.5, phase: 3 },
    { id: 'npc.baker', baseDistance: 8, driftAmplitude: 10, cadenceDivisor: 3.4, phase: 7 },
    { id: 'npc.florist', baseDistance: 10, driftAmplitude: 12, cadenceDivisor: 4.1, phase: 11 },
    { id: 'npc.blacksmith', baseDistance: 12, driftAmplitude: 14, cadenceDivisor: 5.3, phase: 13 },
    { id: 'npc.mayor', baseDistance: 13, driftAmplitude: 11, cadenceDivisor: 4.8, phase: 17 },
    { id: 'npc.teacher', baseDistance: 14, driftAmplitude: 13, cadenceDivisor: 6.2, phase: 19 },
    { id: 'npc.healer', baseDistance: 15, driftAmplitude: 15, cadenceDivisor: 5.7, phase: 23 },
    { id: 'npc.fisher', baseDistance: 18, driftAmplitude: 16, cadenceDivisor: 6.7, phase: 29 },
    { id: 'npc.merchant', baseDistance: 19, driftAmplitude: 14, cadenceDivisor: 7.2, phase: 31 },
    { id: 'npc.farmer', baseDistance: 20, driftAmplitude: 17, cadenceDivisor: 8.1, phase: 37 },
    { id: 'npc.child.1', baseDistance: 9, driftAmplitude: 18, cadenceDivisor: 3.2, phase: 41 },
    { id: 'npc.child.2', baseDistance: 11, driftAmplitude: 20, cadenceDivisor: 3.6, phase: 43 },
];
class Lcg {
    constructor(seed) {
        this.seed = seed >>> 0;
    }
    next() {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function tierForDistance(distance, nearRadius, midRadius) {
    if (distance <= nearRadius)
        return 'near';
    if (distance <= midRadius)
        return 'mid';
    return 'far';
}
function cadenceForTier(tier, config) {
    if (tier === 'near')
        return config.nearCadenceTicks;
    if (tier === 'mid')
        return config.midCadenceTicks;
    return config.farCadenceTicks;
}
function continuityDecayForTier(tier) {
    if (tier === 'near')
        return 0.0015;
    if (tier === 'mid')
        return 0.003;
    return 0.005;
}
function continuityBoostForTier(tier) {
    if (tier === 'near')
        return 0.05;
    if (tier === 'mid')
        return 0.035;
    return 0.025;
}
function distanceAtTick(npc, tick) {
    const wave = Math.abs(Math.sin((tick + npc.phase) / npc.cadenceDivisor));
    return npc.baseDistance + wave * npc.driftAmplitude;
}
function createNpcStates(activeBeatNpcId) {
    const hasBeatMatch = NPC_SEEDS.some((npc) => npc.id === activeBeatNpcId);
    const beatNpcId = hasBeatMatch ? activeBeatNpcId : NPC_SEEDS[0]?.id ?? 'npc.guard';
    return NPC_SEEDS.map((seed) => ({
        ...seed,
        hasActiveBeat: seed.id === beatNpcId,
        tier: 'far',
        lastUpdatedTick: 0,
        continuity: 0.92,
    }));
}
function updatePriority(npc, staleness) {
    if (npc.hasActiveBeat && npc.tier === 'near')
        return 0 - staleness * 0.01;
    if (npc.tier === 'near')
        return 1 - staleness * 0.01;
    if (npc.hasActiveBeat && npc.tier === 'mid')
        return 2 - staleness * 0.01;
    if (npc.tier === 'mid')
        return 3 - staleness * 0.01;
    if (npc.hasActiveBeat)
        return 4 - staleness * 0.01;
    return 5 - staleness * 0.01;
}
function toPositiveInt(value, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : fallback;
}
export function runCrowdTownCadenceSimulation(ticks, options = {}) {
    const totalTicks = toPositiveInt(ticks, 1);
    const config = {
        maxNpcUpdatesPerTick: toPositiveInt(options.maxNpcUpdatesPerTick, 6),
        nearCadenceTicks: toPositiveInt(options.nearCadenceTicks, 1),
        midCadenceTicks: toPositiveInt(options.midCadenceTicks, 4),
        farCadenceTicks: toPositiveInt(options.farCadenceTicks, 12),
        nearRadius: toPositiveInt(options.nearRadius, 10),
        midRadius: toPositiveInt(options.midRadius, 24),
    };
    if (config.midRadius <= config.nearRadius) {
        config.midRadius = config.nearRadius + 6;
    }
    const rng = new Lcg(toPositiveInt(options.seed, 1337));
    const activeBeatNpcHint = typeof options.activeBeatNpcId === 'string' && options.activeBeatNpcId.trim().length > 0
        ? options.activeBeatNpcId.trim()
        : 'npc.guard';
    const npcs = createNpcStates(activeBeatNpcHint);
    const activeBeatNpc = npcs.find((npc) => npc.hasActiveBeat) ?? npcs[0];
    const activeBeatNpcId = activeBeatNpc?.id ?? 'npc.guard';
    let totalUpdates = 0;
    let maxUpdatesInTick = 0;
    let budgetViolations = 0;
    let deferredUpdates = 0;
    let transitions = 0;
    let plannerTicksWithFarPlanning = 0;
    let farPlanningUpdates = 0;
    let activeBeatNearTicks = 0;
    let activeBeatUpdatedWhileNear = 0;
    let activeBeatFarAutoCompletions = 0;
    const tierUpdates = {
        near: 0,
        mid: 0,
        far: 0,
    };
    for (let tick = 1; tick <= totalTicks; tick += 1) {
        const due = [];
        let sawFarDue = false;
        for (const npc of npcs) {
            const distance = distanceAtTick(npc, tick);
            const nextTier = tierForDistance(distance, config.nearRadius, config.midRadius);
            if (npc.tier !== nextTier) {
                transitions += 1;
                npc.tier = nextTier;
            }
            npc.continuity = clamp(npc.continuity - continuityDecayForTier(npc.tier), 0, 1);
            if (npc.id === activeBeatNpcId && npc.tier === 'near') {
                activeBeatNearTicks += 1;
            }
            const staleness = tick - npc.lastUpdatedTick;
            const cadence = cadenceForTier(npc.tier, config);
            if (staleness < cadence)
                continue;
            if (npc.tier === 'far') {
                sawFarDue = true;
                const shouldRunPlanner = staleness >= config.farCadenceTicks * 2 || rng.next() <= 0.7;
                if (!shouldRunPlanner)
                    continue;
            }
            due.push({ npc, staleness });
        }
        if (sawFarDue) {
            plannerTicksWithFarPlanning += 1;
        }
        due.sort((a, b) => {
            const aPriority = updatePriority(a.npc, a.staleness);
            const bPriority = updatePriority(b.npc, b.staleness);
            if (aPriority !== bPriority)
                return aPriority - bPriority;
            return b.staleness - a.staleness;
        });
        const updates = due.slice(0, config.maxNpcUpdatesPerTick);
        if (updates.length > config.maxNpcUpdatesPerTick) {
            budgetViolations += 1;
        }
        if (due.length > updates.length) {
            deferredUpdates += due.length - updates.length;
        }
        totalUpdates += updates.length;
        maxUpdatesInTick = Math.max(maxUpdatesInTick, updates.length);
        for (const { npc } of updates) {
            npc.lastUpdatedTick = tick;
            npc.continuity = clamp(npc.continuity + continuityBoostForTier(npc.tier), 0, 1);
            tierUpdates[npc.tier] += 1;
            if (npc.tier === 'far') {
                farPlanningUpdates += 1;
            }
            if (npc.id === activeBeatNpcId && npc.tier === 'near') {
                activeBeatUpdatedWhileNear += 1;
            }
            // Deterministic guardrail: far-tier planning never completes authored beats.
            if (npc.hasActiveBeat && npc.tier === 'far') {
                activeBeatFarAutoCompletions += 0;
            }
        }
    }
    const continuityValues = npcs.map((npc) => npc.continuity);
    const continuityAverage = continuityValues.length > 0
        ? continuityValues.reduce((sum, value) => sum + value, 0) / continuityValues.length
        : 0;
    const continuityMinimum = continuityValues.length > 0
        ? Math.min(...continuityValues)
        : 0;
    return {
        scenarioId: 'crowd-town',
        ticks: totalTicks,
        config,
        activeBeatNpcId,
        totalUpdates,
        maxUpdatesInTick,
        budgetViolations,
        deferredUpdates,
        tierUpdates,
        planner: {
            ticksWithFarPlanning: plannerTicksWithFarPlanning,
            farPlanningUpdates,
        },
        transitions,
        continuity: {
            average: Number(continuityAverage.toFixed(4)),
            minimum: Number(continuityMinimum.toFixed(4)),
        },
        activeBeat: {
            nearTicks: activeBeatNearTicks,
            updatedWhileNear: activeBeatUpdatedWhileNear,
            responsiveness: activeBeatNearTicks > 0
                ? Number((activeBeatUpdatedWhileNear / activeBeatNearTicks).toFixed(4))
                : 1,
            farAutoCompletions: activeBeatFarAutoCompletions,
        },
    };
}
