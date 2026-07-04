import { createLogger } from '../utils/logger.js';
const _log = createLogger('GMAIL');

async function _gmailFetch(path, config, method = 'GET', body = null) {
  if (!config.accessToken) return { success: false, output: 'Gmail no autenticado. Ve a Integraciones y conecta Gmail.' };
  const headers = { 'Authorization': `Bearer ${config.accessToken}` };
  if (body) { headers['Content-Type'] = 'application/json'; }
  try {
    const url = `https://gmail.googleapis.com${path}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    if (res.status === 401 && config.refreshToken) {
      const refreshed = await _refreshAccessToken(config);
      if (!refreshed) return { success: false, output: 'Sesión de Gmail expirada. Reconecta en Integraciones.' };
      headers['Authorization'] = `Bearer ${config.accessToken}`;
      const retry = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
      const text = await retry.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return retry.ok ? { success: true, data } : { success: false, output: `Error Gmail: ${data.error?.message || text}` };
    }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return res.ok ? { success: true, data } : { success: false, output: `Error Gmail: ${data.error?.message || text}` };
  } catch (e) {
    return { success: false, output: `Error de conexión Gmail: ${e.message}` };
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
  localStorage.setItem('jarvis_int_gmail', JSON.stringify(save));
  const secrets = {};
  if (config.refreshToken) secrets.refreshToken = config.refreshToken;
  if (config.clientSecret) secrets.clientSecret = config.clientSecret;
  if (config.clientId) secrets.clientId = config.clientId;
  if (config.accessToken) secrets.accessToken = config.accessToken;
  if (config.tokenExpiry) secrets.tokenExpiry = config.tokenExpiry;
  if (config.userEmail) secrets.userEmail = config.userEmail;
  if (Object.keys(secrets).length > 0 && window.electronAPI?.secureCredentialSet) {
    window.electronAPI.secureCredentialSet('int_gmail', secrets).catch(() => {});
  }
}

async function _loadFullConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_gmail') || '{}');
    if (window.electronAPI?.secureCredentialGet) {
      try {
        const secrets = await window.electronAPI.secureCredentialGet('int_gmail');
        if (secrets) {
          const merged = { ...base, ...secrets };
          if (merged.clientSecret === '***' && base.clientSecret && base.clientSecret !== '***') merged.clientSecret = base.clientSecret;
          if (merged.refreshToken === '***' && base.refreshToken && base.refreshToken !== '***') merged.refreshToken = base.refreshToken;
          return merged;
        }
      } catch {}
    }
    return base;
  } catch { return {}; }
}

async function _startDeviceAuth(clientId) {
  const res = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: 'https://www.googleapis.com/auth/gmail.modify' })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

async function _pollForToken(deviceCode, clientId, clientSecret) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
  });
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const data = await res.json();
      if (data.access_token) return data;
      if (data.error === 'authorization_pending') continue;
      if (data.error === 'slow_down') { await new Promise(r => setTimeout(r, 5000)); continue; }
      throw new Error(data.error_description || data.error);
    } catch (e) {
      if (e.message.includes('authorization_pending')) continue;
      throw e;
    }
  }
  throw new Error('Tiempo de espera agotado (3 min). Intenta de nuevo.');
}

export const gmailIntegration = {
  id: 'gmail',
  name: 'Gmail',
  icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
  description: 'Correo electrónico Gmail: leer bandeja de entrada, enviar, buscar y leer correos. IMPORTANTE: En Google Cloud Console, si tu tipo de ID de cliente es "Web application", añade "http://localhost:9876/oauth2callback" como URI de redirección autorizada. Si usas "Desktop app" no requiere redirección.',
  guideSteps: [
    '1. Ve a Google Cloud Console, crea un proyecto y habilita la Gmail API en Biblioteca.',
    '2. Ve a Credenciales → "Crear credenciales" → "ID de cliente de OAuth". Elige "Aplicación web" o "Desktop app".',
    '3. Si elegiste "Aplicación web", añade "http://localhost:9876/oauth2callback" como URI de redirección.',
    '4. Copia el Client ID y Client Secret, pégalos abajo y haz clic en "Conectar con Google".'
  ],
  authUrl: 'https://console.cloud.google.com/apis/credentials',
  _status: 'disconnected',
  _authInProgress: false,

  configFields: [
    { key: 'clientId', label: 'Client ID', type: 'text', placeholder: '123456789-xxxxx.apps.googleusercontent.com' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'GOCSPX-...' }
  ],

  async testConnection(config) {
    const full = await _loadFullConfig();
    const c = { ...full, ...config };
    
    // Si viene del formulario con '***', restaurar los valores reales cargados del secure store
    if (config.clientSecret === '***') c.clientSecret = full.clientSecret;
    if (config.refreshToken === '***') c.refreshToken = full.refreshToken;

    if (!c.clientId || !c.clientSecret) {
      return { success: false, error: 'Completa el Client ID y Client Secret.' };
    }
    if (!c.accessToken && c.refreshToken) {
      const ok = await _refreshAccessToken(c);
      if (!ok) return { success: false, error: 'Token expirado y no se pudo refrescar. Re-conecta Gmail.' };
    }
    if (!c.accessToken) {
      return { success: false, error: 'No hay sesión activa. Haz clic en "Conectar con Google" para autorizar.', needsAuth: true };
    }
    const r = await _gmailFetch('/gmail/v1/users/me/profile', c);
    if (r.success) {
      c.userEmail = r.data.emailAddress;
      _saveConfig(c);
      
      // Mutar el objeto config para que index.js guarde la versión ofuscada
      config.clientId = c.clientId;
      config.clientSecret = '***';
      config.refreshToken = '***';
      config.accessToken = c.accessToken;
      config.tokenExpiry = c.tokenExpiry;
      config.userEmail = c.userEmail;
      if (r.scopes) config._scopes = r.scopes;
      
      return { success: true, data: r.data };
    }
    return { success: false, error: r.output, needsAuth: true };
  },

  async startAuth(clientId, clientSecret) {
    if (this._authInProgress) throw new Error('Ya hay una autenticación en curso.');
    this._authInProgress = true;
    try {
      _log('info', 'Iniciando autenticación Gmail...');

      let device = null;
      let useRedirect = false;
      try {
        device = await _startDeviceAuth(clientId);
        _log('info', 'Device code obtenido exitosamente');
      } catch (e) {
        _log('warn', `Device code falló: ${e.message} — usando redirect flow`);
        useRedirect = true;
      }

      let result;
      if (useRedirect || !device) {
        _log('info', 'Iniciando redirect flow OAuth en puerto 9876');
        const redirectUri = 'http://localhost:9876/oauth2callback';
        const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.modify');
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

        if (!window.electronAPI?.startOAuthServer) {
          throw new Error('El sistema OAuth no está disponible. Revisa la instalación de JARVIS.');
        }

        const serverPromise = window.electronAPI.startOAuthServer(9876);
        _log('info', 'Servidor OAuth iniciado, abriendo navegador...');
        window.electronAPI.openBrowser(authUrl);

        const code = await serverPromise;
        _log('info', 'Código OAuth recibido, intercambiando por token...');

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            redirect_uri: redirectUri,
            code, grant_type: 'authorization_code'
          })
        });
        result = await tokenRes.json();
        if (!result.access_token) {
          throw new Error(`Error de Google: ${result.error_description || result.error || 'No se pudo obtener el token. Verifica que en Google Cloud Console → Credenciales → tu cliente tenga "http://localhost:9876/oauth2callback" como URI de redirección autorizada.'}`);
        }
      } else {
        _log('info', 'Usando device_code flow');
        window.electronAPI.openBrowser(device.verification_url);
        _log('info', `Navegador abierto, código de usuario: ${device.user_code}`);
        result = await _pollForToken(device.device_code, clientId, clientSecret);
        _log('info', 'Token obtenido via device_code');
      }

      _log('info', 'Obteniendo perfil de Gmail...');
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { 'Authorization': `Bearer ${result.access_token}` }
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok || !profileData.emailAddress) {
        const errMsg = profileData.error?.message || profileData.error || 'Error desconocido';
        _log('error', `Perfil Gmail falló: ${errMsg}`);
        if (errMsg.includes('Access not configured') || errMsg.includes('not enabled') || errMsg.includes('Gmail API')) {
          throw new Error('La API de Gmail no está habilitada en Google Cloud Console. Ve a: APIs y Servicios → Biblioteca → busca "Gmail API" → HABILITAR. Luego intenta de nuevo.');
        }
        throw new Error(`Error al verificar Gmail: ${errMsg}. Intenta de nuevo.`);
      }

      const config = {
        clientId, clientSecret,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        tokenExpiry: Date.now() + (result.expires_in * 1000),
        userEmail: profileData.emailAddress,
        _configured: true, _lastTest: Date.now()
      };
      _saveConfig(config);
      this._status = 'connected';
      _log('info', `Gmail conectado como ${config.userEmail}`);
      return { success: true, email: config.userEmail };
    } catch (e) {
      this._status = 'error';
      _log('error', `Auth error: ${e.message}`);
      throw e;
    } finally {
      this._authInProgress = false;
    }
  },


  getFunctionDeclarations() {
    return [
      {
        name: 'gmail_list_inbox',
        description: 'Lista los correos más recientes de la bandeja de entrada de Gmail. Devuelve remitente, asunto, fecha, snippet.',
        parameters: { type: 'object', properties: {
          max_results: { type: 'integer', description: 'Máx correos a listar (default: 10, max: 50)' },
          query: { type: 'string', description: 'Filtro opcional (ej: "from:john", "subject:reporte", "has:attachment")' }
        }, required: [] }
      },
      {
        name: 'gmail_send_email',
        description: 'Envía un correo electrónico desde la cuenta Gmail conectada.',
        parameters: { type: 'object', properties: {
          to: { type: 'string', description: 'Destinatario (email)' },
          subject: { type: 'string', description: 'Asunto del correo' },
          body: { type: 'string', description: 'Cuerpo del mensaje (texto plano)' },
          cc: { type: 'string', description: 'CC opcional (email separado por coma)' }
        }, required: ['to', 'subject', 'body'] }
      },
      {
        name: 'gmail_search',
        description: 'Busca correos en Gmail usando el mismo formato de búsqueda que el buscador de Gmail.',
        parameters: { type: 'object', properties: {
          query: { type: 'string', description: 'Búsqueda estilo Gmail (ej: "from:user@gmail.com after:2024/01/01", "subject:importante has:attachment")' },
          max_results: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' }
        }, required: ['query'] }
      },
      {
        name: 'gmail_read_email',
        description: 'Lee el contenido completo de un correo específico de Gmail por su ID.',
        parameters: { type: 'object', properties: {
          message_id: { type: 'string', description: 'ID del mensaje (obtenido de gmail_list_inbox o gmail_search)' }
        }, required: ['message_id'] }
      },
      {
        name: 'gmail_get_unread_count',
        description: 'Obtiene el número de correos no leídos en la bandeja de entrada de Gmail.',
        parameters: { type: 'object', properties: {}, required: [] }
      }
    ];
  },

  async executeTool(name, args, config) {
    const full = await _loadFullConfig();
    config = { ...full, ...config };

    switch (name) {
      case 'gmail_list_inbox': {
        const max = Math.min(args.max_results || 10, 50);
        let q = '';
        if (args.query) q = `&q=${encodeURIComponent(args.query)}`;
        const r = await _gmailFetch(`/gmail/v1/users/me/messages?maxResults=${max}${q}&labelIds=INBOX`, config);
        if (!r.success) return r;
        const messages = r.data.messages || [];
        if (messages.length === 0) return { success: true, output: 'Bandeja de entrada vacía.' };
        const details = [];
        for (const m of messages.slice(0, max)) {
          const d = await _gmailFetch(`/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, config);
          if (d.success) {
            const headers = {};
            (d.data.payload?.headers || []).forEach(h => headers[h.name] = h.value);
            const label = d.data.labelIds?.includes('UNREAD') ? '📩' : '📧';
            const date = headers.Date ? new Date(headers.Date).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            details.push(`${label} ${headers.Subject || 'Sin asunto'} — ${headers.From || ''}\n   🆔 ${m.id} | ${date}`);
          }
        }
        return { success: true, output: `📬 Bandeja de entrada (${messages.length}):\n` + details.join('\n') };
      }

      case 'gmail_send_email': {
        const to = args.to;
        const subject = args.subject;
        const body = args.body;
        const cc = args.cc || '';
        const raw = `From: me\nTo: ${to}${cc ? '\nCc: ' + cc : ''}\nSubject: ${subject}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n${body}`;
        const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const r = await _gmailFetch('/gmail/v1/users/me/messages/send', config, 'POST', { raw: encoded });
        if (!r.success) return r;
        return { success: true, output: `✅ Correo enviado a ${to}${cc ? ' (CC: ' + cc + ')' : ''}\n📧 Asunto: ${subject}` };
      }

      case 'gmail_search': {
        const max = Math.min(args.max_results || 10, 50);
        const r = await _gmailFetch(`/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(args.query)}`, config);
        if (!r.success) return r;
        const messages = r.data.messages || [];
        if (messages.length === 0) return { success: true, output: 'Sin resultados.' };
        const details = [];
        for (const m of messages.slice(0, max)) {
          const d = await _gmailFetch(`/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, config);
          if (d.success) {
            const headers = {};
            (d.data.payload?.headers || []).forEach(h => headers[h.name] = h.value);
            details.push(`📧 ${headers.Subject || 'Sin asunto'} — ${headers.From || ''}\n   🆔 ${m.id}`);
          }
        }
        return { success: true, output: `Resultados para "${args.query}" (${messages.length}):\n` + details.join('\n') };
      }

      case 'gmail_read_email': {
        const r = await _gmailFetch(`/gmail/v1/users/me/messages/${args.message_id}?format=full`, config);
        if (!r.success) return r;
        const d = r.data;
        const headers = {};
        (d.payload?.headers || []).forEach(h => headers[h.name] = h.value);
        let bodyText = '';
        function _extractText(part) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText += decodeURIComponent(escape(atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))));
          }
          if (part.parts) part.parts.forEach(_extractText);
        }
        _extractText(d.payload);
        const preview = bodyText.length > 3000 ? bodyText.substring(0, 3000) + '\n... [truncado]' : bodyText;
        return {
          success: true,
          output: `📧 ${headers.Subject || 'Sin asunto'}\nDe: ${headers.From}\nPara: ${headers.To}\nFecha: ${headers.Date}\n${headers.Cc ? 'CC: ' + headers.Cc + '\n' : ''}\n${preview}`
        };
      }

      case 'gmail_get_unread_count': {
        const r = await _gmailFetch('/gmail/v1/users/me/messages?maxResults=1&q=is:unread&labelIds=INBOX', config);
        if (!r.success) return r;
        const count = r.data.resultSizeEstimate || 0;
        return { success: true, output: `📬 Tienes ${count} correo(s) no leído(s) en Gmail.` };
      }

      default:
        return { success: false, output: `Herramienta Gmail "${name}" no implementada.` };
    }
  }
};
