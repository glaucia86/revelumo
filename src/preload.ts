import { contextBridge, ipcRenderer } from 'electron';
import type { RevelumoApi } from './shared/contracts.ts';
const closeListeners = new Set<() => void>();
let closePending = false;
ipcRenderer.on('revelumo:close-request', () => { closePending = true; for (const callback of closeListeners) callback(); });
const api: RevelumoApi = {
  recipePhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'recipe', id }),
  beginEditingPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'begin-edit', id }),
  saveExposure: (id, sessionId, revision, exposureTenths, processingVersion) => ipcRenderer.invoke('revelumo:invoke', { op: 'exposure', id, sessionId, revision, exposureTenths, processingVersion }),
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
  previewPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'preview', id }),
  originalStatus: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'status', id }),
  originalAvailability: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'availability', id }),
  relocatePhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'relocate', id }),
};
contextBridge.exposeInMainWorld('revelumo', Object.freeze(api));
