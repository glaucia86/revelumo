import type { PhotoSummary, Preview } from '../shared/contracts.ts';

/** Renderer-owned compressed input. Retirement never changes preview identity. */
export class PreviewSource {
  readonly photo: PhotoSummary;
  private payload: ArrayBuffer | null;
  constructor(preview: Preview) { this.photo = preview.photo; this.payload = preview.bytes; }
  take(): ArrayBuffer | null {
    const payload = this.payload;
    this.payload = null;
    return payload;
  }
  release(): void { this.payload = null; }
}
