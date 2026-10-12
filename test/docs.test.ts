import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkDocs } from '../scripts/check-docs.mjs';

const readmes = ['README.md', 'README.pt-BR.md', 'README.es.md'];
const documents = [...readmes, 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'THIRD_PARTY_NOTICES.md'];

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'revelumo-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file: string, content: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  for (const file of documents) {
    const navigation = readmes.includes(file)
      ? readmes.filter(other => other !== file).map(other => `[Language](${other})`).join(' · ')
      : '';
    write(file, `# Project\n\n${navigation}\n`);
  }
  write('LICENSE', 'License text');
  return { root, write };
}

test('reports missing required entry documents and LICENSE', t => {
  const { root } = fixture(t);
  rmSync(join(root, 'SUPPORT.md'));
  rmSync(join(root, 'LICENSE'));
  assert.deepEqual(checkDocs(root), [
    { file: 'SUPPORT.md', line: 1, message: 'Required file is missing.' },
    { file: 'LICENSE', line: 1, message: 'Required file is missing.' },
  ]);
});

test('checks Markdown links, images, and HTML href/src with source lines', t => {
  const { root, write } = fixture(t);
  write('SUPPORT.md', '# Help\n\n[Read](missing.md)\n![Image](missing.png)\n<a href="lost.md">Lost</a>\n<img src="lost.png" />\n');
  const errors = checkDocs(root);
  assert.deepEqual(errors.map(({ file, line }) => ({ file, line })), [
    { file: 'SUPPORT.md', line: 3 }, { file: 'SUPPORT.md', line: 4 },
    { file: 'SUPPORT.md', line: 5 }, { file: 'SUPPORT.md', line: 6 },
  ]);
  assert.match(errors[0].message, /missing\.md.*missing/i);
});

test('checks local fragments against heading slugs and explicit HTML anchors', t => {
  const { root, write } = fixture(t);
  write('docs/guide.md', '# Guia útil: instalação!\n## Repeat\n## Repeat\n<a id="stable"></a>\n<a name="legacy"></a>\n<h3 id="html">HTML heading</h3>\n');
  write('SUPPORT.md', '# Help\n[Self](#help)\n[Heading](docs/guide.md#guia-útil-instalação)\n[Duplicate](docs/guide.md#repeat-1)\n[Stable](docs/guide.md#stable)\n[Named](docs/guide.md#legacy)\n[HTML](docs/guide.md#html)\n[Missing](docs/guide.md#no-such-heading)\n');
  assert.deepEqual(checkDocs(root), [
    { file: 'SUPPORT.md', line: 8, message: 'Anchor "#no-such-heading" is missing in "docs/guide.md".' },
  ]);
});

test('resolves links relative to their source and decodes URL paths and fragments once', t => {
  const { root, write } = fixture(t);
  write('docs/space name(1).md', '# Ação útil\n');
  write('docs/100%.md', '# Percent\n');
  write('docs/nested/entry.md', '[Encoded](../space%20name%281%29.md?view=1#a%C3%A7%C3%A3o-%C3%BAtil)\n[License](../../LICENSE)\n[Percent](../100%25.md)\n');
  assert.deepEqual(checkDocs(root, { documents: ['docs/nested/entry.md'], readmes: [] }), []);
});

test('reports malformed URL encoding without aborting the remaining checks', t => {
  const { root, write } = fixture(t);
  write('SUPPORT.md', '[Bad path](wrong%ZZ.md)\n[Bad anchor](#bad%GG)\n[Missing](lost.md)\n');
  const errors = checkDocs(root);
  assert.equal(errors.length, 3);
  assert.match(errors[0].message, /encoding/i);
  assert.match(errors[1].message, /encoding/i);
  assert.match(errors[2].message, /lost\.md.*missing/i);
});

