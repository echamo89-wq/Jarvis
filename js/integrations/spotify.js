import { createLogger } from '../utils/logger.js';
const _log = createLogger('SPOTIFY');

function _loadFullConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_spotify') || '{}');
    return base;
  } catch { return {}; }
}

async function _loadFullSecureConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_spotify') || '{}');
    if (window.electronAPI?.secureCredentialGet) {
      try {
        const secrets = await window.electronAPI.secureCredentialGet('int_spotify');
        if (secrets) return { ...base, ...secrets };
      } catch {}
    }
    return base;
  } catch { return {}; }
}

function _saveConfig(config) {
  const save = {
    _configured: true,
    _lastTest: config._lastTest || Date.now(),
    clientId: config.clientId,
    clientSecret: config.clientSecret ? '***' : '',
    refreshToken: config.refreshToken ? '***' : '',
    accessToken: config.accessToken,
    tokenExpiry: config.tokenExpiry || 0,
    userEmail: config.userEmail || ''
  };
  localStorage.setItem('jarvis_int_spotify', JSON.stringify(save));
  const secrets = {};
  if (config.refreshToken) secrets.refreshToken = config.refreshToken;
  if (config.clientSecret) secrets.clientSecret = config.clientSecret;
  if (config.clientId) secrets.clientId = config.clientId;
  if (config.accessToken) secrets.accessToken = config.accessToken;
  if (config.tokenExpiry) secrets.tokenExpiry = config.tokenExpiry;
  if (config.userEmail) secrets.userEmail = config.userEmail;
  if (Object.keys(secrets).length > 0 && window.electronAPI?.secureCredentialSet) {
    window.electronAPI.secureCredentialSet('int_spotify', secrets).catch(() => {});
  }
}

async function _refreshAccessToken(config) {
  const url = 'https://accounts.spotify.com/api/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (data.access_token) {
      config.accessToken = data.access_token;
      if (data.expires_in) config.tokenExpiry = Date.now() + (data.expires_in * 1000);
      _saveConfig(config);
      return true;
    }
    return false;
  } catch { return false; }
}

