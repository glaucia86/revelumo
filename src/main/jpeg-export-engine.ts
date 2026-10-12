import { setTimeout as scheduleTimeout, clearTimeout as cancelTimeout } from 'node:timers';
import { app, BrowserWindow, ipcMain, type IpcMainEvent, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JPEG_CODEC_FAILURES, parseExportRecipe } from '../processing/jpeg-export-contract.ts';
import { jpegDimensions } from './jpeg-dimensions.ts';
import { validateExportOutput, type ExportOutput } from './jpeg-export-response.ts';
export type JpegEngineRequest = { source: Uint8Array; recipe: unknown; maximumOutputBytes: number };
export class JpegEngineError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'JpegEngineError'; this.code = code; }
}
let active = false;
let quarantined: { pid: number; creationTime: number | undefined } | null = null;
const stillObserved = (process: { pid: number; creationTime: number | undefined }) => app.getAppMetrics().some(metric =>
  metric.pid === process.pid && (process.creationTime === undefined || metric.creationTime === process.creationTime));
// Keep session callbacks outside the job closure: Electron retains Session objects.
function restrictSession(session: Session, entry: string): () => void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  const denyDownload = (event: { preventDefault(): void }) => event.preventDefault();
  session.on('will-download', denyDownload);
  session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const file = fileURLToPath(details.url);
      allowed = file === entry || (dirname(file) === join(dirname(entry), 'assets') && file.endsWith('.js'));
    } catch { /* Every non-local scheme is denied. */ }
    callback({ cancel: !allowed });
  });
  return () => {
    session.webRequest.onBeforeRequest(null);
    session.setPermissionRequestHandler(null);
    session.setPermissionCheckHandler(null);
    session.removeListener('will-download', denyDownload);
  };
}
export async function encodeJpegSnapshot(request: JpegEngineRequest, signal?: AbortSignal): Promise<ExportOutput> {
  if (signal?.aborted) throw new JpegEngineError('CANCELED');
  if (quarantined && stillObserved(quarantined)) throw new JpegEngineError('CLEANUP_UNCONFIRMED');
  quarantined = null;
  if (active) throw new JpegEngineError('BUSY');
  request = { ...request };
  const recipe = parseExportRecipe(request.recipe);
  if (!recipe) throw new JpegEngineError('UNSUPPORTED_RECIPE');
  if (!Number.isSafeInteger(request.maximumOutputBytes) || request.maximumOutputBytes <= 0) throw new JpegEngineError('INVALID_BUDGET');
  if (!(request.source instanceof Uint8Array) || !(request.source.buffer instanceof ArrayBuffer)) throw new JpegEngineError('INVALID_SOURCE');
  if (request.source.byteLength > 32 * 1024 * 1024) throw new JpegEngineError('SOURCE_TOO_LARGE');
  const source = Buffer.from(request.source), jobId = randomUUID();
  let dimensions: { width: number; height: number };
  try { dimensions = jpegDimensions(source); } catch { throw new JpegEngineError('INVALID_SOURCE'); }
  const entry = join(__dirname, '../renderer/jpeg_export/index.html');
  active = true;
  let window: BrowserWindow;
  try { window = new BrowserWindow({ show: false, webPreferences: {
    preload: join(__dirname, 'export-preload.cjs'), partition: `revelumo-jpeg-${jobId}`,
    sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
  } }); } catch { active = false; throw new JpegEngineError('WINDOW_FAILED'); }
  let rendererPid = 0;
  let creationTime: number | undefined;
  const observeRenderer = () => {
    if (window.isDestroyed()) return;
    const pid = window.webContents.getOSProcessId();
    if (pid) { rendererPid = pid; creationTime = app.getAppMetrics().find(metric => metric.pid === pid)?.creationTime; }
  };
  // Record identity before loadFile settles: the window can close during loading.
  window.webContents.on('did-start-loading', observeRenderer);
  window.webContents.on('dom-ready', observeRenderer);
  observeRenderer();
  const channel = 'revelumo:jpeg-engine-result';
  let deadline: ReturnType<typeof scheduleTimeout> | undefined;
  let failed = () => {};
  let cancel = () => {};
  let receive: ((event: IpcMainEvent, input: unknown) => void) | undefined;
  let releaseSession = () => {};
  try {
    try {
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', event => event.preventDefault());
      window.webContents.on('will-redirect', event => event.preventDefault());
      window.webContents.on('will-attach-webview', event => event.preventDefault());
      releaseSession = restrictSession(window.webContents.session, entry);
    } catch { throw new JpegEngineError('WINDOW_FAILED'); }
    const result = new Promise<ExportOutput>((resolve, reject) => {
      deadline = scheduleTimeout(() => reject(new JpegEngineError('TIMEOUT')), 60_000);
      failed = () => reject(new JpegEngineError('RENDERER_FAILED'));
      window.webContents.on('render-process-gone', failed); window.on('closed', failed);
      cancel = () => reject(new JpegEngineError('CANCELED'));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      receive = (event, input) => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(entry).href) return;
        if (!input || typeof input !== 'object' || (input as { jobId?: unknown }).jobId !== jobId) return;
        const response = input as Record<string, unknown>;
        if (Object.keys(response).sort().join(',') === 'error,jobId' && (JPEG_CODEC_FAILURES as readonly unknown[]).includes(response.error)) {
          reject(new JpegEngineError(response.error as string)); return;
        }
        const output = validateExportOutput(input, jobId, dimensions, request.maximumOutputBytes);
        if (!output) reject(new JpegEngineError('INVALID_OUTPUT')); else resolve(output);
      };
      ipcMain.on(channel, receive);
      window.loadFile(entry).then(() => {
        if (signal?.aborted || window.isDestroyed()) return;
        const pid = window.webContents.getOSProcessId();
        if (!pid || BrowserWindow.getAllWindows().some(other => other !== window && !other.isDestroyed() && other.webContents.getOSProcessId() === pid)) {
          reject(new JpegEngineError('PROCESS_NOT_ISOLATED')); return;
        }
        rendererPid = pid; creationTime = app.getAppMetrics().find(metric => metric.pid === pid)?.creationTime;
        window.webContents.send('revelumo:jpeg-engine-input', { jobId, source: new Uint8Array(source), recipe, maximumOutputBytes: request.maximumOutputBytes });
      }).catch(() => reject(new JpegEngineError('LOAD_FAILED')));
    });
    return await result;
  } finally { cancelTimeout(deadline); if (receive) ipcMain.removeListener(channel, receive); signal?.removeEventListener('abort', cancel); window.removeListener('closed', failed);
    if (!window.isDestroyed()) {
      // Loading can fail after Chromium has already created the renderer.
      if (!rendererPid) {
        rendererPid = window.webContents.getOSProcessId();
        creationTime = app.getAppMetrics().find(metric => metric.pid === rendererPid)?.creationTime;
      }
      window.webContents.removeListener('render-process-gone', failed);
      window.webContents.removeListener('did-start-loading', observeRenderer);
      window.webContents.removeListener('dom-ready', observeRenderer);
      window.destroy();
    }
    const end = Date.now() + 5000;
    while (rendererPid && app.getAppMetrics().some(metric => metric.pid === rendererPid && (creationTime === undefined || metric.creationTime === creationTime))) {
      if (Date.now() >= end) { quarantined = { pid: rendererPid, creationTime }; active = false; throw new JpegEngineError('CLEANUP_UNCONFIRMED'); }
      await pause(25);
    }
    releaseSession();
    active = false; }
}
