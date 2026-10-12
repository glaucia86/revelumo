import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../src/shared/requests.ts';
const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425';
test('classification IPC accepts only exact UUID requests and the proposed rating/flag states', () => {
  assert.deepEqual(parseRequest({ op: 'classification', id }), { op: 'classification', id });
  for (const rating of [null, 1, 2, 3, 4, 5]) for (const flag of ['neutral', 'selected', 'rejected']) {
    const request = { op: 'classify', id, rating, flag };
    assert.deepEqual(parseRequest(request), request);
  }
  for (const rating of [undefined, 0, 6, 2.5, '3', NaN, Infinity, {}, []]) assert.equal(parseRequest({ op: 'classify', id, rating, flag: 'neutral' }), null);
  for (const flag of [undefined, null, 'picked', 1, [], {}]) assert.equal(parseRequest({ op: 'classify', id, rating: 3, flag }), null);
  for (const invalid of [
    { op: 'classify', id: '/photos/a.jpg', rating: 3, flag: 'selected' },
    { op: 'classify', id, rating: 3, flag: 'selected', path: '/photos/a.jpg' },
    { op: 'classification', id, rating: 3 },
  ]) assert.equal(parseRequest(invalid), null);
});
