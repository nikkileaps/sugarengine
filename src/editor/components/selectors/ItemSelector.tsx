/**
 * ItemSelector - Mantine Select component for picking an Item
 */

import { Select } from '@mantine/core';

export interface ItemOption {
  id: string;
  name: string;
}

interface ItemSelectorProps {
  items: ItemOption[];
  value?: string;
  onChange: (itemId: string | null) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
}

export function ItemSelector({
  items,
  value,
  onChange,
  placeholder = 'Select Item',
  label,
  required,
  error,
}: ItemSelectorProps) {
  const data = items.map((item) => ({
    value: item.id,
    label: item.name,
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
