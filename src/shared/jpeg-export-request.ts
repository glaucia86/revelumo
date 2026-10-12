import type { ExportAttempt } from './jpeg-export-contract.ts';
export type JpegExportRequest = ({ op: 'start' } & ExportAttempt) | ({ op: 'recover' } & ExportAttempt) | { op: 'status' | 'cancel'; jobId: string };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function parseJpegExportRequest(input: unknown): JpegExportRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>, keys = Object.keys(value).sort().join(',');
  if ((value.op === 'start' || value.op === 'recover') && keys === 'attemptId,id,op,revision,sessionId' && uuid(value.attemptId) && uuid(value.id) && uuid(value.sessionId) && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0) {
    return { op: value.op, attemptId: value.attemptId, id: value.id, sessionId: value.sessionId, revision: value.revision };
  }
  if ((value.op === 'status' || value.op === 'cancel') && keys === 'jobId,op' && uuid(value.jobId)) return { op: value.op, jobId: value.jobId };
  return null;
}
