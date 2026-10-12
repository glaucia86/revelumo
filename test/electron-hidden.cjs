// Run existing integration harnesses without showing windows or error dialogs.
const electron = require('electron');
const Module = require('node:module');
const path = require('node:path');
function fatal(error) { console.error(error?.stack || String(error)); electron.app.exit(1); }
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
electron.dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
const hiddenElectron = { ...electron, BrowserWindow: class extends electron.BrowserWindow {
  constructor(options) { super({ ...options, show: false }); }
} };
const script = path.resolve(process.argv[2]);
process.argv.splice(2, 1);
const load = Module._load;
Module._load = function(request, ...args) { return request === 'electron' ? hiddenElectron : load.call(this, request, ...args); };
try { require(script); } finally { Module._load = load; }
