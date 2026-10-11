import type { PhotoSummary } from '../shared/contracts.ts';
export const PAGE_SIZE = 48;
export function lastPage(count: number): number { return Math.max(0, Math.ceil(count / PAGE_SIZE) - 1); }
export function pagePhotos(photos: PhotoSummary[], page: number): PhotoSummary[] {
  const start = Math.max(0, Math.min(lastPage(photos.length), Math.floor(page))) * PAGE_SIZE;
  return photos.slice(start, start + PAGE_SIZE);
}
