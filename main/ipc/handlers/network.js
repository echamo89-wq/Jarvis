const { ipcMain, shell } = require('electron');
const http = require('http');
const https = require('https');
const URL = require('url');
const { spawn } = require('child_process');
const { isPathSafe: _isPathSafe } = require('../../utils/path-safety');

const _launchedPids = new Map();

const MAX_FETCH_REDIRECTS = 3;

function _fetchUrl(urlStr, raw, redirectCount = 0) {
  return new Promise((resolve) => {
    if (!urlStr) return resolve({ success: false, output: 'URL vacía' });
    try {
      const parsedUrl = new URL.URL(urlStr);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      if (raw) {
        headers['Accept'] = 'application/json, text/plain, */*';
      } else {
        headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      }

      const request = client.get(urlStr, { timeout: 15000, headers }, (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location && redirectCount < MAX_FETCH_REDIRECTS) {
          const nextUrl = new URL.URL(res.headers.location, parsedUrl).toString();
          res.destroy();
          resolve(_fetchUrl(nextUrl, raw, redirectCount + 1));
          return;
        }

        if (statusCode >= 400) {
          res.destroy();
          return resolve({ success: false, output: `HTTP ${statusCode} ${res.statusMessage || ''}`.trim() });
        }

        let data = '';
        const maxSize = 200 * 1024;
        res.on('data', chunk => {
          data += chunk.toString('utf8');
          if (data.length > maxSize) { data = data.substring(0, maxSize); res.destroy(); }
        });
        res.on('end', () => {
          if (raw) {
            resolve({ success: true, output: data.substring(0, 100000) });
            return;
          }
          const text = data.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 5000);
          resolve({ success: true, output: text.substring(0, 3000) });
        });
      });

      request.on('error', (err) => resolve({ success: false, output: err.message }));
      request.on('timeout', () => {
        request.destroy();
        resolve({ success: false, output: 'Request timeout' });
      });
    } catch (err) {
      resolve({ success: false, output: err.message });
    }
  });
}

function registerNetwork() {
  ipcMain.handle('fetch-url', async (event, urlStr, raw) => {
    return _fetchUrl(urlStr, raw);
  });

  ipcMain.handle('analyze-page', async (event, urlStr) => {
    const { analyzePage } = require('../../browser.js');
    return await analyzePage(urlStr);
  });

  ipcMain.handle('open-browser', async (event, url) => {
    try {
      const allowedProtocols = ['http:', 'https:', 'windowsdefender:', 'bingmaps:', 'xbox:', 'microsoft.windows.camera:'];
      let isValid = false;
      try {
        const parsed = new URL.URL(url);
        isValid = parsed.protocol.startsWith('ms-') || allowedProtocols.includes(parsed.protocol);
      } catch (_) {
        isValid = allowedProtocols.some(p => url.startsWith(p)) || /^ms-[\w.]+:/i.test(url);
      }
      if (!isValid) {
        return { success: false, output: 'ERR_INVALID_PROTOCOL' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, output: err.message };
    }
  });

  ipcMain.handle('open-path', async (event, targetPath) => {
    try {
      if (!_isPathSafe(targetPath)) {
        return { success: false, output: 'ERR_PATH_NOT_ALLOWED' };
      }
      const error = await shell.openPath(targetPath);
      return error ? { success: false, output: error } : { success: true, output: `Abierto: ${targetPath}` };
    } catch (err) {
      return { success: false, output: err.message };
    }
  });

  ipcMain.handle('launch-exec', async (event, exePath) => {
    try {
      if (!_isPathSafe(exePath)) {
        return { success: false, pid: null, output: 'ERR_PATH_NOT_ALLOWED' };
      }
      return new Promise((resolve) => {
        const child = spawn(exePath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        const timer = setTimeout(() => {
          if (child.pid) {
            child.unref();
            resolve({ success: true, pid: child.pid, output: '' });
          } else {
            resolve({ success: false, pid: null, output: 'Spawn timeout' });
          }
        }, 2000);
        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({ success: false, pid: null, output: err.message });
        });
        child.on('spawn', () => {
          clearTimeout(timer);
          child.unref();
          resolve({ success: true, pid: child.pid, output: '' });
        });
      });
    } catch (err) {
      return { success: false, pid: null, output: err.message };
    }
  });

  ipcMain.handle('check-process', async (event, { pid, name }) => {
    try {
      if (pid) {
        try { process.kill(pid, 0); return { running: true }; } catch { return { running: false }; }
      }
      if (name) {
        const exeName = name.replace(/\.exe$/i, '') + '.exe';
        const { execFile } = require('child_process');
        return new Promise((resolve) => {
          execFile('tasklist', ['/NH', '/FO', 'CSV', '/FI', `IMAGENAME eq ${exeName}`], { timeout: 3000 }, (err, stdout) => {
            if (err) return resolve({ running: false });
            resolve({ running: stdout.includes(exeName) });
          });
        });
      }
      return { running: false };
    } catch {
      return { running: false };
    }
  });
}

module.exports = { registerNetwork };