/** Stable message IDs and parameter contracts shared by main and renderer. */
export const messageParameters = {
  "preferences.readOnly": {},
  "shell.workspace": {},
  "shell.catalog": {},
  "shell.editing": {},
  "shell.editHint": {},
  "shell.import": {},
  "shell.library": {},
  "shell.allPhotos": {},
  "shell.checkAvailability": {},
  "shell.localCatalog": {},
  "shell.originalsStay": {},
  "shell.footer": {},
  "shell.development": {},
  "filters.title": {},
  "filters.rating": {},
  "filters.allRatings": {},
  "filters.unrated": {},
  "filters.minStars": {
    "count": "number"
  },
  "filters.flag": {},
  "filters.allFlags": {},
  "filters.neutral": {},
  "filters.selected": {},
  "filters.rejected": {},
  "filters.clear": {},
  "filters.hint": {},
  "catalog.grid": {},
  "catalog.imported": {},
  "catalog.loading": {},
  "catalog.filtered": {},
  "catalog.description": {},
  "catalog.summary": {
    "count": "number",
    "total": "number"
  },
  "catalog.filteredSummary": {
    "count": "number",
    "total": "number"
  },
  "catalog.empty": {},
  "catalog.emptyHint": {},
  "catalog.noMatches": {},
  "catalog.noMatchesHint": {
    "count": "number"
  },
  "catalog.openPhoto": {},
  "catalog.openNamed": {
    "filename": "string"
  },
  "catalog.thumbnailUnavailable": {},
  "catalog.thumbnailLoading": {},
  "catalog.originalMissing": {},
  "catalog.originalUnavailable": {},
  "pagination.label": {},
  "pagination.previous": {},
  "pagination.next": {},
  "pagination.page": {
    "page": "number",
    "total": "number"
  },
  "import.choose": {},
  "import.canceled": {},
  "import.waiting": {},
  "import.progress": {
    "completed": "number",
    "total": "number"
  },
  "import.summary": {
    "valid": "number",
    "failed": "number"
  },
  "import.stopped": {},
  "import.hidden": {
    "count": "number"
  },
  "import.failedFiles": {
    "count": "number"
  },
  "import.failed": {},
  "preferences.language": {},
  "preferences.system": {},
  "preferences.retry": {},
  "preferences.invalid": {},
  "preferences.unreadable": {},
  "preferences.future": {},
  "preferences.invalidRequest": {},
  "preferences.saveFailed": {},
  "errors.generic": {},
  "errors.invalidRequest": {},
  "errors.unauthorized": {},
  "errors.busy": {},
  "errors.query": {},
  "errors.chooseJpeg": {},
  "errors.tooLarge": {},
  "errors.changedDuringRead": {},
  "errors.invalidJpeg": {},
  "errors.unreadable": {},
  "errors.emptySelection": {},
  "errors.notFound": {},
  "errors.locateFile": {},
  "errors.importIdentity": {},
  "errors.decodeJpeg": {},
  "errors.saveReference": {},
  "errors.thumbnailIdentity": {},
  "errors.createThumbnail": {},
  "errors.saveThumbnail": {},
  "boot.title": {},
  "boot.failed": {},
  "dialog.importTitle": {},
  "dialog.jpegFiles": {}
} as const;
export type MessageKey = keyof typeof messageParameters;
type Parameters<K extends MessageKey> = { [P in keyof typeof messageParameters[K]]: typeof messageParameters[K][P] extends 'number' ? number : string };
export type MessageDescriptor = { [K in MessageKey]: keyof Parameters<K> extends never ? { key: K; params?: never } : { key: K; params: Parameters<K> } }[MessageKey];
export type MessageTemplate = string | { one: string; other: string; plural?: 'count' | 'total' };
export type Dictionary = { [K in MessageKey]: MessageTemplate };
