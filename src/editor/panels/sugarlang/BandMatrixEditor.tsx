/**
 * BandMatrixEditor — matrix view of band policies (B0–B4).
 *
 * Editable fields per band: supportLanguagePolicy (mixingLevel, showSupportStrip,
 * showGlosses), groundingIntensity, correctionPosture, allowedResponseModes,
 * and the generic deliveryContract budget used for NPC chat shaping.
 */

import { useCallback } from 'react';
import {
  Stack,
  Text,
  Group,
  Paper,
  Title,
  Select,
  Checkbox,
  Badge,
  ScrollArea,
  NumberInput,
  Divider,
} from '@mantine/core';
import type { BandPolicy, BandPolicyPack, LearnerBandId } from '../../../plugins/sugarlang/types';
import { createDefaultDeliveryContract } from '../../../plugins/sugarlang/content/band-policy-defaults';

const MIXING_LEVELS = [
  { value: 'full_support', label: 'Full Support' },
  { value: 'heavy_support', label: 'Heavy Support' },
  { value: 'light_support', label: 'Light Support' },
  { value: 'target_dominant', label: 'Target Dominant' },
  { value: 'target_only', label: 'Target Only' },
];

const GROUNDING_INTENSITIES = [
  { value: 'always', label: 'Always' },
  { value: 'on_first_encounter', label: 'First Encounter' },
  { value: 'on_request', label: 'On Request' },
  { value: 'none', label: 'None' },
];

const CORRECTION_POSTURES = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'on_request', label: 'On Request' },
  { value: 'none', label: 'None' },
];

const DELIVERY_DETAIL_LEVELS = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'concise', label: 'Concise' },
  { value: 'expanded', label: 'Expanded' },
];

const ALL_RESPONSE_MODES = [
  'chip_composition',
  'object_selection',
  'single_blank',
  'blank_fill',
  'phrase_assembly',
  'word_bank',
  'short_text',
  'open_text',
  'free_form',
];

interface BandMatrixEditorProps {
  bandPolicies: BandPolicyPack;
  onUpdateBandPolicies: (updated: BandPolicyPack) => void;
}

