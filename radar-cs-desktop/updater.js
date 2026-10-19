// Atualização automática: baixa a versão nova da ferramenta (index.html) e guarda no computador.
// Os dados do usuário ficam à parte (localStorage) e não são tocados.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function createUpdater({ base, bundledDir, userDir, fetchFn }) {
  const userFile = () => path.join(userDir, 'index.html');

  // Garante que existe uma cópia local; se o instalador trouxe uma versão mais nova, ela vence.
  function ensureLocal() {
    const b = readJson(path.join(bundledDir, 'version.json')) || { v: 0 };
    const u = readJson(path.join(userDir, 'version.json'));
    if (!u || !fs.existsSync(userFile()) || u.v < b.v) {
      fs.mkdirSync(userDir, { recursive: true });
      fs.copyFileSync(path.join(bundledDir, 'index.html'), userFile());
      fs.copyFileSync(path.join(bundledDir, 'version.json'), path.join(userDir, 'version.json'));
    }
    return userFile();
  }
  const currentVersion = () => (readJson(path.join(userDir, 'version.json')) || { v: 0 }).v;

  // Retorna { status: 'atual' | 'baixada' | 'erro', v, erro? }
  async function check() {
    try {
      const r = await fetchFn(base + 'version.json?t=' + Date.now());
      if (!r.ok) throw new Error('servidor respondeu ' + r.status);
      const remote = await r.json();
      if (!remote || typeof remote.v !== 'number' || !/^[0-9a-f]{64}$/.test(remote.sha256 || '')) throw new Error('arquivo de versão inválido');
      ensureLocal();
      if (!(remote.v > currentVersion())) return { status: 'atual', v: currentVersion() };
      const h = await fetchFn(base + 'index.html?t=' + Date.now());
      if (!h.ok) throw new Error('servidor respondeu ' + h.status);
      const buf = Buffer.from(await h.arrayBuffer());
      if (crypto.createHash('sha256').update(buf).digest('hex') !== remote.sha256) throw new Error('o arquivo baixado não confere');
      fs.mkdirSync(userDir, { recursive: true });
      fs.writeFileSync(userFile() + '.tmp', buf);
      fs.renameSync(userFile() + '.tmp', userFile());
      fs.writeFileSync(path.join(userDir, 'version.json'), JSON.stringify({ v: remote.v, sha256: remote.sha256 }));
      return { status: 'baixada', v: remote.v };
    } catch (e) {
      return { status: 'erro', erro: String(e.message || e), v: currentVersion() };
    }
  }
  return { ensureLocal, check, currentVersion, userFile };
}
module.exports = { createUpdater };
