import { contextBridge, ipcRenderer } from 'electron';
import type { RevelumoApi, Result } from './shared/contracts.ts';
let previewGeneration = 0;
let previewContext: Promise<Result<string>> | undefined;
async function previewRequest(request: Record<string, unknown>) {
  // Cache even a failed handshake: never silently enroll an old document again.
  const context = await (previewContext ??= ipcRenderer.invoke('revelumo:preview', { op: 'context' }));
  if (!context.ok) return context;
  return ipcRenderer.invoke('revelumo:preview', { ...request, document: context.value });
}
const closeListeners = new Set<() => void>();
let closePending = false;
ipcRenderer.on('revelumo:close-request', () => { closePending = true; for (const callback of closeListeners) callback(); });
const api: RevelumoApi = {
  startJpegExport: (id, sessionId, revision, attemptId) => ipcRenderer.invoke('revelumo:export', { op: 'start', id, sessionId, revision, attemptId }),
  recoverJpegExport: (id, sessionId, revision, attemptId) => ipcRenderer.invoke('revelumo:export', { op: 'recover', id, sessionId, revision, attemptId }),
  jpegExportStatus: jobId => ipcRenderer.invoke('revelumo:export', { op: 'status', jobId }),
  cancelJpegExport: jobId => ipcRenderer.invoke('revelumo:export', { op: 'cancel', jobId }),
  recipePhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'recipe', id }),
  beginEditingPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'begin-edit', id }),
  saveAdjustments: (id, sessionId, revision, adjustments, processingVersion, gestures) => ipcRenderer.invoke('revelumo:invoke', { op: 'adjustments', id, sessionId, revision, adjustments, processingVersion, gestures }),
  saveExposure: (id, sessionId, revision, exposureTenths, processingVersion, gestures) => ipcRenderer.invoke('revelumo:invoke', { op: 'exposure', id, sessionId, revision, exposureTenths, processingVersion, ...(gestures === undefined ? {} : { gestures }) }),
  moveExposureHistory: (id, sessionId, revision, direction) => ipcRenderer.invoke('revelumo:invoke', { op: 'exposure-history', id, sessionId, revision, direction }),
  endEditingPhoto: (id, sessionId) => ipcRenderer.invoke('revelumo:invoke', { op: 'end-edit', id, sessionId }),
  onCloseRequested: (callback) => { closeListeners.add(callback); if (closePending) queueMicrotask(callback); return () => { closeListeners.delete(callback); }; },
  confirmClose: () => ipcRenderer.invoke('revelumo:invoke', { op: 'close-ready' }),
  classificationPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'classification', id }),
  classifyPhoto: (id, rating, flag) => ipcRenderer.invoke('revelumo:invoke', { op: 'classify', id, rating, flag }),
  importJpeg: () => ipcRenderer.invoke('revelumo:invoke', { op: 'import' }),
  importProgress: () => ipcRenderer.invoke('revelumo:invoke', { op: 'progress' }),
  thumbnailPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'thumbnail', id }),
  listPhotos: () => ipcRenderer.invoke('revelumo:invoke', { op: 'list' }),
  queryPhotos: (filters) => ipcRenderer.invoke('revelumo:invoke', { ...filters, op: 'query' }),
  previewPhoto: (id, generation) => {
    const reserved = generation ?? ++previewGeneration;
    if (reserved !== previewGeneration) return Promise.resolve({ ok: false, canceled: true });
    return previewRequest({ op: 'preview', id, generation: reserved });
  },
  invalidatePreview: async () => {
    const generation = ++previewGeneration;
    const result = await previewRequest({ op: 'invalidate', generation });
    if (result.ok) return { ok: true, value: generation };
    if ('canceled' in result) return { ok: false, code: 'invalid-request', message: 'Preview document retired.', descriptor: { key: 'errors.invalidRequest' } };
    return result;
  },
  originalStatus: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'status', id }),
  originalAvailability: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'availability', id }),
  relocatePhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'relocate', id }),
};
contextBridge.exposeInMainWorld('revelumo', Object.freeze(api));

import type { PreferencesApi } from './shared/preferences-contract.ts';
const preferences: PreferencesApi = {
  getLanguage: () => ipcRenderer.invoke('revelumo:preferences', { op: 'get-language' }),
  setLanguage: choice => ipcRenderer.invoke('revelumo:preferences', { op: 'set-language', choice }),
};
contextBridge.exposeInMainWorld('revelumoPreferences', Object.freeze(preferences));
