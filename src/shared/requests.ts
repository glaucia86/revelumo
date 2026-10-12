import { MAX_EXPOSURE_CHECKPOINT_GESTURES } from './contracts.ts';
import type { PhotoFlag, LibraryFilters, ExposureGesture, PhotoAdjustments } from './contracts.ts';
export type Request = { op: 'import' | 'list' | 'progress' | 'close-ready' } | ({ op: 'query' } & LibraryFilters) | { op: 'preview' | 'thumbnail' | 'availability' | 'status' | 'relocate' | 'classification' | 'recipe' | 'begin-edit'; id: string } | { op: 'end-edit'; id: string; sessionId: string } | { op: 'exposure'; id: string; sessionId: string; revision: number; exposureTenths: number; processingVersion: 2; gestures?: ExposureGesture[] } | { op: 'adjustments'; id: string; sessionId: string; revision: number; adjustments: PhotoAdjustments; processingVersion: 2; gestures: ExposureGesture[] } | { op: 'exposure-history'; id: string; sessionId: string; revision: number; direction: 'undo' | 'redo' } | { op: 'classify'; id: string; rating: number | null; flag: PhotoFlag };
const photoId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function parseRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if ((value.op === 'import' || value.op === 'list' || value.op === 'progress' || value.op === 'close-ready') && keys === 'op') return { op: value.op };
  if (value.op === 'end-edit' && keys === 'id,op,sessionId' && photoId(value.id) && photoId(value.sessionId)) return { op: value.op, id: value.id, sessionId: value.sessionId };
  if (value.op === 'exposure-history' && keys === 'direction,id,op,revision,sessionId' && photoId(value.id) && photoId(value.sessionId) &&
      typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0 && (value.direction === 'undo' || value.direction === 'redo')) {
    return { op: value.op, id: value.id, sessionId: value.sessionId, revision: value.revision, direction: value.direction };
  }
  if (value.op === 'adjustments' && keys === 'adjustments,gestures,id,op,processingVersion,revision,sessionId' && photoId(value.id) && photoId(value.sessionId) &&
      typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0 && value.processingVersion === 2 &&
      value.adjustments && typeof value.adjustments === 'object' && !Array.isArray(value.adjustments) && Object.keys(value.adjustments).sort().join(',') === 'exposureTenths,temperature,tint') {
    const adjustments = value.adjustments as Record<string, unknown>;
    if (typeof adjustments.exposureTenths !== 'number' || !Number.isInteger(adjustments.exposureTenths) || adjustments.exposureTenths < -30 || adjustments.exposureTenths > 30 ||
        typeof adjustments.temperature !== 'number' || !Number.isInteger(adjustments.temperature) || adjustments.temperature < -100 || adjustments.temperature > 100 ||
        typeof adjustments.tint !== 'number' || !Number.isInteger(adjustments.tint) || adjustments.tint < -100 || adjustments.tint > 100 || !Array.isArray(value.gestures)) return null;
    if (value.gestures.length && !parseRequest({ op: 'exposure', id: value.id, sessionId: value.sessionId, revision: value.revision, exposureTenths: adjustments.exposureTenths, processingVersion: 2, gestures: value.gestures })) return null;
    return { op: 'adjustments', id: value.id, sessionId: value.sessionId, revision: value.revision, adjustments: { exposureTenths: adjustments.exposureTenths, temperature: adjustments.temperature, tint: adjustments.tint }, processingVersion: 2, gestures: value.gestures as ExposureGesture[] };
  }
  if (value.op === 'exposure' && (keys === 'exposureTenths,id,op,processingVersion,revision,sessionId' || keys === 'exposureTenths,gestures,id,op,processingVersion,revision,sessionId') && photoId(value.id) && photoId(value.sessionId) &&
      typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0 &&
      typeof value.exposureTenths === 'number' && Number.isInteger(value.exposureTenths) && value.exposureTenths >= -30 && value.exposureTenths <= 30 && value.processingVersion === 2) {
    if ('gestures' in value && (!Array.isArray(value.gestures) || value.gestures.length < 1 || value.gestures.length > MAX_EXPOSURE_CHECKPOINT_GESTURES || !value.gestures.every((item, index, all) =>
      item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).sort().join(',') === 'complete,exposureTenths,id' &&
      Number.isSafeInteger(item.id) && item.id > 0 && Number.isInteger(item.exposureTenths) && item.exposureTenths >= -30 && item.exposureTenths <= 30 &&
      typeof item.complete === 'boolean' && (index === all.length - 1 || item.complete) && (index === 0 || item.id > all[index - 1].id)) ||
      value.gestures.at(-1).exposureTenths !== value.exposureTenths)) return null;
    return { op: value.op, id: value.id, sessionId: value.sessionId, revision: value.revision, exposureTenths: value.exposureTenths, processingVersion: 2,
      ...('gestures' in value ? { gestures: value.gestures as ExposureGesture[] } : {}) };
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