export function BandMatrixEditor({
  bandPolicies,
  onUpdateBandPolicies,
}: BandMatrixEditorProps) {
  const updatePolicy = useCallback(
    (bandId: LearnerBandId, patch: Partial<BandPolicy>) => {
      const updated = {
        policies: bandPolicies.policies.map((p) =>
          p.bandId === bandId ? { ...p, ...patch } : p,
        ),
      };
      onUpdateBandPolicies(updated);
    },
    [bandPolicies, onUpdateBandPolicies],
  );

  if (bandPolicies.policies.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">No band policies loaded</Text>
      </Stack>
    );
  }

  return (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        <Title order={5}>Band Policy Matrix</Title>

        {bandPolicies.policies.map((policy) => (
          <BandPolicyCard
            key={policy.bandId}
            policy={policy}
            onUpdate={(patch) => updatePolicy(policy.bandId, patch)}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}

function BandPolicyCard({
  policy,
  onUpdate,
}: {
  policy: BandPolicy;
  onUpdate: (patch: Partial<BandPolicy>) => void;
}) {
  const deliveryContract = policy.deliveryContract ?? createDefaultDeliveryContract(policy.bandId);
  const updateDeliveryContract = (patch: Partial<BandPolicy['deliveryContract']>) => {
    onUpdate({
      deliveryContract: {
        ...deliveryContract,
        ...patch,
      },
    });
  };

  return (
    <Paper p="sm" withBorder>
      <Group gap="xs" mb="sm">
        <Badge size="md" color={bandColor(policy.bandId)}>{policy.bandId}</Badge>
        <Text size="sm" fw={500}>{bandLabel(policy.bandId)}</Text>
      </Group>

      <Stack gap="sm">
        <Group gap="md" grow>
          <Select
            label="Mixing Level"
            size="xs"
            data={MIXING_LEVELS}
            value={policy.supportLanguagePolicy.mixingLevel}
            onChange={(val) => {
              if (!val) return;
              onUpdate({
                supportLanguagePolicy: {
                  ...policy.supportLanguagePolicy,
                  mixingLevel: val as BandPolicy['supportLanguagePolicy']['mixingLevel'],
                },
              });
            }}
          />
          <Select
            label="Grounding"
            size="xs"
            data={GROUNDING_INTENSITIES}
            value={policy.groundingIntensity}
            onChange={(val) => {
              if (!val) return;
              onUpdate({ groundingIntensity: val as BandPolicy['groundingIntensity'] });
            }}
          />
          <Select
            label="Correction"
            size="xs"
            data={CORRECTION_POSTURES}
            value={policy.correctionPosture}
            onChange={(val) => {
              if (!val) return;
              onUpdate({ correctionPosture: val as BandPolicy['correctionPosture'] });
            }}
          />
        </Group>

        <Group gap="md">
          <Checkbox
            label="Show Support Strip"
            size="xs"
            checked={policy.supportLanguagePolicy.showSupportStrip}
            onChange={(e) =>
              onUpdate({
                supportLanguagePolicy: {
                  ...policy.supportLanguagePolicy,
                  showSupportStrip: e.currentTarget.checked,
                },
              })
            }
          />
          <Checkbox
            label="Show Glosses"
            size="xs"
            checked={policy.supportLanguagePolicy.showGlosses}
            onChange={(e) =>
              onUpdate({
                supportLanguagePolicy: {
                  ...policy.supportLanguagePolicy,
                  showGlosses: e.currentTarget.checked,
                },
              })
            }
          />
        </Group>

        <div>
          <Text size="xs" fw={500} mb={4}>Allowed Response Modes</Text>
          <Group gap={4} style={{ flexWrap: 'wrap' }}>
            {ALL_RESPONSE_MODES.map((mode) => (
              <Checkbox
                key={mode}
                label={mode.replace(/_/g, ' ')}
                size="xs"
                checked={policy.allowedResponseModes.includes(mode)}
                onChange={(e) => {
                  const modes = e.currentTarget.checked
                    ? [...policy.allowedResponseModes, mode]
                    : policy.allowedResponseModes.filter((m) => m !== mode);
                  onUpdate({ allowedResponseModes: modes });
                }}
              />
            ))}
          </Group>
        </div>

        <Divider />

        <Stack gap="xs">
          <Text size="xs" fw={500}>Delivery Contract</Text>
          <Group gap="md" grow>
            <Select
              label="Detail Level"
              size="xs"
              data={DELIVERY_DETAIL_LEVELS}
              value={deliveryContract.detailLevel ?? 'concise'}
              onChange={(val) => {
                if (!val) return;
                updateDeliveryContract({
                  detailLevel: val as NonNullable<BandPolicy['deliveryContract']['detailLevel']>,
                });
              }}
            />
            <NumberInput
              label="Max Knowledge Claims"
              size="xs"
              min={1}
              value={deliveryContract.maxKnowledgeClaims ?? 1}
              onChange={(value) => updateDeliveryContract({ maxKnowledgeClaims: Number(value) || 1 })}
            />
            <NumberInput
              label="Max Knowledge Parts"
              size="xs"
              min={1}
              value={deliveryContract.maxKnowledgeParts ?? 1}
              onChange={(value) => updateDeliveryContract({ maxKnowledgeParts: Number(value) || 1 })}
            />
          </Group>

          <Group gap="md" grow>
            <NumberInput
              label="Max Sentences"
              size="xs"
              min={1}
              value={deliveryContract.maxSentences ?? 1}
              onChange={(value) => updateDeliveryContract({ maxSentences: Number(value) || 1 })}
            />
            <NumberInput
              label="Max Sentence Length"
              size="xs"
              min={1}
              value={deliveryContract.maxSentenceLength ?? 8}
              onChange={(value) => updateDeliveryContract({ maxSentenceLength: Number(value) || 1 })}
            />
            <NumberInput
              label="Max Clause Depth"
              size="xs"
              min={1}
              value={deliveryContract.maxClauseDepth ?? 1}
              onChange={(value) => updateDeliveryContract({ maxClauseDepth: Number(value) || 1 })}
            />
          </Group>

          <Group gap="md" style={{ flexWrap: 'wrap' }}>
            <Checkbox
              label="Allow Exact Numbers"
              size="xs"
              checked={deliveryContract.allowExactNumbers ?? false}
              onChange={(e) => updateDeliveryContract({ allowExactNumbers: e.currentTarget.checked })}
            />
            <Checkbox
              label="Allow Enrichment Facts"
              size="xs"
              checked={deliveryContract.allowEnrichmentFacts ?? false}
              onChange={(e) => updateDeliveryContract({ allowEnrichmentFacts: e.currentTarget.checked })}
            />
            <Checkbox
              label="Prefer Concrete Facts"
              size="xs"
              checked={deliveryContract.preferConcreteFacts ?? false}
              onChange={(e) => updateDeliveryContract({ preferConcreteFacts: e.currentTarget.checked })}
            />
            <Checkbox
              label="Prefer High-Frequency Lexicon"
              size="xs"
              checked={deliveryContract.preferHighFrequencyLexicon ?? false}
              onChange={(e) => updateDeliveryContract({ preferHighFrequencyLexicon: e.currentTarget.checked })}
            />
          </Group>
        </Stack>
      </Stack>
    </Paper>
  );
}

function bandColor(bandId: string): string {
  switch (bandId) {
    case 'B0': return 'green';
    case 'B1': return 'teal';
    case 'B2': return 'blue';
    case 'B3': return 'grape';
    case 'B4': return 'orange';
    default: return 'gray';
  }
}

function bandLabel(bandId: string): string {
  switch (bandId) {
    case 'B0': return 'Anchored Recognition';
    case 'B1': return 'Guided Response';
    case 'B2': return 'Constrained Exchange';
    case 'B3': return 'Independent Task Dialogue';
    case 'B4': return 'Natural Interaction';
    default: return bandId;
  }
}
