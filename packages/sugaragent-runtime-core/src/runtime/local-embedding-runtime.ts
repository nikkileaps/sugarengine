/**
 * @fileoverview Local embedding runtime for SugarAgent preview/dev.
 *
 * Phase B0/B1:
 * - ONNX Runtime is the architectural anchor for local embeddings.
 * - Preview uses a real local embedding model behind the existing embed() bridge.
 * - Silent fake vectors are forbidden; callers get explicit failures if the runtime is unavailable.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { resolveEmbeddingModelDir } from './asset-paths.js';

export const LOCAL_EMBEDDING_MODEL_ID = 'xenova/all-MiniLM-L6-v2';
const DEFAULT_MAX_TOKENS = 128;
const MAX_CACHE_ENTRIES = 1024;
const WORD_OR_PUNCTUATION = /[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu;

interface TokenizerAssets {
  vocab: Map<string, number>;
  clsId: number;
  sepId: number;
  padId: number;
  unkId: number;
  maxTokens: number;
  hiddenSize: number;
}

export interface LocalEmbeddingRuntimeHealth {
  ok: boolean;
  detail: string;
  modelId: string;
  dimension: number;
  cacheSize: number;
}

const embeddingCache = new Map<string, number[]>();
let tokenizerAssetsPromise: Promise<TokenizerAssets> | null = null;
let sessionPromise: Promise<ort.InferenceSession> | null = null;

function requireEmbeddingModelDir(): string {
  const embeddingModelDir = resolveEmbeddingModelDir();
  if (!embeddingModelDir) {
    throw new Error('Embedding model directory not found. Set SUGARAGENT_EMBEDDING_MODEL_DIR or SUGARAGENT_RUNTIME_BUNDLE_DIR, or run from the SugarEngine workspace.');
  }
  return embeddingModelDir;
}

function resolveEmbeddingAssetPaths() {
  const embeddingModelDir = requireEmbeddingModelDir();
  return {
    embeddingModelPath: path.join(embeddingModelDir, 'onnx', 'model_quantized.onnx'),
    embeddingVocabPath: path.join(embeddingModelDir, 'vocab.txt'),
    embeddingConfigPath: path.join(embeddingModelDir, 'config.json'),
    embeddingTokenizerPath: path.join(embeddingModelDir, 'tokenizer.json'),
  };
}

function normalizeEmbeddingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function basicTokenize(text: string): string[] {
  const normalized = stripAccents(normalizeEmbeddingText(text)).toLowerCase();
  return normalized.match(WORD_OR_PUNCTUATION) ?? [];
}

function wordpieceTokenize(token: string, vocab: Map<string, number>, unkToken = '[UNK]'): string[] {
  if (!token) return [];
  if (vocab.has(token)) return [token];

  const pieces: string[] = [];
  let start = 0;
  while (start < token.length) {
    let end = token.length;
    let matched: string | null = null;
    while (start < end) {
      let fragment = token.slice(start, end);
      if (start > 0) fragment = `##${fragment}`;
      if (vocab.has(fragment)) {
        matched = fragment;
        break;
      }
      end -= 1;
    }
    if (!matched) return [unkToken];
    pieces.push(matched);
    start = end;
  }
  return pieces;
}

function toTokenIds(text: string, assets: TokenizerAssets): number[] {
  const tokens = basicTokenize(text)
    .flatMap((token) => wordpieceTokenize(token, assets.vocab))
    .slice(0, Math.max(0, assets.maxTokens - 2));
  const sequence = ['[CLS]', ...tokens, '[SEP]'];
  return sequence.map((token) => assets.vocab.get(token) ?? assets.unkId);
}

function buildInt64Tensor(values: number[], dims: number[]): ort.Tensor {
  return new ort.Tensor('int64', BigInt64Array.from(values, (value) => BigInt(value)), dims);
}

function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (!Number.isFinite(magnitude) || magnitude <= 0) return vector.map(() => 0);
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

async function loadTokenizerAssets(): Promise<TokenizerAssets> {
  const {
    embeddingVocabPath,
    embeddingConfigPath,
    embeddingTokenizerPath,
  } = resolveEmbeddingAssetPaths();
  const [vocabRaw, configRaw, tokenizerRaw] = await Promise.all([
    fs.readFile(embeddingVocabPath, 'utf8'),
    fs.readFile(embeddingConfigPath, 'utf8'),
    fs.readFile(embeddingTokenizerPath, 'utf8'),
  ]);

  const vocab = new Map<string, number>();
  for (const [index, line] of vocabRaw.split(/\r?\n/).entries()) {
    const token = line.trim();
    if (!token) continue;
    vocab.set(token, index);
  }

  const config = JSON.parse(configRaw) as Record<string, unknown>;
  const tokenizer = JSON.parse(tokenizerRaw) as Record<string, unknown>;
  const maxTokens = Math.max(
    8,
    Math.min(
      DEFAULT_MAX_TOKENS,
      Number.isFinite((tokenizer as { truncation?: { max_length?: number } }).truncation?.max_length)
        ? Number((tokenizer as { truncation?: { max_length?: number } }).truncation?.max_length)
        : DEFAULT_MAX_TOKENS,
    ),
  );
  const hiddenSize = Number.isFinite(config.hidden_size)
    ? Number(config.hidden_size)
    : 384;

  const clsId = vocab.get('[CLS]');
  const sepId = vocab.get('[SEP]');
  const padId = vocab.get('[PAD]');
  const unkId = vocab.get('[UNK]');
  if (
    clsId === undefined
    || sepId === undefined
    || padId === undefined
    || unkId === undefined
  ) {
    throw new Error('Embedding tokenizer vocabulary is missing required BERT special tokens.');
  }

  return {
    vocab,
    clsId,
    sepId,
    padId,
    unkId,
    maxTokens,
    hiddenSize,
  };
}

async function getTokenizerAssets(): Promise<TokenizerAssets> {
  tokenizerAssetsPromise ??= loadTokenizerAssets();
  return tokenizerAssetsPromise;
}

async function getEmbeddingSession(): Promise<ort.InferenceSession> {
  sessionPromise ??= (async () => {
    const { embeddingModelPath } = resolveEmbeddingAssetPaths();
    return ort.InferenceSession.create(embeddingModelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
  })();
  return sessionPromise;
}

function cacheVector(text: string, vector: number[]): void {
  if (embeddingCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = embeddingCache.keys().next().value;
    if (typeof firstKey === 'string') embeddingCache.delete(firstKey);
  }
  embeddingCache.set(text, vector);
}

async function embedBatch(texts: string[], assets: TokenizerAssets): Promise<number[][]> {
  if (texts.length === 0) return [];

  const session = await getEmbeddingSession();
  const encoded = texts.map((text) => toTokenIds(text, assets));
  const sequenceLength = Math.max(1, ...encoded.map((entry) => entry.length));
  const batchSize = encoded.length;

  const inputIds: number[] = [];
  const attentionMask: number[] = [];
  const tokenTypeIds: number[] = [];

  for (const entry of encoded) {
    const padCount = sequenceLength - entry.length;
    inputIds.push(...entry, ...Array.from({ length: padCount }, () => assets.padId));
    attentionMask.push(...Array.from({ length: entry.length }, () => 1), ...Array.from({ length: padCount }, () => 0));
    tokenTypeIds.push(...Array.from({ length: sequenceLength }, () => 0));
  }

  const output = await session.run({
    input_ids: buildInt64Tensor(inputIds, [batchSize, sequenceLength]),
    attention_mask: buildInt64Tensor(attentionMask, [batchSize, sequenceLength]),
    token_type_ids: buildInt64Tensor(tokenTypeIds, [batchSize, sequenceLength]),
  });

  const hidden = output.last_hidden_state;
  if (!hidden || !Array.isArray(hidden.dims) || hidden.dims.length !== 3) {
    throw new Error('Embedding model returned an unexpected output shape.');
  }

  const [resolvedBatchSizeRaw, resolvedSequenceLengthRaw, resolvedDimensionRaw] = hidden.dims;
  const resolvedBatchSize = Number(resolvedBatchSizeRaw ?? 0);
  const resolvedSequenceLength = Number(resolvedSequenceLengthRaw ?? 0);
  const resolvedDimension = Number(resolvedDimensionRaw ?? 0);
  if (
    resolvedBatchSize !== batchSize
    || resolvedSequenceLength !== sequenceLength
    || resolvedDimension <= 0
  ) {
    throw new Error('Embedding model output dimensions did not match the request.');
  }

  const data = Array.from(hidden.data as Float32Array | number[]);
  const vectors: number[][] = [];
  for (let batchIndex = 0; batchIndex < batchSize; batchIndex++) {
    const pooled = Array.from({ length: resolvedDimension }, () => 0);
    let tokenCount = 0;
    for (let tokenIndex = 0; tokenIndex < sequenceLength; tokenIndex++) {
      if (attentionMask[(batchIndex * sequenceLength) + tokenIndex] !== 1) continue;
      tokenCount += 1;
      const offset = ((batchIndex * sequenceLength) + tokenIndex) * resolvedDimension;
      for (let dimensionIndex = 0; dimensionIndex < resolvedDimension; dimensionIndex++) {
        const currentValue = pooled[dimensionIndex] ?? 0;
        pooled[dimensionIndex] = currentValue + (data[offset + dimensionIndex] ?? 0);
      }
    }

    const averaged = tokenCount > 0
      ? pooled.map((value) => value / tokenCount)
      : pooled;
    vectors.push(l2Normalize(averaged));
  }

  return vectors;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const normalizedTexts = texts.map((text) => normalizeEmbeddingText(String(text ?? '')));
  const assets = await getTokenizerAssets();
  const vectors: Array<number[] | undefined> = normalizedTexts.map((text) => (
    text ? embeddingCache.get(text) : []
  ));

  const missingTexts: string[] = [];
  const missingIndexes: number[] = [];
  normalizedTexts.forEach((text, index) => {
    if (!text) {
      vectors[index] = Array.from({ length: assets.hiddenSize }, () => 0);
      return;
    }
    if (!vectors[index]) {
      missingTexts.push(text);
      missingIndexes.push(index);
    }
  });

  if (missingTexts.length > 0) {
    const embeddedMissing = await embedBatch(missingTexts, assets);
    embeddedMissing.forEach((vector, index) => {
      const text = missingTexts[index];
      const targetIndex = missingIndexes[index];
      if (!text) return;
      if (targetIndex === undefined) return;
      cacheVector(text, vector);
      vectors[targetIndex] = vector;
    });
  }

  return vectors.map((vector) => vector ?? Array.from({ length: assets.hiddenSize }, () => 0));
}

export async function getLocalEmbeddingRuntimeHealth(): Promise<LocalEmbeddingRuntimeHealth> {
  try {
    const { embeddingModelPath } = resolveEmbeddingAssetPaths();
    const [assets] = await Promise.all([
      getTokenizerAssets(),
      fs.access(embeddingModelPath),
    ]);
    return {
      ok: true,
      detail: 'local-embedding-runtime-ready',
      modelId: LOCAL_EMBEDDING_MODEL_ID,
      dimension: assets.hiddenSize,
      cacheSize: embeddingCache.size,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      detail: `local-embedding-runtime-unavailable: ${message}`,
      modelId: LOCAL_EMBEDDING_MODEL_ID,
      dimension: 0,
      cacheSize: embeddingCache.size,
    };
  }
}
