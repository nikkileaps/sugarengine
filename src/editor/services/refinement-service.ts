/**
 * Client-side service for calling the LLM refinement endpoint.
 * Proxies through the vite dev server to keep API keys server-side.
 */

import type { RefinementPacket, RefinementProposal } from '../../plugins/sugarlang/content/refinement-packet';

const REFINE_ENDPOINT = '/__sugarengine/refine';

export type RefinementProviderName = 'openai' | 'anthropic';

export interface RefinementProviderInfo {
  id: RefinementProviderName;
  name: string;
  configured: boolean;
  defaultModel: string;
}

export interface RefinementResult {
  ok: boolean;
  proposal?: RefinementProposal;
  raw?: string;
  error?: string;
  provider: string;
  model: string;
}

/** List available refinement providers and their configuration status. */
export async function listRefinementProviders(): Promise<RefinementProviderInfo[]> {
  const response = await fetch(REFINE_ENDPOINT, { method: 'GET' });
  const data = await response.json();
  return data.providers ?? [];
}

/** Call the LLM refinement endpoint with a packet. */
export async function callRefinement(
  packet: RefinementPacket,
  provider: RefinementProviderName = 'openai',
  model?: string,
): Promise<RefinementResult> {
  const response = await fetch(REFINE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, packet }),
  });
  return await response.json() as RefinementResult;
}
