import {
  embedTexts,
  getLocalEmbeddingRuntimeHealth,
  LOCAL_EMBEDDING_MODEL_ID,
} from './local-embedding-runtime.js';
import type { EmbeddingsRuntimeService } from '../services.js';

export { LOCAL_EMBEDDING_MODEL_ID } from './local-embedding-runtime.js';

export function createLocalEmbeddingsService(): EmbeddingsRuntimeService {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      return embedTexts(Array.isArray(texts) ? texts : []);
    },
    async health() {
      return getLocalEmbeddingRuntimeHealth();
    },
  };
}
