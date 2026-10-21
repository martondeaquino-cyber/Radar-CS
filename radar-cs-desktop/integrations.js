// Integrações reais do Radar CS (Asana, Claude, Google Agenda e Drive).
// Roda só no processo principal: chaves e tokens nunca chegam à página, ficam criptografados no computador.
const { ipcMain, safeStorage, shell, net, app } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTA = 'anaflavia.lumos@gmail.com';
const secFile = () => path.join(app.getPath('userData'), 'integracoes.dat');

function loadSec() {
  try {
    const raw = fs.readFileSync(secFile());
    const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    return JSON.parse(txt);
  } catch (e) { return {}; }
}
function saveSec(s) {
  const txt = JSON.stringify(s);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf8');
  fs.writeFileSync(secFile(), buf);
}
let SEC = null;
const sec = () => (SEC || (SEC = loadSec()));
const setSec = (k, v) => { const s = sec(); if (v == null) delete s[k]; else s[k] = v; saveSec(s); };

async function jfetch(url, opt = {}) {
  const r = await net.fetch(url, opt);
  const txt = await r.text();
  let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = txt; }
  if (!r.ok) {
    const msg = (body && (body.errors && body.errors[0] && body.errors[0].message || body.error && (body.error.message || body.error_description || body.error) || body.message)) || ('erro ' + r.status);
    const e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)); e.status = r.status; throw e;
  }
  return body;
}

