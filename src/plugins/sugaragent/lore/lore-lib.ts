// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'have',
  'has',
  'how',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'you',
  'your',
  'about',
  'know',
  'tell',
]);
const VALID_QUERY_TYPES = new Set([
  'conversation',
  'self_query',
  'other_query',
  'world_query',
  'mixed_query',
]);
const FACT_SPLIT_PATTERN = /(?<=[.!?])\s+|\n+/g;
const PROVENANCE_CONTEXT_CHARS = 56;

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function shortHash(value, length = 16) {
  return sha256(value).slice(0, Math.max(8, Math.min(64, length)));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function parseArray(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }

  return trimmed
    .slice(1, -1)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^['"]|['"]$/g, ''));
}

function parseFrontmatterValue(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseArray(trimmed);
  }

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(frontmatterBlock) {
  const metadata = {};
  for (const line of frontmatterBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const delimiterIndex = trimmed.indexOf(':');
    if (delimiterIndex <= 0) continue;

    const key = trimmed.slice(0, delimiterIndex).trim();
    const value = trimmed.slice(delimiterIndex + 1).trim();
    metadata[key] = parseFrontmatterValue(value);
  }
  return metadata;
}

function splitFrontmatter(rawMarkdown) {
  if (!rawMarkdown.startsWith('---\n')) {
    return { metadata: {}, body: rawMarkdown, bodyOffset: 0 };
  }

  const closingIndex = rawMarkdown.indexOf('\n---\n', 4);
  if (closingIndex < 0) {
    return { metadata: {}, body: rawMarkdown, bodyOffset: 0 };
  }

  const frontmatterBlock = rawMarkdown.slice(4, closingIndex);
  const body = rawMarkdown.slice(closingIndex + 5);
  return {
    metadata: parseFrontmatter(frontmatterBlock),
    body,
    bodyOffset: closingIndex + 5,
  };
}

function collectMarkdownFiles(root) {
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      files.push(entryPath);
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function computeLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function lineForOffset(lineStarts, offset) {
  if (!Array.isArray(lineStarts) || lineStarts.length === 0) return 1;
  const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid];
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY;
    if (normalizedOffset < start) {
      high = mid - 1;
    } else if (normalizedOffset >= next) {
      low = mid + 1;
    } else {
      return mid + 1;
    }
  }
  return lineStarts.length;
}

