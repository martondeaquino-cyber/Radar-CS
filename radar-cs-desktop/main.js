const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null, tray = null, quitting = false;
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const saveCfg = (c) => { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWin());

function showWin() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 380, minHeight: 600,
    title: 'Radar CS', backgroundColor: '#f5f6f3', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'tray.png'),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false   // gatilhos e relógios continuam rodando com a janela escondida
    }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // links externos abrem no navegador, nunca dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // fechar a janela só esconde: o Radar CS segue vivo na barra do sistema
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function buildTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Radar CS');
  const cfg = loadCfg();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Radar CS', click: showWin },
    { label: 'Abrir com o computador', type: 'checkbox', checked: !!app.getLoginItemSettings().openAtLogin,
      click: (m) => { app.setLoginItemSettings({ openAtLogin: m.checked }); saveCfg({ ...cfg, login: m.checked }); } },
    { type: 'separator' },
    { label: 'Sair de vez', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWin);
}

app.whenReady().then(() => { createWindow(); buildTray(); });
app.on('activate', showWin);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* continua na barra do sistema */ });
