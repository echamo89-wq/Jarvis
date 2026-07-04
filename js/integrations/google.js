import { createLogger } from '../utils/logger.js';
const _log = createLogger('GOOGLE');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/tasks'
].join(' ');

function _loadConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_google') || '{}');
    return base;
  } catch { return {}; }
}

async function _loadFullConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_google') || '{}');
    if (window.electronAPI?.secureCredentialGet) {
      try {
        const secrets = await window.electronAPI.secureCredentialGet('int_google');
        if (secrets) {
          const merged = { ...base, ...secrets };
          if (merged.clientSecret === '***' && base.clientSecret !== '***') merged.clientSecret = base.clientSecret;
          if (merged.refreshToken === '***' && base.refreshToken !== '***') merged.refreshToken = base.refreshToken;
          return merged;
        }
      } catch {}
    }
    return base;
  } catch { return {}; }
}

function _saveConfig(config) {
  const save = {
    _configured: true, _lastTest: config._lastTest || Date.now(),
    clientId: config.clientId,
    clientSecret: config.clientSecret ? '***' : '',
    refreshToken: config.refreshToken ? '***' : '',
    accessToken: config.accessToken,
    tokenExpiry: config.tokenExpiry || 0,
    userEmail: config.userEmail || ''
  };
  localStorage.setItem('jarvis_int_google', JSON.stringify(save));
  const secrets = {};
  if (config.refreshToken) secrets.refreshToken = config.refreshToken;
  if (config.clientSecret) secrets.clientSecret = config.clientSecret;
  if (config.clientId) secrets.clientId = config.clientId;
  if (config.accessToken) secrets.accessToken = config.accessToken;
  if (config.tokenExpiry) secrets.tokenExpiry = config.tokenExpiry;
  if (config.userEmail) secrets.userEmail = config.userEmail;
  if (Object.keys(secrets).length > 0 && window.electronAPI?.secureCredentialSet) {
    window.electronAPI.secureCredentialSet('int_google', secrets).catch(() => {});
  }
}

async function _refreshToken(config) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (data.access_token) {
    config.accessToken = data.access_token;
    if (data.expires_in) config.tokenExpiry = Date.now() + data.expires_in * 1000;
    _saveConfig(config);
    return true;
  }
  return false;
}

async function _googleFetch(baseUrl, path, config, method = 'GET', body = null) {
  if (!config.accessToken) return { success: false, output: 'Google no autenticado. Ve a Integraciones y conecta Google.' };
  if (Date.now() >= (config.tokenExpiry || 0) && config.refreshToken) {
    const ok = await _refreshToken(config);
    if (!ok) return { success: false, output: 'Sesión de Google expirada. Reconecta en Integraciones.' };
  }
  const headers = { 'Authorization': `Bearer ${config.accessToken}` };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    if (res.status === 401 && config.refreshToken) {
      const ok = await _refreshToken(config);
      if (ok) {
        headers['Authorization'] = `Bearer ${config.accessToken}`;
        const retry = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
        const text = await retry.text();
        let d; try { d = JSON.parse(text); } catch { d = text; }
        return retry.ok ? { success: true, data: d } : { success: false, output: `Error: ${d.error?.message || text}` };
      }
    }
    const text = await res.text();
    let d; try { d = JSON.parse(text); } catch { d = text; }
    return res.ok ? { success: true, data: d } : { success: false, output: `Error: ${d.error?.message || text}` };
  } catch (e) {
    return { success: false, output: `Error de conexión: ${e.message}` };
  }
}

function _gmailFetch(path, config, method, body) {
  return _googleFetch('https://gmail.googleapis.com', path, config, method, body);
}

function _calendarFetch(path, config, method, body) {
  return _googleFetch('https://www.googleapis.com/calendar/v3', path, config, method, body);
}

function _youtubeFetch(path, config) {
  return _googleFetch('https://www.googleapis.com/youtube/v3', path, config);
}

