/**
 * NPCSelector - Inline dropdown select for picking an NPC
 */

export interface NPCOption {
  id: string;
  name: string;
}

export interface NPCSelectorConfig {
  npcs: NPCOption[];
  selectedId?: string;
  placeholder?: string;
  onChange: (npcId: string) => void;
}

/**
 * Creates an inline select dropdown for picking an NPC.
 */
export function createNPCSelector(config: NPCSelectorConfig): HTMLSelectElement {
  const { npcs, selectedId, placeholder = '-- Select NPC --', onChange } = config;

  const select = document.createElement('select');
  select.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #313244;
    border-radius: 6px;
    background: #181825;
    color: #cdd6f4;
    font-size: 13px;
    outline: none;
  `;

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = placeholder;
  select.appendChild(emptyOption);

  for (const npc of npcs) {
    const option = document.createElement('option');
    option.value = npc.id;
    option.textContent = npc.name;
    option.selected = npc.id === selectedId;
    select.appendChild(option);
  }

  select.onchange = () => onChange(select.value);

  return select;
}
