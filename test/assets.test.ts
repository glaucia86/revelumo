import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assetPath } from '../src/main/assets.ts';
const root = resolve('/app/renderer');
test('serves only packaged assets under the app origin', () => {
  assert.equal(assetPath(root, 'app://revelumo/index.html'), resolve(root, 'index.html'));
  assert.equal(assetPath(root, 'app://revelumo/assets/app.js'), resolve(root, 'assets/app.js'));
});
test('rejects foreign origins, escapes and non-asset extensions', () => {
  for (const url of ['file:///etc/passwd', 'app://evil/index.html', 'app://revelumo/%2fetc/passwd',
    'app://revelumo/..%2f..%2foutside.js', 'app://revelumo/data.sqlite', 'bad URL',
    'app://revelumo/..%5coutside.js', 'app://revelumo/foo%00.js']) assert.equal(assetPath(root, url), null, url);
});
