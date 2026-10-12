import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFailureMessage } from '../src/shared/jpeg-export-messages.ts';
import { translate } from '../src/shared/i18n/format.ts';
test('export limits and failures use localized actionable descriptors without raw errors', () => {
  for (const locale of ['en', 'pt-BR', 'es'] as const) {
    assert.match(translate(locale, exportFailureMessage('OUTPUT_TOO_LARGE')), /32 MiB/);
    assert.match(translate(locale, exportFailureMessage('SOURCE_TOO_LARGE')), /32 MiB/);
    assert.notEqual(translate(locale, exportFailureMessage('DESTINATION_EXISTS')), translate(locale, exportFailureMessage('EXPORT_FAILED')));
    assert.equal(exportFailureMessage('/private/arbitrary<script>').key, 'export.failed');
  }
});
