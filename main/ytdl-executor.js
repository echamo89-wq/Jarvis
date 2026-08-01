const { ipcMain, app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function _findYtdlp() {
  const candidates = ['yt-dlp', 'yt-dlp.exe', 'youtube-dl', 'youtube-dl.exe'];
  for (const name of candidates) {
    try {
      const r = require('child_process').execSync(`where ${name}`, { encoding: 'utf8', timeout: 2000 });
      if (r.trim()) return r.trim().split('\n')[0].trim();
    } catch {}
  }
  return null;
}

function _ensureOutputDir(subfolder) {
  const desk = app.getPath('desktop');
  const dir = path.join(desk, 'JARVIS_Youtube', subfolder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function _parseProgressLine(line) {
  const p = line.match(/\[download\]\s+(\d+\.?\d*)%/);
  if (!p) return null;
  const percent = parseFloat(p[1]);
  const speedMatch = line.match(/at\s+([\d.]+[KMG]?iB\/s)/);
  const etaMatch = line.match(/ETA\s+(\S+)/);
  const sizeMatch = line.match(/of\s+~?([\d.]+[KMG]?iB)/);
  return {
    percent: Math.min(percent, 100),
    speed: speedMatch ? speedMatch[1] : null,
    eta: etaMatch ? etaMatch[1] : null,
    totalSize: sizeMatch ? sizeMatch[1] : null
  };
}

function registerYtdlIpc(cleanupCallback) {
  ipcMain.handle('youtube-download', async (event, args) => {
    const url = args?.url || '';
    const fmt = args?.format || 'video';
    const formatCode = args?.formatCode || '';
    if (!url) return { success: false, output: 'Se requiere una URL de YouTube.' };

    // Validar que la URL sea realmente de YouTube antes de pasarla al proceso
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, output: 'URL inválida.' };
    }
    const allowedHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      return { success: false, output: `ERR_INVALID_HOST: Solo se permiten URLs de YouTube (recibido: ${parsedUrl.hostname})` };
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return { success: false, output: 'ERR_INVALID_PROTOCOL: Solo se permiten URLs http/https.' };
    }

    const ytPath = _findYtdlp();
    if (!ytPath) {
      return { success: false, output: 'ERR: yt-dlp no está instalado. Instalalo desde https://github.com/yt-dlp/yt-dlp/releases y agregalo al PATH.' };
    }

    let formatArg;
    let subfolder = 'Video';
    if (fmt === 'audio') {
      formatArg = 'bestaudio[ext=m4a]/bestaudio';
      subfolder = 'Music';
    } else if (fmt === 'custom' && formatCode) {
      formatArg = formatCode;
      subfolder = 'Custom';
    } else {
      formatArg = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]';
    }

    const outDir = _ensureOutputDir(subfolder);
    const outputTemplate = path.join(outDir, '%(title)s.%(ext)s');

    return new Promise((resolve) => {
      const child = spawn(ytPath, [
        '--no-warnings',
        '-f', formatArg,
        '-o', outputTemplate,
        '--no-playlist',
        '--compat-options', 'filename-sanitization',
        '--newline',
        url
      ], {
        windowsHide: true,
        encoding: 'utf8'
      });

      if (cleanupCallback) cleanupCallback(child);

      let stderrBuf = '';
      let lastProgress = 0;

      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith('[download]')) {
            const prog = _parseProgressLine(line);
            if (prog && prog.percent > lastProgress) {
              lastProgress = prog.percent;
              event.sender.send('youtube-download-progress', prog);
            }
          } else if (line.startsWith('[ExtractAudio]') || line.startsWith('[Merger]') || line.startsWith('[ffmpeg]')) {
            event.sender.send('youtube-download-progress', {
              percent: lastProgress,
              status: 'processing',
              message: line.replace(/^\[[^\]]+\]\s*/, '').trim()
            });
          }
        }
      });

      child.stderr.on('data', (data) => {
        stderrBuf += data.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith('[download]')) {
            const prog = _parseProgressLine(line);
            if (prog && prog.percent > lastProgress) {
              lastProgress = prog.percent;
              event.sender.send('youtube-download-progress', prog);
            }
          } else if (line.startsWith('[ExtractAudio]') || line.startsWith('[Merger]') || line.startsWith('[ffmpeg]') || line.startsWith('[info]')) {
            event.sender.send('youtube-download-progress', {
              percent: lastProgress,
              status: 'processing',
              message: line.replace(/^\[[^\]]+\]\s*/, '').trim()
            });
          }
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          event.sender.send('youtube-download-progress', {
            percent: 100,
            status: 'complete',
            message: 'Descarga completada'
          });
          resolve({ success: true, output: `Descargado en ${outDir}` });
        } else {
          const errMsg = stderrBuf.trim() || `Código de salida: ${code}`;
          event.sender.send('youtube-download-progress', {
            percent: 0,
            status: 'error',
            message: errMsg.substring(0, 200)
          });
          resolve({ success: false, output: `Error: ${errMsg}` });
        }
      });

      child.on('error', (err) => {
        event.sender.send('youtube-download-progress', {
          percent: 0,
          status: 'error',
          message: err.message
        });
        resolve({ success: false, output: `Error: ${err.message}` });
      });
    });
  });

  return { cleanupYtdl: () => {} };
}

module.exports = { registerYtdlIpc };
