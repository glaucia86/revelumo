const electron = require('electron');
const { app, dialog, BrowserWindow: RealWindow } = electron;
const fatal = error => { console.error(error?.stack || String(error)); app.exit(1); };
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(title + ': ' + message));
const Module = require('node:module'), load = Module._load;
const hidden = { ...electron, BrowserWindow: class extends RealWindow { constructor(options) { super({ ...options, show: false }); } } };
const target = require('node:path').resolve(process.argv[2]);
process.argv.splice(1, 1);
Module._load = function(request, ...args) { return request === 'electron' ? hidden : load.call(this, request, ...args); };
try { require(target); } catch (error) { fatal(error); } finally { Module._load = load; }