function _driveFetch(path, config) {
  return _googleFetch('https://www.googleapis.com/drive/v3', path, config);
}

function _tasksFetch(path, config, method, body) {
  return _googleFetch('https://tasks.googleapis.com/tasks/v1', path, config, method, body);
}

export const googleIntegration = {
  id: 'google',
  name: 'Google',
  icon: 'G',
  description: 'Gmail, YouTube, Calendar, Drive y Tasks con una sola cuenta de Google. IMPORTANTE: Habilita cada API en Google Cloud Console → Biblioteca (Gmail API, YouTube Data API, Calendar API, Google Drive API, Tasks API) y registra "http://localhost:9876/oauth2callback" como URI de redirección autorizada.',
  guideSteps: [
    '1. Ve a Google Cloud Console (console.cloud.google.com), crea o selecciona un proyecto.',
    '2. Ve a APIs y Servicios → Biblioteca y habilita: Gmail API, YouTube Data API v3, Calendar API, Google Drive API, Tasks API.',
    '3. Ve a APIs y Servicios → Credenciales → "Crear credenciales" → "ID de cliente de OAuth". Configura "Aplicación web" y añade "http://localhost:9876/oauth2callback" como URI de redirección.',
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
    if (config.clientSecret === '***') c.clientSecret = full.clientSecret;
    if (config.refreshToken === '***') c.refreshToken = full.refreshToken;

    if (!c.clientId || !c.clientSecret) {
      return { success: false, error: 'Completa el Client ID y Client Secret.' };
    }
    if (!c.accessToken && c.refreshToken) {
      const ok = await _refreshToken(c);
      if (!ok) return { success: false, error: 'Token expirado. Re-conecta Google.', needsAuth: true };
    }
    if (!c.accessToken) {
      return { success: false, error: 'No hay sesión activa. Conecta con Google.', needsAuth: true };
    }
    const r = await _gmailFetch('/gmail/v1/users/me/profile', c);
    if (r.success) {
      c.userEmail = r.data.emailAddress;
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
    if (this._authInProgress) throw new Error('Ya hay una autenticación en curso.');
    this._authInProgress = true;
    try {
      _log('info', 'Iniciando autenticación Google con scopes múltiples...');
      const redirectUri = 'http://localhost:9876/oauth2callback';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent`;

      if (!window.electronAPI?.startOAuthServer) {
        throw new Error('El sistema OAuth local no está disponible.');
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
          redirect_uri: redirectUri, code, grant_type: 'authorization_code'
        })
      });
      const result = await tokenRes.json();
      if (!result.access_token) {
        throw new Error(`Error de Google: ${result.error_description || result.error || 'No se pudo obtener el token.'}`);
      }

      _log('info', 'Token obtenido, verificando Gmail...');
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { 'Authorization': `Bearer ${result.access_token}` }
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok || !profileData.emailAddress) {
        const errMsg = profileData.error?.message || 'Error desconocido';
        if (errMsg.includes('Access not configured') || errMsg.includes('not enabled')) {
          throw new Error('La API de Gmail no está habilitada. Ve a Google Cloud Console → Biblioteca → habilita Gmail API, YouTube Data API v3, Calendar API, Drive API y Tasks API. Luego intenta de nuevo.');
        }
        throw new Error(`Error al verificar Google: ${errMsg}`);
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
      _log('info', `Google conectado como ${config.userEmail}`);
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
      // Gmail
      { name: 'gmail_list_inbox', description: 'Lista los correos más recientes de Gmail.', parameters: { type: 'object', properties: { max_results: { type: 'integer', description: 'Máx (default: 10, max: 50)' }, query: { type: 'string', description: 'Filtro (ej: "from:user", "subject:reporte", "has:attachment")' } }, required: [] } },
      { name: 'gmail_send_email', description: 'Envía un correo desde Gmail.', parameters: { type: 'object', properties: { to: { type: 'string', description: 'Destinatario' }, subject: { type: 'string', description: 'Asunto' }, body: { type: 'string', description: 'Cuerpo del mensaje' }, cc: { type: 'string', description: 'CC opcional' } }, required: ['to', 'subject', 'body'] } },
      { name: 'gmail_search', description: 'Busca correos en Gmail.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Búsqueda estilo Gmail' }, max_results: { type: 'integer', description: 'Máx (default: 10, max: 50)' } }, required: ['query'] } },
      { name: 'gmail_read_email', description: 'Lee el contenido completo de un correo por su ID.', parameters: { type: 'object', properties: { message_id: { type: 'string', description: 'ID del mensaje (de gmail_list_inbox o gmail_search)' } }, required: ['message_id'] } },
      { name: 'gmail_get_unread_count', description: 'Número de correos no leídos en Gmail.', parameters: { type: 'object', properties: {}, required: [] } },
      { name: 'gmail_trash_email', description: 'Mueve un correo a la papelera.', parameters: { type: 'object', properties: { message_id: { type: 'string', description: 'ID del mensaje a eliminar' } }, required: ['message_id'] } },
      { name: 'gmail_batch_trash', description: 'Elimina varios correos a la vez moviéndolos a la papelera.', parameters: { type: 'object', properties: { message_ids: { type: 'array', items: { type: 'string' }, description: 'Array de IDs de mensajes a eliminar' } }, required: ['message_ids'] } },
      { name: 'gmail_empty_trash', description: 'Vacía la papelera permanentemente (borra todos los correos en la papelera para siempre).', parameters: { type: 'object', properties: {}, required: [] } },
      // Calendar
      { name: 'calendar_list_events', description: 'Lista próximos eventos de Google Calendar.', parameters: { type: 'object', properties: { max_results: { type: 'integer', description: 'Máx (default: 10, max: 50)' }, time_min: { type: 'string', description: 'Fecha inicio ISO (default: ahora)' } }, required: [] } },
      { name: 'calendar_create_event', description: 'Crea un evento en Google Calendar.', parameters: { type: 'object', properties: { summary: { type: 'string', description: 'Título' }, start_time: { type: 'string', description: 'Inicio ISO (ej: "2024-06-27T10:00:00-03:00")' }, end_time: { type: 'string', description: 'Fin ISO' }, description: { type: 'string', description: 'Descripción' }, location: { type: 'string', description: 'Ubicación' } }, required: ['summary', 'start_time', 'end_time'] } },
      // YouTube
      { name: 'youtube_search', description: 'Busca videos en YouTube por palabra clave. Devuelve título, canal, fecha y URL.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Búsqueda' }, max_results: { type: 'integer', description: 'Máx resultados (default: 5, max: 20)' } }, required: ['query'] } },
      { name: 'youtube_channel_info', description: 'Obtiene información de un canal de YouTube por nombre o ID.', parameters: { type: 'object', properties: { channel_id: { type: 'string', description: 'ID del canal (de youtube_search)' } }, required: ['channel_id'] } },
      // Drive
      { name: 'drive_list_files', description: 'Lista archivos recientes de Google Drive.', parameters: { type: 'object', properties: { page_size: { type: 'integer', description: 'Máx (default: 10, max: 50)' } }, required: [] } },
      { name: 'drive_search', description: 'Busca archivos en Google Drive por nombre.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Nombre o parte del nombre a buscar' }, page_size: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' } }, required: ['query'] } },
      // Tasks
      { name: 'tasks_list', description: 'Lista todas las listas de tareas de Google Tasks.', parameters: { type: 'object', properties: {}, required: [] } },
      { name: 'tasks_create', description: 'Crea una tarea en Google Tasks.', parameters: { type: 'object', properties: { task_list_id: { type: 'string', description: 'ID de la lista de tareas (de tasks_list)' }, title: { type: 'string', description: 'Título de la tarea' }, notes: { type: 'string', description: 'Notas opcionales' }, due_date: { type: 'string', description: 'Fecha ISO opcional (ej: "2024-12-31T23:59:00Z")' } }, required: ['task_list_id', 'title'] } }
    ];
  },

  async executeTool(name, args, config) {
    const full = await _loadFullConfig();
    config = { ...full, ...config };

    switch (name) {
      // ─── GMAIL ──────────────────────────────────
      case 'gmail_list_inbox': {
        const max = Math.min(args.max_results || 10, 50);
        let q = '';
        if (args.query) q = `&q=${encodeURIComponent(args.query)}`;
        const r = await _gmailFetch(`/gmail/v1/users/me/messages?maxResults=${max}${q}&labelIds=INBOX`, config);
        if (!r.success) return r;
        const msgs = r.data.messages || [];
        if (msgs.length === 0) return { success: true, output: 'Bandeja vacía.' };
        const details = [];
        for (const m of msgs.slice(0, max)) {
          const d = await _gmailFetch(`/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, config);
          if (d.success) {
            const h = {}; (d.data.payload?.headers || []).forEach(x => h[x.name] = x.value);
            const label = d.data.labelIds?.includes('UNREAD') ? '📩' : '📧';
            const date = h.Date ? new Date(h.Date).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            details.push(`${label} ${h.Subject || 'Sin asunto'} — ${h.From || ''}\n   🆔 ${m.id} | ${date}`);
          }
        }
        return { success: true, output: `📬 Bandeja (${msgs.length}):\n` + details.join('\n') };
      }
      case 'gmail_send_email': {
        const raw = `From: me\nTo: ${args.to}${args.cc ? '\nCc: ' + args.cc : ''}\nSubject: ${args.subject}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n${args.body}`;
        const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const r = await _gmailFetch('/gmail/v1/users/me/messages/send', config, 'POST', { raw: encoded });
        if (!r.success) return r;
        return { success: true, output: `✅ Correo enviado a ${args.to}\n📧 ${args.subject}` };
      }
      case 'gmail_search': {
        const max = Math.min(args.max_results || 10, 50);
        const r = await _gmailFetch(`/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(args.query)}`, config);
        if (!r.success) return r;
        const msgs = r.data.messages || [];
        if (msgs.length === 0) return { success: true, output: 'Sin resultados.' };
        const details = [];
        for (const m of msgs.slice(0, max)) {
          const d = await _gmailFetch(`/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, config);
          if (d.success) {
            const h = {}; (d.data.payload?.headers || []).forEach(x => h[x.name] = x.value);
            details.push(`📧 ${h.Subject || 'Sin asunto'} — ${h.From || ''}\n   🆔 ${m.id}`);
          }
        }
        return { success: true, output: `Resultados para "${args.query}" (${msgs.length}):\n` + details.join('\n') };
      }
      case 'gmail_read_email': {
        const r = await _gmailFetch(`/gmail/v1/users/me/messages/${args.message_id}?format=full`, config);
        if (!r.success) return r;
        const d = r.data;
        const h = {}; (d.payload?.headers || []).forEach(x => h[x.name] = x.value);
        let body = '';
        function extract(p) {
          if (p.mimeType === 'text/plain' && p.body?.data) body += decodeURIComponent(escape(atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'))));
          if (p.parts) p.parts.forEach(extract);
        }
        extract(d.payload);
        const preview = body.length > 3000 ? body.substring(0, 3000) + '\n... [truncado]' : body;
        return { success: true, output: `📧 ${h.Subject || 'Sin asunto'}\nDe: ${h.From}\nPara: ${h.To}\nFecha: ${h.Date}\n${h.Cc ? 'CC: ' + h.Cc + '\n' : ''}\n${preview}` };
      }
      case 'gmail_get_unread_count': {
        const r = await _gmailFetch('/gmail/v1/users/me/messages?maxResults=1&q=is:unread&labelIds=INBOX', config);
        if (!r.success) return r;
        return { success: true, output: `📬 Tienes ${r.data.resultSizeEstimate || 0} correo(s) no leído(s).` };
      }
      case 'gmail_trash_email': {
        const r = await _gmailFetch(`/gmail/v1/users/me/messages/${args.message_id}/trash`, config, 'POST');
        if (!r.success) return r;
        return { success: true, output: `🗑️ Correo "${args.message_id}" movido a la papelera.` };
      }
      case 'gmail_batch_trash': {
        const ids = Array.isArray(args.message_ids) ? args.message_ids : [args.message_ids];
        if (ids.length === 0) return { success: false, output: 'No se proporcionaron IDs.' };
        const r = await _gmailFetch('/gmail/v1/users/me/messages/batchModify', config, 'POST', { ids, addLabelIds: ['TRASH'] });
        if (!r.success) return r;
        return { success: true, output: `🗑️ ${ids.length} correo(s) movido(s) a la papelera.` };
      }
      case 'gmail_empty_trash': {
        const r = await _gmailFetch('/gmail/v1/users/me/messages?q=in:trash&maxResults=500', config);
        if (!r.success) return r;
        const msgs = r.data.messages || [];
        if (msgs.length === 0) return { success: true, output: 'La papelera ya está vacía.' };
        for (const m of msgs) {
          await _gmailFetch(`/gmail/v1/users/me/messages/${m.id}/delete`, config, 'DELETE');
        }
        return { success: true, output: `🗑️ Papelera vaciada (${msgs.length} correos eliminados permanentemente).` };
      }

      // ─── CALENDAR ──────────────────────────────
      case 'calendar_list_events': {
        const max = Math.min(args.max_results || 10, 50);
        const tm = args.time_min || new Date().toISOString();
        const r = await _calendarFetch(`/calendars/primary/events?maxResults=${max}&timeMin=${encodeURIComponent(tm)}&singleEvents=true&orderBy=startTime`, config);
        if (!r.success) return r;
        const events = r.data.items || [];
        if (events.length === 0) return { success: true, output: 'No hay eventos próximos.' };
        const details = events.map(e => {
          const s = e.start.dateTime || e.start.date;
          return `📅 ${e.summary || 'Sin título'}\n   🕒 ${new Date(s).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}\n   📌 ID: ${e.id}${e.location ? ' | 📍 ' + e.location : ''}`;
        });
        return { success: true, output: `🗓️ Próximos eventos (${events.length}):\n\n` + details.join('\n\n') };
      }
      case 'calendar_create_event': {
        const body = { summary: args.summary, start: { dateTime: args.start_time }, end: { dateTime: args.end_time }, description: args.description || '', location: args.location || '' };
        const r = await _calendarFetch('/calendars/primary/events', config, 'POST', body);
        if (!r.success) return r;
        return { success: true, output: `✅ Evento: ${args.summary}\n🕒 Inicio: ${new Date(args.start_time).toLocaleString()}\n🕒 Fin: ${new Date(args.end_time).toLocaleString()}` };
      }

      // ─── YOUTUBE ───────────────────────────────
      case 'youtube_search': {
        const max = Math.min(args.max_results || 5, 20);
        const r = await _youtubeFetch(`/search?part=snippet&q=${encodeURIComponent(args.query)}&maxResults=${max}&type=video`, config);
        if (!r.success) return r;
        const items = r.data.items || [];
        if (items.length === 0) return { success: true, output: `Sin resultados para "${args.query}".` };
        const results = items.map((v, i) => {
          const sn = v.snippet;
          return `${i + 1}. ${sn.title}\n   Canal: ${sn.channelTitle} | ${new Date(sn.publishedAt).toLocaleDateString()}\n   🆔 ${sn.resourceId?.videoId || v.id?.videoId}\n   https://youtube.com/watch?v=${sn.resourceId?.videoId || v.id?.videoId}`;
        });
        return { success: true, output: `🎬 YouTube: "${args.query}"\n\n` + results.join('\n\n') };
      }
      case 'youtube_channel_info': {
        const r = await _youtubeFetch(`/channels?part=snippet,statistics&id=${encodeURIComponent(args.channel_id)}`, config);
        if (!r.success) return r;
        const ch = r.data.items?.[0];
        if (!ch) return { success: false, output: 'Canal no encontrado.' };
        const s = ch.snippet, st = ch.statistics;
        return { success: true, output: `📺 ${s.title}\n   ${s.description?.substring(0, 200) || ''}\n   🧑‍🤝‍🧑 ${parseInt(st.subscriberCount || 0).toLocaleString()} suscriptores\n   👁️ ${parseInt(st.viewCount || 0).toLocaleString()} vistas\n   📹 ${st.videoCount || 0} videos\n   🆔 ${ch.id}` };
      }

      // ─── DRIVE ─────────────────────────────────
      case 'drive_list_files': {
        const ps = Math.min(args.page_size || 10, 50);
        const r = await _driveFetch(`/files?pageSize=${ps}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime)`, config);
        if (!r.success) return r;
        const files = r.data.files || [];
        if (files.length === 0) return { success: true, output: 'Drive vacío o sin archivos recientes.' };
        const lines = files.map(f => {
          const icon = f.mimeType?.includes('folder') ? '📁' : f.mimeType?.includes('spreadsheet') ? '📊' : f.mimeType?.includes('document') ? '📝' : f.mimeType?.includes('presentation') ? '📽️' : f.mimeType?.includes('pdf') ? '📄' : '📄';
          const size = f.size ? ` (${(parseInt(f.size) / 1024 / 1024).toFixed(1)} MB)` : '';
          return `${icon} ${f.name}${size}\n   🆔 ${f.id} | ${new Date(f.modifiedTime).toLocaleDateString()}`;
        });
        return { success: true, output: `📂 Archivos recientes:\n\n` + lines.join('\n') };
      }
      case 'drive_search': {
        const ps = Math.min(args.page_size || 10, 50);
        const q = `name contains '${args.query.replace(/'/g, "\\'")}'`;
        const r = await _driveFetch(`/files?pageSize=${ps}&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)`, config);
        if (!r.success) return r;
        const files = r.data.files || [];
        if (files.length === 0) return { success: true, output: `Sin archivos que coincidan con "${args.query}".` };
        const lines = files.map(f => {
          const icon = f.mimeType?.includes('folder') ? '📁' : '📄';
          return `${icon} ${f.name}\n   🆔 ${f.id} | ${new Date(f.modifiedTime).toLocaleDateString()}`;
        });
        return { success: true, output: `🔍 Resultados para "${args.query}" (${files.length}):\n\n` + lines.join('\n') };
      }

      // ─── TASKS ─────────────────────────────────
      case 'tasks_list': {
        const r = await _tasksFetch('/users/@me/lists', config);
        if (!r.success) return r;
        const lists = r.data.items || [];
        if (lists.length === 0) return { success: true, output: 'No tienes listas de tareas.' };
        const lines = lists.map(l => `📋 ${l.title}\n   🆔 ${l.id}`);
        return { success: true, output: `📝 Listas de tareas:\n\n` + lines.join('\n') };
      }
      case 'tasks_create': {
        const body = { title: args.title, notes: args.notes || '' };
        if (args.due_date) body.due = args.due_date;
        const r = await _tasksFetch(`/lists/${encodeURIComponent(args.task_list_id)}/tasks`, config, 'POST', body);
        if (!r.success) return r;
        return { success: true, output: `✅ Tarea creada: ${args.title}` };
      }

      default:
        return { success: false, output: `Herramienta "${name}" no implementada.` };
    }
  }
};
