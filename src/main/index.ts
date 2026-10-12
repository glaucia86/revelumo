import { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, session } from 'electron';
import { mkdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { PreferencesStore } from './preferences.ts';
import { handlePreferencesRequest } from './preferences-ipc.ts';
import { resolveLanguage, type UiLanguage } from '../shared/i18n/locale.ts';
import type { MessageDescriptor } from '../shared/i18n/messages.ts';
import { translate } from '../shared/i18n/format.ts';
import { Catalog } from './catalog.ts';
import { Library } from './library.ts';
import { parseRequest } from '../shared/requests.ts';
import { jpegPreview } from './preview.ts';
import { jpegThumbnail } from './thumbnail.ts';
import type { ImportProgress } from '../shared/contracts.ts';
import { assetPath } from './assets.ts';
import { isTrustedDocument } from './trusted-document.ts';

app.setName('Revelumo');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
let catalog: Catalog | undefined;
let language: UiLanguage = 'en';
let window: BrowserWindow | null = null;
let closeRequested = false;
let closeAllowed = false;
let selectingFiles = false;
let progress: ImportProgress = { running: false, total: 0, completed: 0, succeeded: 0, failed: 0, currentName: null };
const developmentUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const entryUrl = developmentUrl || 'app://revelumo/index.html';
const fail = (code: string, message: string, descriptor: MessageDescriptor = { key: 'errors.generic' }) => ({ ok: false, code, message, descriptor });

async function preview(bytes: Buffer): Promise<string> {
  return jpegPreview(bytes, (content) => {
    const image = nativeImage.createFromBuffer(content);
    if (image.isEmpty()) throw new Error('JPEG decode failed');
    const size = image.getSize();
    if (size.width * size.height > 40_000_000) throw new Error('JPEG exceeds pixel budget');
  });
}

async function thumbnail(bytes: Buffer): Promise<string> {
  return jpegThumbnail(bytes, (content, width, height) => {
    const image = nativeImage.createFromBuffer(content);
    if (image.isEmpty()) throw new Error('JPEG decode failed');
    return image.resize({ width, height, quality: 'good' }).toJPEG(75);
  });
}

async function createWindow() {
  closeRequested = false; closeAllowed = false;
  window = new BrowserWindow({
    width: 1160, height: 780, minWidth: 760, minHeight: 540,
    backgroundColor: '#151715', title: 'Revelumo',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('close', (event) => {
    if (closeAllowed) return;
    event.preventDefault(); closeRequested = true;
    window?.webContents.send('revelumo:close-request');
  });
  window.on('closed', () => { window = null; });
  await window.loadURL(entryUrl);
}

if (ownsInstance) app.whenReady().then(async () => {
  const rendererRoot = join(__dirname, '../renderer', MAIN_WINDOW_VITE_NAME);
  const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'";
  protocol.handle('app', async (request) => {
    const filename = assetPath(rendererRoot, request.url);
    if (!filename || request.method !== 'GET') return new Response('Not found', { status: 404 });
    try {
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      const bytes = await readFile(filename);
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': mime[extname(filename)], 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  if (developmentUrl) {
    const origin = new URL(developmentUrl).origin;
    const socketOrigin = origin.replace(/^http/, 'ws');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'").replace("connect-src 'none'", `connect-src 'self' ${socketOrigin}`)] } });
    });
  }
  let preferred: unknown = [];
  try { preferred = app.getPreferredSystemLanguages(); } catch { /* English fallback keeps boot available. */ }
  language = resolveLanguage('system', preferred);
  const dataDir = app.getPath('userData');
  await mkdir(dataDir, { recursive: true });
  const preferences = new PreferencesStore(dataDir, preferred);
  language = (await preferences.read()).resolved;
  ipcMain.handle('revelumo:preferences', async (event, input: unknown) => {
    const result = await handlePreferencesRequest(preferences, event, window?.webContents ?? null, entryUrl, input);
    if (result.ok) language = result.value.resolved;
    return result;
  });
  catalog = new Catalog(join(dataDir, 'catalog.sqlite'));
  const library = new Library(catalog, preview, thumbnail);
  ipcMain.handle('revelumo:invoke', async (event, input: unknown) => {
    const owner = window;
    if (!owner || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame ||
        !isTrustedDocument(event.senderFrame.url, entryUrl)) {
      return fail('invalid-request', 'Origem não autorizada.', { key: 'errors.unauthorized' });
    }
    const request = parseRequest(input);
    if (!request) return fail('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' });
    try {
      if (request.op === 'list') return { ok: true, value: library.list() };
      if (request.op === 'query') return library.query({ rating: request.rating, flag: request.flag });
      if (request.op === 'progress') return { ok: true, value: progress };
      if (request.op === 'recipe') return library.recipe(request.id);
      if (request.op === 'begin-edit') return await library.beginEditing(request.id);
      if (request.op === 'adjustments') return await library.saveAdjustments(request.id, request.sessionId, request.revision, request.adjustments, request.processingVersion, request.gestures);
      if (request.op === 'exposure') return await library.saveExposure(request.id, request.sessionId, request.revision, request.exposureTenths, request.processingVersion, request.gestures);
      if (request.op === 'exposure-history') return await library.moveExposureHistory(request.id, request.sessionId, request.revision, request.direction);
      if (request.op === 'end-edit') return await library.endEditing(request.id, request.sessionId);
      if (request.op === 'close-ready') {
        if (!closeRequested) return fail('invalid-request', 'Nenhum fechamento solicitado.');
        closeAllowed = true;
        // Reply before closing the bridge's owning renderer.
        setImmediate(() => { if (window === owner && !owner.isDestroyed()) owner.close(); });
        return { ok: true, value: null };
      }
      if (request.op === 'classification') return library.classification(request.id);
      if (request.op === 'classify') return library.classify(request.id, request.rating, request.flag);
      if (request.op === 'status') return await library.status(request.id);
      if (request.op === 'availability') return await library.availability(request.id);
      if (request.op === 'thumbnail') return await library.thumbnail(request.id);
      if (request.op === 'preview') return await library.preview(request.id);
      if (selectingFiles) return fail('busy', 'Outra seleção de arquivos está em andamento. Aguarde.', { key: 'errors.busy' });
      if (request.op === 'relocate') {
        selectingFiles = true;
        try {
          const status = await library.status(request.id);
          if (owner.isDestroyed()) return { ok: true, value: { canceled: true } };
          if (!status.ok) return status;
          if (status.value.state === 'available') return fail('invalid-request', 'O original já está disponível. Volte a abrir a foto.');
          if (!status.value.canRelocate) return fail('identity-unverified', status.value.message);
          const selection = await dialog.showOpenDialog(owner, { title: 'Localizar original', properties: ['openFile'], filters: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }] });
          return await library.relocateSelected(request.id, selection.canceled ? null : selection.filePaths[0] || null, () => owner.isDestroyed());
        } finally { selectingFiles = false; }
      }
      selectingFiles = true;
      progress = { running: true, total: 0, completed: 0, succeeded: 0, failed: 0, currentName: null };
      try {
        const selection = await dialog.showOpenDialog(owner, { title: translate(language, { key: 'dialog.importTitle' }), properties: ['openFile', 'multiSelections'], filters: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }] });
        return { ok: true, value: await library.importBatch(selection.canceled ? null : selection.filePaths, (state) => { progress = state; }, () => owner.isDestroyed()) };
      } finally { selectingFiles = false; progress = { ...progress, running: false, currentName: null }; }
    } catch { return fail('catalog-error', 'Não foi possível concluir a operação. Tente novamente.'); }
  });
  await createWindow();
  app.on('activate', () => { if (!window) void createWindow(); });
}).catch(() => {
  dialog.showErrorBox(translate(language, { key: 'boot.title' }), translate(language, { key: 'boot.failed' }));
  app.quit();
});
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { catalog?.close(); });
