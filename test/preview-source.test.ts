import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PreviewSource } from '../src/renderer/preview-source.ts';

const photo = { id: 'photo-a', name: 'a.jpg' };
test('a preview delivers its owned compressed payload only once, before transfer', () => {
  const bytes = new Uint8Array([255, 216, 255, 217]).buffer;
  const source = new PreviewSource({ photo, bytes });
  assert.equal(source.take(), bytes);
  assert.equal(source.take(), null);
  const delivered = structuredClone(bytes, { transfer: [bytes] });
  assert.equal(bytes.byteLength, 0);
  assert.deepEqual([...new Uint8Array(delivered)], [255, 216, 255, 217]);
  source.release(); source.release();
  assert.equal(source.take(), null);
  assert.deepEqual(source.photo, photo);
});
test('retiring before delivery drops the payload and is idempotent', () => {
  const source = new PreviewSource({ photo, bytes: new Uint8Array([255, 216, 255, 217]).buffer });
  source.release(); source.release();
  assert.equal(source.take(), null);
  assert.deepEqual(source.photo, photo);
});

test('discarding an undelivered preview returns its reservation exactly once', () => {
  const reservation = { lease: 'preview-a', generation: 1 };
  const releases: unknown[] = [];
  const source = new PreviewSource({ photo, bytes: new Uint8Array([255, 216, 255, 217]).buffer, reservation }, value => { releases.push(value); });
  source.release(); source.release();
  assert.equal(source.take(), null);
  assert.deepEqual(releases, [reservation]);
});

test('retiring a delivered preview keeps its reservation charged until the consumer acknowledges', () => {
  const reservation = { lease: 'preview-b', generation: 2 };
  const releases: unknown[] = [];
  const source = new PreviewSource({ photo, bytes: new Uint8Array([255, 216, 255, 217]).buffer, reservation }, value => { releases.push(value); });
  const bytes = source.take()!;
  const delivered = structuredClone(bytes, { transfer: [bytes] });
  source.release(); source.release();
  assert.deepEqual(releases, [], 'the Worker still owns the compressed input after parent retirement');
  assert.equal(delivered.byteLength, 4);
  source.consumed(); source.consumed(); source.release();
  assert.deepEqual(releases, [reservation]);
  assert.equal(source.take(), null);
});

test('a failed reservation acknowledgement is contained without retrying an uncertain release', async () => {
  for (const reject of [() => { throw new Error('bridge closed'); }, () => Promise.reject(new Error('bridge closed'))]) {
    let attempts = 0;
    const source = new PreviewSource({ photo, bytes: new Uint8Array([255, 216, 255, 217]).buffer, reservation: { lease: 'preview-c', generation: 3 } }, () => { attempts++; return reject(); });
    assert.doesNotThrow(() => source.release());
    source.release(); source.consumed();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 1);
    assert.equal(source.take(), null);
  }
});
