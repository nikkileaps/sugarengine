import { describe, expect, it } from 'vitest';
import { parseGroundedReplyAuditDetailed } from './reply-audit';

describe('reply-audit', () => {
  it('parses wrapped grounded audit JSON', () => {
    expect(parseGroundedReplyAuditDetailed('preface {"partAudits":[{"partIndex":0,"role":"social","claimOrdinals":[],"hedgeSufficient":true},{"partIndex":1,"role":"knowledge","claimOrdinals":[1],"hedgeSufficient":true,"notes":"states claim 1"}],"unsupportedFacts":[]} trailing')).toEqual({
      audit: {
        partAudits: [
          {
            partIndex: 0,
            role: 'social',
            claimOrdinals: [],
            hedgeSufficient: true,
          },
          {
            partIndex: 1,
            role: 'knowledge',
            claimOrdinals: [1],
            hedgeSufficient: true,
            notes: 'states claim 1',
          },
        ],
        unsupportedFacts: [],
      },
    });
  });

  it('returns invalid_part when the shape is wrong', () => {
    expect(parseGroundedReplyAuditDetailed('{"partAudits":"bad","unsupportedFacts":[]}')).toEqual({
      audit: null,
      failureReason: 'invalid_part',
    });
  });
});
