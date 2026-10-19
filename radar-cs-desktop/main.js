const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createUpdater } = require('./updater');
let autoUpdater = null;
try { if (process.platform === 'win32') autoUpdater = require('electron-updater').autoUpdater; } catch (e) { autoUpdater = null; }

// Endereço onde ficam a versão mais nova da ferramenta (repositório público).
const UPDATE_BASE = 'https://raw.githubusercontent.com/martondeaquino-cyber/Radar-CS/main/radar-cs-desktop/app/';

let win = null, tray = null, quitting = false, pendingReload = false, updater = null;
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const saveCfg = (c) => { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWin());

function showWin() {
  if (!win) createWindow();
  if (pendingReload) { pendingReload = false; win.loadFile(updater.userFile()); }
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
  // sempre o mesmo caminho: assim os dados guardados continuam valendo depois de cada atualização
  win.loadFile(updater.ensureLocal());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

async function checkUpdate(manual) {
  const r = await updater.check();
  const parent = win && win.isVisible() ? win : undefined;
  if (r.status === 'baixada') {
    if (!parent) { pendingReload = true; return; }   // janela escondida: aplica na próxima vez que abrir
    const a = await dialog.showMessageBox(parent, { type: 'info', buttons: ['Atualizar agora', 'Depois'], defaultId: 0,
      message: 'Atualização pronta', detail: 'A nova versão do Radar CS foi baixada. Seus dados continuam como estão.' });
    if (a.response === 0 && win) win.loadFile(updater.userFile()); else pendingReload = true;
  } else if (manual) {
    await dialog.showMessageBox(parent, { type: r.status === 'erro' ? 'warning' : 'info',
      message: r.status === 'erro' ? 'Não consegui verificar agora' : 'Você já está na versão mais recente',
      detail: r.status === 'erro' ? r.erro : 'Versão ' + r.v });
  }
}

// Atualização do próprio programa (casca, ícone, janela). Só no Windows.
let shellManual = false;
function setupShellUpdater() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async () => {
    const parent = win && win.isVisible() ? win : undefined;
    const a = await dialog.showMessageBox(parent, { type: 'info', buttons: ['Reiniciar agora', 'Depois'], defaultId: 0,
      message: 'Nova versão do programa pronta', detail: 'O Radar CS precisa reiniciar para terminar a atualização. Seus dados continuam como estão.' });
    if (a.response === 0) { quitting = true; autoUpdater.quitAndInstall(false, true); }
  });
  autoUpdater.on('update-not-available', () => { if (shellManual) { shellManual = false; dialog.showMessageBox({ type: 'info', message: 'Você já está na versão mais recente do programa' }); } });
  autoUpdater.on('error', (e) => { if (shellManual) { shellManual = false; dialog.showMessageBox({ type: 'warning', message: 'Não consegui verificar o programa agora', detail: String(e && e.message || e) }); } });
  const go = () => { try { autoUpdater.checkForUpdates(); } catch (e) {} };
  setTimeout(go, 20000);
  setInterval(go, 3 * 60 * 60 * 1000);
}
function checkShell() { if (autoUpdater && app.isPackaged) { shellManual = true; try { autoUpdater.checkForUpdates(); } catch (e) {} } }

function buildTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Radar CS');
  const cfg = loadCfg();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Radar CS', click: showWin },
    { label: 'Verificar atualização agora', click: () => { checkUpdate(true); checkShell(); } },
    { label: 'Abrir com o computador', type: 'checkbox', checked: !!app.getLoginItemSettings().openAtLogin,
      click: (m) => { app.setLoginItemSettings({ openAtLogin: m.checked }); saveCfg({ ...cfg, login: m.checked }); } },
    { type: 'separator' },
    { label: 'Sair de vez', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWin);
}

app.whenReady().then(() => {
  updater = createUpdater({
    base: UPDATE_BASE,
    bundledDir: path.join(__dirname, 'app'),
    userDir: path.join(app.getPath('userData'), 'app'),
    fetchFn: (u) => net.fetch(u)
  });
  createWindow(); buildTray();
  setupShellUpdater();
  setTimeout(() => checkUpdate(false), 8000);
  setInterval(() => checkUpdate(false), 3 * 60 * 60 * 1000);
});
app.on('activate', showWin);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* continua na barra do sistema */ });
