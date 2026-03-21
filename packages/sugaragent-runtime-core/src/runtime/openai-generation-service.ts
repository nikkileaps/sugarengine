import type {
  JsonGenerationRequest,
  JsonGenerationService,
} from '../services.js';

export interface OpenAIGenerationServiceOptions {
  apiKey?: string | null;
  model: string;
  baseUrl?: string;
}

interface OpenAIResponsesApiResponse {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
      type?: unknown;
    }>;
  }>;
  error?: {
    message?: unknown;
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseUrl(value: string | undefined): string {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.replace(/\/+$/, '') : 'https://api.openai.com/v1';
}

function extractOutputText(payload: OpenAIResponsesApiResponse): string {
  const direct = normalizeOptionalString(payload?.output_text);
  if (direct) return direct;
  if (!Array.isArray(payload?.output)) return '';

  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type !== 'output_text' && content?.type !== 'text' && typeof content?.text !== 'string') {
        continue;
      }
      const text = normalizeOptionalString(content.text);
      if (text) return text;
    }
  }

  return '';
}

export function createOpenAIGenerationService(
  options: OpenAIGenerationServiceOptions,
): JsonGenerationService {
  const model = normalizeOptionalString(options.model) ?? 'gpt-5-mini';
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const apiKey = normalizeOptionalString(options.apiKey);

  return {
    name: 'openai',
    async health() {
      if (!apiKey) {
        return {
          ok: false,
          detail: 'OpenAI API key not configured.',
        };
      }
      return {
        ok: true,
        detail: `openai-ready (${model})`,
      };
    },
    async loadModel() {
      // Hosted/provider-backed model lifecycle is API-owned.
    },
    async unloadModel() {
      // Hosted/provider-backed model lifecycle is API-owned.
    },
    async generateStructured(request: JsonGenerationRequest) {
      if (!apiKey) {
        throw new Error('OpenAI API key not configured.');
      }

      const prompt = typeof request?.prompt === 'string'
        ? request.prompt.trim()
        : '';
      if (!prompt) {
        throw new Error('Prompt must be a non-empty string');
      }

      const schemaText = normalizeOptionalString(request?.schemaText);
      if (!schemaText) {
        throw new Error('Structured generation requires a JSON schema.');
      }

      let schema: Record<string, unknown>;
      try {
        schema = JSON.parse(schemaText) as Record<string, unknown>;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON schema: ${detail}`);
      }

      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: prompt,
          text: {
            format: {
              type: 'json_schema',
              name: 'sugaragent_turn',
              strict: true,
              schema,
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({} as OpenAIResponsesApiResponse));
      if (!response.ok) {
        const detail = normalizeOptionalString(payload?.error?.message)
          ?? `${response.status} ${response.statusText}`;
        throw new Error(detail);
      }

      const jsonText = extractOutputText(payload).trim();
      if (!jsonText) {
        throw new Error('OpenAI response did not include structured output text.');
      }

      return {
        jsonText,
        rawText: jsonText,
      };
    },
  };
}