test('ignores examples in fenced, indented and inline code and HTML comments', t => {
  const { root, write } = fixture(t);
  write('SUPPORT.md', [
    '# Help', '````markdown', '[Example](fake.md)', '```', '<a id="fake"></a>',
    '````', '~~~md', '[Example](fake.md)', '~~~',
    '    [Indented](fake.md)', '`[Inline](fake.md)`', '``<img src="fake.png">``',
    '<!-- [Hidden](fake.md)', '<a id="hidden"></a> -->', '[Real](#fake)', '[Real](#hidden)',
  ].join('\n'));
  const errors = checkDocs(root);
  assert.deepEqual(errors.map(error => error.line), [15, 16]);
  assert.ok(errors.every(error => /Anchor/.test(error.message)));
});

test('ignores external and email destinations without fetching or executing Markdown', t => {
  const { root, write } = fixture(t);
  write('SUPPORT.md', '[Web](https://example.invalid/%ZZ#missing)\n[HTTP](http://example.invalid)\n[Email](mailto:security@example.invalid)\n[CDN](//example.invalid/missing.png)\n```sh\ntouch should-not-exist\n```\n');
  assert.deepEqual(checkDocs(root), []);
});

test('rejects path escapes, absolute paths, backslashes and NULs', t => {
  const { root, write } = fixture(t);
  const paths = ['../outside.md', '%2e%2e/outside.md', '/etc/passwd', 'C:/outside.md', 'docs%5cfile.md', 'bad%00.md'];
  write('SUPPORT.md', paths.map(path => `[Outside](${path})`).join('\n'));
  const errors = checkDocs(root);
  assert.equal(errors.length, paths.length);
  assert.ok(errors.every(error => /outside|unsafe/i.test(error.message)), JSON.stringify(errors));
});

