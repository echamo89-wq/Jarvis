import { github } from './github.js';
import { openweathermap } from './weather-owm.js';
import { googleIntegration } from './google.js';
import { gmailIntegration } from './gmail.js';
import { googleCalendarIntegration } from './google-calendar.js';
import { spotifyIntegration } from './spotify.js';
import { discordIntegration } from './discord.js';
import { slackIntegration } from './slack.js';
import { notionIntegration } from './notion.js';
import { telegramIntegration } from './telegram.js';

const _integrations = {
  github,
  openweathermap,
  google: googleIntegration,
  gmail: gmailIntegration,
  calendar: googleCalendarIntegration,
  spotify: spotifyIntegration,
  discord: discordIntegration,
  slack: slackIntegration,
  notion: notionIntegration,
  telegram: telegramIntegration
};

import { createLogger } from '../utils/logger.js';
const _log = createLogger('INTEGRATIONS');

const SECRET_FIELDS = new Set([
  'token', 'refreshToken', 'accessToken', 'clientSecret', 'clientId',
  'apiKey', 'webhookUrl', 'botToken', 'password', 'secret'
]);

function _loadConfig(id) {
  try {
    const raw = localStorage.getItem(`jarvis_int_${id}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function _loadFullConfig(id) {
  const pub = _loadConfig(id);
  if (window.electronAPI?.secureCredentialGet) {
    try {
      const secrets = await window.electronAPI.secureCredentialGet(`int_${id}`);
      if (secrets) Object.assign(pub, secrets);
    } catch {}
  }
  return pub;
}

async function _saveConfig(id, config) {
  if (window.electronAPI?.secureCredentialSet) {
    const secrets = {};
    const pub = {};
    for (const [k, v] of Object.entries(config)) {
      if (SECRET_FIELDS.has(k) && v && typeof v === 'string') {
        secrets[k] = v;
      } else {
        pub[k] = v;
      }
    }
    localStorage.setItem(`jarvis_int_${id}`, JSON.stringify(pub));
    if (Object.keys(secrets).length > 0) {
      await window.electronAPI.secureCredentialSet(`int_${id}`, secrets);
    }
  } else {
    localStorage.setItem(`jarvis_int_${id}`, JSON.stringify(config));
  }
}

function _removeConfig(id) {
  localStorage.removeItem(`jarvis_int_${id}`);
  if (window.electronAPI?.secureCredentialDelete) {
    window.electronAPI.secureCredentialDelete(`int_${id}`).catch(() => {});
  }
}

export function getIntegration(id) {
  return _integrations[id] || null;
}

export function getAllIntegrations() {
  return Object.values(_integrations);
}

export function getIntegrationStatus(id) {
  const int = _integrations[id];
  if (!int) return 'unknown';
  const cfg = _loadConfig(id);
  if (!cfg._configured) return 'disconnected';
  if (int._status === 'error') return 'error';
  return 'connected';
}

export function getIntegrationConfig(id) {
  return _loadConfig(id);
}

export async function getIntegrationFullConfig(id) {
  return await _loadFullConfig(id);
}

export async function configureIntegration(id, config) {
  const int = _integrations[id];
  if (!int) throw new Error(`Integración "${id}" no existe`);
  try {
    const result = await int.testConnection(config);
    if (!result.success) throw new Error(result.error || 'Conexión fallida');
    config._configured = true;
    config._lastTest = Date.now();
    if (result.scopes) config._scopes = result.scopes;
    await _saveConfig(id, config);
    int._status = 'connected';
    _log('info', `${int.name} configurada y conectada`);
    return { success: true, scopes: result.scopes };
  } catch (e) {
    _log('error', `${int.name} error: ${e.message}`);
    int._status = 'error';
    config._configured = false;
    await _saveConfig(id, config);
    return { success: false, error: e.message };
  }
}

export async function getIntegrationPermissions(id) {
  const int = _integrations[id];
  if (!int) return null;
  const cfg = _loadConfig(id);
  if (!cfg._configured) return null;
  if (int.checkPermissions) {
    return await int.checkPermissions(cfg);
  }
  return { available: [], missing: [], isFullAccess: false };
}

export function disconnectIntegration(id) {
  const int = _integrations[id];
  if (!int) return;
  _removeConfig(id);
  int._status = 'disconnected';
  _log('info', `${int.name} desconectada`);
}

export function getFunctionDeclarations() {
  const decls = [];
  for (const int of Object.values(_integrations)) {
    if (int.getFunctionDeclarations) {
      decls.push(...int.getFunctionDeclarations());
    }
  }
  return decls;
}

export async function executeIntegrationTool(name, args) {
  for (const int of Object.values(_integrations)) {
    if (!int.executeTool || !int.getFunctionDeclarations().some(d => d.name === name)) continue;
    const cfg = await _loadFullConfig(int.id);
    if (!cfg._configured) {
      return { success: false, output: `La integración "${int.name}" no está configurada. Abre el panel de Integraciones y configúrala primero.` };
    }
    return await int.executeTool(name, args, cfg);
  }
  return { success: false, output: `Herramienta "${name}" no encontrada en integraciones activas.` };
}

export async function initIntegrations() {
  for (const int of Object.values(_integrations)) {
    const cfg = await _loadFullConfig(int.id);
    if (cfg._configured) {
      int._status = 'connected';
      _log('info', `${int.name} cargada (configurada)`);
    } else {
      int._status = 'disconnected';
    }
  }
}
