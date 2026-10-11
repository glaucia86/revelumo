import { contextBridge, ipcRenderer } from 'electron';
import type { RevelumoApi } from './shared/contracts.ts';
const api: RevelumoApi = {
  importJpeg: () => ipcRenderer.invoke('revelumo:invoke', { op: 'import' }),
  importProgress: () => ipcRenderer.invoke('revelumo:invoke', { op: 'progress' }),
  thumbnailPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'thumbnail', id }),
  listPhotos: () => ipcRenderer.invoke('revelumo:invoke', { op: 'list' }),
  previewPhoto: (id) => ipcRenderer.invoke('revelumo:invoke', { op: 'preview', id }),
};
contextBridge.exposeInMainWorld('revelumo', Object.freeze(api));
