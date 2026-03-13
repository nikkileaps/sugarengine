/**
 * ReconciliationModal — review stale turns after a quest sync.
 *
 * Shows a diff view of each stale turn (reviewed/manual content vs freshly
 * generated suggestion). The author can keep their version, accept the new
 * one, or edit inline before accepting.
 */

import { useCallback, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import type { StaleTurnPair } from '../../../plugins/sugarlang/content/reconcile-turns';
import type { SceneTurn } from '../../../plugins/sugarlang/types';

export type ReconciliationDecision = 'keep' | 'accept' | 'edit';

export interface ResolvedTurn {
  turnId: string;
  bandId: string;
  decision: ReconciliationDecision;
  /** The turn content to persist. */
  turn: SceneTurn;
}

interface ReconciliationModalProps {
  opened: boolean;
  stalePairs: StaleTurnPair[];
  onResolve: (resolved: ResolvedTurn[]) => void;
  onClose: () => void;
}

interface PairState {
  decision: ReconciliationDecision | null;
  editedTargetText: string;
  editedInitialDelivery: string;
  editedSupportText: string;
}

export function ReconciliationModal({ opened, stalePairs, onResolve, onClose }: ReconciliationModalProps) {
  const [pairStates, setPairStates] = useState<PairState[]>(() =>
    stalePairs.map((p) => ({
      decision: null,
      editedTargetText: p.existing.targetText,
      editedInitialDelivery: p.existing.initialDelivery ?? '',
      editedSupportText: p.existing.supportText ?? '',
    })),
  );

  // Reset state when pairs change
  const resetForPairs = useCallback((pairs: StaleTurnPair[]) => {
    setPairStates(
      pairs.map((p) => ({
        decision: null,
        editedTargetText: p.existing.targetText,
        editedInitialDelivery: p.existing.initialDelivery ?? '',
        editedSupportText: p.existing.supportText ?? '',
      })),
    );
  }, []);

  // Ensure state matches pairs length (for re-opens with different data)
  if (pairStates.length !== stalePairs.length && stalePairs.length > 0) {
    resetForPairs(stalePairs);
  }

  const updatePair = (index: number, patch: Partial<PairState>) => {
    setPairStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const allResolved = pairStates.every((s) => s.decision !== null);

  const handleBulkKeep = () => {
    setPairStates((prev) => prev.map((s) => (s.decision === null ? { ...s, decision: 'keep' } : s)));
  };

  const handleBulkAccept = () => {
    setPairStates((prev) => prev.map((s) => (s.decision === null ? { ...s, decision: 'accept' } : s)));
  };

  const handleApply = () => {
    const resolved: ResolvedTurn[] = stalePairs.map((pair, i) => {
      const state = pairStates[i]!;
      const decision = state.decision ?? 'keep';

      let turn: SceneTurn;
      switch (decision) {
        case 'accept':
          turn = { ...pair.fresh, stale: false, editStatus: 'generated' };
          break;
        case 'edit':
          turn = {
            ...pair.existing,
            targetText: state.editedTargetText,
            initialDelivery: state.editedInitialDelivery || undefined,
            supportText: state.editedSupportText || undefined,
            stale: false,
            sourceHash: pair.fresh.sourceHash,
          };
          break;
        case 'keep':
        default:
          turn = { ...pair.existing, stale: false };
          break;
      }

      return { turnId: pair.existing.turnId, bandId: pair.bandId, decision, turn };
    });

    onResolve(resolved);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Reconcile Stale Turns"
      size="xl"
      centered
      closeOnClickOutside={false}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {stalePairs.length} turn(s) were edited or reviewed but the source quest content has changed.
          Review each turn and decide whether to keep your version or accept the new suggestion.
        </Text>

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" size="xs" onClick={handleBulkKeep}>
            Keep All Mine
          </Button>
          <Button variant="subtle" size="xs" onClick={handleBulkAccept}>
            Accept All New
          </Button>
        </Group>

        <ScrollArea.Autosize mah="60vh">
          <Stack gap="sm">
            {stalePairs.map((pair, index) => {
              const state = pairStates[index];
              if (!state) return null;

              return (
                <Paper key={pair.existing.turnId} p="sm" withBorder>
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Badge size="xs" variant="light">
                          {pair.bandId}
                        </Badge>
                        <Text size="xs" c="dimmed" truncate style={{ maxWidth: 400 }}>
                          {pair.fresh.sourceEnglishText ?? pair.existing.sourceEnglishText ?? pair.existing.turnId}
                        </Text>
                      </Group>
                      <Badge
                        size="xs"
                        color={pair.existing.editStatus === 'manual' ? 'violet' : 'blue'}
                      >
                        {pair.existing.editStatus ?? 'reviewed'}
                      </Badge>
                    </Group>

                    {/* Current (yours) */}
                    <Paper p="xs" bg="rgba(136, 180, 220, 0.08)" radius="sm">
                      <Text size="xs" fw={600} c="blue.4" mb={4}>
                        Your version
                      </Text>
                      <Text size="sm">{pair.existing.targetText}</Text>
                      {pair.existing.initialDelivery && (
                        <Text size="xs" c="dimmed" mt={2}>
                          Delivery: {pair.existing.initialDelivery}
                        </Text>
                      )}
                      {pair.existing.supportText && (
                        <Text size="xs" c="dimmed" mt={2}>
                          Support: {pair.existing.supportText}
                        </Text>
                      )}
                    </Paper>

                    {/* Fresh (new suggestion) */}
                    <Paper p="xs" bg="rgba(220, 180, 120, 0.08)" radius="sm">
                      <Text size="xs" fw={600} c="yellow.4" mb={4}>
                        New suggestion
                      </Text>
                      <Text size="sm">{pair.fresh.targetText}</Text>
                      {pair.fresh.initialDelivery && (
                        <Text size="xs" c="dimmed" mt={2}>
                          Delivery: {pair.fresh.initialDelivery}
                        </Text>
                      )}
                      {pair.fresh.supportText && (
                        <Text size="xs" c="dimmed" mt={2}>
                          Support: {pair.fresh.supportText}
                        </Text>
                      )}
                    </Paper>

                    {/* Edit area (only shown when decision is 'edit') */}
                    {state.decision === 'edit' && (
                      <Stack gap={4}>
                        <Textarea
                          label="Target text"
                          size="xs"
                          autosize
                          minRows={1}
                          value={state.editedTargetText}
                          onChange={(e) => updatePair(index, { editedTargetText: e.currentTarget.value })}
                        />
                        <Textarea
                          label="Initial delivery"
                          size="xs"
                          autosize
                          minRows={1}
                          value={state.editedInitialDelivery}
                          onChange={(e) => updatePair(index, { editedInitialDelivery: e.currentTarget.value })}
                        />
                        <Textarea
                          label="Support text"
                          size="xs"
                          autosize
                          minRows={1}
                          value={state.editedSupportText}
                          onChange={(e) => updatePair(index, { editedSupportText: e.currentTarget.value })}
                        />
                      </Stack>
                    )}

                    {/* Action buttons */}
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant={state.decision === 'keep' ? 'filled' : 'light'}
                        color="blue"
                        onClick={() => updatePair(index, { decision: 'keep' })}
                      >
                        Keep Mine
                      </Button>
                      <Button
                        size="xs"
                        variant={state.decision === 'accept' ? 'filled' : 'light'}
                        color="yellow"
                        onClick={() => updatePair(index, { decision: 'accept' })}
                      >
                        Accept New
                      </Button>
                      <Button
                        size="xs"
                        variant={state.decision === 'edit' ? 'filled' : 'light'}
                        color="grape"
                        onClick={() => updatePair(index, { decision: 'edit' })}
                      >
                        Edit
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!allResolved} onClick={handleApply}>
            Apply ({pairStates.filter((s) => s.decision !== null).length}/{stalePairs.length})
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
