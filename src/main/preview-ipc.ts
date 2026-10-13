import { MAX_PREVIEW_BYTES } from '../shared/preview-bytes.ts';
import { randomUUID } from 'node:crypto';
import type { Library } from './library.ts';
import type { PreviewResult, Result } from '../shared/contracts.ts';
import { PreviewRequests } from './preview-requests.ts';
import { isTrustedDocument } from './trusted-document.ts';

type Frame = { url: string };
type Owner = { mainFrame: Frame };
type Event = { sender: unknown; senderFrame: Frame | null };
const invalid = (): Result<never> => ({ ok: false, code: 'invalid-request', message: 'Invalid preview request.', descriptor: { key: 'errors.invalidRequest' } });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// The document token is issued by main, never chosen or reset by the renderer.
// Even a late response to the old preload's handshake retains a retired token.
export class PreviewIpc {
  private owner: Owner | null = null;
  private document = '';
  private requests: PreviewRequests;
  private capacity: number;
  private reserved = 0;
  private leases = new Map<string, { document: string; generation: number; bytes: number; working: boolean; ended: boolean }>();
  constructor(library: Library, options: { capacity?: number } = {}) {
    this.capacity = options.capacity ?? 2 * MAX_PREVIEW_BYTES + 1;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || this.capacity > 2 * MAX_PREVIEW_BYTES + 1) throw new Error('Invalid preview capacity');
    this.requests = new PreviewRequests(library);
  }
  // Main-only diagnostic of logical retained work, useful when investigating
  // backpressure. Never exposed over IPC and never a physical-memory reading.
  get retainedCompressedBytes(): number { return this.reserved; }
  private release(lease: string): void {
    const owned = this.leases.get(lease);
    if (!owned) return;
    this.leases.delete(lease); this.reserved -= owned.bytes;
  }
  reset(owner: Owner): void {
    this.retire(true); this.owner = owner; this.document = randomUUID();
    this.requests.reset();
  }
  retire(ownerEnded = false): void {
    if (ownerEnded) for (const [lease, owned] of this.leases) {
      owned.ended = true;
      if (!owned.working) this.release(lease);
    }
    this.requests.retire(); this.owner = null; this.document = '';
  }
  async handle(event: Event, owner: Owner | null, entryUrl: string, input: unknown): Promise<PreviewResult | Result<string | null>> {
    if (!owner || owner !== this.owner || event.sender !== owner || event.senderFrame !== owner.mainFrame ||
        !isTrustedDocument(event.senderFrame.url, entryUrl)) return invalid();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
    const value = input as Record<string, unknown>;
    const keys = Object.keys(value).sort().join(',');
    if (value.op === 'context' && keys === 'op') return { ok: true, value: this.document };
    if (value.op === 'release') {
      if (keys !== 'document,generation,lease,op' || !uuid(value.document) || !uuid(value.lease) || !Number.isSafeInteger(value.generation) || (value.generation as number) < 1) return invalid();
      if (value.document !== this.document) return { ok: false, canceled: true };
      const owned = this.leases.get(value.lease);
      if (owned && (owned.document !== value.document || owned.generation !== value.generation || owned.working)) return invalid();
      this.release(value.lease);
      return { ok: true, value: null };
    }
    if (!((value.op === 'preview' && keys === 'document,generation,id,op' && uuid(value.id)) ||
          (value.op === 'invalidate' && keys === 'document,generation,op')) ||
        !uuid(value.document) || typeof value.generation !== 'number' || !Number.isSafeInteger(value.generation) || value.generation < 1) return invalid();
    if (value.document !== this.document) return { ok: false, canceled: true };
    if (value.op === 'invalidate') { this.requests.invalidate(value.generation); return { ok: true, value: null }; }
    const document = this.document, generation = value.generation;
    let lease: string | undefined;
    return this.requests.preview(value.id as string, generation, {
      reserve: size => {
        const bytes = 2 * size + 1;
        // One delivered source and at most one preparing successor. The byte
        // allowance is an envelope of explicit app allocations, never RSS.
        if (this.leases.size >= 2 || bytes > this.capacity - this.reserved) return false;
        lease = randomUUID(); this.reserved += bytes;
        this.leases.set(lease, { document, generation, bytes, working: true, ended: false });
        return true;
      },
      complete: result => {
        if (!lease) return result;
        const owned = this.leases.get(lease)!;
        owned.working = false;
        if (!result.ok || owned.ended || document !== this.document) {
          this.release(lease);
          return result.ok && document !== this.document ? { ok: false, canceled: true } : result;
        }
        return { ok: true, value: { ...result.value, reservation: { lease, generation } } };
      },
    });
  }
}
