import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, formatNumber, dictionaries } from '../src/shared/i18n/format.ts';
import type { MessageDescriptor } from '../src/shared/i18n/messages.ts';

test('translates the catalog shell into all supported languages', () => {
  assert.equal(translate('en', { key: 'shell.catalog' }), 'Catalog');
  assert.equal(translate('es', { key: 'shell.catalog' }), 'Catálogo');
  assert.equal(translate('pt-BR', { key: 'shell.catalog' }), 'Catálogo');
});

test('formats whole messages and locale numbers for 0, 1, 2 and 1000', () => {
  for (const count of [0, 1, 2, 1000]) {
    for (const locale of ['en', 'es', 'pt-BR'] as const) {
      const result = translate(locale, { key: 'import.failedFiles', params: { count } });
      assert.ok(result.includes(formatNumber(locale, count)));
      assert.equal(result, `${formatNumber(locale, count)} ${locale === 'en' ? count === 1 ? 'file not imported' : 'files not imported' : locale === 'es' ? count === 1 ? 'archivo no importado' : 'archivos no importados' : count === 0 || count === 1 ? 'arquivo não importado' : 'arquivos não importados'}`);
    }
  }
  assert.equal(formatNumber('en', 1000), '1,000');
  assert.equal(formatNumber('pt-BR', 1000), '1.000');
  assert.equal(formatNumber('es', 1000), '1000');
  assert.equal(translate('es', { key: 'import.progress', params: { completed: 2, total: 1000 } }), '2 de 1000 archivos');
});

test('unknown or malformed runtime descriptors never expose keys or untrusted text', () => {
  for (const descriptor of [null, { key: 'secret/path' }, { key: 'toString' }, { key: 'import.progress', params: { completed: 'secret/path', total: 2 } }]) {
    assert.equal(translate('es', descriptor as MessageDescriptor), 'No se pudo completar la operación. Inténtalo de nuevo.');
  }
});

test('every dictionary has the same keys, placeholders and plural variants', () => {
  for (const dictionary of [dictionaries.es, dictionaries['pt-BR']]) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(dictionaries.en).sort());
    for (const key of Object.keys(dictionaries.en) as (keyof typeof dictionaries.en)[]) {
      const placeholders = (value: unknown) => JSON.stringify(value).match(/\{\w+\}/g)?.sort() ?? [];
      assert.deepEqual(placeholders(dictionary[key]), placeholders(dictionaries.en[key]), key);
    }
  }
});

test('known missing translations fall back to English without exposing a key', () => {
  const saved = dictionaries.es['shell.catalog'];
  try {
    Reflect.deleteProperty(dictionaries.es, 'shell.catalog');
    assert.equal(translate('es', { key: 'shell.catalog' }), 'Catalog');
  } finally { dictionaries.es['shell.catalog'] = saved; }
});

test('each declared parameter appears in every translation variant', async () => {
  const { messageParameters } = await import('../src/shared/i18n/messages.ts');
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of Object.keys(messageParameters) as (keyof typeof messageParameters)[]) {
      const template = dictionary[key];
      for (const text of typeof template === 'string' ? [template] : [template.one, template.other]) {
        assert.deepEqual([...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort(), Object.keys(messageParameters[key]).sort(), key);
      }
    }
  }
});

test('filenames are preserved verbatim, and descriptors resolve in the current language', () => {
  const descriptor = { key: 'catalog.openNamed', params: { filename: 'ação_ñ_<img>.JPEG' } } as const;
  assert.equal(translate('en', descriptor), 'Open ação_ñ_<img>.JPEG');
  assert.equal(translate('es', descriptor), 'Abrir ação_ñ_<img>.JPEG');
  assert.equal(translate('pt-BR', { key: 'preferences.saveFailed' }), 'Não foi possível salvar o idioma. A escolha anterior foi mantida. Tente novamente.');
});

// Build-time examples guard the discriminated union's key/parameter relationship.
function descriptorTypeContract() {
  // @ts-expect-error A count is required.
  translate('en', { key: 'import.failedFiles' });
  // @ts-expect-error A numeric count cannot be a string.
  translate('en', { key: 'import.failedFiles', params: { count: '1' } });
  // @ts-expect-error Parameters are specific to their message.
  translate('en', { key: 'catalog.openNamed', params: { count: 1 } });
  // @ts-expect-error Static messages take no parameters.
  translate('en', { key: 'shell.catalog', params: { count: 1 } });
}
void descriptorTypeContract;

test('progress and catalog summaries use the total to choose singular and plural', () => {
  assert.equal(translate('en', { key: 'import.progress', params: { completed: 0, total: 1 } }), '0 of 1 file');
  assert.equal(translate('en', { key: 'catalog.summary', params: { count: 1, total: 1 } }), '1 of 1 photo.');
  assert.equal(translate('en', { key: 'catalog.summary', params: { count: 1, total: 2 } }), '1 of 2 photos.');
});

test('read-only preferences explain safe recovery without suggesting deletion', () => {
  assert.equal(translate('en', { key: 'preferences.readOnly' }), 'The preferences file cannot be changed safely. Correct the file or use a compatible version, then try again.');
  assert.equal(translate('es', { key: 'preferences.readOnly' }), 'El archivo de preferencias no se puede modificar de forma segura. Corrige el archivo o usa una versión compatible e inténtalo de nuevo.');
  assert.equal(translate('pt-BR', { key: 'preferences.readOnly' }), 'O arquivo de preferências não pode ser alterado com segurança. Corrija o arquivo ou use uma versão compatível e tente novamente.');
});

test('editor keeps photographic units and filenames while translating accessible names and star plurals', () => {
  assert.equal(translate('en', { key: 'editor.exposureValue' }), 'Exposure in EV');
  assert.equal(translate('es', { key: 'editor.previewCaption' }), 'Vista previa sRGB de hasta 2048 px');
  assert.equal(translate('pt-BR', { key: 'editor.previewLabel', params: { filename: 'ação_ñ_<img>.JPEG' } }), 'Prévia de edição de ação_ñ_<img>.JPEG');
  for (const [locale, one, many] of [['en', '1 star', '5 stars'], ['es', '1 estrella', '5 estrellas'], ['pt-BR', '1 estrela', '5 estrelas']] as const) {
    assert.equal(translate(locale, { key: 'classification.count', params: { count: 1 } }), one);
    assert.equal(translate(locale, { key: 'classification.count', params: { count: 5 } }), many);
  }
});

test('save failure translations explain that the last saved adjustment is preserved', () => {
  assert.equal(translate('en', { key: 'errors.saveAdjustment' }), 'Could not save the adjustment. The last confirmed adjustment was preserved. Try again.');
  assert.equal(translate('es', { key: 'errors.saveAdjustment' }), 'No se pudo guardar el ajuste. Se conservó el último ajuste confirmado. Inténtalo de nuevo.');
  assert.equal(translate('pt-BR', { key: 'errors.saveAdjustment' }), 'Não foi possível salvar o ajuste. O último ajuste confirmado foi preservado. Tente novamente.');
});
