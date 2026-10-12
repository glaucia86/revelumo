import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local, read-only validation for this repository's simple Markdown/HTML docs.
// This is deliberately not a full CommonMark renderer or an external-URL checker.
// Source files are the configured entrypoints; linked documents are read for
// anchors, not recursively crawled. No Markdown, HTML, or shell text is executed.
const READMES = ['README.md', 'README.pt-BR.md', 'README.es.md'];
const DOCUMENTS = [...READMES, 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'THIRD_PARTY_NOTICES.md'];

const blank = text => text.replace(/[^\r\n]/g, ' ');

function prose(text) {
  let fence;
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, blank).split('\n').map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return blank(line);
    }
    if (marker) {
      fence = marker[1];
      return blank(line);
    }
    return /^(?: {4}|\t)/.test(line) ? blank(line) : line;
  }).join('\n');
}

function withoutInlineCode(text) {
  const runs = [...text.matchAll(/`+/g)];
  for (let i = 0; i < runs.length; i++) {
    const end = runs.findIndex((run, index) => index > i && run[0].length === runs[i][0].length);
    if (end === -1) continue;
    const from = runs[i].index;
    const to = runs[end].index + runs[end][0].length;
    text = text.slice(0, from) + blank(text.slice(from, to)) + text.slice(to);
    i = end;
  }
  return text;
}

function escapedAt(text, index) {
  let slashes = 0;
  while (text[--index] === '\\') slashes++;
  return slashes % 2 === 1;
}

const unescapeMarkdown = text => text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity;
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '\ufffd';
  });
}

function inlineDestination(text, index) {
  while (/\s/.test(text[index] ?? '') && index < text.length) index++;
  let end = index;
  let url;
  if (text[index] === '<') {
    end = text.indexOf('>', index + 1);
    if (end === -1) return null;
    url = text.slice(index + 1, end++);
  } else {
    let depth = 0;
    for (; end < text.length; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '(') depth++;
      else if (text[end] === ')') {
        if (!depth) break;
        depth--;
      } else if (/\s/.test(text[end])) break;
    }
    if (depth) return null;
    url = text.slice(index, end);
  }
  if (!/^\s*(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\))?\s*\)/.test(text.slice(end))) return null;
  return unescapeMarkdown(url);
}

function linksIn(text) {
  text = withoutInlineCode(prose(text));
  const links = [];
  const label = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const references = new Map();
  text = text.replace(/^ {0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]*)>|(\S+)).*$/gm, (definition, name, angled, bare) => {
    if (!references.has(label(name))) references.set(label(name), unescapeMarkdown(angled ?? bare));
    return blank(definition);
  });
  for (const match of text.matchAll(/!?\[([^\]\n]+)\](?:\[([^\]\n]*)\])?/g)) {
    if (escapedAt(text, match.index) || text[match.index + match[0].length] === '(') continue;
    const url = references.get(label(match[2] || match[1]));
    if (url !== undefined) links.push({ url, index: match.index, navigation: !match[0].startsWith('!') });
  }
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(/g)) {
    if (escapedAt(text, match.index)) continue;
    const url = inlineDestination(text, match.index + match[0].length);
    if (url !== null) links.push({ url, index: match.index, navigation: !match[0].startsWith('!') });
  }
  for (const tag of text.matchAll(/<[a-z][^>]*>/gi)) {
    for (const attribute of tag[0].matchAll(/(?<=\s)(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      links.push({ url: attribute[1] ?? attribute[2], index: tag.index, navigation: /^<a\b/i.test(tag[0]) && /^href/i.test(attribute[0]) });
    }
  }
  return links.sort((a, b) => a.index - b.index).map(link => ({ ...link, url: decodeEntities(link.url) }));
}

function anchorsIn(text) {
  text = prose(text);
  const anchors = new Set();
  const referenceLabel = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const references = new Set([...text.matchAll(/^ {0,3}\[([^\]\n]+)\]:/gm)].map(match => referenceLabel(match[1])));
  const usedSlugs = new Set();
  const headings = [...text.matchAll(/^ {0,3}#{1,6}[^\S\n]+(.+?)[^\S\n]*#*[^\S\n]*$/gm)]
    .map(match => ({ text: match[1], index: match.index }));
  for (const match of text.matchAll(/^([^\n]+)\n {0,3}(?:=+|-+)[^\S\n]*$/gm)) headings.push({ text: match[1], index: match.index });
  for (const match of text.matchAll(/<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/gi)) headings.push({ text: match[1], index: match.index });
  for (const heading of headings.sort((a, b) => a.index - b.index)) {
    const base = decodeEntities(heading.text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!?\[([^\]]*)\]\[([^\]]*)\]/g, (match, label, reference) => references.has(referenceLabel(reference || label)) ? label : match)
      .replace(/<[^>]*>/g, ''))
      .replace(/(\*{1,2}|_{1,2}|~~)(.*?)\1/g, '$2').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
    let slug = base;
    for (let suffix = 1; usedSlugs.has(slug); suffix++) slug = `${base}-${suffix}`;
    usedSlugs.add(slug);
    anchors.add(slug);
  }
  for (const tag of withoutInlineCode(text).matchAll(/<[a-z][^>]*>/gi)) {
    for (const attribute of tag[0].matchAll(/(?<=\s)(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      anchors.add(decodeEntities(attribute[1] ?? attribute[2]));
    }
  }
  return anchors;
}

function inspectPath(root, target, requireFile = true) {
  const path = relative(root, target);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return 'outside the repository';
  let current = root;
  try {
    for (const part of path.split(sep).filter(Boolean)) {
      current = resolve(current, part);
      // Reject even in-repository symlinks rather than following an ambiguous path.
      if (lstatSync(current).isSymbolicLink()) return 'unsafe symlink';
    }
    const stat = lstatSync(target);
    if (!stat.isFile() && (requireFile || !stat.isDirectory())) return 'not a regular file';
  } catch (error) {
    return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'missing' : `unreadable (${error.code})`;
  }
  return null;
}

/** Return { file, line, message } diagnostics; an empty array means local checks passed. */
export function checkDocs(root, { documents = DOCUMENTS, readmes = READMES } = {}) {
  const errors = [];
  try { root = realpathSync(root); } catch (error) {
    return [{ file: '.', line: 1, message: `Repository root is unreadable (${error.code}).` }];
  }
  const readable = new Set();
  for (const file of [...new Set([...documents, ...readmes, 'LICENSE'])]) {
    const problem = inspectPath(root, resolve(root, file));
    if (problem) errors.push({ file, line: 1, message: `Required file is ${problem}.` });
    else readable.add(file);
  }
  for (const file of new Set([...documents, ...readmes])) {
    const sourcePath = resolve(root, file);
    if (!readable.has(file)) continue;
    const text = readFileSync(sourcePath, 'utf8');
    const navigationTargets = new Set();
    for (const { url, index, navigation } of linksIn(text)) {
      if (!/^(?:[a-z]:|file:)/i.test(url) && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) continue;
      const line = text.slice(0, index).split('\n').length;
      let path, fragment;
      try {
        path = decodeURIComponent(url.split(/[?#]/)[0]);
        fragment = decodeURIComponent(url.includes('#') ? url.slice(url.indexOf('#') + 1) : '');
      } catch {
        errors.push({ file, line, message: `Invalid URL encoding in "${url}".` });
        continue;
      }
      if (isAbsolute(path) || /^[a-z]:/i.test(path) || /[\\\x00-\x1f]/.test(path) || /^file:/i.test(path)) {
        errors.push({ file, line, message: `Target "${url}" has an unsafe local path.` });
        continue;
      }
      const target = path ? resolve(dirname(sourcePath), path) : sourcePath;
      const problem = inspectPath(root, target, Boolean(fragment));
      if (problem) {
        errors.push({ file, line, message: `Target "${url}" is ${problem}.` });
        continue;
      }
      if (fragment && !anchorsIn(readFileSync(target, 'utf8')).has(fragment)) {
        errors.push({ file, line, message: `Anchor "#${fragment}" is missing in "${path || file}".` });
        continue;
      }
      if (navigation) navigationTargets.add(target);
    }
    if (readmes.includes(file)) {
      for (const other of readmes) {
        if (other !== file && !navigationTargets.has(resolve(root, other))) {
          errors.push({ file, line: 1, message: `Missing language navigation link to "${other}".` });
        }
      }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const errors = checkDocs(root);
    for (const error of errors) console.error(`${error.file}:${error.line}: ${error.message}`);
    if (errors.length) process.exitCode = 1;
    else console.log('Local documentation checks passed. External URLs were not requested.');
  } catch (error) {
    console.error(`Documentation check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
