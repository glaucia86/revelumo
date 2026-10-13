import type { Library } from './library.ts';
import type { PreviewResult } from '../shared/contracts.ts';

const canceled = (): PreviewResult => ({ ok: false, canceled: true });
type Ticket = { lifetime: object; id: string; generation: number; resolve: (result: PreviewResult) => void };

// One dispatched operation (which may wait in Library's protected queue), and
// one replaceable pending selection. Mutations never enter this coordinator.
export class PreviewRequests {
  private library: Library;
  private generation = 0;
  private claimed = false;
  private alive = true;
  private lifetime: object = {};
  private active: Ticket | null = null;
  private pending: Ticket | null = null;
  constructor(library: Library) { this.library = library; }

  preview(id: string, generation: number): Promise<PreviewResult> {
    if (!this.alive || !Number.isSafeInteger(generation) || generation < 1 || generation < this.generation ||
        (generation === this.generation && this.claimed)) return Promise.resolve(canceled());
    this.generation = generation; this.claimed = true;
    this.pending?.resolve(canceled());
    return new Promise(resolve => {
      this.pending = { lifetime: this.lifetime, id, generation, resolve };
      this.dispatch();
    });
  }

  invalidate(generation: number): void {
    if (!this.alive || !Number.isSafeInteger(generation) || generation <= this.generation) return;
    this.generation = generation; this.claimed = false;
    this.pending?.resolve(canceled()); this.pending = null;
  }

  reset(): void {
    this.retire(); this.alive = true; this.generation = 0; this.claimed = false;
  }

  retire(): void {
    this.alive = false; this.lifetime = {};
    this.pending?.resolve(canceled()); this.pending = null;
  }

  private dispatch() {
    if (this.active || !this.pending) return;
    const ticket = this.pending; this.pending = null; this.active = ticket;
    // Admit at the tail, never put a newer photo in an old queued position.
    void this.library.preview(ticket.id, () => this.alive && ticket.lifetime === this.lifetime && ticket.generation === this.generation)
      .then(ticket.resolve, () => ticket.resolve({ ok: false, code: 'catalog-error', message: 'Preview operation failed.', descriptor: { key: 'errors.generic' } }))
      .finally(() => { this.active = null; this.dispatch(); });
  }
}
