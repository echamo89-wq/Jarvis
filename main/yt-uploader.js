const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');

function _resumableUpload(filePath, accessToken, metadata) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg'
    };
    const mimeType = mimeTypes[ext] || 'video/mp4';

    const metaBody = JSON.stringify(metadata);
    const urlObj = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
    urlObj.searchParams.set('uploadType', 'resumable');
    urlObj.searchParams.set('part', 'snippet,status');

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
        'Content-Length': Buffer.byteLength(metaBody)
      }
    };

    const req = https.request(options, (res) => {
      const location = res.headers.location;
      if (!location) {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { const d = JSON.parse(body); reject(new Error(d.error?.message || body)); }
          catch { reject(new Error(body || 'No se obtuvo URL de subida')); }
        });
        return;
      }

      const uploadUrlObj = new URL(location);
      const readStream = fs.createReadStream(filePath);
      const putOpts = {
        hostname: uploadUrlObj.hostname,
        path: uploadUrlObj.pathname + uploadUrlObj.search,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': mimeType,
          'Content-Length': String(fileSize)
        }
      };

      const putReq = https.request(putOpts, (putRes) => {
        let body = '';
        putRes.on('data', c => body += c);
        putRes.on('end', () => {
          if (putRes.statusCode === 200 || putRes.statusCode === 201) {
            try {
              const d = JSON.parse(body);
              resolve({ videoId: d.id, url: `https://youtu.be/${d.id}` });
            } catch {
              resolve({ videoId: '(desconocido)', url: location });
            }
          } else {
            try { const d = JSON.parse(body); reject(new Error(d.error?.message || body)); }
            catch { reject(new Error(body || 'Error al subir')); }
          }
        });
      });

      putReq.on('error', reject);
      readStream.pipe(putReq);
      readStream.on('error', reject);
    });

    req.on('error', reject);
    req.write(metaBody);
    req.end();
  });
}

function registerYoutubeUploader() {
  ipcMain.handle('youtube-upload-file', async (event, { filePath, accessToken, metadata }) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, output: 'Archivo no encontrado.' };
      const stat = fs.statSync(filePath);
      if (stat.size === 0) return { success: false, output: 'El archivo está vacío.' };
      const videoExts = new Set(['.mp4','.mov','.avi','.mkv','.webm','.flv','.wmv','.m4v','.mpg','.mpeg']);
      if (!videoExts.has(path.extname(filePath).toLowerCase())) {
        return { success: false, output: 'Formato de video no soportado. Usá mp4, mov, avi, mkv, webm, flv, wmv, m4v, mpg o mpeg.' };
      }
      const result = await _resumableUpload(filePath, accessToken, metadata);
      return { success: true, output: `Video subido exitosamente: ${result.url}`, data: result };
    } catch (e) {
      return { success: false, output: `Error al subir: ${e.message}` };
    }
  });
}

module.exports = { registerYoutubeUploader };
