export type PhotoSummary = { id: string; name: string };
export type PhotoFlag = 'neutral' | 'selected' | 'rejected';
export type LibraryFilters = { rating: 'all' | 'unrated' | 1 | 2 | 3 | 4 | 5; flag: 'all' | PhotoFlag };
export type LibraryResults = { photos: PhotoSummary[]; total: number };
export type PhotoClassification = { photo: PhotoSummary; rating: number | null; flag: PhotoFlag };
export type PhotoRecipe = { photo: PhotoSummary; exposureTenths: number; processingVersion: 1 };
// Transport cap, independent of the separately decided history-retention policy.
export const MAX_EXPOSURE_CHECKPOINT_GESTURES = 1024;
export type ExposureGesture = { id: number; exposureTenths: number; complete: boolean };
export type EditSession = PhotoRecipe & { sessionId: string; revision: number; undoSteps: number; redoSteps: number };
export type FailureCode = 'invalid-request' | 'invalid-jpeg' | 'too-large' | 'unreadable' | 'not-found' | 'catalog-error' | 'busy' | 'identity-mismatch' | 'identity-unverified' | 'path-conflict';
export type Result<T> = { ok: true; value: T } | { ok: false; code: FailureCode; message: string };
export type ImportOutcome = { canceled: true } | { canceled: false; photo: PhotoSummary };
export type Preview = { photo: PhotoSummary; dataUrl: string };
export type PhotoStatus = { photo: PhotoSummary; state: 'available' | 'missing' | 'unreadable' | 'changed'; canRelocate: boolean; message: string };
export type PhotoAvailability = { photo: PhotoSummary; state: 'present' | 'missing' | 'unreadable'; identityRecorded: boolean; contentVerified: false; message: string };
export interface RevelumoApi {
  recipePhoto(id: string): Promise<Result<PhotoRecipe>>;
  beginEditingPhoto(id: string): Promise<Result<EditSession>>;
  saveExposure(id: string, sessionId: string, revision: number, exposureTenths: number, processingVersion: number, gestures?: ExposureGesture[]): Promise<Result<EditSession>>;
  moveExposureHistory(id: string, sessionId: string, revision: number, direction: 'undo' | 'redo'): Promise<Result<EditSession>>;
  endEditingPhoto(id: string, sessionId: string): Promise<Result<null>>;
  onCloseRequested(callback: () => void): () => void;
  confirmClose(): Promise<Result<null>>;
  classificationPhoto(id: string): Promise<Result<PhotoClassification>>;
  classifyPhoto(id: string, rating: number | null, flag: PhotoFlag): Promise<Result<PhotoClassification>>;
  importJpeg(): Promise<Result<BatchOutcome>>;
  importProgress(): Promise<Result<ImportProgress>>;
  thumbnailPhoto(id: string): Promise<Result<Preview>>;
  listPhotos(): Promise<Result<PhotoSummary[]>>;
  queryPhotos(filters: LibraryFilters): Promise<Result<LibraryResults>>;
  previewPhoto(id: string): Promise<Result<Preview>>;
  originalStatus(id: string): Promise<Result<PhotoStatus>>;
  originalAvailability(id: string): Promise<Result<PhotoAvailability>>;
  relocatePhoto(id: string): Promise<Result<ImportOutcome>>;
}

export type BatchItem = { name: string; result: Result<PhotoSummary> };
export type BatchOutcome = { canceled: true } | { canceled: false; stopped: boolean; items: BatchItem[] };
export type ImportProgress = { running: boolean; total: number; completed: number; succeeded: number; failed: number; currentName: string | null };
