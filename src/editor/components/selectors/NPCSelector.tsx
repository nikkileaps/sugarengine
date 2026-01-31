/**
 * NPCSelector - Mantine Select component for picking an NPC
 */

import { Select } from '@mantine/core';

export interface NPCOption {
  id: string;
  name: string;
}

interface NPCSelectorProps {
  npcs: NPCOption[];
  value?: string;
  onChange: (npcId: string | null) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
}

export function NPCSelector({
  npcs,
  value,
  onChange,
  placeholder = 'Select NPC',
  label,
  required,
  error,
}: NPCSelectorProps) {
  const data = npcs.map((npc) => ({
    value: npc.id,
    label: npc.name,
  }));

  return (
    <Select
      label={label}
      placeholder={placeholder}
      data={data}
      value={value || null}
      onChange={onChange}
      searchable
      clearable
      required={required}
      error={error}
    />
  );
}