async function _spotifyFetch(path, config, method = 'GET', body = null) {
  if (!config.accessToken) return { success: false, output: 'Spotify no autenticado. Conéctalo primero.' };
  if (Date.now() >= (config.tokenExpiry || 0)) {
    const refreshed = await _refreshAccessToken(config);
    if (!refreshed) return { success: false, output: 'Sesión de Spotify expirada y no se pudo refrescar. Reconéctalo.' };
  }
  const headers = { 'Authorization': `Bearer ${config.accessToken}` };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const url = `https://api.spotify.com/v1${path}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    if (res.status === 204) return { success: true, data: null };
    const text = await res.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      if (res.status === 401) {
        const refreshed = await _refreshAccessToken(config);
        if (refreshed) {
          headers['Authorization'] = `Bearer ${config.accessToken}`;
          const retry = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
          if (retry.status === 204) return { success: true, data: null };
          const retryText = await retry.text();
          try { return { success: retry.ok, data: JSON.parse(retryText) }; } catch { return { success: retry.ok, data: retryText }; }
        }
      }
      return { success: false, output: `Error Spotify (${res.status}): ${data.error?.message || text}` };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, output: `Error de conexión Spotify: ${e.message}` };
  }
}

export const spotifyIntegration = {
  id: 'spotify',
  name: 'Spotify',
  icon: '♫',
  description: 'Controla tu música en Spotify: play, pausa, pista siguiente/anterior y consulta la canción que estás escuchando en tus dispositivos activos.',
  guideSteps: [
    '1. Ve a Spotify Developer Dashboard (developer.spotify.com/dashboard) e inicia sesión.',
    '2. Haz clic en "Create App", ponle un nombre y descripción, y crea la app.',
    '3. En la app, ve a Settings y añade "http://localhost:9876/oauth2callback" en Redirect URIs.',
    '4. Copia el Client ID y Client Secret de la app y pégalos abajo.',
    '5. Haz clic en "Conectar con Spotify" y autoriza desde tu navegador.'
  ],
  authUrl: 'https://developer.spotify.com/dashboard',
  _status: 'disconnected',
  _authInProgress: false,

  configFields: [
    { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Pega el Client ID de Spotify Developer Console' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Pega el Client Secret' }
  ],

  async testConnection(config) {
    const full = await _loadFullSecureConfig();
    const c = { ...full, ...config };
    if (config.clientSecret === '***') c.clientSecret = full.clientSecret;
    if (config.refreshToken === '***') c.refreshToken = full.refreshToken;

    if (!c.clientId || !c.clientSecret) {
      return { success: false, error: 'Completa el Client ID y Client Secret.' };
    }
    if (!c.accessToken && c.refreshToken) {
      const ok = await _refreshAccessToken(c);
      if (!ok) return { success: false, error: 'Token expirado. Re-conecta Spotify.' };
    }
    if (!c.accessToken) {
      return { success: false, error: 'No hay sesión activa. Conecta con Spotify.', needsAuth: true };
    }
    const r = await _spotifyFetch('/me', c);
    if (r.success) {
      c.userEmail = r.data.email || r.data.id || '';
      _saveConfig(c);
      
      config.clientId = c.clientId;
      config.clientSecret = '***';
      config.refreshToken = '***';
      config.accessToken = c.accessToken;
      config.tokenExpiry = c.tokenExpiry;
      config.userEmail = c.userEmail;
      
      return { success: true, data: r.data };
    }
    return { success: false, error: r.output, needsAuth: true };
  },

  async startAuth(clientId, clientSecret) {
    if (this._authInProgress) throw new Error('Autenticación en curso.');
    this._authInProgress = true;
    try {
      const redirectUri = 'http://localhost:9876/oauth2callback';
      const scopes = [
        'user-modify-playback-state',
        'user-read-playback-state',
        'user-read-currently-playing'
      ].join(' ');
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&show_dialog=true`;

      const codePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Tiempo de espera agotado (3 min).')), 180000);
        if (window.electronAPI?.startOAuthServer) {
          window.electronAPI.startOAuthServer(9876).then(code => {
            clearTimeout(timeout);
            resolve(code);
          }).catch(e => { clearTimeout(timeout); reject(e); });
        } else {
          clearTimeout(timeout);
          reject(new Error('Servidor OAuth local no disponible.'));
        }
      });

      window.electronAPI.openBrowser(authUrl);
      const code = await codePromise;

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        })
      });
      const result = await tokenRes.json();
      if (!result.access_token) throw new Error(result.error_description || result.error || 'Error al obtener token');

      const profile = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${result.access_token}` }
      });
      const profileData = await profile.json();

      const config = {
        clientId, clientSecret,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        tokenExpiry: Date.now() + (result.expires_in * 1000),
        userEmail: profileData.email || profileData.id || '',
        _configured: true, _lastTest: Date.now()
      };
      _saveConfig(config);
      this._status = 'connected';
      return { success: true, email: config.userEmail };
    } catch (e) {
      this._status = 'error';
      throw e;
    } finally {
      this._authInProgress = false;
    }
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'spotify_get_current_track',
        description: 'Obtiene información de la canción/pista que se está reproduciendo actualmente en la cuenta de Spotify conectada.',
        parameters: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'spotify_playback_control',
        description: 'Controla la reproducción de Spotify: pausar, reproducir, pasar a la siguiente pista o pista anterior.',
        parameters: { type: 'object', properties: {
          action: { type: 'string', enum: ['play', 'pause', 'next', 'previous'], description: 'Acción a realizar' }
        }, required: ['action'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    const full = await _loadFullSecureConfig();
    config = { ...full, ...config };

    switch (name) {
      case 'spotify_get_current_track': {
        const r = await _spotifyFetch('/me/player/currently-playing', config);
        if (!r.success) return r;
        if (!r.data || !r.data.item) {
          return { success: true, output: 'No se está reproduciendo ninguna canción en este momento o no hay un dispositivo activo.' };
        }
        const item = r.data.item;
        const artists = (item.artists || []).map(a => a.name).join(', ');
        const isPlaying = r.data.is_playing ? '▶️ Reproduciendo' : '⏸️ Pausado';
        return {
          success: true,
          output: `🎵 Actualmente en Spotify:\n📌 Canción: ${item.name}\n👤 Artista: ${artists}\n💿 Álbum: ${item.album?.name || 'Desconocido'}\n⚡ Estado: ${isPlaying}`
        };
      }
      case 'spotify_playback_control': {
        const act = args.action;
        let endpoint = '/me/player/play';
        let method = 'PUT';
        if (act === 'pause') endpoint = '/me/player/pause';
        else if (act === 'next') { endpoint = '/me/player/next'; method = 'POST'; }
        else if (act === 'previous') { endpoint = '/me/player/previous'; method = 'POST'; }

        const r = await _spotifyFetch(endpoint, config, method);
        if (!r.success) {
          return { success: false, output: `Fallo al controlar Spotify. Asegúrate de tener un reproductor activo o la app abierta. Detalle: ${r.output}` };
        }
        const actText = { play: 'reproduciendo', pause: 'pausado', next: 'siguiente pista', previous: 'pista anterior' }[act];
        return { success: true, output: `✅ Comando enviado: ${actText} en Spotify.` };
      }
      default:
        return { success: false, output: 'Herramienta no implementada.' };
    }
  }
};