function sectionizeMarkdown(markdownBody, options = {}) {
  const baseOffset = Number.isFinite(options.baseOffset) ? Math.max(0, Math.floor(options.baseOffset)) : 0;
  const lineStarts = Array.isArray(options.lineStarts) ? options.lineStarts : computeLineStarts(markdownBody);
  const lines = markdownBody.split('\n');
  const sections = [];
  let current = {
    heading: 'Introduction',
    contentLines: [],
    startOffset: 0,
    startLine: 1,
  };
  let runningOffset = 0;
  let lineNumber = 1;

  const flush = () => {
    const rawText = current.contentLines.join('\n');
    const text = normalizeWhitespace(rawText);
    if (!text) return;
    const endOffset = current.startOffset + rawText.length;
    const globalStartOffset = baseOffset + current.startOffset;
    const globalEndOffset = baseOffset + endOffset;
    sections.push({
      heading: current.heading,
      text,
      rawText,
      startOffset: globalStartOffset,
      endOffset: globalEndOffset,
      startLine: lineForOffset(lineStarts, globalStartOffset),
      endLine: lineForOffset(lineStarts, Math.max(globalStartOffset, globalEndOffset - 1)),
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      current = {
        heading: headingMatch[2].trim(),
        contentLines: [],
        startOffset: runningOffset + line.length + 1,
        startLine: lineNumber + 1,
      };
      runningOffset += line.length + 1;
      lineNumber += 1;
      continue;
    }
    current.contentLines.push(line);
    runningOffset += line.length + 1;
    lineNumber += 1;
  }

  flush();
  return sections;
}

function normalizeFactStatement(text) {
  return normalizeWhitespace(String(text ?? ''))
    .replace(/^[-*]\s+/g, '')
    .replace(/^from the archives:\s*/i, '')
    .replace(/[“”]/g, '"')
    .trim();
}

function canonicalizeFactStatement(text) {
  return normalizeFactStatement(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectStatementSpans(rawText) {
  const source = String(rawText ?? '');
  const spans = [];
  const parts = source.split(FACT_SPLIT_PATTERN);
  let cursor = 0;
  for (const part of parts) {
    const rawPart = String(part ?? '');
    const startInSource = source.indexOf(rawPart, cursor);
    const effectiveStart = startInSource >= 0 ? startInSource : cursor;
    const effectiveEnd = effectiveStart + rawPart.length;
    cursor = effectiveEnd + 1;
    const statement = normalizeFactStatement(rawPart);
    if (!statement) continue;
    if (statement.length < 16) continue;
    const canonical = canonicalizeFactStatement(statement);
    if (!canonical) continue;
    const tokenCount = canonical.split(' ').filter(Boolean).length;
    if (tokenCount < 4) continue;
    spans.push({
      statement,
      canonical,
      startOffsetInText: effectiveStart,
      endOffsetInText: effectiveEnd,
    });
  }
  return spans;
}

function buildProvenanceAnchor(rawSourceText, startOffset, endOffset) {
  const source = String(rawSourceText ?? '');
  const safeStart = Number.isFinite(startOffset) ? Math.max(0, Math.min(source.length, Math.floor(startOffset))) : 0;
  const safeEnd = Number.isFinite(endOffset) ? Math.max(safeStart, Math.min(source.length, Math.floor(endOffset))) : safeStart;
  const prefixStart = Math.max(0, safeStart - PROVENANCE_CONTEXT_CHARS);
  const suffixEnd = Math.min(source.length, safeEnd + PROVENANCE_CONTEXT_CHARS);
  const prefix = source.slice(prefixStart, safeStart);
  const exact = source.slice(safeStart, safeEnd);
  const suffix = source.slice(safeEnd, suffixEnd);
  const normalizedPrefix = normalizeWhitespace(prefix).toLowerCase();
  const normalizedExact = normalizeWhitespace(exact).toLowerCase();
  const normalizedSuffix = normalizeWhitespace(suffix).toLowerCase();
  const signature = `${normalizedPrefix}|${normalizedExact}|${normalizedSuffix}`;
  return {
    prefix,
    exact,
    suffix,
    normalizedExact,
    signatureHash: shortHash(signature, 24),
  };
}

function scoreCanonicalSimilarity(leftCanonical, rightCanonical) {
  const leftTokens = new Set(String(leftCanonical ?? '').split(' ').filter(Boolean));
  const rightTokens = new Set(String(rightCanonical ?? '').split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  if (union === 0) return 0;
  return overlap / union;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function stemToken(token) {
  if (token.length <= 4) return token;
  return token.replace(/(ing|ed|es|s)$/g, '');
}

function firstSentence(text) {
  const trimmed = normalizeWhitespace(text);
  const sentenceMatch = trimmed.match(/.+?[.!?](\s|$)/);
  return sentenceMatch ? sentenceMatch[0].trim() : trimmed;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeScopeToken(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('lore.') && trimmed.length > 5) {
    return trimmed.slice(5);
  }
  return trimmed;
}

function normalizeQueryType(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return VALID_QUERY_TYPES.has(normalized) ? normalized : undefined;
}

function collectChunkScopeTokens(chunk) {
  const chunkMetadata = typeof chunk.metadata === 'object' && chunk.metadata !== null ? chunk.metadata : {};
  const rawCandidates = [
    chunk.chunkId,
    chunk.pageId,
    chunkMetadata.id,
    ...(normalizeStringArray(chunkMetadata.tags)),
    ...(normalizeStringArray(chunkMetadata.entity_ids)),
    ...(normalizeStringArray(chunkMetadata.location_ids)),
    ...(normalizeStringArray(chunkMetadata.faction_ids)),
    ...(normalizeStringArray(chunkMetadata.beat_ids)),
  ];

  const tokens = new Set();
  for (const candidate of rawCandidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) continue;
    tokens.add(normalized);
    for (const part of normalized.split(/[.#/_-]+/)) {
      if (part.length >= 3) {
        tokens.add(part);
      }
    }
    const withoutLorePrefix = normalizeScopeToken(candidate);
    if (withoutLorePrefix) {
      tokens.add(withoutLorePrefix);
      for (const part of withoutLorePrefix.split(/[.#/_-]+/)) {
        if (part.length >= 3) {
          tokens.add(part);
        }
      }
    }
  }
  return tokens;
}

function collectChunkEntityIds(chunk) {
  const chunkMetadata = typeof chunk.metadata === 'object' && chunk.metadata !== null ? chunk.metadata : {};
  return normalizeStringArray(chunkMetadata.entity_ids)
    .map((entry) => entry.toLowerCase());
}

function poolRank(pool) {
  if (pool === 'self') return 0;
  if (pool === 'related') return 1;
  return 2;
}

function buildIdentityRetrievalConfig(options = {}) {
  const queryType = normalizeQueryType(options.queryType) ?? 'conversation';
  const selfEntityId = normalizeOptionalString(options.selfEntityId)?.toLowerCase();
  const loreScopes = normalizeStringArray(options.loreScopes)
    .map((entry) => normalizeScopeToken(entry))
    .filter((entry) => typeof entry === 'string');
  const selfLoreScopes = normalizeStringArray(options.selfLoreScopes)
    .map((entry) => normalizeScopeToken(entry))
    .filter((entry) => typeof entry === 'string');
  const relatedLoreScopes = normalizeStringArray(options.relatedLoreScopes)
    .map((entry) => normalizeScopeToken(entry))
    .filter((entry) => typeof entry === 'string');
  const scopeFilters = Array.from(new Set([
    ...loreScopes,
    ...selfLoreScopes,
    ...relatedLoreScopes,
  ]));
  return {
    queryType,
    selfEntityId,
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
    scopeFilters,
  };
}

function classifyChunkIdentity(chunk, identityConfig) {
  const chunkEntityIds = collectChunkEntityIds(chunk);
  const selfEntityMatch = Boolean(
    identityConfig.selfEntityId
    && chunkEntityIds.includes(identityConfig.selfEntityId),
  );
  const inSelfScopes = identityConfig.selfLoreScopes.length > 0
    && matchesLoreScope(chunk, identityConfig.selfLoreScopes);
  const inRelatedScopes = identityConfig.relatedLoreScopes.length > 0
    && matchesLoreScope(chunk, identityConfig.relatedLoreScopes);
  const inLoreScopes = identityConfig.loreScopes.length > 0
    && matchesLoreScope(chunk, identityConfig.loreScopes);

  let pool = 'ambient';
  if (selfEntityMatch || inSelfScopes) {
    pool = 'self';
  } else if (inRelatedScopes) {
    pool = 'related';
  } else if (inLoreScopes || identityConfig.scopeFilters.length === 0) {
    pool = 'ambient';
  }

  return {
    pool,
    poolRank: poolRank(pool),
    selfEntityMatch,
    hasForeignEntity: Boolean(
      identityConfig.selfEntityId
      && chunkEntityIds.length > 0
      && !selfEntityMatch,
    ),
  };
}

function matchesLoreScope(chunk, scopeFilters) {
  if (scopeFilters.length === 0) return true;
  const chunkTokens = collectChunkScopeTokens(chunk);
  for (const scope of scopeFilters) {
    if (chunkTokens.has(scope)) {
      return true;
    }
    for (const token of chunkTokens) {
      if (token.startsWith(`${scope}.`) || token.endsWith(`.${scope}`)) {
        return true;
      }
    }
  }
  return false;
}

export function ingestLoreDirectory({
  sourceDir,
  commit,
  repo = 'local',
  ref,
  toolVersion = 'phase5',
  previousArtifacts = null,
}) {
  const absoluteSourceDir = path.resolve(sourceDir);
  if (!fs.existsSync(absoluteSourceDir)) {
    throw new Error(`Lore source directory does not exist: ${absoluteSourceDir}`);
  }

  const markdownFiles = collectMarkdownFiles(absoluteSourceDir);
  const chunks = [];
  const facts = [];
  const factById = new Map();
  const issues = [];

  for (const absoluteFilePath of markdownFiles) {
    const relativeFilePath = path.relative(absoluteSourceDir, absoluteFilePath);
    const raw = fs.readFileSync(absoluteFilePath, 'utf8');
    const { metadata, body, bodyOffset } = splitFrontmatter(raw);
    const lineStarts = computeLineStarts(raw);

    if (typeof metadata.id !== 'string' || metadata.id.trim().length === 0) {
      issues.push(`Missing required metadata "id" in ${relativeFilePath}`);
      continue;
    }
    if (typeof metadata.title !== 'string' || metadata.title.trim().length === 0) {
      issues.push(`Missing required metadata "title" in ${relativeFilePath}`);
      continue;
    }
    if (
      metadata.canon_level !== 'hard' &&
      metadata.canon_level !== 'soft' &&
      metadata.canon_level !== 'rumor'
    ) {
      issues.push(`Invalid metadata "canon_level" in ${relativeFilePath}`);
      continue;
    }

    const sections = sectionizeMarkdown(body, {
      baseOffset: bodyOffset,
      lineStarts,
    });
    if (sections.length === 0) {
      issues.push(`No usable markdown content in ${relativeFilePath}`);
      continue;
    }

    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      if (!section) continue;
      const sectionSlug = slugify(section.heading || `section-${i + 1}`) || `section-${i + 1}`;
      const chunkId = `${metadata.id}#${sectionSlug}`;
      const chunk = {
        chunkId,
        pageId: metadata.id,
        title: metadata.title,
        canonLevel: metadata.canon_level,
        sourceFile: relativeFilePath,
        sourceRepo: repo,
        sourceCommit: commit,
        sourceRef: normalizeOptionalString(ref),
        sectionHeading: section.heading,
        content: section.text,
        summary: firstSentence(section.text),
        tokens: tokenize(section.text),
        provenance: {
          offsets: {
            start: section.startOffset,
            end: section.endOffset,
            lineStart: section.startLine,
            lineEnd: section.endLine,
          },
        },
        metadata: {
          id: metadata.id,
          title: metadata.title,
          canon_level: metadata.canon_level,
          entity_ids: Array.isArray(metadata.entity_ids) ? metadata.entity_ids : [],
          location_ids: Array.isArray(metadata.location_ids) ? metadata.location_ids : [],
          faction_ids: Array.isArray(metadata.faction_ids) ? metadata.faction_ids : [],
          time_period: typeof metadata.time_period === 'string' ? metadata.time_period : undefined,
          tags: Array.isArray(metadata.tags) ? metadata.tags : [],
          beat_ids: Array.isArray(metadata.beat_ids) ? metadata.beat_ids : [],
          fact_ids: [],
        },
      };

      const factSpans = collectStatementSpans(section.rawText);
      for (const span of factSpans) {
        const statementStart = section.startOffset + span.startOffsetInText;
        const statementEnd = section.startOffset + span.endOffsetInText;
        const factId = `fact.${shortHash(`${metadata.id}|${span.canonical}`, 24)}`;
        const anchor = buildProvenanceAnchor(raw, statementStart, statementEnd);
        if (factById.has(factId)) {
          const existing = factById.get(factId);
          if (existing && Array.isArray(existing.chunkIds) && !existing.chunkIds.includes(chunkId)) {
            existing.chunkIds.push(chunkId);
          }
          if (!chunk.metadata.fact_ids.includes(factId)) {
            chunk.metadata.fact_ids.push(factId);
          }
          continue;
        }
        const factRecord = {
          factId,
          pageId: metadata.id,
          chunkId,
          chunkIds: [chunkId],
          statement: span.statement,
          canonicalStatement: span.canonical,
          sourceFile: relativeFilePath,
          sourceRepo: repo,
          sourceCommit: commit,
          sourceRef: normalizeOptionalString(ref),
          provenance: {
            offsets: {
              start: statementStart,
              end: statementEnd,
              lineStart: lineForOffset(lineStarts, statementStart),
              lineEnd: lineForOffset(lineStarts, Math.max(statementStart, statementEnd - 1)),
            },
            anchor: {
              prefix: anchor.prefix,
              exact: anchor.exact,
              suffix: anchor.suffix,
              normalizedExact: anchor.normalizedExact,
              signatureHash: anchor.signatureHash,
            },
          },
          verification: {
            status: 'available',
            reason: null,
            anchorConfidence: 1,
          },
          supersedesFactIds: [],
        };
        facts.push(factRecord);
        factById.set(factId, factRecord);
        chunk.metadata.fact_ids.push(factId);
      }
      chunk.metadata.fact_ids.sort((a, b) => a.localeCompare(b));
      chunks.push(chunk);
    }
  }

  if (chunks.length === 0) {
    throw new Error(issues[0] ?? 'No lore chunks generated.');
  }
  if (facts.length === 0) {
    issues.push('No atomic facts extracted from lore content.');
  }

  const sortedChunks = [...chunks].sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  const sortedFacts = [...facts].sort((a, b) => a.factId.localeCompare(b.factId));
  const loreArtifactVersion = `lore.${shortHash([
    `commit:${commit}`,
    ...sortedChunks.map((chunk) => chunk.chunkId),
    ...sortedFacts.map((fact) => `${fact.factId}:${fact.canonicalStatement}`),
  ].join('|'), 24)}`;

  const { mappings, unresolvedOldFacts } = buildFactMigrationRecords({
    previousFacts: Array.isArray(previousArtifacts?.facts) ? previousArtifacts.facts : [],
    nextFacts: sortedFacts,
  });
  for (const mapping of mappings) {
    if (mapping.newFactId === null) continue;
    const nextFact = factById.get(mapping.newFactId);
    if (!nextFact) continue;
    if (mapping.oldFactId === mapping.newFactId) continue;
    if (!Array.isArray(nextFact.supersedesFactIds)) {
      nextFact.supersedesFactIds = [];
    }
    if (!nextFact.supersedesFactIds.includes(mapping.oldFactId)) {
      nextFact.supersedesFactIds.push(mapping.oldFactId);
    }
  }
  for (const fact of sortedFacts) {
    if (Array.isArray(fact.supersedesFactIds)) {
      fact.supersedesFactIds = Array.from(new Set(fact.supersedesFactIds))
        .sort((a, b) => a.localeCompare(b));
    }
  }

  const manifest = {
    schemaVersion: 2,
    loreSchemaVersion: 2,
    loreArtifactVersion,
    source: {
      repo,
      commit,
      ref: normalizeOptionalString(ref),
    },
    generatedAt: new Date().toISOString(),
    toolVersion,
    counts: {
      files: markdownFiles.length,
      chunks: sortedChunks.length,
      facts: sortedFacts.length,
      issues: issues.length,
    },
    durability: {
      factSchemaVersion: 1,
      provenanceSchemaVersion: 1,
      migrationSchemaVersion: 1,
      unresolvedOldFacts: unresolvedOldFacts.length,
    },
  };

  const migrations = {
    schemaVersion: 1,
    generatedAt: manifest.generatedAt,
    fromArtifactVersion: normalizeOptionalString(previousArtifacts?.manifest?.loreArtifactVersion)
      ?? (normalizeOptionalString(previousArtifacts?.manifest?.source?.commit)
        ? `legacy.${previousArtifacts.manifest.source.commit}`
        : null),
    toArtifactVersion: loreArtifactVersion,
    mappings,
    unresolvedOldFacts,
  };

  return {
    manifest,
    chunks: sortedChunks,
    facts: sortedFacts,
    migrations,
    issues,
  };
}

function normalizeExistingFactRecord(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const factId = normalizeOptionalString(raw.factId);
  if (!factId) return null;
  const statement = normalizeFactStatement(raw.statement ?? raw.text ?? '');
  const canonicalStatement = canonicalizeFactStatement(raw.canonicalStatement ?? statement);
  if (!statement || !canonicalStatement) return null;
  const pageId = normalizeOptionalString(raw.pageId);
  const chunkId = normalizeOptionalString(raw.chunkId);
  const sourceFile = normalizeOptionalString(raw.sourceFile);
  const oldAnchorHash = normalizeOptionalString(raw?.provenance?.anchor?.signatureHash);
  const offsetStart = Number.isFinite(raw?.provenance?.offsets?.start)
    ? Math.max(0, Math.floor(raw.provenance.offsets.start))
    : null;
  return {
    factId,
    statement,
    canonicalStatement,
    pageId,
    chunkId,
    sourceFile,
    oldAnchorHash,
    offsetStart,
  };
}

function buildFactMigrationRecords({ previousFacts, nextFacts }) {
  const oldFacts = (Array.isArray(previousFacts) ? previousFacts : [])
    .map((entry) => normalizeExistingFactRecord(entry))
    .filter((entry) => entry !== null)
    .sort((a, b) => a.factId.localeCompare(b.factId));
  if (oldFacts.length === 0) {
    return {
      mappings: [],
      unresolvedOldFacts: [],
    };
  }

  const nextById = new Map();
  for (const fact of Array.isArray(nextFacts) ? nextFacts : []) {
    if (typeof fact?.factId === 'string' && fact.factId.length > 0) {
      nextById.set(fact.factId, fact);
    }
  }
  const reservedNextFactIds = new Set();
  const mappings = [];
  const unresolvedOldFacts = [];

  for (const oldFact of oldFacts) {
    const directMatch = nextById.get(oldFact.factId);
    if (directMatch) {
      const oldStart = oldFact.offsetStart;
      const newStart = Number.isFinite(directMatch?.provenance?.offsets?.start) ? directMatch.provenance.offsets.start : null;
      const oldAnchorHash = oldFact.oldAnchorHash;
      const newAnchorHash = normalizeOptionalString(directMatch?.provenance?.anchor?.signatureHash);
      const reattached = oldStart !== null && newStart !== null && oldStart !== newStart;
      const anchorStable = Boolean(oldAnchorHash && newAnchorHash && oldAnchorHash === newAnchorHash);
      mappings.push({
        oldFactId: oldFact.factId,
        newFactId: directMatch.factId,
        kind: reattached ? 'reattached' : 'unchanged',
        confidence: reattached ? (anchorStable ? 1 : 0.92) : 1,
        reason: reattached
          ? (anchorStable ? 'offset_drift_anchor_match' : 'offset_drift_factid_match')
          : 'factid_stable',
      });
      continue;
    }

    const candidates = (Array.isArray(nextFacts) ? nextFacts : [])
      .filter((nextFact) => {
        if (!nextFact || typeof nextFact.factId !== 'string') return false;
        if (reservedNextFactIds.has(nextFact.factId)) return false;
        if (oldFact.pageId && typeof nextFact.pageId === 'string' && nextFact.pageId !== oldFact.pageId) {
          return false;
        }
        if (oldFact.sourceFile && typeof nextFact.sourceFile === 'string' && nextFact.sourceFile !== oldFact.sourceFile) {
          return false;
        }
        return true;
      })
      .map((nextFact) => {
        const similarity = scoreCanonicalSimilarity(oldFact.canonicalStatement, nextFact.canonicalStatement);
        const oldAnchorHash = oldFact.oldAnchorHash;
        const newAnchorHash = normalizeOptionalString(nextFact?.provenance?.anchor?.signatureHash);
        const anchorMatch = oldAnchorHash && newAnchorHash && oldAnchorHash === newAnchorHash;
        const sameChunk = oldFact.chunkId && typeof nextFact.chunkId === 'string' && oldFact.chunkId === nextFact.chunkId;
        const score = (similarity * 0.82)
          + (anchorMatch ? 0.14 : 0)
          + (sameChunk ? 0.08 : 0);
        return {
          nextFact,
          score: Number(score.toFixed(4)),
        };
      })
      .sort((a, b) => (
        b.score - a.score
        || a.nextFact.factId.localeCompare(b.nextFact.factId)
      ));

    const best = candidates[0];
    if (best && best.score >= 0.58) {
      reservedNextFactIds.add(best.nextFact.factId);
      mappings.push({
        oldFactId: oldFact.factId,
        newFactId: best.nextFact.factId,
        kind: 'superseded',
        confidence: best.score,
        reason: 'semantic_update_mapped',
      });
      continue;
    }

    mappings.push({
      oldFactId: oldFact.factId,
      newFactId: null,
      kind: 'removed',
      confidence: 0,
      reason: 'verification_unavailable_no_reattachment',
    });
    unresolvedOldFacts.push({
      oldFactId: oldFact.factId,
      reason: 'verification_unavailable_no_reattachment',
    });
  }

  return {
    mappings,
    unresolvedOldFacts,
  };
}

export function writeLoreArtifacts(outputDir, artifacts) {
  const absoluteOutputDir = path.resolve(outputDir);
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  const manifestPath = path.join(absoluteOutputDir, 'manifest.json');
  const chunksPath = path.join(absoluteOutputDir, 'chunks.json');
  const factsPath = path.join(absoluteOutputDir, 'facts.json');
  const migrationsPath = path.join(absoluteOutputDir, 'migrations.json');

  fs.writeFileSync(manifestPath, `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(chunksPath, `${JSON.stringify(artifacts.chunks, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    factsPath,
    `${JSON.stringify(Array.isArray(artifacts.facts) ? artifacts.facts : [], null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    migrationsPath,
    `${JSON.stringify(artifacts.migrations ?? {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      fromArtifactVersion: null,
      toArtifactVersion: normalizeOptionalString(artifacts?.manifest?.loreArtifactVersion) ?? null,
      mappings: [],
      unresolvedOldFacts: [],
    }, null, 2)}\n`,
    'utf8',
  );

  return {
    manifestPath,
    chunksPath,
    factsPath,
    migrationsPath,
  };
}

export function loadLoreArtifacts(outputDir) {
  const absoluteOutputDir = path.resolve(outputDir);
  const manifestPath = path.join(absoluteOutputDir, 'manifest.json');
  const chunksPath = path.join(absoluteOutputDir, 'chunks.json');
  const factsPath = path.join(absoluteOutputDir, 'facts.json');
  const migrationsPath = path.join(absoluteOutputDir, 'migrations.json');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(chunksPath)) {
    return null;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
  if (!Array.isArray(chunks)) return null;
  const facts = fs.existsSync(factsPath)
    ? JSON.parse(fs.readFileSync(factsPath, 'utf8'))
    : [];
  const migrations = fs.existsSync(migrationsPath)
    ? JSON.parse(fs.readFileSync(migrationsPath, 'utf8'))
    : {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      fromArtifactVersion: null,
      toArtifactVersion: normalizeOptionalString(manifest?.loreArtifactVersion) ?? null,
      mappings: [],
      unresolvedOldFacts: [],
    };
  const safeFacts = Array.isArray(facts) ? facts : [];
  const factById = {};
  const factsByChunkId = {};
  for (const fact of safeFacts) {
    const factId = normalizeOptionalString(fact?.factId);
    if (!factId) continue;
    factById[factId] = fact;
    const chunkIds = Array.isArray(fact?.chunkIds)
      ? fact.chunkIds.filter((entry) => typeof entry === 'string')
      : [normalizeOptionalString(fact?.chunkId)].filter(Boolean);
    for (const chunkId of chunkIds) {
      if (!factsByChunkId[chunkId]) factsByChunkId[chunkId] = [];
      factsByChunkId[chunkId].push(fact);
    }
  }

  return {
    manifest,
    chunks,
    facts: safeFacts,
    migrations,
    factById,
    factsByChunkId,
  };
}

function scoreChunk(queryTokens, chunk, options = {}) {
  const baseTokens = Array.isArray(chunk.tokens) ? chunk.tokens : [];
  const tokenSet = new Set(baseTokens);
  const stemSet = new Set(baseTokens.map((token) => stemToken(token)));

  const headingTokens = tokenize(`${chunk.sectionHeading ?? ''}`);
  const headingSet = new Set(headingTokens);
  const headingStemSet = new Set(headingTokens.map((token) => stemToken(token)));
  const scopeTokenSet = collectChunkScopeTokens(chunk);

  let score = 0;
  for (const token of queryTokens) {
    const queryStem = stemToken(token);
    if (tokenSet.has(token)) {
      score += 1;
    } else if (stemSet.has(queryStem)) {
      score += 0.8;
    }

    if (headingSet.has(token)) {
      score += 0.5;
    } else if (headingStemSet.has(queryStem)) {
      score += 0.4;
    }

    if (scopeTokenSet.has(token)) {
      score += 0.9;
    } else if (scopeTokenSet.has(queryStem)) {
      score += 0.7;
    }
  }

  const filters = options.filters ?? {};
  const entityIds = normalizeStringArray(filters.entityIds);
  const locationIds = normalizeStringArray(filters.locationIds);
  const factionIds = normalizeStringArray(filters.factionIds);
  const beatIds = normalizeStringArray(options.activeBeatIds);
  const chunkMetadata = typeof chunk.metadata === 'object' && chunk.metadata !== null ? chunk.metadata : {};
  const chunkEntityIds = normalizeStringArray(chunkMetadata.entity_ids);
  const chunkLocationIds = normalizeStringArray(chunkMetadata.location_ids);
  const chunkFactionIds = normalizeStringArray(chunkMetadata.faction_ids);
  const chunkBeatIds = normalizeStringArray(chunkMetadata.beat_ids);
  const chunkCanonLevel = normalizeOptionalString(chunk.canonLevel ?? chunkMetadata.canon_level);
  const requestedCanonLevel = normalizeOptionalString(filters.canonLevel);
  const chunkTimePeriod = normalizeOptionalString(chunkMetadata.time_period);
  const requestedTimePeriod = normalizeOptionalString(filters.timePeriod);

  if (entityIds.length > 0 && entityIds.some((id) => chunkEntityIds.includes(id))) {
    score += 2;
  }
  if (locationIds.length > 0 && locationIds.some((id) => chunkLocationIds.includes(id))) {
    score += 2;
  }
  if (factionIds.length > 0 && factionIds.some((id) => chunkFactionIds.includes(id))) {
    score += 2;
  }
  if (beatIds.length > 0 && beatIds.some((id) => chunkBeatIds.includes(id))) {
    score += 3;
  }
  if (requestedCanonLevel && chunkCanonLevel === requestedCanonLevel) {
    score += 1.2;
  }
  if (requestedTimePeriod && chunkTimePeriod === requestedTimePeriod) {
    score += 1;
  }

  const identityConfig = options.identityConfig ?? buildIdentityRetrievalConfig(options);
  const chunkIdentity = options.chunkIdentity ?? classifyChunkIdentity(chunk, identityConfig);
  const queryType = identityConfig.queryType;

  if (queryType === 'self_query') {
    if (chunkIdentity.selfEntityMatch) {
      score += 4;
    }
    if (chunkIdentity.pool === 'self') {
      score += 1.8;
    }
    if (chunkIdentity.pool === 'related') {
      score -= 0.8;
    }
    if (chunkIdentity.hasForeignEntity) {
      score -= 2.4;
    }
  } else if (queryType === 'other_query') {
    if (chunkIdentity.pool === 'related') {
      score += 1.2;
    }
    if (chunkIdentity.pool === 'self') {
      score -= 0.3;
    }
  } else if (queryType === 'world_query') {
    if (chunkIdentity.pool === 'ambient') {
      score += 0.8;
    }
    if (chunkIdentity.pool === 'self') {
      score -= 0.2;
    }
  } else if (queryType === 'mixed_query') {
    if (chunkIdentity.pool === 'self') {
      score += 0.9;
    }
    if (chunkIdentity.pool === 'ambient') {
      score += 0.5;
    }
  }

  return score;
}

export function retrieveLoreChunks(artifacts, query, options = {}) {
  if (!artifacts || !Array.isArray(artifacts.chunks)) return [];

  const maxResults = Math.max(1, options.maxResults ?? 3);
  const queryTokens = tokenize(query);
  const identityConfig = buildIdentityRetrievalConfig(options);
  const scopeFilters = identityConfig.scopeFilters;
  if (queryTokens.length === 0) return [];

  return artifacts.chunks
    .filter((chunk) => matchesLoreScope(chunk, scopeFilters))
    .map((chunk) => {
      const chunkIdentity = classifyChunkIdentity(chunk, identityConfig);
      return {
        chunk,
        score: scoreChunk(queryTokens, chunk, {
          ...options,
          identityConfig,
          chunkIdentity,
        }),
        pool: chunkIdentity.pool,
        poolRank: chunkIdentity.poolRank,
        selfEntityMatch: chunkIdentity.selfEntityMatch,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (
      b.score - a.score
      || a.poolRank - b.poolRank
      || a.chunk.chunkId.localeCompare(b.chunk.chunkId)
    ))
    .slice(0, maxResults);
}

export function buildLoreGroundedTurn(query, matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }

  const topMatch = matches[0]?.chunk;
  if (!topMatch) return null;

  return {
    utterance: topMatch.summary,
    emotion: 'informed',
    intent: 'answer_lore',
    proposedIntents: [],
    citations: matches.map((entry) => ({
      sourceId: entry.chunk.chunkId,
      snippet: `${entry.chunk.sourceFile}#${entry.chunk.sectionHeading}`,
      sourceCommit: normalizeOptionalString(entry.chunk.sourceCommit),
      sourceRepo: normalizeOptionalString(entry.chunk.sourceRepo),
    })),
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
    debug: {
      query,
      topSourceFile: topMatch.sourceFile,
    },
  };
}
