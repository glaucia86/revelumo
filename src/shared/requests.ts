import type { PhotoFlag } from './contracts.ts';
export type Request = { op: 'import' } | { op: 'list' } | { op: 'progress' } | { op: 'preview' | 'thumbnail' | 'availability' | 'status' | 'relocate' | 'classification'; id: string } | { op: 'classify'; id: string; rating: number | null; flag: PhotoFlag };
const photoId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function parseRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if ((value.op === 'import' || value.op === 'list' || value.op === 'progress') && keys === 'op') return { op: value.op };
  if (value.op === 'classify' && keys === 'flag,id,op,rating' && photoId(value.id) &&
      (value.rating === null || (typeof value.rating === 'number' && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) &&
      (value.flag === 'neutral' || value.flag === 'selected' || value.flag === 'rejected')) {
    return { op: 'classify', id: value.id, rating: value.rating, flag: value.flag };
  }
  if ((value.op === 'preview' || value.op === 'thumbnail' || value.op === 'availability' || value.op === 'status' || value.op === 'relocate' || value.op === 'classification') && keys === 'id,op' && photoId(value.id)) {
    return { op: value.op, id: value.id };
  }
  return null;
}
