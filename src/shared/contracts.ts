export type PhotoSummary = { id: string; name: string };
export type FailureCode = 'invalid-request' | 'invalid-jpeg' | 'too-large' | 'unreadable' | 'not-found' | 'catalog-error' | 'busy' | 'identity-mismatch' | 'identity-unverified' | 'path-conflict';
export type Result<T> = { ok: true; value: T } | { ok: false; code: FailureCode; message: string };
export type ImportOutcome = { canceled: true } | { canceled: false; photo: PhotoSummary };
export type Preview = { photo: PhotoSummary; dataUrl: string };
export type PhotoStatus = { photo: PhotoSummary; state: 'available' | 'missing' | 'unreadable' | 'changed'; canRelocate: boolean; message: string };
export type PhotoAvailability = { photo: PhotoSummary; state: 'present' | 'missing' | 'unreadable'; identityRecorded: boolean; contentVerified: false; message: string };
export interface RevelumoApi {
  importJpeg(): Promise<Result<BatchOutcome>>;
  importProgress(): Promise<Result<ImportProgress>>;
  thumbnailPhoto(id: string): Promise<Result<Preview>>;
  listPhotos(): Promise<Result<PhotoSummary[]>>;
  previewPhoto(id: string): Promise<Result<Preview>>;
  originalStatus(id: string): Promise<Result<PhotoStatus>>;
  originalAvailability(id: string): Promise<Result<PhotoAvailability>>;
  relocatePhoto(id: string): Promise<Result<ImportOutcome>>;
}

export type BatchItem = { name: string; result: Result<PhotoSummary> };
export type BatchOutcome = { canceled: true } | { canceled: false; stopped: boolean; items: BatchItem[] };
export type ImportProgress = { running: boolean; total: number; completed: number; succeeded: number; failed: number; currentName: string | null };
