import { parseJpegExportRequest } from '../shared/jpeg-export-request.ts';
import { isTrustedDocument } from './trusted-document.ts';
import type { JpegExportJobs } from './jpeg-export-job.ts';
import type { ExportResult, ExportJobState } from '../shared/jpeg-export-contract.ts';
type Frame = { url: string };
export function handleJpegExportRequest(jobs: JpegExportJobs, event: { sender: unknown; senderFrame: Frame | null }, owner: { mainFrame: Frame } | null, entryUrl: string, input: unknown, generation?: object): ExportResult<ExportJobState> {
  if (!owner || event.sender !== owner || event.senderFrame !== owner.mainFrame || !isTrustedDocument(event.senderFrame.url, entryUrl)) return { ok: false, code: 'INVALID_REQUEST' };
  const request = parseJpegExportRequest(input);
  if (!request) return { ok: false, code: 'INVALID_REQUEST' };
  if (request.op === 'start') return jobs.start(generation ?? event.senderFrame, request);
  if (request.op === 'recover') return jobs.recover(generation ?? event.senderFrame, request);
  return request.op === 'status' ? jobs.status(generation ?? event.senderFrame, request.jobId) : jobs.cancel(generation ?? event.senderFrame, request.jobId);
}
