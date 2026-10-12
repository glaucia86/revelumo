import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Library } from './library.ts';
import type { JpegExportRequest } from './jpeg-export-circuit.ts';
import type { ExportSelection, ExportAttempt, ExportPublication, ExportJobState, ExportResult } from '../shared/jpeg-export-contract.ts';
export const JPEG_EXPORT_OUTPUT_LIMIT = 32 * 1024 * 1024;
type Publish = (request: JpegExportRequest, signal?: AbortSignal) => Promise<ExportPublication>;
type Job = { owner: object; attemptId: string; state: ExportJobState; abort: AbortController; finished: Promise<void> };
export class JpegExportJobs {
  private job: Job | undefined;
  private library: Library;
  private choose: (name: string) => Promise<string | null>;
  private publish: Publish;
  private protectedDirectories: string[];
  constructor(library: Library, choose: (name: string) => Promise<string | null>, publish: Publish, protectedDirectories: string[]) {
    this.library = library; this.choose = choose; this.publish = publish; this.protectedDirectories = [...protectedDirectories];
  }
  start(owner: object, request: ExportAttempt): ExportResult<ExportJobState> {
    if (this.job && !['succeeded', 'failed', 'canceled'].includes(this.job.state.state)) return { ok: false, code: 'BUSY' };
    const retained = this.recover(owner, request);
    if (retained.ok) return retained;
    const job: Job = { owner, attemptId: request.attemptId, abort: new AbortController(), finished: Promise.resolve(), state: { jobId: randomUUID(), photoId: request.id, sessionId: request.sessionId, revision: request.revision, state: 'choosing' } };
    this.job = job;
    job.finished = this.run(job, { ...request });
    return { ok: true, value: structuredClone(job.state) };
  }
  status(owner: object, jobId: string): ExportResult<ExportJobState> {
    if (!this.job || this.job.owner !== owner || this.job.state.jobId !== jobId) return { ok: false, code: 'UNKNOWN_JOB' };
    return { ok: true, value: structuredClone(this.job.state) };
  }
  recover(owner: object, request: ExportAttempt): ExportResult<ExportJobState> {
    const job = this.job;
    if (!job || job.owner !== owner || job.state.photoId !== request.id || job.state.sessionId !== request.sessionId || job.state.revision !== request.revision || job.attemptId !== request.attemptId) return { ok: false, code: 'UNKNOWN_JOB' };
    return this.status(owner, job.state.jobId);
  }
  cancel(owner: object, jobId: string): ExportResult<ExportJobState> {
    const current = this.status(owner, jobId);
    if (!current.ok) return current;
    if (!['succeeded', 'failed', 'canceled'].includes(current.value.state)) {
      this.job!.abort.abort(); this.job!.state.state = 'canceling';
    }
    return this.status(owner, jobId);
  }
  async cancelOwner(owner: object): Promise<void> {
    const job = this.job;
    if (!job || job.owner !== owner) return;
    this.cancel(owner, job.state.jobId);
    await job.finished;
  }
  private async run(job: Job, request: ExportSelection) {
    try {
      const snapshot = await this.library.captureExport(request.id, request.sessionId, request.revision);
      if (!snapshot.ok) throw Object.assign(new Error(), { code: snapshot.code });
      if (job.abort.signal.aborted) { job.state.state = 'canceled'; return; }
      const destination = await this.choose(snapshot.value.name);
      if (!destination || job.abort.signal.aborted) { job.state.state = 'canceled'; return; }
      if (!['.jpg', '.jpeg'].includes(extname(destination).toLowerCase())) throw Object.assign(new Error(), { code: 'INVALID_DESTINATION' });
      job.state.state = 'exporting';
      job.state.result = await this.publish({ ...snapshot.value, destination, protectedDirectories: this.protectedDirectories, maximumOutputBytes: JPEG_EXPORT_OUTPUT_LIMIT }, job.abort.signal);
      job.state.state = 'succeeded';
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'EXPORT_FAILED';
      job.state.state = code === 'CANCELED' ? 'canceled' : 'failed'; job.state.error = code;
      job.state.cleanupPending = (error as { cleanupPending?: unknown }).cleanupPending === true;
    }
  }
}
