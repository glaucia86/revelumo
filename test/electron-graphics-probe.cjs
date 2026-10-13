// Environment prerequisite probe, not a substitute for the JPEG workflow.
// Never disables the sandbox or changes the host's security configuration.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revelumo-graphics-'));
app.setPath('userData', path.join(root, 'profile'));
app.setPath('sessionData', path.join(root, 'session'));
const fail = error => { console.error(error?.stack || error); app.exit(1); };
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
setTimeout(() => fail(new Error('Graphics prerequisite probe timed out')), 20000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
  } });
  await win.loadURL('data:text/html,<title>Revelumo synthetic graphics probe</title>');
  assert.equal(await win.webContents.executeJavaScript('typeof require'), 'undefined');
  assert.equal(win.webContents.getLastWebPreferences().sandbox, true);
  console.log(JSON.stringify({ status: 'passed', platform: process.platform, versions: process.versions, profile: root }));
  app.exit(0);
}).catch(fail);
