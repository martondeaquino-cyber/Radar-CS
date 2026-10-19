// Ponte entre a página do Radar CS e as integrações reais (processo principal).
const { contextBridge, ipcRenderer } = require('electron');
const call = async (svc, op, args) => {
  const r = await ipcRenderer.invoke('rcs', svc, op, args);
  if (!r || !r.ok) { const e = new Error((r && r.error) || 'falha'); e.status = r && r.status; throw e; }
  return r.data;
};
contextBridge.exposeInMainWorld('rcsBridge', { v: 1, call });
