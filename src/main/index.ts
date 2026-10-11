import { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, session } from 'electron';
import { mkdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
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
let window: BrowserWindow | null = null;
let importing = false;
let progress: ImportProgress = { running: false, total: 0, completed: 0, succeeded: 0, failed: 0, currentName: null };
const developmentUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const entryUrl = developmentUrl || 'app://revelumo/index.html';
const fail = (code: string, message: string) => ({ ok: false, code, message });

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
  window = new BrowserWindow({
    width: 1160, height: 780, minWidth: 760, minHeight: 540,
    backgroundColor: '#151715', title: 'Revelumo',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
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
  const dataDir = app.getPath('userData');
  await mkdir(dataDir, { recursive: true });
  catalog = new Catalog(join(dataDir, 'catalog.sqlite'));
  const library = new Library(catalog, preview, thumbnail);
  ipcMain.handle('revelumo:invoke', async (event, input: unknown) => {
    const owner = window;
    if (!owner || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame ||
        !isTrustedDocument(event.senderFrame.url, entryUrl)) {
      return fail('invalid-request', 'Origem não autorizada.');
    }
    const request = parseRequest(input);
    if (!request) return fail('invalid-request', 'Solicitação inválida.');
    try {
      if (request.op === 'list') return { ok: true, value: library.list() };
      if (request.op === 'progress') return { ok: true, value: progress };
      if (request.op === 'thumbnail') return await library.thumbnail(request.id);
      if (request.op === 'preview') return await library.preview(request.id);
      if (importing) return fail('busy', 'Uma importação já está em andamento.');
      importing = true;
      progress = { running: true, total: 0, completed: 0, succeeded: 0, failed: 0, currentName: null };
      try {
        const selection = await dialog.showOpenDialog(owner, { title: 'Importar JPEGs', properties: ['openFile', 'multiSelections'], filters: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }] });
        return { ok: true, value: await library.importBatch(selection.canceled ? null : selection.filePaths, (state) => { progress = state; }, () => owner.isDestroyed()) };
      } finally { importing = false; progress = { ...progress, running: false, currentName: null }; }
    } catch { return fail('catalog-error', 'Não foi possível concluir a operação. Tente novamente.'); }
  });
  await createWindow();
  app.on('activate', () => { if (!window) void createWindow(); });
}).catch(() => {
  dialog.showErrorBox('Não foi possível abrir o Revelumo', 'O catálogo pode estar indisponível ou ter sido criado por uma versão mais nova. Nenhum original foi alterado.');
  app.quit();
});
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { catalog?.close(); });
