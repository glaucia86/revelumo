import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJpegExportRequest } from '../src/shared/jpeg-export-request.ts';
const attemptId = '44444444-4444-4444-8444-444444444444';
const id = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222';
test('accepts only bounded ID-scoped export requests without renderer authority over files or recipes', () => {
  for (const input of [{ op: 'start', attemptId, id, sessionId, revision: 0 }, { op: 'recover', attemptId, id, sessionId, revision: 0 }, { op: 'status', jobId: id }, { op: 'cancel', jobId: id }]) assert.deepEqual(parseJpegExportRequest(input), input);
  for (const input of [null, [], { op: 'start', attemptId, id, sessionId, revision: -1 }, { op: 'start', attemptId, id, sessionId, revision: Number.MAX_SAFE_INTEGER + 1 },
    { op: 'start', attemptId, id, sessionId: 'foreign', revision: 0 }, { op: 'start', attemptId, id, sessionId, revision: 0, destination: '/tmp/anything' },
    { op: 'start', attemptId, id, sessionId, revision: 0, recipe: {} }, { op: 'cancel', jobId: id, owner: 1 }, { op: 'status', jobId: '../../catalog.sqlite' }]) assert.equal(parseJpegExportRequest(input), null);
});
