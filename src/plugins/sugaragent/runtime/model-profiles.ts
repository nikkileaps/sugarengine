// @ts-nocheck
export const DEFAULT_MODEL_PROFILE = 'balanced';

export const MODEL_PROFILES = {
  mobile: {
    id: 'mobile',
    label: 'Mobile',
    description: 'Lowest memory footprint for phones/tablets; lower conversation quality.',
    modelRepo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    modelFileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended default for broad game usage across desktop and newer tablets.',
    modelRepo: 'WariHima/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF',
    modelFileName: 'qwen3-4b-instruct-2507-q5_k_m.gguf',
    fallbackModelRepo: 'WariHima/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF',
    fallbackModelFileName: 'qwen3-4b-instruct-2507-q4_k_m.gguf',
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    description: 'Higher quality for desktop-class devices; larger download and memory usage.',
    modelRepo: 'WariHima/Qwen3-8B-Q4_K_M-GGUF',
    modelFileName: 'qwen3-8b-q4_k_m.gguf',
  },
};

export function getModelProfile(profileId) {
  if (!profileId) return MODEL_PROFILES[DEFAULT_MODEL_PROFILE];
  return MODEL_PROFILES[profileId] ?? null;
}

export function listModelProfiles() {
  return Object.values(MODEL_PROFILES);
}

export function buildModelUrl(profile) {
  return `https://huggingface.co/${profile.modelRepo}/resolve/main/${profile.modelFileName}`;
}
