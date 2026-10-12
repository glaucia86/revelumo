import { JPEG_CODEC_FAILURES } from '../processing/jpeg-export-contract.ts';
import { encodeFullResolution } from './encode.ts';
declare global { interface Window { jpegEngine: { receive(callback: (input: unknown) => void): void; result(output: unknown): void } } }
window.jpegEngine.receive(async input => {
  const job = input as { jobId: string; source: Uint8Array<ArrayBuffer>; recipe: unknown; maximumOutputBytes: number };
  try { window.jpegEngine.result({ jobId: job.jobId, ...await encodeFullResolution(job.source, job.recipe, job.maximumOutputBytes) }); }
  catch (error) {
    const code = error instanceof Error && (JPEG_CODEC_FAILURES as readonly string[]).includes(error.message) ? error.message : 'ENCODE_FAILED';
    window.jpegEngine.result({ jobId: job.jobId, error: code });
  }
});
