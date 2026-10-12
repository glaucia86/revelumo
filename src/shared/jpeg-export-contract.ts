export type ExportSelection = { id: string; sessionId: string; revision: number };
export type ExportAttempt = ExportSelection & { attemptId: string };
export type ExportPublication = { path: string; width: number; height: number; bytesWritten: number; cleanupPending: boolean };
export type ExportJobState = { jobId: string; photoId: string; sessionId: string; revision: number;
  state: 'choosing' | 'exporting' | 'canceling' | 'succeeded' | 'canceled' | 'failed';
  result?: ExportPublication; error?: string; cleanupPending?: boolean };
export type ExportResult<T> = { ok: true; value: T } | { ok: false; code: string };
