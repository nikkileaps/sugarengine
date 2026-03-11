import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { useEffect, useState } from 'react';
interface CompactIdDisplayProps {
  value: string;
  prefixLength?: number;
  size?: 'xs' | 'sm' | 'md';
  color?: string;
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the document-based fallback.
    }
  }

  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function CompactIdDisplay({
  value,
  prefixLength = 8,
  size = 'xs',
  color = 'dimmed',
}: CompactIdDisplayProps) {
  const [copied, setCopied] = useState(false);
  const displayValue = value.length > prefixLength ? value.substring(0, prefixLength) : value;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const success = await copyText(value);
    if (success) {
      setCopied(true);
    }
  };

  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={value}>
        <Text size={size} c={color} ff="monospace">
          {displayValue}
        </Text>
      </Tooltip>
      <Tooltip label={copied ? 'Copied' : 'Copy full ID'}>
        <ActionIcon
          size="xs"
          variant="transparent"
          color={copied ? 'green' : 'gray'}
          onClick={(event) => void handleCopy(event)}
          aria-label={copied ? 'Copied full ID' : 'Copy full ID'}
        >
          <span style={{ fontSize: 11, lineHeight: 1 }}>📋</span>
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
