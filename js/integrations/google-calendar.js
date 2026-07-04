import { createLogger } from '../utils/logger.js';
const _log = createLogger('CALENDAR');

function _loadFullConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_calendar') || '{}');
    return base;
  } catch { return {}; }
}

async function _loadFullSecureConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_calendar') || '{}');
    if (window.electronAPI?.secureCredentialGet) {
      try {
        const secrets = await window.electronAPI.secureCredentialGet('int_calendar');
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
  localStorage.setItem('jarvis_int_calendar', JSON.stringify(save));
  const secrets = {};
  if (config.refreshToken) secrets.refreshToken = config.refreshToken;
  if (config.clientSecret) secrets.clientSecret = config.clientSecret;
  if (config.clientId) secrets.clientId = config.clientId;
  if (config.accessToken) secrets.accessToken = config.accessToken;
  if (config.tokenExpiry) secrets.tokenExpiry = config.tokenExpiry;
  if (config.userEmail) secrets.userEmail = config.userEmail;
  if (Object.keys(secrets).length > 0 && window.electronAPI?.secureCredentialSet) {
    window.electronAPI.secureCredentialSet('int_calendar', secrets).catch(() => {});
  }
}

async function _refreshAccessToken(config) {
  const url = 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token'
  });
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
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

async function _calendarFetch(path, config, method = 'GET', body = null) {
  if (!config.accessToken) return { success: false, output: 'Google Calendar no autenticado. Conéctalo primero.' };
  if (Date.now() >= (config.tokenExpiry || 0)) {
    const refreshed = await _refreshAccessToken(config);
    if (!refreshed) return { success: false, output: 'Sesión de Google Calendar expirada. Reconéctalo.' };
  }
  const headers = { 'Authorization': `Bearer ${config.accessToken}` };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const url = `https://www.googleapis.com/calendar/v3${path}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    if (res.status === 401) {
      const refreshed = await _refreshAccessToken(config);
      if (refreshed) {
        headers['Authorization'] = `Bearer ${config.accessToken}`;
        const retry = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
        const text = await retry.text();
        let data; try { data = JSON.parse(text); } catch { data = text; }
        return retry.ok ? { success: true, data } : { success: false, output: `Error Calendar: ${data.error?.message || text}` };
      }
    }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return res.ok ? { success: true, data } : { success: false, output: `Error Calendar: ${data.error?.message || text}` };
  } catch (e) {
    return { success: false, output: `Error de conexión: ${e.message}` };
  }
}

export const googleCalendarIntegration = {
  id: 'calendar',
  name: 'Google Calendar',
  icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>',
  description: 'Lee y crea eventos en tu agenda de Google Calendar. IMPORTANTE: Registra "http://localhost:9876/oauth2callback" como URI de redirección autorizada en tu ID de cliente de Google Cloud Console si usas "Web application".',
  guideSteps: [
    '1. Ve a Google Cloud Console, crea o selecciona un proyecto.',
    '2. Habilita la API de Google Calendar en APIs y Servicios → Biblioteca.',
    '3. Ve a Credenciales → "Crear credenciales" → "ID de cliente de OAuth". Elige "Aplicación web" y añade "http://localhost:9876/oauth2callback" como URI.',
    '4. Copia el Client ID y Client Secret, pégalos abajo y haz clic en "Conectar con Google Calendar".',
    '5. Autoriza el acceso en la ventana que se abrirá en tu navegador.'
  ],
  authUrl: 'https://console.cloud.google.com/apis/credentials',
  _status: 'disconnected',
  _authInProgress: false,

  configFields: [
    { key: 'clientId', label: 'Client ID', type: 'text', placeholder: '123456789-xxxxx.apps.googleusercontent.com' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'GOCSPX-...' }
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
      if (!ok) return { success: false, error: 'Token expirado. Re-conecta Google Calendar.' };
    }
    if (!c.accessToken) {
      return { success: false, error: 'No hay sesión activa. Conecta con Google Calendar.', needsAuth: true };
    }
    const r = await _calendarFetch('/users/me/calendarList/primary', c);
    if (r.success) {
      c.userEmail = r.data.id || '';
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
      const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

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

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, code, grant_type: 'authorization_code'
        })
      });
      const result = await tokenRes.json();
      if (!result.access_token) throw new Error(result.error_description || result.error || 'Error al obtener token');

      const profile = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
        headers: { 'Authorization': `Bearer ${result.access_token}` }
      });
      const profileData = await profile.json();

      const config = {
        clientId, clientSecret,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        tokenExpiry: Date.now() + (result.expires_in * 1000),
        userEmail: profileData.id || '',
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
        name: 'calendar_list_events',
        description: 'Lista los próximos eventos de la agenda de Google Calendar. Devuelve título, hora de inicio/fin, descripción y ubicación.',
        parameters: { type: 'object', properties: {
          max_results: { type: 'integer', description: 'Máx eventos a listar (default: 10, max: 50)' },
          time_min: { type: 'string', description: 'Fecha de inicio en formato ISO (ej: "2024-01-01T00:00:00Z"). Default: ahora.' }
        }, required: [] }
      },
      {
        name: 'calendar_create_event',
        description: 'Crea un nuevo evento en Google Calendar.',
        parameters: { type: 'object', properties: {
          summary: { type: 'string', description: 'Título del evento' },
          start_time: { type: 'string', description: 'Fecha/hora de inicio en formato ISO (ej: "2024-06-27T10:00:00-03:00")' },
          end_time: { type: 'string', description: 'Fecha/hora de fin en formato ISO (ej: "2024-06-27T11:00:00-03:00")' },
          description: { type: 'string', description: 'Descripción opcional' },
          location: { type: 'string', description: 'Ubicación opcional del evento' }
        }, required: ['summary', 'start_time', 'end_time'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    const full = await _loadFullSecureConfig();
    config = { ...full, ...config };

    switch (name) {
      case 'calendar_list_events': {
        const max = Math.min(args.max_results || 10, 50);
        const timeMin = args.time_min || new Date().toISOString();
        const r = await _calendarFetch(`/calendars/primary/events?maxResults=${max}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`, config);
        if (!r.success) return r;
        const events = r.data.items || [];
        if (events.length === 0) return { success: true, output: 'No tienes eventos próximos en Google Calendar.' };
        const details = events.map(e => {
          const start = e.start.dateTime || e.start.date;
          const end = e.end.dateTime || e.end.date;
          const timeStr = new Date(start).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          return `📅 ${e.summary || 'Sin título'}\n   🕒 ${timeStr}\n   📌 ID: ${e.id}${e.location ? ' | 📍 ' + e.location : ''}`;
        });
        return { success: true, output: `🗓️ Próximos eventos (${events.length}):\n\n` + details.join('\n\n') };
      }
      case 'calendar_create_event': {
        const body = {
          summary: args.summary,
          start: { dateTime: args.start_time },
          end: { dateTime: args.end_time },
          description: args.description || '',
          location: args.location || ''
        };
        const r = await _calendarFetch('/calendars/primary/events', config, 'POST', body);
        if (!r.success) return r;
        return { success: true, output: `✅ Evento creado con éxito:\n📅 ${args.summary}\n🕒 Inicio: ${new Date(args.start_time).toLocaleString()}\n🕒 Fin: ${new Date(args.end_time).toLocaleString()}` };
      }
      default:
        return { success: false, output: 'Herramienta no implementada.' };
    }
  }
};
