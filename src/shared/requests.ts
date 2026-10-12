import type { PhotoFlag, LibraryFilters } from './contracts.ts';
export type Request = { op: 'import' | 'list' | 'progress' | 'close-ready' } | ({ op: 'query' } & LibraryFilters) | { op: 'preview' | 'thumbnail' | 'availability' | 'status' | 'relocate' | 'classification' | 'recipe' | 'begin-edit'; id: string } | { op: 'end-edit'; id: string; sessionId: string } | { op: 'exposure'; id: string; sessionId: string; revision: number; exposureTenths: number; processingVersion: 1 } | { op: 'classify'; id: string; rating: number | null; flag: PhotoFlag };
const photoId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function parseRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if ((value.op === 'import' || value.op === 'list' || value.op === 'progress' || value.op === 'close-ready') && keys === 'op') return { op: value.op };
  if (value.op === 'end-edit' && keys === 'id,op,sessionId' && photoId(value.id) && photoId(value.sessionId)) return { op: value.op, id: value.id, sessionId: value.sessionId };
  if (value.op === 'exposure' && keys === 'exposureTenths,id,op,processingVersion,revision,sessionId' && photoId(value.id) && photoId(value.sessionId) &&
      typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0 &&
      typeof value.exposureTenths === 'number' && Number.isInteger(value.exposureTenths) && value.exposureTenths >= -30 && value.exposureTenths <= 30 && value.processingVersion === 1) {
    return { op: value.op, id: value.id, sessionId: value.sessionId, revision: value.revision, exposureTenths: value.exposureTenths, processingVersion: 1 };
  }
  if (value.op === 'query' && keys === 'flag,op,rating' &&
      (value.rating === 'all' || value.rating === 'unrated' || (typeof value.rating === 'number' && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) &&
      (value.flag === 'all' || value.flag === 'neutral' || value.flag === 'selected' || value.flag === 'rejected')) {
    return { op: 'query', rating: value.rating as LibraryFilters['rating'], flag: value.flag };
  }
  if (value.op === 'classify' && keys === 'flag,id,op,rating' && photoId(value.id) &&
      (value.rating === null || (typeof value.rating === 'number' && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) &&
      (value.flag === 'neutral' || value.flag === 'selected' || value.flag === 'rejected')) {
    return { op: 'classify', id: value.id, rating: value.rating, flag: value.flag };
  }
  if ((value.op === 'preview' || value.op === 'thumbnail' || value.op === 'availability' || value.op === 'status' || value.op === 'relocate' || value.op === 'classification' || value.op === 'recipe' || value.op === 'begin-edit') && keys === 'id,op' && photoId(value.id)) {
    return { op: value.op, id: value.id };
  }
  return null;
}