/* ---------------- Asana ---------------- */
const AS = 'https://app.asana.com/api/1.0';
const asH = () => ({ Authorization: 'Bearer ' + (sec().asana || {}).token, 'Content-Type': 'application/json', Accept: 'application/json' });
function projGid(u) {
  u = String(u || '').trim();
  if (/^\d{6,}$/.test(u)) return u;
  let m = u.match(/project\/(\d{6,})/) || u.match(/asana\.com\/0\/(\d{6,})/) || u.match(/(\d{10,})/);
  return m ? m[1] : null;
}
// Na Lumos as demandas entram no projeto [Lumos], seção "Entrada de tarefas", com o nome "[Cliente] descrição".
const LUMOS_PROJ = '1210510753654250';
let asUsers = null;
const asana = {
  async connect({ token }) {
    token = String(token || '').trim();
    if (!token) throw new Error('Cole o token pessoal do Asana');
    const H = { Authorization: 'Bearer ' + token };
    const me = await jfetch(AS + '/users/me?opt_fields=name,email,workspaces.name', { headers: H });
    const p = await jfetch(AS + '/projects/' + LUMOS_PROJ + '?opt_fields=name,workspace.gid,workspace.name,permalink_url', { headers: H })
      .catch(() => { throw new Error('Este token não enxerga o projeto [Lumos]. Crie o token entrando no Asana com anaflavia.lumos@gmail.com.'); });
    const secs = await jfetch(AS + '/projects/' + LUMOS_PROJ + '/sections?opt_fields=name', { headers: H });
    const sec0 = (secs.data || []).find(x => /entrada de tarefas/i.test(x.name)) || (secs.data || [])[0];
    setSec('asana', { token, projeto: LUMOS_PROJ, nomeProjeto: p.data.name, secao: sec0 && sec0.gid, nomeSecao: sec0 && sec0.name, ws: p.data.workspace.gid, nomeWs: p.data.workspace.name, user: me.data.name, email: me.data.email, me: me.data.gid, link: p.data.permalink_url });
    asUsers = null;
    return asana.status();
  },
  status() { const a = sec().asana; return a && a.secao !== undefined ? { ok: 1, user: a.user, email: a.email, projeto: a.nomeProjeto, secao: a.nomeSecao, ws: a.nomeWs, link: a.link } : (a ? { ok: 0, refazer: 1 } : { ok: 0 }); },
  async users() {
    const a = sec().asana; if (!a) throw new Error('Asana não conectado');
    if (asUsers) return asUsers;
    let out = [], url = AS + '/workspaces/' + a.ws + '/users?limit=100&opt_fields=name,email';
    for (let i = 0; i < 10 && url; i++) { const r = await jfetch(url, { headers: asH() }); out = out.concat(r.data); url = r.next_page && r.next_page.uri; }
    asUsers = out.map(u => ({ gid: u.gid, name: u.name, email: u.email }));
    return asUsers;
  },
  async _assignee(nome) {
    const a = sec().asana; nome = String(nome || '').trim();
    if (!nome || /^voc[êe]$/i.test(nome)) return a.me;
    try {
      const n = nome.toLowerCase(), L = await asana.users();
      const u = L.find(x => (x.name || '').toLowerCase() === n) || L.find(x => (x.name || '').toLowerCase().startsWith(n)) || L.find(x => (x.name || '').toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
      return u ? u.gid : a.me;
    } catch (e) { return a.me; }
  },
  async createTask({ name, notes, due_on, responsavel }) {
    const a = sec().asana; if (!a || a.secao === undefined) throw new Error('Asana não conectado');
    const data = { name: String(name || 'Demanda').slice(0, 1000), notes: notes || '', workspace: a.ws, assignee: await asana._assignee(responsavel),
      memberships: [{ project: a.projeto, section: a.secao }] };
    if (!a.secao) { delete data.memberships; data.projects = [a.projeto]; }
    if (due_on) data.due_on = due_on;
    const r = await jfetch(AS + '/tasks?opt_fields=gid,permalink_url,name,assignee.name', { method: 'POST', headers: asH(), body: JSON.stringify({ data }) });
    return { gid: r.data.gid, url: r.data.permalink_url, who: r.data.assignee && r.data.assignee.name };
  },
  async complete({ gid, done }) {
    await jfetch(AS + '/tasks/' + gid, { method: 'PUT', headers: asH(), body: JSON.stringify({ data: { completed: done !== false } }) });
    return { ok: 1 };
  },
  // tarefas atribuídas a você no Grupo Lumos (últimos 30 dias) + situação das que o Radar CS criou para outras pessoas
  async list({ gids } = {}) {
    const a = sec().asana; if (!a || a.secao === undefined) throw new Error('Asana não conectado');
    const since = new Date(Date.now() - 30 * 864e5).toISOString(), F = 'name,completed,due_on,assignee.name,permalink_url,projects.name';
    let out = [], url = AS + '/tasks?assignee=me&workspace=' + a.ws + '&limit=100&completed_since=' + encodeURIComponent(since) + '&opt_fields=' + F;
    for (let i = 0; i < 10 && url; i++) { const r = await jfetch(url, { headers: asH() }); out = out.concat(r.data); url = r.next_page && r.next_page.uri; }
    const have = new Set(out.map(t => t.gid));
    for (const g of (gids || []).filter(g => !have.has(g)).slice(0, 40)) {
      try { const r = await jfetch(AS + '/tasks/' + g + '?opt_fields=' + F, { headers: asH() }); out.push(r.data); } catch (e) { if (e.status === 404) out.push({ gid: g, gone: 1 }); }
    }
    return out.map(t => ({ gid: t.gid, gone: t.gone, name: t.name, done: t.completed, due: t.due_on, who: t.assignee && t.assignee.name, url: t.permalink_url, proj: (t.projects || []).map(p => p.name).join(', ') }));
  },
  disconnect() { setSec('asana', null); asUsers = null; return { ok: 0 }; }
};

/* ---------------- Fathom ---------------- */
const FT = 'https://api.fathom.ai/external/v1';
const fathom = {
  async connect({ key }) {
    key = String(key || '').trim(); if (!key) throw new Error('Cole a chave da API do Fathom');
    await jfetch(FT + '/meetings', { headers: { 'X-Api-Key': key } });
    setSec('fathom', { key });
    return fathom.status();
  },
  status() { return sec().fathom ? { ok: 1 } : { ok: 0 }; },
  async meetings({ after } = {}) {
    const f = sec().fathom; if (!f) throw new Error('Fathom não conectado');
    const H = { 'X-Api-Key': f.key };
    const q = (full) => { const u = new URLSearchParams({ include_transcript: 'true' }); if (full) { u.set('include_summary', 'true'); u.set('include_action_items', 'true'); } if (after) u.set('created_after', new Date(after).toISOString()); return u; };
    let full = true, out = [], cursor = null;
    for (let i = 0; i < 5; i++) {
      const u = q(full); if (cursor) u.set('cursor', cursor);
      let r;
      try { r = await jfetch(FT + '/meetings?' + u, { headers: H }); }
      catch (e) { if (e.status === 400 && full) { full = false; i--; continue; } throw e; }
      out = out.concat(r.items || r.meetings || r.data || []);
      cursor = r.next_cursor; if (!cursor) break;
    }
    return out.map(m => ({
      id: String(m.recording_id || m.id || m.share_url || m.url || m.created_at),
      titulo: m.title || m.meeting_title || 'Reunião',
      t: Date.parse(m.recording_start_time || m.scheduled_start_time || m.created_at),
      url: m.share_url || m.url || '',
      convidados: (m.calendar_invitees || []).map(x => x.name || x.email).filter(Boolean),
      externos: (m.calendar_invitees || []).filter(x => x.is_external).map(x => x.name || x.email).filter(Boolean),
      resumo: (m.default_summary && m.default_summary.markdown_formatted) || '',
      acoes: (m.action_items || []).map(x => ({ t: x.description, quem: x.assignee && x.assignee.name || '', feito: !!x.completed })),
      transcricao: (m.transcript || []).map(s => (s.timestamp ? '[' + s.timestamp + '] ' : '') + ((s.speaker && s.speaker.display_name) || '') + ': ' + s.text).join('\n').slice(0, 200000)
    }));
  },
  disconnect() { setSec('fathom', null); return { ok: 0 }; }
};

/* ---------------- Claude (API da Anthropic) ---------------- */
const claude = {
  async connect({ key, model }) {
    key = String(key || '').trim(); if (!key) throw new Error('Cole a chave da API');
    model = String(model || '').trim() || 'claude-sonnet-5-5';
    await claude._call(key, model, 'Responda apenas: ok', '', 10);
    setSec('claude', { key, model });
    return claude.status();
  },
  status() { const c = sec().claude; return c ? { ok: 1, model: c.model } : { ok: 0 }; },
  async _call(key, model, prompt, system, max) {
    const r = await jfetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: max || 2000, system: system || undefined, messages: [{ role: 'user', content: prompt }] })
    });
    return (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  },
  async ask({ prompt, system, max }) {
    const c = sec().claude; if (!c) throw new Error('Claude não conectado');
    return { text: await claude._call(c.key, c.model, prompt, system, max) };
  },
  disconnect() { setSec('claude', null); return { ok: 0 }; }
};

