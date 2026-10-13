import type { PhotoSummary, Preview } from '../shared/contracts.ts';

/** Renderer-owned compressed input. Retirement never changes preview identity. */
export class PreviewSource {
  readonly photo: PhotoSummary;
  private payload: string | null;
  constructor(preview: Preview) { this.photo = preview.photo; this.payload = preview.dataUrl; }
  read(): string | null { return this.payload; }
  release(): void { this.payload = null; }
}
