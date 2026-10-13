import type { PhotoSummary, Preview, PreviewReservation } from '../shared/contracts.ts';

/** Renderer-owned compressed input. Retirement never changes preview identity. */
export class PreviewSource {
  readonly photo: PhotoSummary;
  private payload: ArrayBuffer | null;
  private delivered = false;
  private reservation: PreviewReservation | undefined;
  private releaseReservation: (reservation: PreviewReservation) => unknown;
  constructor(preview: Preview, releaseReservation: (reservation: PreviewReservation) => unknown = reservation => window.revelumo.releasePreview(reservation)) {
    this.photo = preview.photo; this.payload = preview.bytes;
    this.reservation = preview.reservation; this.releaseReservation = releaseReservation;
  }
  take(): ArrayBuffer | null {
    const payload = this.payload;
    this.payload = null;
    if (payload) this.delivered = true;
    return payload;
  }
  /** Parent retirement cannot acknowledge a payload already handed to a Worker. */
  release(): void {
    this.payload = null;
    if (!this.delivered) this.consumed();
  }
  /** Consumer only: after Worker ready (compressed input consumed) or terminate(). */
  consumed(): void {
    this.payload = null;
    const reservation = this.reservation;
    this.reservation = undefined;
    if (!reservation) return;
    // A closing bridge must not break retirement. The preload owns recovery of
    // an unconfirmed acknowledgement; this source emits its disposition once.
    try { void Promise.resolve(this.releaseReservation(reservation)).catch(() => {}); } catch { /* Bridge already unavailable. */ }
  }
}