/* ---------------- Google (Agenda e Drive) ---------------- */
const G_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.file'];
const b64u = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let gTok = null; // { access, exp }
async function gAccess() {
  const g = sec().google; if (!g || !g.refresh) throw new Error('Google não conectado');
  if (gTok && gTok.exp > Date.now() + 60000) return gTok.access;
  const r = await jfetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refresh, grant_type: 'refresh_token' }).toString()
  });
  gTok = { access: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
  return gTok.access;
}
const gH = async () => ({ Authorization: 'Bearer ' + await gAccess(), 'Content-Type': 'application/json' });
let gPending = null;
const google = {
  async connect({ clientId, clientSecret }) {
    clientId = String(clientId || '').trim(); clientSecret = String(clientSecret || '').trim();
    if (!clientId || !clientSecret) throw new Error('Cole o ID do cliente e a chave secreta do Google');
    if (gPending) { try { gPending.close(); } catch (e) {} gPending = null; }
    const verifier = b64u(crypto.randomBytes(48)), challenge = b64u(crypto.createHash('sha256').update(verifier).digest()), state = b64u(crypto.randomBytes(16));
    const code = await new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
        const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2>${ok ? 'Pronto! O Google foi conectado ao Radar CS.' : 'Não deu certo.'}</h2><p>Pode fechar esta aba e voltar ao Radar CS.</p></body></html>`);
        srv.close(); gPending = null;
        if (ok) resolve({ code: u.searchParams.get('code'), redirect: 'http://127.0.0.1:' + srv.address().port + '/' });
        else reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'O acesso foi recusado no Google' : 'O Google não devolveu a autorização'));
      });
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const redirect = 'http://127.0.0.1:' + srv.address().port + '/';
        const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: G_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state, login_hint: CONTA });
        shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
      });
      gPending = srv;
      setTimeout(() => { try { srv.close(); } catch (e) {} reject(new Error('Tempo esgotado esperando o login do Google (5 min)')); }, 5 * 60 * 1000);
    });
    const t = await jfetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: code.code, code_verifier: verifier, redirect_uri: code.redirect, grant_type: 'authorization_code' }).toString()
    });
    if (!t.refresh_token) throw new Error('O Google não liberou acesso contínuo. Tente conectar de novo.');
    let email = '';
    try { const p = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64').toString()); email = p.email || ''; } catch (e) {}
    gTok = { access: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 };
    setSec('google', { clientId, clientSecret, refresh: t.refresh_token, email, pasta: null });
    return google.status();
  },
  status() { const g = sec().google; return g && g.refresh ? { ok: 1, email: g.email, pasta: g.pastaLink || '', esperado: CONTA } : { ok: 0, esperado: CONTA, temCliente: !!(g && g.clientId) }; },
  async events({ from, to }) {
    const q = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '500' });
    const r = await jfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q, { headers: await gH() });
    return (r.items || []).filter(e => e.status !== 'cancelled').map(e => ({
      id: e.id, t: e.summary || '(sem título)', url: e.htmlLink, desc: e.description || '',
      s: e.start.dateTime ? Date.parse(e.start.dateTime) : Date.parse(e.start.date + 'T00:00:00'),
      e: e.end.dateTime ? Date.parse(e.end.dateTime) : Date.parse(e.end.date + 'T00:00:00'),
      allDay: !e.start.dateTime, meet: e.hangoutLink || ''
    }));
  },
  async createEvent({ title, start, minutes, desc }) {
    const s = new Date(start), e = new Date(+s + (minutes || 60) * 60000);
    const r = await jfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST', headers: await gH(),
      body: JSON.stringify({ summary: title, description: desc || 'Criado pelo Radar CS', start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() } })
    });
    return { id: r.id, url: r.htmlLink };
  },
  async _pasta() {
    const g = sec().google;
    if (g.pasta) {
      try { const f = await jfetch('https://www.googleapis.com/drive/v3/files/' + g.pasta + '?fields=id,trashed', { headers: await gH() }); if (!f.trashed) return g.pasta; } catch (e) {}
    }
    const f = await jfetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
      method: 'POST', headers: await gH(), body: JSON.stringify({ name: 'Radar CS · Atas', mimeType: 'application/vnd.google-apps.folder' })
    });
    setSec('google', { ...g, pasta: f.id, pastaLink: f.webViewLink });
    return f.id;
  },
  async saveDoc({ name, text }) {
    const pasta = await google._pasta();
    const bnd = 'rcs' + crypto.randomBytes(8).toString('hex');
    const meta = { name: name || 'Ata', mimeType: 'application/vnd.google-apps.document', parents: [pasta] };
    const body = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bnd}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text || ''}\r\n--${bnd}--`;
    const h = await gH(); h['Content-Type'] = 'multipart/related; boundary=' + bnd;
    const r = await jfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', headers: h, body });
    return { id: r.id, url: r.webViewLink, pasta: sec().google.pastaLink };
  },
  disconnect() { const g = sec().google; setSec('google', g ? { clientId: g.clientId, clientSecret: g.clientSecret } : null); gTok = null; return google.status(); }
};

const { whatsapp } = require('./whatsapp');
const SV = { asana, claude, google, fathom, whatsapp };
function setupIntegrations() {
  setTimeout(() => { try { whatsapp.startIfOn(); } catch (e) {} }, 5000);
  ipcMain.handle('rcs', async (_e, svc, op, args) => {
    try {
      if (svc === 'all' && op === 'status') return { ok: true, data: { asana: asana.status(), claude: claude.status(), google: google.status(), fathom: fathom.status(), whatsapp: whatsapp.status(), v: 3 } };
      if (svc === 'open' && /^https:\/\//.test(String(args && args.url))) { shell.openExternal(args.url); return { ok: true }; }
      const s = SV[svc];
      if (!s || op.startsWith('_') || typeof s[op] !== 'function') throw new Error('operação desconhecida');
      return { ok: true, data: await s[op](args || {}) };
    } catch (e) { return { ok: false, error: String(e && e.message || e), status: e && e.status }; }
  });
}
module.exports = { setupIntegrations };
