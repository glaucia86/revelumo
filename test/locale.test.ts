import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage } from '../src/shared/i18n/locale.ts';

test('system selects first supported language and normalizes OS variants', () => {
  assert.equal(resolveLanguage('system', ['fr-CA', 'es-419', 'en-US']), 'es');
  assert.equal(resolveLanguage('system', ['pt_PT.UTF-8']), 'pt-BR');
  assert.equal(resolveLanguage('system', ['en-GB']), 'en');
  assert.equal(resolveLanguage('system', ['ja-JP']), 'en');
  assert.equal(resolveLanguage('system', []), 'en');
  assert.equal(resolveLanguage('es', ['pt-BR']), 'es');
});

test('malformed preferences cannot manufacture a supported language', () => {
  for (const preferred of [null, {}, 'pt-BR', [false, null, 4], ['pt-bogus!'], ['en_US.badencoding', 'es-419'], [' pt-BR', 'es-ES']]) {
    assert.equal(resolveLanguage('system', preferred), Array.isArray(preferred) && preferred.includes('es-419') || Array.isArray(preferred) && preferred.includes('es-ES') ? 'es' : 'en');
  }
  assert.equal(resolveLanguage('system', ['pt_PT.UTF-8@euro']), 'pt-BR');
  assert.equal(resolveLanguage('system', ['PT_br']), 'pt-BR');
});
