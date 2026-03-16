import { describe, expect, it } from 'vitest';
import {
  embedTexts,
  getLocalEmbeddingRuntimeHealth,
} from './local-embedding-runtime';

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  if (leftMagnitude <= 0 || rightMagnitude <= 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

describe('local embedding runtime', () => {
  it('reports a ready embedding runtime with a stable dimension', async () => {
    const health = await getLocalEmbeddingRuntimeHealth();
    expect(health.ok).toBe(true);
    expect(health.modelId).toBe('xenova/all-MiniLM-L6-v2');
    expect(health.dimension).toBeGreaterThan(0);
  });

  it('returns non-zero vectors and keeps semantically similar prompts closer than unrelated ones', async () => {
    const [jobVector, workVector, weatherVector] = await embedTexts([
      'What do you do for work?',
      'What is your job?',
      'How is the weather today?',
    ]);

    expect(jobVector.length).toBe(workVector.length);
    expect(workVector.length).toBe(weatherVector.length);
    expect(jobVector.some((value) => Math.abs(value) > 0.000001)).toBe(true);
    expect(workVector.some((value) => Math.abs(value) > 0.000001)).toBe(true);

    const similarScore = cosineSimilarity(jobVector, workVector);
    const unrelatedScore = cosineSimilarity(jobVector, weatherVector);
    expect(similarScore).toBeGreaterThan(unrelatedScore);
  });
});
