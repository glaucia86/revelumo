// External module adapter: Electron's actual export is non-configurable.
// Never redefine BrowserWindow on the real Electron module.
module.exports = function loadHidden(entry) {
  const electron = require('electron'), Module = require('node:module'), load = Module._load;
  const fatal = error => { console.error(error?.stack || error); electron.app.exit(1); };
  process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
  electron.dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
  const hidden = { ...electron, BrowserWindow: class extends electron.BrowserWindow { constructor(options) { super({ ...options, show: false }); } } };
  Module._load = function(request, ...args) { return request === 'electron' ? hidden : load.call(this, request, ...args); };
  try { return require(entry); } finally { Module._load = load; }
};
