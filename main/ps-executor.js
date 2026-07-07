const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const { PS_BLOCKED_PATTERNS, CMD_BLOCKED_PATTERNS } = require('./ps-blocked-patterns');

let psProc = null;
let psQueue = [];
let psBusy = false;
let psBuffer = '';
let psRestarting = false;

function _normalizeCommand(command, isPowerShell = true) {
  if (typeof command !== 'string') return '';
  let clean = command;
  if (isPowerShell) {
    clean = clean.replace(/`/g, '');
  }
  let prev;
  do {
    prev = clean;
    clean = clean.replace(/(["'])(.*?)\1\s*\+\s*(["'])(.*?)\3/g, (match, q1, s1, q2, s2) => {
      return q1 + s1 + s2 + q1;
    });
  } while (clean !== prev);
  clean = clean.replace(/["']/g, '');
  if (isPowerShell) {
    clean = clean.replace(/[()&$,;{}|]/g, ' ');
  } else {
    clean = clean.replace(/[()&$,;{}|^&|<>]/g, ' ');
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function _startPsProc() {
  if (psProc && psProc.exitCode === null) return;
  if (psRestarting) return;
  psProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  psBuffer = '';
  psProc.stdout.on('data', (data) => { psBuffer += data.toString(); _checkPsResponses(); });
  psProc.stderr.on('data', (data) => { psBuffer += data.toString(); _checkPsResponses(); });
  psProc.on('exit', () => {
    psProc = null;
    if (psQueue.length > 0) {
      psRestarting = true;
      setTimeout(() => { psRestarting = false; _startPsProc(); }, 100);
    }
  });
}

function _checkPsResponses() {
  while (psQueue.length > 0) {
    const marker = psQueue[0].marker;
    const endIdx = psBuffer.indexOf(marker);
    if (endIdx === -1) break;
    const output = psBuffer.substring(0, endIdx);
    psBuffer = psBuffer.substring(endIdx + marker.length);
    const item = psQueue.shift();
    if (psQueue.length > 0) psBusy = true; else psBusy = false;
    const isError = output.includes('___JARVIS_PS_ERR___');
    const clean = output.replace(/___JARVIS_PS_ERR___/g, '').trim();
    item.resolve({ success: !isError, output: clean || (isError ? 'Error' : '') });
  }
}

async function _runPsPersistent(command) {
  _startPsProc();
  const marker = `___JARVIS_END_${crypto.randomBytes(4).toString('hex')}___`;
  const tmpFile = path.join(app.getPath('temp'), `jarvis_ps_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.ps1`);
  fs.writeFileSync(tmpFile, `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${command}`, 'utf8');
  setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch(e) {} }, 5000);

  return new Promise((resolve) => {
    psQueue.push({ resolve, marker });
    if (psQueue.length === 1) psBusy = true;
    psProc.stdin.write(`. '${tmpFile.replace(/'/g, "''")}'; if (!$?) { Write-Output '___JARVIS_PS_ERR___' }; Write-Output '${marker}'\n`);
    setTimeout(() => {
      const idx = psQueue.findIndex(q => q.marker === marker);
      if (idx !== -1) {
        psQueue.splice(idx, 1);
        if (psQueue.length === 0) psBusy = false;
        resolve({ success: false, output: 'ERR_TIMEOUT' });
        try { fs.unlinkSync(tmpFile); } catch(e) {}
      }
    }, 60000);
  });
}

function registerPsIpc(cleanupCallback) {
  ipcMain.handle('run-powershell', async (event, command) => {
    const isWin = process.platform === 'win32';
    if (!isWin) {
      return new Promise((resolve) => {
        execFile('/bin/sh', ['-c', command], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve(error ? { success: false, output: stderr.trim() || error.message } : { success: true, output: stdout.trim() });
        });
      });
    }
    const normalized = _normalizeCommand(command, true);
    const isBlocked = PS_BLOCKED_PATTERNS.some(p => p.test(normalized));
    if (isBlocked) {
      return { success: false, output: 'ERR_BLOCKED_BY_SECURITY_POLICY' };
    }
    if (!command.includes('@"') && !command.includes("@'")) {
      return await _runPsPersistent(command);
    }
    return new Promise((resolve) => {
      const tmpFile = path.join(app.getPath('temp'), `jarvis_ps_${Date.now()}.ps1`);
      try {
        fs.writeFileSync(tmpFile, `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${command}`, 'utf8');
      } catch(e) {
        return resolve({ success: false, output: `Failed to write temp script: ${e.message}` });
      }
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile];
      const child = execFile('powershell.exe', args, { timeout: 30000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch(e) {}
        const hasRealError = stderr && stderr.trim().length > 0;
        resolve(error && hasRealError ? { success: false, output: stderr.trim() } : { success: true, output: stdout.trim() });
      });
      if (cleanupCallback) cleanupCallback(child);
    });
  });

  ipcMain.handle('run-cmd', async (event, command) => {
    const isWin = process.platform === 'win32';
    if (!isWin) {
      return new Promise((resolve) => {
        execFile('/bin/sh', ['-c', command], { timeout: 6000 }, (error, stdout, stderr) => {
          resolve(error ? { success: false, output: stderr.trim() || error.message } : { success: true, output: stdout.trim() });
        });
      });
    }
    const normalized = _normalizeCommand(command, false);
    const isBlocked = CMD_BLOCKED_PATTERNS.some(p => p.test(normalized));
    if (isBlocked) {
      return { success: false, output: 'ERR_BLOCKED_BY_SECURITY_POLICY' };
    }
    return new Promise((resolve) => {
      const child = execFile('cmd.exe', ['/c', command], { timeout: 6000, encoding: 'utf8' }, (error, stdout, stderr) => {
        const isStartCmd = /^start\s/i.test(command.trim());
        if (error && !stdout && !isStartCmd) {
          resolve({ success: false, output: stderr || error.message });
        } else {
          resolve({ success: true, output: stdout.trim() });
        }
      });
      if (cleanupCallback) cleanupCallback(child);
    });
  });

  return {
    cleanupPs: () => {
      if (psProc && psProc.exitCode === null) {
        try { psProc.stdin.write("exit\n"); } catch (e) {}
        try { psProc.kill(); } catch (e) {}
        psProc = null;
      }
    }
  };
}

module.exports = { registerPsIpc };
