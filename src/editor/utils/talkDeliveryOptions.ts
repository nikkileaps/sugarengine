import type { PluginConfigData } from '../store/useEditorStore';

export interface TalkDeliveryOption {
  id: string;
  label: string;
  pluginId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeOption(raw: unknown, defaultPluginId?: string): TalkDeliveryOption | null {
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
  const label = typeof raw.label === 'string' && raw.label.trim().length > 0
    ? raw.label.trim()
    : id;
  const pluginId = typeof raw.pluginId === 'string' && raw.pluginId.trim().length > 0
    ? raw.pluginId.trim()
    : defaultPluginId;
  return {
    id,
    label,
    pluginId,
  };
}

function isPluginEnabled(plugins: PluginConfigData[], pluginId: string): boolean {
  return plugins.some((entry) => entry.id === pluginId && entry.enabled !== false);
}

function readPluginProvidedOptions(plugin: PluginConfigData): TalkDeliveryOption[] {
  if (plugin.enabled === false) return [];
  const raw = plugin.talkDeliveryOptions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeOption(entry, plugin.id))
    .filter((entry): entry is TalkDeliveryOption => entry !== null);
}

const BUILTIN_OPTIONS: TalkDeliveryOption[] = [
  {
    id: 'scripted',
    label: 'Scripted Dialogue',
  },
  {
    id: 'agent',
    label: 'Agent Conversation',
    pluginId: 'sugaragent',
  },
];

export function resolveTalkDeliveryOptions(plugins: PluginConfigData[]): TalkDeliveryOption[] {
  const resolved: TalkDeliveryOption[] = [];
  const seen = new Set<string>();

  const pushIfAvailable = (option: TalkDeliveryOption): void => {
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

  if (!seen.has('scripted')) {
    resolved.unshift({ id: 'scripted', label: 'Scripted Dialogue' });
  }

  return resolved;
}
