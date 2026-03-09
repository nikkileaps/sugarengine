/**
 * Migration utility: export existing Find the Luggage TypeScript content
 * as JSON artifact files in the V1 on-disk layout.
 *
 * This can be run from the editor or CLI to bootstrap the artifact directory.
 * After migration, the runtime loads from persisted JSON files rather than
 * from compiled TypeScript modules.
 */

import { FIND_THE_LUGGAGE_BUNDLE } from './find-the-luggage';
import { serializeContentBundle, type ArtifactStatus } from './artifacts';

/**
 * Generate the full set of JSON artifact files for the built-in
 * Find the Luggage demo content.
 *
 * Returns Map<relativePath, jsonString> suitable for writing to
 * plugins/sugarlang/ via the plugin artifact I/O layer.
 */
export function generateFindTheLuggageArtifacts(
  status: ArtifactStatus = 'approved',
): Map<string, string> {
  return serializeContentBundle(FIND_THE_LUGGAGE_BUNDLE, status);
}
