import { describe, expect, it } from 'vitest';
import {
  localizeGroundedReplyExemplar,
  localizeGroundedUncertaintyReply,
} from './language-stock';

describe('language-stock', () => {
  it('provides target-language grounded exemplars for Spanish', () => {
    expect(localizeGroundedReplyExemplar('grounded', 'es')).toBe('Estamos en la estacion ahora.');
    expect(localizeGroundedReplyExemplar('inferred', 'es')).toBe('Creo que el hotel esta cerca.');
    expect(localizeGroundedReplyExemplar('rumor', 'es')).toBe('Oi que la estacion cierra temprano.');
    expect(localizeGroundedReplyExemplar('uncertain', 'es')).toBe('No lo se.');
  });

  it('keeps uncertainty localization behavior unchanged', () => {
    expect(localizeGroundedUncertaintyReply('world_query', 'es')).toBe('No lo se.');
    expect(localizeGroundedUncertaintyReply('world_query', 'fr')).toBe('Je ne sais pas.');
  });
});
