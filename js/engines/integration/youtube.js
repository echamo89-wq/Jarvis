import { createLogger } from '../../utils/logger.js';
const _log = createLogger('YOUTUBE');

async function _youtubeFetch(path, config, method = 'GET', body = null) {
  if (!config.accessToken) return { success: false, output: 'YouTube no autenticado. Ve a Integraciones y conecta YouTube.' };
  const headers = { 'Authorization': `Bearer ${config.accessToken}` };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const url = `https://www.googleapis.com/youtube/v3${path}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    if (res.status === 401 && config.refreshToken) {
      const refreshed = await _refreshAccessToken(config);
      if (!refreshed) return { success: false, output: 'Sesión de YouTube expirada. Reconecta en Integraciones.' };
      headers['Authorization'] = `Bearer ${config.accessToken}`;
      const retry = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
      const text = await retry.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return retry.ok ? { success: true, data } : { success: false, output: `Error YouTube: ${data.error?.message || text}` };
    }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return res.ok ? { success: true, data } : { success: false, output: `Error YouTube: ${data.error?.message || text}` };
  } catch (e) {
    return { success: false, output: `Error de conexión YouTube: ${e.message}` };
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
  localStorage.setItem('jarvis_int_youtube', JSON.stringify(save));
  const secrets = {};
  if (config.refreshToken) secrets.refreshToken = config.refreshToken;
  if (config.clientSecret) secrets.clientSecret = config.clientSecret;
  if (config.clientId) secrets.clientId = config.clientId;
  if (config.accessToken) secrets.accessToken = config.accessToken;
  if (config.tokenExpiry) secrets.tokenExpiry = config.tokenExpiry;
  if (config.userEmail) secrets.userEmail = config.userEmail;
  if (Object.keys(secrets).length > 0 && window.electronAPI?.secureCredentialSet) {
    window.electronAPI.secureCredentialSet('int_youtube', secrets).catch(() => {});
  }
}

function _loadFullConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_youtube') || '{}');
    return base;
  } catch { return {}; }
}

async function _loadFullSecureConfig() {
  try {
    const base = JSON.parse(localStorage.getItem('jarvis_int_youtube') || '{}');
    if (window.electronAPI?.secureCredentialGet) {
      try {
        const secrets = await window.electronAPI.secureCredentialGet('int_youtube');
        if (secrets) return { ...base, ...secrets };
      } catch {}
    }
    return base;
  } catch { return {}; }
}

async function _startDeviceAuth(clientId) {
  const res = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl' })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

async function _pollForToken(deviceCode, clientId, clientSecret) {
  const start = Date.now();
  while (Date.now() - start < 180000) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });
    const data = await res.json();
    if (data.access_token) return data;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') { await new Promise(r => setTimeout(r, 5000)); continue; }
    throw new Error(data.error_description || data.error);
  }
  throw new Error('Tiempo de espera agotado (3 min). Intenta de nuevo.');
}

export const youtubeIntegration = {
  id: 'youtube',
  name: 'YouTube',
  icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 15l5-3-5-3v6zm7.5-11.6c.5.1 1.4.4 1.8.9.4.4.6 1 .7 1.8.1 1.3.1 1.6.1 4.9s0 3.6-.1 4.9c-.1.8-.3 1.4-.7 1.8s-1.3.8-1.8.9c-.5.1-3.1.2-6.5.2s-6 0-6.5-.2c-.5-.1-1.4-.4-1.8-.9s-.6-1-.7-1.8C3 14.6 3 14.3 3 12s0-3.6.1-4.9c.1-.8.3-1.4.7-1.8s1.3-.8 1.8-.9c.5-.1 3.1-.2 6.5-.2s6 0 6.5.2z"/></svg>',
  description: 'Busca videos, canales, comentarios, estadísticas, sube y edita videos de YouTube.',
  guideSteps: [
    '1. ANDÁ a https://console.cloud.google.com — Iniciá sesión con tu cuenta de Google.',
    '2. CREÁ UN PROYECTO: Arriba a la izquierda, selector de proyectos → "NUEVO PROYECTO". Ponele un nombre (ej: "Jarvis YouTube").',
    '3. HABILITÁ LA API: Andá a "APIs y Servicios" → "Biblioteca". Buscá "YouTube Data API v3" → click → Habilitar.',
    '4. CREAR CREDENCIAL: Andá a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth". Elegí "Aplicación Web".',
    '5. REDIRECCIÓN: En "URIs de redirección autorizados", agregá esta URL EXACTA:',
    '   http://localhost:9876/oauth2callback',
    '   Después dale a "Crear".',
    '6. ANOTAR: Copiá el Client ID y Client Secret. Pegalos abajo y dale a "Conectar con YouTube".'
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
      if (!ok) return { success: false, error: 'Token expirado y no se pudo refrescar. Re-conecta YouTube.' };
    }
    if (!c.accessToken) {
      return { success: false, error: 'No hay sesión activa. Haz clic en "Conectar con YouTube" para autorizar.', needsAuth: true };
    }
    const r = await _youtubeFetch('/channels?part=snippet&mine=true', c);
    if (r.success) {
      const channelName = r.data.items?.[0]?.snippet?.title || 'YouTube';
      c.userEmail = channelName;
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
      _log('info', 'Iniciando autenticación YouTube...');
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
        const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl');
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

      const config = {
        clientId,
        clientSecret,
        accessToken: result.access_token,
        refreshToken: result.refresh_token || '',
        tokenExpiry: result.expires_in ? Date.now() + (result.expires_in * 1000) : 0,
        userEmail: ''
      };
      _saveConfig(config);

      const channelRes = await _youtubeFetch('/channels?part=snippet&mine=true', config);
      if (channelRes.success && channelRes.data?.items?.[0]) {
        config.userEmail = channelRes.data.items[0].snippet.title;
        _saveConfig(config);
      }

      this._authInProgress = false;
      return { success: true, output: 'YouTube conectado correctamente.' };
    } catch (e) {
      this._authInProgress = false;
      _log('error', `Error auth YouTube: ${e.message}`);
      throw e;
    }
  },

  getFunctionDeclarations() {
    return [
      { name: 'youtube_search', description: 'Busca videos en YouTube por palabra clave. Devuelve título, canal, fecha y URL.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Búsqueda' }, max_results: { type: 'integer', description: 'Máx resultados (default: 5, max: 20)' } }, required: ['query'] } },
      { name: 'youtube_channel_info', description: 'Obtiene información de un canal de YouTube por nombre o ID.', parameters: { type: 'object', properties: { channel_id: { type: 'string', description: 'ID del canal (de youtube_search)' } }, required: ['channel_id'] } },
      { name: 'youtube_my_channel_stats', description: 'Obtiene estadísticas y datos clave de tu propio canal de YouTube conectado (suscriptores, vistas, videos, ID de canal y lista de reproducción de subidas).', parameters: { type: 'object', properties: {} } },
      { name: 'youtube_list_comments', description: 'Lista los comentarios y respuestas más recientes de tu canal o de un video específico.', parameters: { type: 'object', properties: { video_id: { type: 'string', description: 'ID opcional del video. Si se omite, busca de todo el canal.' }, max_results: { type: 'integer', description: 'Máx comentarios (default: 10, max: 50)' } } } },
      { name: 'youtube_post_comment', description: 'Publica un nuevo comentario en un video específico de YouTube.', parameters: { type: 'object', properties: { video_id: { type: 'string', description: 'ID del video' }, text: { type: 'string', description: 'Cuerpo del comentario' } }, required: ['video_id', 'text'] } },
      { name: 'youtube_reply_to_comment', description: 'Responde a un hilo de comentario existente en YouTube.', parameters: { type: 'object', properties: { thread_id: { type: 'string', description: 'ID del hilo de comentarios' }, text: { type: 'string', description: 'Texto de la respuesta' } }, required: ['thread_id', 'text'] } },
      { name: 'youtube_list_playlist_items', description: 'Obtiene los videos de una lista de reproducción (ej. la de subidas "Uploads" para ver tus videos recientes).', parameters: { type: 'object', properties: { playlist_id: { type: 'string', description: 'ID de la lista de reproducción' }, max_results: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' } }, required: ['playlist_id'] } },
      { name: 'youtube_get_video_stats', description: 'Obtiene las vistas, likes, comentarios y estado de uno o varios videos de YouTube.', parameters: { type: 'object', properties: { video_ids: { type: 'array', items: { type: 'string' }, description: 'Array de IDs de videos' } }, required: ['video_ids'] } },
      { name: 'youtube_update_video_metadata', description: 'Modifica el título, descripción, etiquetas o categoría de un video existente.', parameters: { type: 'object', properties: { video_id: { type: 'string', description: 'ID del video' }, title: { type: 'string', description: 'Nuevo título opcional' }, description: { type: 'string', description: 'Nueva descripción opcional' }, tags: { type: 'array', items: { type: 'string' }, description: 'Nuevas etiquetas/tags opcionales' } }, required: ['video_id'] } },
      { name: 'youtube_upload_video', description: 'Sube un video de ARCHIVO LOCAL a YouTube con metadatos SEO optimizados. Vos generás el SEO (título, descripción, tags) según el contenido del video. Soporta mp4, mov, avi, mkv, webm, flv, wmv, m4v, mpg, mpeg.', parameters: { type: 'object', properties: { file_path: { type: 'string', description: 'Ruta local del archivo de video' }, title: { type: 'string', description: 'Título SEO del video (máx 100 caracteres)' }, description: { type: 'string', description: 'Descripción SEO del video con palabras clave y hashtags' }, tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas/tags (máx 500 caracteres total)' }, privacy_status: { type: 'string', enum: ['private', 'unlisted', 'public'], description: 'Visibilidad del video (default: private)' } }, required: ['file_path', 'title', 'description'] } },
    ];
  },

  async executeTool(name, args, config) {
    const c = await _loadFullSecureConfig();
    const merged = { ...c, ...config };
    if (config?.clientSecret === '***') merged.clientSecret = c.clientSecret;
    if (config?.refreshToken === '***') merged.refreshToken = c.refreshToken;

    const isExpired = merged.tokenExpiry && Date.now() > merged.tokenExpiry;
    if ((!merged.accessToken || isExpired) && merged.refreshToken) {
      const ok = await _refreshAccessToken(merged);
      if (!ok && !merged.accessToken) {
        return { success: false, output: 'YouTube no autenticado. Conectalo en Integraciones.' };
      }
    }
    if (!merged.accessToken) {
      return { success: false, output: 'YouTube no autenticado. Conectalo en Integraciones.' };
    }

    try {
      switch (name) {
        case 'youtube_search': {
          const q = encodeURIComponent(args.query);
          const max = Math.min(args.max_results || 5, 20);
          const r = await _youtubeFetch(`/search?part=snippet&q=${q}&maxResults=${max}&type=video`, merged);
          if (!r.success) return r;
          const items = r.data.items || [];
          if (items.length === 0) return { success: true, output: 'Sin resultados.' };
          const lines = items.map((v, i) => `${i + 1}. ${v.snippet.title} — ${v.snippet.channelTitle} (https://youtu.be/${v.id.videoId})`);
          return { success: true, output: lines.join('\n') };
        }
        case 'youtube_channel_info': {
          const r = await _youtubeFetch(`/channels?part=snippet,statistics&id=${args.channel_id}`, merged);
          if (!r.success) return r;
          const ch = r.data.items?.[0];
          if (!ch) return { success: false, output: 'Canal no encontrado.' };
          return { success: true, output: `Canal: ${ch.snippet.title} (${ch.snippet.customUrl || ''})\nSuscriptores: ${ch.statistics.subscriberCount}\nVideos: ${ch.statistics.videoCount}\nVistas: ${ch.statistics.viewCount}\nDescripción: ${(ch.snippet.description || '').substring(0, 300)}` };
        }
        case 'youtube_my_channel_stats': {
          const r = await _youtubeFetch('/channels?part=snippet,statistics,contentDetails&mine=true', merged);
          if (!r.success) return r;
          const ch = r.data.items?.[0];
          if (!ch) return { success: false, output: 'No se encontró tu canal.' };
          const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads || '';
          return { success: true, output: `Tu canal: ${ch.snippet.title}\nSuscriptores: ${ch.statistics.subscriberCount}\nVideos totales: ${ch.statistics.videoCount}\nVistas totales: ${ch.statistics.viewCount}\nID del canal: ${ch.id}\nPlaylist de subidas: ${uploadsId}\nURL: https://youtube.com/channel/${ch.id}` };
        }
        case 'youtube_list_comments': {
          if (args.video_id) {
            const r = await _youtubeFetch(`/commentThreads?part=snippet&videoId=${args.video_id}&maxResults=${Math.min(args.max_results || 10, 50)}&order=relevance`, merged);
            if (!r.success) return r;
            const items = r.data.items || [];
            if (items.length === 0) return { success: true, output: 'Sin comentarios.' };
            return { success: true, output: items.map((c, i) => `${i + 1}. ${c.snippet.topLevelComment.snippet.authorDisplayName}: ${c.snippet.topLevelComment.snippet.textDisplay.substring(0, 200)}`).join('\n') };
          }
          const ch = await _youtubeFetch('/channels?part=contentDetails&mine=true', merged);
          if (!ch.success || !ch.data?.items?.[0]) return { success: false, output: 'No se pudo obtener tu canal.' };
          const uploadsId = ch.data.items[0].contentDetails.relatedPlaylists.uploads;
          const vids = await _youtubeFetch(`/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=5`, merged);
          if (!vids.success) return { success: false, output: 'No se pudieron obtener tus videos.' };
          const videoIds = (vids.data.items || []).map(v => v.snippet.resourceId.videoId).filter(Boolean);
          if (videoIds.length === 0) return { success: true, output: 'No se encontraron comentarios recientes.' };
          const allComments = [];
          for (const vid of videoIds.slice(0, 3)) {
            const cr = await _youtubeFetch(`/commentThreads?part=snippet&videoId=${vid}&maxResults=10`, merged);
            if (cr.success && cr.data?.items) allComments.push(...cr.data.items);
          }
          if (allComments.length === 0) return { success: true, output: 'Sin comentarios recientes.' };
          return { success: true, output: allComments.slice(0, Math.min(args.max_results || 10, 50)).map((c, i) => `${i + 1}. ${c.snippet.topLevelComment.snippet.authorDisplayName}: ${c.snippet.topLevelComment.snippet.textDisplay.substring(0, 200)}`).join('\n') };
        }
        case 'youtube_post_comment': {
          const r = await _youtubeFetch(`/commentThreads?part=snippet`, merged, 'POST', {
            snippet: { videoId: args.video_id, topLevelComment: { snippet: { textOriginal: args.text } } }
          });
          return r.success ? { success: true, output: 'Comentario publicado.' } : r;
        }
        case 'youtube_reply_to_comment': {
          const r = await _youtubeFetch(`/comments?part=snippet`, merged, 'POST', {
            snippet: { parentId: args.thread_id, textOriginal: args.text }
          });
          return r.success ? { success: true, output: 'Respuesta publicada.' } : r;
        }
        case 'youtube_list_playlist_items': {
          const r = await _youtubeFetch(`/playlistItems?part=snippet&playlistId=${args.playlist_id}&maxResults=${Math.min(args.max_results || 10, 50)}`, merged);
          if (!r.success) return r;
          const items = r.data.items || [];
          if (items.length === 0) return { success: true, output: 'Lista de reproducción vacía.' };
          return { success: true, output: items.map((v, i) => `${i + 1}. ${v.snippet.title} (https://youtu.be/${v.snippet.resourceId.videoId})`).join('\n') };
        }
        case 'youtube_get_video_stats': {
          const ids = (args.video_ids || []).join(',');
          if (!ids) return { success: false, output: 'Sin IDs de video.' };
          const r = await _youtubeFetch(`/videos?part=statistics,snippet&id=${ids}`, merged);
          if (!r.success) return r;
          const items = r.data.items || [];
          if (items.length === 0) return { success: true, output: 'Videos no encontrados.' };
          return { success: true, output: items.map(v => `${v.snippet.title}: ${v.statistics.viewCount} vistas, ${v.statistics.likeCount} likes, ${v.statistics.commentCount} comentarios`).join('\n') };
        }
        case 'youtube_update_video_metadata': {
          const body = { id: args.video_id, snippet: {} };
          if (args.title) body.snippet.title = args.title;
          if (args.description) body.snippet.description = args.description;
          if (args.tags) body.snippet.tags = args.tags;
          const r = await _youtubeFetch(`/videos?part=snippet`, merged, 'PUT', body);
          return r.success ? { success: true, output: 'Metadatos actualizados.' } : r;
        }
        case 'youtube_upload_video': {
          if (!window.electronAPI?.youtubeUploadFile) {
            return { success: false, output: 'El sistema de subida no está disponible en esta versión.' };
          }
          const filePath = args.file_path;
          if (!filePath) return { success: false, output: 'Falta la ruta del archivo.' };
          const metadata = {
            snippet: { title: args.title, description: args.description || '', tags: args.tags || [] },
            status: { privacyStatus: args.privacy_status || 'private', selfDeclaredMadeForKids: false }
          };
          const result = await window.electronAPI.youtubeUploadFile({
            filePath,
            accessToken: merged.accessToken,
            metadata
          });
          if (result.success) {
            return {
              success: true,
              output: `Video subido exitosamente: ${result.data.url}`,
              data: result.data
            };
          }
          return result;
        }
        default:
          return { success: false, output: `Herramienta desconocida: ${name}` };
      }
    } catch (e) {
      return { success: false, output: `Error YouTube: ${e.message}` };
    }
  }
};
