import { enrichEvidenceWithEpistemics } from '../epistemology.js';
import type { EpistemicEvidenceItem } from '../turn-contracts.js';

export type EvidencePackItem = Omit<EpistemicEvidenceItem, 'knowledgeClass' | 'accessPolicy' | 'disclosurePolicy'> & Partial<
  Pick<EpistemicEvidenceItem, 'knowledgeClass' | 'accessPolicy' | 'disclosurePolicy'>
>;

export interface EvidencePackLike {
  items: EvidencePackItem[];
  evidenceIdToItem?: Map<string, EvidencePackItem>;
}

export interface EnrichedEvidencePack extends EvidencePackLike {
  items: EpistemicEvidenceItem[];
  evidenceIdToItem?: Map<string, EpistemicEvidenceItem>;
}

function isEpistemicEvidenceItem(item: EvidencePackItem): item is EpistemicEvidenceItem {
  return Boolean(item?.knowledgeClass && item?.accessPolicy && item?.disclosurePolicy);
}

export function enrichEvidencePackWithEpistemics(
  evidencePack: EvidencePackLike,
  beatContract?: unknown,
): EnrichedEvidencePack {
  if (!evidencePack || !Array.isArray(evidencePack.items)) {
    return {
      items: [],
      evidenceIdToItem: new Map<string, EpistemicEvidenceItem>(),
    };
  }

  const enrichedItems: EpistemicEvidenceItem[] = evidencePack.items.map((item) =>
    isEpistemicEvidenceItem(item)
      ? item
      : enrichEvidenceWithEpistemics(item, beatContract as { urgency?: string } | null | undefined),
  );

  const enrichedIdToItem = new Map<string, EpistemicEvidenceItem>();
  for (const item of enrichedItems) {
    enrichedIdToItem.set(item.evidenceId, item);
  }

  return {
    ...evidencePack,
    items: enrichedItems,
    evidenceIdToItem: enrichedIdToItem,
  };
}
