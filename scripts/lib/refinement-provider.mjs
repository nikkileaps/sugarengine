/**
 * LLM Refinement Provider — server-side adapter for calling LLM APIs.
 *
 * Strategy pattern: swap between OpenAI and Anthropic via the `provider` field.
 * Runs in the vite dev server (Node.js), NOT in the browser.
 *
 * API keys are read from environment variables:
 *   OPENAI_API_KEY    — for the 'openai' provider
 *   ANTHROPIC_API_KEY — for the 'anthropic' provider
 */

import { config as loadDotenv } from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Load .env from project root so API keys are available in dev server middleware.
loadDotenv();

/** @typedef {'openai' | 'anthropic'} ProviderName */

/**
 * @typedef {Object} RefinementRequest
 * @property {ProviderName} provider
 * @property {string} [model] — override the default model
 * @property {object} packet — the full RefinementPacket from the editor
 */

/**
 * @typedef {Object} RefinementResponse
 * @property {boolean} ok
 * @property {object} [proposal] — parsed RefinementProposal
 * @property {string} [raw] — raw LLM response text
 * @property {string} [error]
 * @property {string} provider
 * @property {string} model
 */

const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

/**
 * Build the system prompt from the refinement packet.
 * @param {object} packet
 * @returns {string}
 */
function buildSystemPrompt(packet) {
  return [
    'You are a language learning content expert.',
    'You refine scripted dialogue turns for an immersive language learning game.',
    'You will receive a refinement packet containing scenario context, band context,',
    'a vocabulary plan, the conversation flow, and instructions.',
    '',
    'You MUST return a valid JSON object matching this schema:',
    '{',
    '  "packetVersion": 1,',
    '  "turns": [',
    '    {',
    '      "turnId": "<string>",',
    '      "proposedTargetText": "<string — full target-language canonical line>",',
    '      "proposedDeliveryText": "<string — mixed-language line the learner sees>",',
    '      "note": "<optional string — brief explanation>"',
    '    }',
    '  ],',
    '  "note": "<optional string>"',
    '}',
    '',
    'Return ONLY the JSON object. No markdown fences, no explanation outside the JSON.',
  ].join('\n');
}

/**
 * Build the user prompt from the refinement packet.
 * @param {object} packet
 * @returns {string}
 */
function buildUserPrompt(packet) {
  return JSON.stringify(packet, null, 2);
}

/**
 * Extract JSON from LLM response text (handles markdown fences).
 * @param {string} text
 * @returns {string}
 */
function extractJson(text) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  // Try to find the first { ... } block
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text.trim();
}

/**
 * Call the OpenAI API.
 * @param {object} packet
 * @param {string} model
 * @returns {Promise<RefinementResponse>}
 */
async function callOpenAI(packet, model) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY environment variable is not set', provider: 'openai', model };
  }

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(packet) },
      { role: 'user', content: buildUserPrompt(packet) },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });

  const raw = response.choices[0]?.message?.content ?? '';
  try {
    const proposal = JSON.parse(extractJson(raw));
    return { ok: true, proposal, raw, provider: 'openai', model };
  } catch (parseError) {
    return { ok: false, error: `Failed to parse LLM response as JSON: ${parseError.message}`, raw, provider: 'openai', model };
  }
}

/**
 * Call the Anthropic API.
 * @param {object} packet
 * @param {string} model
 * @returns {Promise<RefinementResponse>}
 */
async function callAnthropic(packet, model) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY environment variable is not set', provider: 'anthropic', model };
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: buildSystemPrompt(packet),
    messages: [
      { role: 'user', content: buildUserPrompt(packet) },
    ],
  });

  const raw = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const proposal = JSON.parse(extractJson(raw));
    return { ok: true, proposal, raw, provider: 'anthropic', model };
  } catch (parseError) {
    return { ok: false, error: `Failed to parse LLM response as JSON: ${parseError.message}`, raw, provider: 'anthropic', model };
  }
}

/**
 * Main entry point — dispatch to the appropriate provider.
 * @param {RefinementRequest} request
 * @returns {Promise<RefinementResponse>}
 */
export async function callRefinementProvider(request) {
  const provider = request.provider ?? 'openai';
  const model = request.model ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.openai;

  try {
    switch (provider) {
      case 'openai':
        return await callOpenAI(request.packet, model);
      case 'anthropic':
        return await callAnthropic(request.packet, model);
      default:
        return { ok: false, error: `Unknown provider: ${provider}`, provider, model };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      provider,
      model,
    };
  }
}

/** List available providers and whether their API key is configured. */
export function listProviders() {
  return [
    { id: 'openai', name: 'OpenAI', configured: !!process.env.OPENAI_API_KEY, defaultModel: DEFAULT_MODELS.openai },
    { id: 'anthropic', name: 'Anthropic', configured: !!process.env.ANTHROPIC_API_KEY, defaultModel: DEFAULT_MODELS.anthropic },
  ];
}
