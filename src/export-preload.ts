import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('jpegEngine', {
  receive: (callback: (input: unknown) => void) => ipcRenderer.once('revelumo:jpeg-engine-input', (_event, input) => callback(input)),
  result: (output: unknown) => ipcRenderer.send('revelumo:jpeg-engine-result', output),
});
