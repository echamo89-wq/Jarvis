const { ipcMain, safeStorage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'jarvis_credentials.enc');

function _getMachineKey() {
  const keyPath = path.join(app.getPath('userData'), '.jarvis_key');

  if (!safeStorage.isEncryptionAvailable()) {
    // Sin cifrado del OS disponible: no podemos proteger la clave.
    // Lanzar error explícito — mejor fallar que guardar secretos en texto plano.
    throw new Error('safeStorage no disponible en este sistema. El almacenamiento seguro requiere acceso al keychain del OS.');
  }

  if (fs.existsSync(keyPath)) {
    try {
      const encrypted = fs.readFileSync(keyPath);
      return safeStorage.decryptString(encrypted).toString('utf8');
    } catch (e) {
      // Si la clave existente no se puede descifrar (ej. cambio de usuario), regenerar.
      console.warn('[SECURE] No se pudo descifrar la clave existente, regenerando:', e.message);
      try { fs.unlinkSync(keyPath); } catch {}
    }
  }

  // Generar nueva clave y cifrarla con safeStorage del OS
  const newKey = crypto.randomBytes(32).toString('hex');
  const encrypted = safeStorage.encryptString(newKey);
  fs.writeFileSync(keyPath, encrypted);
  return newKey;
}

let _machineKey = null;
function _ensureMachineKey() {
  if (!_machineKey) _machineKey = _getMachineKey();
  return _machineKey;
}

function _encryptCredential(plaintext) {
  const key = _ensureMachineKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function _decryptCredential(ciphertext) {
  try {
    const key = _ensureMachineKey();
    const parts = ciphertext.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

function _loadCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
      const decrypted = _decryptCredential(raw);
      return decrypted ? JSON.parse(decrypted) : {};
    }
  } catch (e) {
    console.error('[SECURE] Error loading credentials:', e.message);
  }
  return {};
}

function _saveCredentials(data) {
  try {
    const dir = path.dirname(CREDENTIALS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = CREDENTIALS_FILE + '.tmp';
    fs.writeFileSync(tmp, _encryptCredential(JSON.stringify(data)), 'utf8');
    fs.renameSync(tmp, CREDENTIALS_FILE);
  } catch (e) {
    console.error('[SECURE] Error saving credentials:', e.message);
  }
}

function registerSecureStorageIpc() {
  ipcMain.handle('secure-credential-get', (event, key) => {
    const creds = _loadCredentials();
    return creds[key] || null;
  });

  ipcMain.handle('secure-credential-set', (event, key, value) => {
    const creds = _loadCredentials();
    creds[key] = value;
    _saveCredentials(creds);
    return { success: true };
  });

  ipcMain.handle('secure-credential-delete', (event, key) => {
    const creds = _loadCredentials();
    delete creds[key];
    _saveCredentials(creds);
    return { success: true };
  });

  ipcMain.handle('secure-credential-list', () => {
    const creds = _loadCredentials();
    return Object.keys(creds);
  });
}

module.exports = {
  registerSecureStorageIpc,
  loadCredentials: _loadCredentials,
  saveCredentials: _saveCredentials
};
