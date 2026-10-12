export type Request = { op: 'import' } | { op: 'list' } | { op: 'progress' } | { op: 'preview' | 'thumbnail' | 'status' | 'relocate'; id: string };
export function parseRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if ((value.op === 'import' || value.op === 'list' || value.op === 'progress') && keys === 'op') return { op: value.op };
  if ((value.op === 'preview' || value.op === 'thumbnail' || value.op === 'status' || value.op === 'relocate') && keys === 'id,op' && typeof value.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) {
    return { op: value.op, id: value.id };
  }
  return null;
}