test('rejects symlinked files and directories, even if their target is inside the repository', t => {
  const { root, write } = fixture(t);
  write('docs/real.md', '# Real\n');
  const directory = join(root, 'alias');
  // Junctions work on Windows without the privileges required for file symlinks.
  symlinkSync(join(root, 'docs'), directory, process.platform === 'win32' ? 'junction' : 'dir');
  write('SUPPORT.md', '[Symlink](alias/real.md#real)\n');
  assert.match(checkDocs(root)[0]?.message ?? '', /symlink/i);
  rmSync(join(root, 'LICENSE'));
  symlinkSync(join(root, 'docs'), join(root, 'LICENSE'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok(checkDocs(root).some(error => error.file === 'LICENSE' && /symlink/i.test(error.message)));
});

test('reports directory targets instead of trying to read them as documents', t => {
  const { root, write } = fixture(t);
  write('docs/real.md', '# Real\n');
  write('SUPPORT.md', '[Directory](docs#real)\n');
  assert.match(checkDocs(root)[0]?.message ?? '', /regular file/i);
});

test('requires real navigation links between each README language', t => {
  const { root, write } = fixture(t);
  write('README.md', '# Project\n[Spanish](./README.es.md#project)\n`[Português](README.pt-BR.md)`\n![Not navigation](README.pt-BR.md)\n');
  assert.deepEqual(checkDocs(root), [
    { file: 'README.md', line: 1, message: 'Missing language navigation link to "README.pt-BR.md".' },
  ]);
});

test('CLI succeeds for valid documents and exits nonzero with actionable diagnostics', t => {
  const { root, write } = fixture(t);
  const script = fileURLToPath(new URL('../scripts/check-docs.mjs', import.meta.url));
  const valid = spawnSync(process.execPath, [script, root], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /documentation.*passed/i);
  write('SUPPORT.md', '# Help\n\n[Broken](lost.md)\n');
  const invalid = spawnSync(process.execPath, [script, root], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /SUPPORT\.md:3:.*lost\.md.*missing/i);
});

test('handles reference links and images while ignoring unused reference definitions', t => {
  const { root, write } = fixture(t);
  write('SUPPORT.md', '[Read][guide]\n![Picture][image]\n[License][]\n[Security]\n\n[guide]: missing.md "A title"\n[image]: missing.png\n[license]: LICENSE\n[security]: SECURITY.md\n[unused]: unused.md\n');
  const errors = checkDocs(root);
  assert.deepEqual(errors.map(error => error.line), [1, 2]);
  assert.match(errors[0].message, /missing\.md/);
  assert.match(errors[1].message, /missing\.png/);
});

test('accepts balanced parentheses and angle destinations and ignores escaped example links', t => {
  const { root, write } = fixture(t);
  write('docs/file(1).md', '# File\n');
  write('docs/space name.md', '# File\n');
  write('SUPPORT.md', '[Balanced](docs/file(1).md "Title")\n[Angle](<docs/space name.md>)\n\\[Example](absent.md)\n[Escaped](docs/file\\(1\\).md)\n');
  assert.deepEqual(checkDocs(root), []);
});

test('recognizes formatted and setext headings and decodes common HTML entities', t => {
  const { root, write } = fixture(t);
  write('docs/a&b.md', '# Run `npm test` &amp; [check](other.md)\n\nQuick start\n---\n\n<h3>HTML title</h3>\n<a id="a&amp;b"></a>\n');
  write('SUPPORT.md', '<a href="docs/a&amp;b.md#run-npm-test--check">Run</a>\n[Start](docs/a%26b.md#quick-start)\n[HTML](docs/a%26b.md#html-title)\n[ID](docs/a%26b.md#a%26b)\n');
  assert.deepEqual(checkDocs(root), []);
});

test('uses the rendered label of reference links in heading anchors', t => {
  const { root, write } = fixture(t);
  write('docs/guide.md', '# [Release][release]\n\n[release]: https://example.invalid\n');
  write('SUPPORT.md', '[Release](docs/guide.md#release)\n');
  assert.deepEqual(checkDocs(root), []);
});

test('unescapes Markdown punctuation in reference destinations', t => {
  const { root, write } = fixture(t);
  write('docs/file(1).md', '# File\n');
  write('SUPPORT.md', '[Guide][g]\n\n[g]: docs/file\\(1\\).md\n');
  assert.deepEqual(checkDocs(root), []);
});

test('does not interpret prefixed HTML attributes as links or anchors', t => {
  const { root, write } = fixture(t);
  write('SUPPORT.md', '<a data-href="missing.md">Data</a>\n<img data-src="missing.png" />\n<span data-id="fake" aria-name="other"></span>\n[Fake](#fake)\n[Other](#other)\n');
  assert.deepEqual(checkDocs(root).map(({ line, message }) => ({ line, message })), [
    { line: 4, message: 'Anchor "#fake" is missing in "SUPPORT.md".' },
    { line: 5, message: 'Anchor "#other" is missing in "SUPPORT.md".' },
  ]);
});

// Published document paths and fragments are a reader-facing compatibility seam.
test('historical RAW report keeps its entrypoint and links to the Wiki archive', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const report = 'evidence/rawtherapee-cli-windows/report.md';
  const text = readFileSync(join(root, report), 'utf8');
  assert.ok(text.includes('(https://github.com/glaucia86/revelumo/wiki/RawTherapee-CLI-original-report)'));
  assert.ok(text.includes('(https://github.com/glaucia86/revelumo/blob/f6dd8fd5ffc28b6d94162b71bb8c8d8ba2cbbdf7/evidence/rawtherapee-cli-windows/report.md)'));
  assert.deepEqual(checkDocs(root, { documents: [report], readmes: [] }), []);
});

test('historical RAW report preserves every original section anchor', t => {
  const { root, write } = fixture(t);
  const report = 'evidence/rawtherapee-cli-windows/report.md';
  const text = readFileSync(new URL('../' + report, import.meta.url), 'utf8');
  const anchors = [
    'issue-14--resultados-do-spike-rawtherapee-cli', 'resultado',
    'base-ambiente-e-autorização', 'proveniência-e-componente', 'reprodução',
    'visual-cor-e-repetição', 'recursos-e-retenção', 'falhas-demonstradas',
    'offline-licença-e-plataformas', 'próxima-fatia',
  ];
  write(report, text);
  write('SUPPORT.md', anchors.map(anchor => `[Historical section](${report}#${anchor})`).join('\n'));
  assert.deepEqual(checkDocs(root), []);
  for (const anchor of anchors.slice(1)) {
    assert.ok(text.includes(`(https://github.com/glaucia86/revelumo/wiki/RawTherapee-CLI-original-report#${anchor})`));
  }
});
