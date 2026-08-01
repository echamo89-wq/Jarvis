import { openweathermap } from './weather-owm.js';
import { github } from './github.js';
import { googleIntegration } from './google.js';
import { gmailIntegration } from './gmail.js';
import { youtubeIntegration } from './youtube.js';
import { googleCalendarIntegration } from './google-calendar.js';
import { spotifyIntegration } from './spotify.js';
import { notionIntegration } from './notion.js';
import { telegramIntegration } from './telegram.js';
import { discordIntegration } from './discord.js';
import { slackIntegration } from './slack.js';
import { n8nIntegration } from './n8n.js';

const _integrations = {
  openweathermap,
  github,
  google: googleIntegration,
  gmail: gmailIntegration,
  youtube: youtubeIntegration,
  calendar: googleCalendarIntegration,
  spotify: spotifyIntegration,
  notion: notionIntegration,
  telegram: telegramIntegration,
  discord: discordIntegration,
  slack: slackIntegration,
  n8n: n8nIntegration
};

import { createLogger } from '../../utils/logger.js';
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
    const full = await _loadFullConfig(id);
    const merged = { ...full, ...config };
    // Restaurar campos enmascarados con el valor persistido real
    for (const [k, v] of Object.entries(config)) {
      if (v === '***') merged[k] = full[k];
    }

    let result = await int.testConnection(merged);

    // Si requiere autenticación y la integración soporta startAuth
    if (!result.success && result.needsAuth && int.startAuth) {
      // Evitar flujos duplicados — verificar si ya hay uno en curso
      if (int._authInProgress) {
        throw new Error('Ya hay una autenticación en curso.');
      }
      _log('info', `Iniciando autenticación OAuth para ${int.name}...`);
      const authResult = await int.startAuth(merged.clientId, merged.clientSecret);
      if (authResult && authResult.success) {
        // Volver a cargar la configuración (que startAuth acaba de guardar con tokens) y re-testear
        const freshConfig = await _loadFullConfig(id);
        result = await int.testConnection(freshConfig);
        if (!result.success) throw new Error(result.error || 'Autenticación exitosa pero la verificación falló.');
        // Usar freshConfig (post-auth, con tokens) como base en vez de merged (pre-auth, sin tokens)
        Object.assign(merged, freshConfig);
      } else {
        throw new Error(authResult?.error || 'No se pudo completar el flujo de autenticación.');
      }
    } else if (!result.success) {
      throw new Error(result.error || 'Conexión fallida');
    }

    // Actualizar configuración del resultado
    const finalConfig = { ...merged };
    finalConfig._configured = true;
    finalConfig._lastTest = Date.now();
    if (result.scopes) finalConfig._scopes = result.scopes;
    
    // Auto-detectar email de usuario si está disponible
    if (result.data?.emailAddress) finalConfig.userEmail = result.data.emailAddress;
    else if (result.data?.email) finalConfig.userEmail = result.data.email;
    else if (result.data?.id) finalConfig.userEmail = result.data.id;

    await _saveConfig(id, finalConfig);
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
  let fallback = null;
  for (const int of Object.values(_integrations)) {
    if (!int.executeTool || !int.getFunctionDeclarations().some(d => d.name === name)) continue;
    const cfg = await _loadFullConfig(int.id);
    if (cfg._configured) {
      return await int.executeTool(name, args, cfg);
    }
    if (!fallback) fallback = int;
  }
  if (fallback) {
    const cfg = await _loadFullConfig(fallback.id);
    return { success: false, output: `La integración "${fallback.name}" no está configurada. Abre el panel de Integraciones y configúrala primero.` };
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
