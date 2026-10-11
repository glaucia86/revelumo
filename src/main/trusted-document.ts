export function isTrustedDocument(actual: string, expected: string): boolean {
  try {
    const document = new URL(actual);
    const entry = new URL(expected);
    if (document.username || document.password) return false;
    document.hash = ''; entry.hash = '';
    return document.href === entry.href;
  } catch { return false; }
}
