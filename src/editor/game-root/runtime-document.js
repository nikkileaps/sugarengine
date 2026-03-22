/**
 * Canonical runtime-document builder shared by preview and published exports.
 *
 * The authored project document is not the same shape as the runtime game document:
 * plugin-owned runtime payloads like Sugarlang artifacts may live outside project.sgrgame
 * and must be materialized explicitly here.
 */

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function buildSugarlangRuntimeConfig(options) {
  if (!options || typeof options !== 'object') return undefined;
  if (options.enabled === false) return undefined;

  const disabledLanguages = normalizeStringArray(options.disabledLanguages);
  const artifacts = (
    options.artifacts
    && typeof options.artifacts === 'object'
    && !Array.isArray(options.artifacts)
  )
    ? Object.fromEntries(
        Object.entries(options.artifacts).filter(([, value]) => typeof value === 'string'),
      )
    : {};

  return Object.keys(artifacts).length > 0
    ? { enabled: true, artifacts, disabledLanguages }
    : { enabled: true, disabledLanguages };
}

export function buildRuntimeProjectDocument(options) {
  const {
    project,
    contentBasePath,
    sugarlang,
  } = options;

  return {
    version: 1,
    ...project,
    meta: {
      ...project.meta,
      contentBasePath,
    },
    defaultEpisode: project.defaultEpisode ?? project.episodes?.[0]?.id,
    ...(sugarlang ? { sugarlang } : {}),
  };
}
