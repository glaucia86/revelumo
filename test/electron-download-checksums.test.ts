import { test } from 'node:test';
import assert from 'node:assert/strict';
import { electronDownloadChecksums } from '../scripts/electron-download-checksums.ts';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadArtifact } from '@electron/get';

test('packaging refuses a missing official checksum or mismatched installed version', () => {
  assert.throws(() => electronDownloadChecksums({ expectedVersion: '44.7.0', installedVersion: '44.7.0', platform: 'linux', arch: 'x64', checksums: {} }), /checksum/i);
  assert.throws(() => electronDownloadChecksums({ expectedVersion: '44.7.0', installedVersion: '44.6.0', platform: 'linux', arch: 'x64', checksums: {} }), /version/i);
});

test('the official Electron download validator rejects a corrupted archive against npm-pinned checksums', async t => {
  const require = createRequire(import.meta.url);
  const version = require('electron/package.json').version;
  const official = require('electron/checksums.json');
  const checksums = electronDownloadChecksums({ expectedVersion: version, installedVersion: version,
    platform: process.platform, arch: process.arch, checksums: official });
  assert.deepEqual(checksums, official);
  const root = mkdtempSync(join(tmpdir(), 'revelumo-checksum-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await assert.rejects(downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch,
    cacheRoot: join(root, 'cache'), tempDirectory: root, checksums,
    downloader: { async download(_url, target) { writeFileSync(target, 'synthetic corrupted ZIP'); } },
  }), /checksum/i);
});

test('an incompatible target checksum cannot be substituted for the requested archive', () => {
  assert.throws(() => electronDownloadChecksums({ expectedVersion: '44.7.0', installedVersion: '44.7.0', platform: 'win32', arch: 'x64',
    checksums: { 'electron-v44.7.0-linux-x64.zip': 'a'.repeat(64) } }), /win32-x64/);
  assert.throws(() => electronDownloadChecksums({ expectedVersion: '44.7.0', installedVersion: '44.7.0', platform: 'linux', arch: 'x64',
    checksums: { 'electron-v44.7.0-linux-x64.zip': 'invalid' } }), /invalid/);
});
