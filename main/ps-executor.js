const { ipcMain, app, dialog, BrowserWindow } = require('electron');
const { loadCredentials, saveCredentials } = require('./secure-storage');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { PS_BLOCKED_PATTERNS, CMD_BLOCKED_PATTERNS } = require('./ps-blocked-patterns');
const { getPowerShellHost } = require('./ps-host');

const PS_EXEC_TIMEOUT = 120000;
const PS_HOST_READY_TIMEOUT = 10000;

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

async function checkExecutionPermission(command) {
  let creds = {};
  try {
    creds = loadCredentials();
  } catch (e) {}

  if (creds.system_execution_allowed === 'all') {
    return true;
  }

  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Denegar', 'Permitir una vez', 'Permitir siempre'],
    defaultId: 1,
    cancelId: 0,
    title: '🔒 Jarvis — Solicitud de permiso',
    message: '¿Permitir que Jarvis ejecute un comando en la terminal?',
    detail: `Jarvis necesita ejecutar el siguiente comando para completar su tarea:\n\n${command.substring(0, 300)}${command.length > 300 ? '...' : ''}\n\n¿Qué significa cada opción?\n• "Denegar" — No ejecutar. Jarvis buscará otra forma de ayudar.\n• "Permitir una vez" — Ejecutar solo ahora. Jarvis volverá a preguntar.\n• "Permitir siempre" — Ejecutar sin preguntar de nuevo. Solo si confía plenamente.`,
    noLink: true
  });

  if (response === 2) {
    try {
      creds.system_execution_allowed = 'all';
      saveCredentials(creds);
    } catch (e) {}
    return true;
  }
  if (response === 1) {
    return true;
  }
  return false;
}

function _preWarmCmd() {
  try {
    const child = execFile('cmd.exe', ['/c', 'ver'], { timeout: 5000 }, () => {});
    child.unref();
  } catch (e) {}
}

async function _runPsHost(command) {
  const host = getPowerShellHost();
  try {
    const readyPromise = host.init();
    await Promise.race([
      readyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('PS host init timeout')), PS_HOST_READY_TIMEOUT))
    ]);
    return await host.execute(command, PS_EXEC_TIMEOUT);
  } catch (e) {
    return { success: false, output: `PS Host error: ${e.message}` };
  }
}

function _runPsExecFile(command) {
  return new Promise((resolve) => {
    const tmpFile = path.join(app.getPath('temp'), `jarvis_ps_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.ps1`);
    try {
      fs.writeFileSync(tmpFile, `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${command}`, 'utf8');
    } catch(e) {
      return resolve({ success: false, output: `Failed to write temp script: ${e.message}` });
    }

    const child = execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile
    ], { timeout: PS_EXEC_TIMEOUT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
      const hasRealError = stderr && stderr.trim().length > 0;
      resolve(error && hasRealError
        ? { success: false, output: stderr.trim() }
        : { success: true, output: stdout.trim() });
    });
  });
}

async function _runPowerShell(command) {
  const isWin = process.platform === 'win32';
  if (!isWin) {
    return { success: false, output: 'ERR_PLATFORM_UNSUPPORTED: PowerShell no está disponible en esta plataforma.' };
  }

  let creds = {};
  try { creds = loadCredentials(); } catch (e) {}
  const systemUnrestricted = creds.system_execution_allowed === 'all';

  if (!systemUnrestricted) {
    const normalized = _normalizeCommand(command, true);
    const isBlockedRaw = PS_BLOCKED_PATTERNS.some(p => p.test(command));
    const isBlockedNorm = PS_BLOCKED_PATTERNS.some(p => p.test(normalized));
    if (isBlockedRaw || isBlockedNorm) {
      return { success: false, output: 'ERR_BLOCKED_BY_SECURITY_POLICY' };
    }
  }

  const allowed = await checkExecutionPermission(command);
  if (!allowed) {
    return { success: false, output: 'ERR_PERMISSION_DENIED: Ejecución cancelada por el usuario.' };
  }

  try {
    const hostResult = await _runPsHost(command);
    if (hostResult.success || !hostResult.output) {
      return hostResult;
    }
    // El host falló (timeout, proceso caído, script inválido): intentar ejecución directa
    return await _runPsExecFile(command);
  } catch (e) {
    return await _runPsExecFile(command);
  }
}

function registerPsIpc(cleanupCallback) {
  _preWarmCmd();

  ipcMain.handle('run-powershell', async (event, command) => {
    return await _runPowerShell(command);
  });

  ipcMain.handle('run-cmd', async (event, command) => {
    const isWin = process.platform === 'win32';
    if (!isWin) {
      return { success: false, output: 'ERR_PLATFORM_UNSUPPORTED: cmd.exe no está disponible en esta plataforma.' };
    }
    let creds = {};
    try { creds = loadCredentials(); } catch (e) {}
    const systemUnrestricted = creds.system_execution_allowed === 'all';
    if (!systemUnrestricted) {
      const normalized = _normalizeCommand(command, false);
      const isBlockedRaw = CMD_BLOCKED_PATTERNS.some(p => p.test(command));
      const isBlockedNorm = CMD_BLOCKED_PATTERNS.some(p => p.test(normalized));
      if (isBlockedRaw || isBlockedNorm) {
        return { success: false, output: 'ERR_BLOCKED_BY_SECURITY_POLICY' };
      }
    }
    const allowed = await checkExecutionPermission(command);
    if (!allowed) {
      return { success: false, output: 'ERR_PERMISSION_DENIED: Ejecución cancelada por el usuario.' };
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
    cleanupPs: async () => {
      const host = getPowerShellHost();
      await host.shutdown();
    }
  };
}

module.exports = { registerPsIpc };