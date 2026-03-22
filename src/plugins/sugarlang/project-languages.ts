export function extractSugarlangTargetLanguages(projectData: unknown): string[] {
  if (!projectData || typeof projectData !== 'object') return [];
  const slConfig = (projectData as Record<string, unknown>).sugarlang;
  if (!slConfig || typeof slConfig !== 'object') return [];
  const config = slConfig as { artifacts?: Record<string, string>; disabledLanguages?: string[] };
  const artifacts = config.artifacts;
  if (!artifacts) return [];
  const disabled = new Set(config.disabledLanguages ?? []);

  return Object.keys(artifacts)
    .filter((key) => key.match(/^languages\/[a-z]+\/lexicon\.json$/))
    .map((key) => key.split('/')[1]!)
    .filter((language) => language !== 'en' && !disabled.has(language))
    .sort();
}
