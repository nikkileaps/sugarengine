import type { PluginConfigData } from '../store/useEditorStore';

export interface NPCInteractionOption {
  id: 'scenario' | 'chat' | string;
  label: string;
  description?: string;
  pluginId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPluginEnabled(plugins: PluginConfigData[], pluginId: string): boolean {
  return plugins.some((entry) => entry.id === pluginId && entry.enabled !== false);
}

function normalizeOption(raw: unknown, defaultPluginId?: string): NPCInteractionOption | null {
  if (typeof raw === 'string') {
    const id = raw.trim();
    if (id.length === 0) return null;
    return {
      id,
      label: id,
      pluginId: defaultPluginId,
    };
  }
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id.length === 0) return null;
  return {
    id,
    label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : id,
    description: typeof raw.description === 'string' && raw.description.trim().length > 0
      ? raw.description.trim()
      : undefined,
    pluginId: typeof raw.pluginId === 'string' && raw.pluginId.trim().length > 0
      ? raw.pluginId.trim()
      : defaultPluginId,
  };
}

function readPluginProvidedOptions(plugin: PluginConfigData): NPCInteractionOption[] {
  if (plugin.enabled === false) return [];
  if (!Array.isArray(plugin.npcInteractionOptions)) return [];
  return plugin.npcInteractionOptions
    .map((entry) => normalizeOption(entry, plugin.id))
    .filter((entry): entry is NPCInteractionOption => entry !== null);
}

const BUILTIN_OPTIONS: NPCInteractionOption[] = [
  {
    id: 'scenario',
    label: 'Scenario / Scripted',
    description: 'Structured dialogue or sugarlang-authored scenario interaction.',
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Free conversation through a chat-capable provider.',
    pluginId: 'sugaragent',
  },
];

export function resolveNPCInteractionOptions(
  plugins: PluginConfigData[],
): NPCInteractionOption[] {
  const resolved: NPCInteractionOption[] = [];
  const seen = new Set<string>();

  const pushIfAvailable = (option: NPCInteractionOption): void => {
    if (seen.has(option.id)) return;
    if (option.pluginId && !isPluginEnabled(plugins, option.pluginId)) return;
    seen.add(option.id);
    resolved.push(option);
  };

  for (const option of BUILTIN_OPTIONS) {
    pushIfAvailable(option);
  }

  for (const plugin of plugins) {
    for (const option of readPluginProvidedOptions(plugin)) {
      pushIfAvailable(option);
    }
  }

  if (!seen.has('scenario')) {
    resolved.unshift(BUILTIN_OPTIONS[0]!);
  }

  return resolved;
}
