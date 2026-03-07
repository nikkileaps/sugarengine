import type {
  PluginAgentTurnDiagnostics,
  PluginAgentValidationSource,
} from './types';

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function deriveValidationSource(input: {
  npcOutputValidated?: boolean;
  progressionGateEvaluated?: boolean;
}): PluginAgentValidationSource {
  const npcOutputValidated = input.npcOutputValidated === true;
  const progressionGateEvaluated = input.progressionGateEvaluated === true;
  if (npcOutputValidated && progressionGateEvaluated) return 'npc_output+progression_gate';
  if (npcOutputValidated) return 'npc_output';
  if (progressionGateEvaluated) return 'progression_gate';
  return 'none';
}

export function mergeValidationBoundary(
  validation: PluginAgentTurnDiagnostics['validation'],
  patch: {
    npcOutputValidated?: boolean;
    progressionGateEvaluated?: boolean;
  },
): NonNullable<PluginAgentTurnDiagnostics['validation']> {
  const npcOutputValidated = patch.npcOutputValidated ?? toBoolean(validation?.npcOutputValidated) ?? false;
  const progressionGateEvaluated = patch.progressionGateEvaluated ?? toBoolean(validation?.progressionGateEvaluated) ?? false;
  return {
    ...(validation ?? {}),
    npcOutputValidated,
    progressionGateEvaluated,
    source: deriveValidationSource({
      npcOutputValidated,
      progressionGateEvaluated,
    }),
  };
}
