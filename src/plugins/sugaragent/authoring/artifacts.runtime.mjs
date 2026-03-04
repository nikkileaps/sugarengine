// AUTO-GENERATED FILE. DO NOT EDIT.
// Source of truth: src/plugins/sugaragent/authoring/artifacts.ts
// Regenerate: node scripts/sugaragent-sync-authoring-artifacts.mjs
function toNonEmptyString(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    const entries = value
        .map((entry) => toNonEmptyString(entry))
        .filter((entry) => typeof entry === 'string');
    return Array.from(new Set(entries));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function normalizeProfile(npcId, profile) {
    return {
        npcId,
        persona: toNonEmptyString(profile.persona),
        tone: toNonEmptyString(profile.tone),
        constraints: normalizeStringArray(profile.constraints ?? profile.safetyBounds),
        loreScopes: normalizeStringArray(profile.loreScopes),
        selfEntityId: toNonEmptyString(profile.selfEntityId),
        selfLoreScopes: normalizeStringArray(profile.selfLoreScopes),
        relatedLoreScopes: normalizeStringArray(profile.relatedLoreScopes),
    };
}
function extractGlobalSafetyBounds(project) {
    const values = [];
    values.push(...normalizeStringArray(project.sugaragent?.globalSafetyBounds ?? project.sugaragent?.safetyBounds));
    if (Array.isArray(project.plugins)) {
        for (const plugin of project.plugins) {
            if (!isRecord(plugin) || plugin.id !== 'sugaragent')
                continue;
            values.push(...normalizeStringArray(plugin.globalSafetyBounds ?? plugin.safetyBounds));
        }
    }
    return Array.from(new Set(values));
}
function isValidCompletionRule(value) {
    return value === 'player_ack' || value === 'player_action' || value === 'engine_flag';
}
function isPluginEnabled(project) {
    if (project.sugaragent?.enabled === true) {
        return true;
    }
    if (!Array.isArray(project.plugins))
        return false;
    for (const plugin of project.plugins) {
        if (typeof plugin === 'string') {
            if (plugin === 'sugaragent')
                return true;
            continue;
        }
        if (typeof plugin === 'object'
            && plugin !== null
            && plugin.id === 'sugaragent'
            && plugin.enabled !== false) {
            return true;
        }
    }
    return false;
}
function hasSugarAgentAuthoringData(project) {
    const hasProfile = Array.isArray(project.npcs)
        && project.npcs.some((npc) => npc && typeof npc.id === 'string' && typeof npc.agentProfile === 'object' && npc.agentProfile !== null);
    if (hasProfile)
        return true;
    return Array.isArray(project.quests)
        && project.quests.some((quest) => Array.isArray(quest.agentBeatContracts) && quest.agentBeatContracts.length > 0);
}
function normalizePackedProfile(raw) {
    if (!isRecord(raw))
        return null;
    const npcId = toNonEmptyString(raw.npcId);
    if (!npcId)
        return null;
    return {
        npcId,
        persona: toNonEmptyString(raw.persona),
        tone: toNonEmptyString(raw.tone),
        constraints: normalizeStringArray(raw.constraints ?? raw.safetyBounds),
        loreScopes: normalizeStringArray(raw.loreScopes),
        selfEntityId: toNonEmptyString(raw.selfEntityId),
        selfLoreScopes: normalizeStringArray(raw.selfLoreScopes),
        relatedLoreScopes: normalizeStringArray(raw.relatedLoreScopes),
    };
}
function normalizePackedBeatContract(raw) {
    if (!isRecord(raw))
        return null;
    const id = toNonEmptyString(raw.id);
    const questId = toNonEmptyString(raw.questId);
    const npcId = toNonEmptyString(raw.npcId);
    const objective = toNonEmptyString(raw.objective);
    if (!id || !questId || !npcId || !objective)
        return null;
    const requiredFacts = normalizeStringArray(raw.requiredFacts);
    if (requiredFacts.length === 0)
        return null;
    if (!isValidCompletionRule(raw.completionRule))
        return null;
    const maxTurns = typeof raw.maxTurns === 'number' && Number.isFinite(raw.maxTurns)
        ? Math.max(1, Math.floor(raw.maxTurns))
        : undefined;
    return {
        id,
        questId,
        npcId,
        objective,
        requiredFacts,
        forbiddenFacts: normalizeStringArray(raw.forbiddenFacts),
        completionRule: raw.completionRule,
        completionTarget: toNonEmptyString(raw.completionTarget),
        maxTurns,
        fallbackScriptId: toNonEmptyString(raw.fallbackScriptId),
        stageId: toNonEmptyString(raw.stageId),
        objectiveId: toNonEmptyString(raw.objectiveId),
    };
}
export function parseSugarAgentAuthoringBundle(raw) {
    if (!isRecord(raw) || raw.schemaVersion !== 1)
        return null;
    const generatedAt = toNonEmptyString(raw.generatedAt);
    if (!generatedAt)
        return null;
    const source = isRecord(raw.source) ? raw.source : {};
    const policy = isRecord(raw.policy) ? raw.policy : {};
    const profiles = Array.isArray(raw.profiles)
        ? raw.profiles
            .map((entry) => normalizePackedProfile(entry))
            .filter((entry) => entry !== null)
        : [];
    const beatContracts = Array.isArray(raw.beatContracts)
        ? raw.beatContracts
            .map((entry) => normalizePackedBeatContract(entry))
            .filter((entry) => entry !== null)
        : [];
    const uniqueProfiles = Array.from(new Map(profiles.map((profile) => [profile.npcId, profile])).values());
    const uniqueBeatContracts = Array.from(new Map(beatContracts.map((contract) => [contract.id, contract])).values());
    return {
        schemaVersion: 1,
        generatedAt,
        source: {
            gameId: toNonEmptyString(source.gameId),
            name: toNonEmptyString(source.name),
        },
        policy: {
            globalSafetyBounds: normalizeStringArray(policy.globalSafetyBounds ?? policy.safetyBounds),
        },
        profiles: uniqueProfiles,
        beatContracts: uniqueBeatContracts,
    };
}
export function findSugarAgentProfile(bundle, npcId) {
    if (!bundle || typeof npcId !== 'string' || npcId.trim().length === 0)
        return null;
    const normalizedNpcId = npcId.trim();
    return bundle.profiles.find((profile) => profile.npcId === normalizedNpcId) ?? null;
}
export function findSugarAgentBeatContract(bundle, lookup = {}) {
    if (!bundle)
        return null;
    const byId = toNonEmptyString(lookup.contractId);
    if (byId) {
        return bundle.beatContracts.find((contract) => contract.id === byId) ?? null;
    }
    const byNpc = toNonEmptyString(lookup.npcId);
    if (byNpc) {
        return bundle.beatContracts.find((contract) => contract.npcId === byNpc) ?? null;
    }
    return bundle.beatContracts[0] ?? null;
}
export function buildSugarAgentAuthoringBundle(project) {
    const enabled = isPluginEnabled(project);
    const errors = [];
    const warnings = [];
    if (!enabled) {
        if (hasSugarAgentAuthoringData(project)) {
            warnings.push('SugarAgent authoring fields found, but plugin is not enabled. Fields will be ignored.');
        }
        return {
            enabled: false,
            bundle: null,
            errors,
            warnings,
        };
    }
    const npcs = Array.isArray(project.npcs) ? project.npcs : [];
    const quests = Array.isArray(project.quests) ? project.quests : [];
    const dialogues = Array.isArray(project.dialogues) ? project.dialogues : [];
    const npcIds = new Set(npcs.map((npc) => npc.id));
    const dialogueIds = new Set(dialogues.map((dialogue) => dialogue.id));
    const profiles = [];
    for (const npc of npcs) {
        if (!npc || typeof npc.id !== 'string')
            continue;
        if (!npc.agentProfile || typeof npc.agentProfile !== 'object')
            continue;
        profiles.push(normalizeProfile(npc.id, npc.agentProfile));
    }
    const beatContracts = [];
    const seenContractIds = new Set();
    for (const quest of quests) {
        if (!quest || typeof quest.id !== 'string')
            continue;
        const contracts = Array.isArray(quest.agentBeatContracts) ? quest.agentBeatContracts : [];
        if (contracts.length === 0)
            continue;
        const stageMap = new Map();
        for (const stage of Array.isArray(quest.stages) ? quest.stages : []) {
            if (!stage || typeof stage.id !== 'string')
                continue;
            stageMap.set(stage.id, {
                objectiveIds: new Set(Array.isArray(stage.objectives)
                    ? stage.objectives
                        .map((objective) => (objective && typeof objective.id === 'string' ? objective.id : null))
                        .filter((id) => typeof id === 'string')
                    : []),
            });
        }
        for (const contract of contracts) {
            if (!contract || typeof contract !== 'object') {
                errors.push(`Quest "${quest.id}" has an invalid agentBeatContract entry (must be an object).`);
                continue;
            }
            const id = toNonEmptyString(contract.id);
            if (!id) {
                errors.push(`Quest "${quest.id}" has an agentBeatContract missing required field "id".`);
                continue;
            }
            if (seenContractIds.has(id)) {
                errors.push(`Duplicate SugarAgent beat contract id: "${id}".`);
                continue;
            }
            seenContractIds.add(id);
            const npcId = toNonEmptyString(contract.npcId);
            if (!npcId) {
                errors.push(`Beat contract "${id}" is missing required field "npcId".`);
                continue;
            }
            if (!npcIds.has(npcId)) {
                errors.push(`Beat contract "${id}" references unknown npcId "${npcId}".`);
            }
            const objective = toNonEmptyString(contract.objective);
            if (!objective) {
                errors.push(`Beat contract "${id}" is missing required field "objective".`);
                continue;
            }
            const requiredFacts = normalizeStringArray(contract.requiredFacts);
            if (requiredFacts.length === 0) {
                errors.push(`Beat contract "${id}" must include at least one required fact.`);
                continue;
            }
            if (!isValidCompletionRule(contract.completionRule)) {
                errors.push(`Beat contract "${id}" has invalid completionRule "${String(contract.completionRule)}".`);
                continue;
            }
            const fallbackScriptId = toNonEmptyString(contract.fallbackScriptId);
            if (fallbackScriptId && !dialogueIds.has(fallbackScriptId)) {
                errors.push(`Beat contract "${id}" references unknown fallbackScriptId "${fallbackScriptId}".`);
            }
            const stageId = toNonEmptyString(contract.stageId);
            if (stageId && !stageMap.has(stageId)) {
                errors.push(`Beat contract "${id}" references unknown stageId "${stageId}" in quest "${quest.id}".`);
            }
            const objectiveId = toNonEmptyString(contract.objectiveId);
            if (objectiveId) {
                if (!stageId) {
                    errors.push(`Beat contract "${id}" includes objectiveId but no stageId.`);
                }
                else {
                    const stage = stageMap.get(stageId);
                    if (!stage?.objectiveIds.has(objectiveId)) {
                        errors.push(`Beat contract "${id}" references unknown objectiveId "${objectiveId}" in stage "${stageId}".`);
                    }
                }
            }
            const maxTurns = typeof contract.maxTurns === 'number' && Number.isFinite(contract.maxTurns)
                ? Math.max(1, Math.floor(contract.maxTurns))
                : undefined;
            beatContracts.push({
                id,
                questId: quest.id,
                npcId,
                objective,
                requiredFacts,
                forbiddenFacts: normalizeStringArray(contract.forbiddenFacts),
                completionRule: contract.completionRule,
                completionTarget: toNonEmptyString(contract.completionTarget),
                maxTurns,
                fallbackScriptId,
                stageId,
                objectiveId,
            });
        }
    }
    if (errors.length > 0) {
        return {
            enabled,
            bundle: null,
            errors,
            warnings,
        };
    }
    const globalSafetyBounds = extractGlobalSafetyBounds(project);
    const bundle = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: {
            gameId: toNonEmptyString(project.meta?.gameId),
            name: toNonEmptyString(project.meta?.name),
        },
        policy: {
            globalSafetyBounds,
        },
        profiles,
        beatContracts,
    };
    return {
        enabled,
        bundle,
        errors,
        warnings,
    };
}
