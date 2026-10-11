export type PhotoSummary = { id: string; name: string };
export type FailureCode = 'invalid-request' | 'invalid-jpeg' | 'too-large' | 'unreadable' | 'not-found' | 'catalog-error' | 'busy';
export type Result<T> = { ok: true; value: T } | { ok: false; code: FailureCode; message: string };
export type ImportOutcome = { canceled: true } | { canceled: false; photo: PhotoSummary };
export type Preview = { photo: PhotoSummary; dataUrl: string };
export interface RevelumoApi {
  importJpeg(): Promise<Result<ImportOutcome>>;
  listPhotos(): Promise<Result<PhotoSummary[]>>;
  previewPhoto(id: string): Promise<Result<Preview>>;
}
