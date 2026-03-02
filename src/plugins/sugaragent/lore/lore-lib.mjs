import fs from 'node:fs';
import path from 'node:path';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
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
    return { metadata: {}, body: rawMarkdown };
  }

  const closingIndex = rawMarkdown.indexOf('\n---\n', 4);
  if (closingIndex < 0) {
    return { metadata: {}, body: rawMarkdown };
  }

  const frontmatterBlock = rawMarkdown.slice(4, closingIndex);
  const body = rawMarkdown.slice(closingIndex + 5);
  return {
    metadata: parseFrontmatter(frontmatterBlock),
    body,
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

function sectionizeMarkdown(markdownBody) {
  const lines = markdownBody.split('\n');
  const sections = [];
  let current = {
    heading: 'Introduction',
    contentLines: [],
  };

  const flush = () => {
    const text = normalizeWhitespace(current.contentLines.join('\n'));
    if (!text) return;
    sections.push({
      heading: current.heading,
      text,
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      current = {
        heading: headingMatch[2].trim(),
        contentLines: [],
      };
      continue;
    }
    current.contentLines.push(line);
  }

  flush();
  return sections;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
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

export function ingestLoreDirectory({
  sourceDir,
  commit,
  repo = 'local',
  ref,
  toolVersion = 'phase2',
}) {
  const absoluteSourceDir = path.resolve(sourceDir);
  if (!fs.existsSync(absoluteSourceDir)) {
    throw new Error(`Lore source directory does not exist: ${absoluteSourceDir}`);
  }

  const markdownFiles = collectMarkdownFiles(absoluteSourceDir);
  const chunks = [];
  const issues = [];

  for (const absoluteFilePath of markdownFiles) {
    const relativeFilePath = path.relative(absoluteSourceDir, absoluteFilePath);
    const raw = fs.readFileSync(absoluteFilePath, 'utf8');
    const { metadata, body } = splitFrontmatter(raw);

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

    const sections = sectionizeMarkdown(body);
    if (sections.length === 0) {
      issues.push(`No usable markdown content in ${relativeFilePath}`);
      continue;
    }

    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      if (!section) continue;
      const sectionSlug = slugify(section.heading || `section-${i + 1}`) || `section-${i + 1}`;
      const chunkId = `${metadata.id}#${sectionSlug}`;
      chunks.push({
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
        },
      });
    }
  }

  if (chunks.length === 0) {
    throw new Error(issues[0] ?? 'No lore chunks generated.');
  }

  const manifest = {
    schemaVersion: 1,
    source: {
      repo,
      commit,
      ref: normalizeOptionalString(ref),
    },
    generatedAt: new Date().toISOString(),
    toolVersion,
    counts: {
      files: markdownFiles.length,
      chunks: chunks.length,
      issues: issues.length,
    },
  };

  return {
    manifest,
    chunks,
    issues,
  };
}

export function writeLoreArtifacts(outputDir, artifacts) {
  const absoluteOutputDir = path.resolve(outputDir);
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  const manifestPath = path.join(absoluteOutputDir, 'manifest.json');
  const chunksPath = path.join(absoluteOutputDir, 'chunks.json');

  fs.writeFileSync(manifestPath, `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(chunksPath, `${JSON.stringify(artifacts.chunks, null, 2)}\n`, 'utf8');

  return {
    manifestPath,
    chunksPath,
  };
}

export function loadLoreArtifacts(outputDir) {
  const absoluteOutputDir = path.resolve(outputDir);
  const manifestPath = path.join(absoluteOutputDir, 'manifest.json');
  const chunksPath = path.join(absoluteOutputDir, 'chunks.json');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(chunksPath)) {
    return null;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
  if (!Array.isArray(chunks)) return null;

  return {
    manifest,
    chunks,
  };
}

function scoreChunk(queryTokens, chunk, options = {}) {
  const baseTokens = Array.isArray(chunk.tokens) ? chunk.tokens : [];
  const tokenSet = new Set(baseTokens);
  const stemSet = new Set(baseTokens.map((token) => stemToken(token)));

  const headingTokens = tokenize(`${chunk.sectionHeading ?? ''}`);
  const headingSet = new Set(headingTokens);
  const headingStemSet = new Set(headingTokens.map((token) => stemToken(token)));

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

  return score;
}

export function retrieveLoreChunks(artifacts, query, options = {}) {
  if (!artifacts || !Array.isArray(artifacts.chunks)) return [];

  const maxResults = Math.max(1, options.maxResults ?? 3);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  return artifacts.chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(queryTokens, chunk, options),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.chunkId.localeCompare(b.chunk.chunkId))
    .slice(0, maxResults);
}

export function buildLoreGroundedTurn(query, matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }

  const topMatch = matches[0]?.chunk;
  if (!topMatch) return null;

  return {
    utterance: `From the archives: ${topMatch.summary}`,
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
