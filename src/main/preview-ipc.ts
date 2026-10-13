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
  constructor(library: Library) { this.requests = new PreviewRequests(library); }
  reset(owner: Owner): void {
    this.retire(); this.owner = owner; this.document = randomUUID();
    this.requests.reset();
  }
  retire(): void {
    this.requests.retire(); this.owner = null; this.document = '';
  }
  async handle(event: Event, owner: Owner | null, entryUrl: string, input: unknown): Promise<PreviewResult | Result<string | null>> {
    if (!owner || owner !== this.owner || event.sender !== owner || event.senderFrame !== owner.mainFrame ||
        !isTrustedDocument(event.senderFrame.url, entryUrl)) return invalid();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
    const value = input as Record<string, unknown>;
    const keys = Object.keys(value).sort().join(',');
    if (value.op === 'context' && keys === 'op') return { ok: true, value: this.document };
    if (!((value.op === 'preview' && keys === 'document,generation,id,op' && uuid(value.id)) ||
          (value.op === 'invalidate' && keys === 'document,generation,op')) ||
        !uuid(value.document) || typeof value.generation !== 'number' || !Number.isSafeInteger(value.generation) || value.generation < 1) return invalid();
    if (value.document !== this.document) return { ok: false, canceled: true };
    if (value.op === 'invalidate') { this.requests.invalidate(value.generation); return { ok: true, value: null }; }
    return this.requests.preview(value.id as string, value.generation);
  }
}
