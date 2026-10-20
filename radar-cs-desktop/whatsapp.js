// WhatsApp Business dentro do Radar CS: abre o WhatsApp Web numa janela própria (sessão guardada neste computador)
// e SÓ LÊ as conversas que têm a etiqueta LUMOS. Nunca envia mensagens, nunca marca como lida, nunca altera nada.
const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const cfgFile = () => path.join(app.getPath('userData'), 'whatsapp.json');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const saveCfg = (c) => { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };
let waWin = null, quitting = false, last = { stage: 'off' };
app.on('before-quit', () => { quitting = true; });

function ensureWin(show) {
  if (!waWin) {
    waWin = new BrowserWindow({
      width: 1100, height: 800, show: false, title: 'WhatsApp · Radar CS (somente leitura)', autoHideMenuBar: true,
      webPreferences: { partition: 'persist:whatsapp', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    waWin.webContents.setUserAgent(UA);
    waWin.loadURL('https://web.whatsapp.com/', { userAgent: UA });
    waWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    waWin.on('close', (e) => { if (!quitting) { e.preventDefault(); waWin.hide(); } });
    waWin.on('closed', () => { waWin = null; });
  }
  if (show) { waWin.show(); waWin.focus(); }
  return waWin;
}

// Lê os dados direto da página do WhatsApp Web, apenas leitura.
const READ = `(() => {
  try {
    if (document.querySelector('canvas[aria-label], [data-ref] canvas, div[data-testid="qrcode"]')) return { stage: 'qr' };
    const req = window.require;
    if (typeof req !== 'function') return { stage: 'carregando' };
    let C = null;
    try { C = req('WAWebCollections'); } catch (e) { return { stage: 'carregando' }; }
    if (!C || !C.Chat || !C.Chat.getModelsArray) return { stage: 'carregando' };
    const chatsAll = C.Chat.getModelsArray();
    if (!chatsAll.length) return { stage: 'carregando' };
    const labels = (C.Label && C.Label.getModelsArray ? C.Label.getModelsArray() : []).map(l => ({ id: String(l.id), name: String(l.name || '') }));
    const lum = new Set(labels.filter(l => /lumos/i.test(l.name)).map(l => l.id));
    const ser = (id) => id ? (id._serialized || String(id)) : '';
    const chats = chatsAll.filter(c => (c.labels || []).some(id => lum.has(String(id)))).map(c => {
      let msgs = [];
      try { msgs = (c.msgs && c.msgs.getModelsArray ? c.msgs.getModelsArray() : []).slice(-40); } catch (e) {}
      return {
        id: ser(c.id), nome: String(c.formattedTitle || c.name || (c.contact && (c.contact.name || c.contact.pushname)) || ''), grupo: !!c.isGroup,
        t: c.t || 0, naoLidas: c.unreadCount || 0,
        msgs: msgs.filter(m => ['chat', 'image', 'video', 'document', 'ptt', 'audio'].includes(m.type)).map(m => ({
          id: ser(m.id), t: m.t || 0, eu: !!(m.id && m.id.fromMe), tipo: m.type,
          texto: String(m.body && m.type === 'chat' ? m.body : (m.caption || ({ image: '[imagem]', video: '[vídeo]', document: '[documento]', ptt: '[áudio]', audio: '[áudio]' })[m.type] || '')).slice(0, 3000),
          autor: String((m.senderObj && (m.senderObj.name || m.senderObj.pushname)) || m.notifyName || '')
        }))
      };
    });
    return { stage: 'ok', etiquetas: labels.map(l => l.name), temLumos: lum.size > 0, chats };
  } catch (e) { return { stage: 'erro', erro: String(e && e.message || e) }; }
})()`;

const whatsapp = {
  status() { const c = loadCfg(); return { ok: c.on ? 1 : 0, stage: last.stage, erro: last.erro || '', temLumos: last.temLumos, etiquetas: last.etiquetas || [] }; },
  async connect() { const c = loadCfg(); c.on = 1; saveCfg(c); ensureWin(true); return whatsapp.status(); },
  show() { ensureWin(true); return { ok: 1 }; },
  async read() {
    const c = loadCfg(); if (!c.on) throw new Error('WhatsApp não conectado');
    const w = ensureWin(false);
    if (w.webContents.isLoading()) { last = { stage: 'carregando' }; return last; }
    let r;
    try { r = await w.webContents.executeJavaScript(READ, true); } catch (e) { r = { stage: 'erro', erro: String(e && e.message || e) }; }
    last = { stage: r.stage, erro: r.erro, temLumos: r.temLumos, etiquetas: r.etiquetas };
    if (r.stage === 'qr' && !w.isVisible()) w.show();
    return r;
  },
  async disconnect() {
    const c = loadCfg(); c.on = 0; saveCfg(c);
    if (waWin) { try { await waWin.webContents.session.clearStorageData(); } catch (e) {} quitting = true; waWin.destroy(); quitting = false; waWin = null; }
    last = { stage: 'off' };
    return whatsapp.status();
  },
  startIfOn() { if (loadCfg().on) ensureWin(false); }
};
module.exports = { whatsapp };
