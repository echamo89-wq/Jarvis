import { createLogger } from '../../utils/logger.js';
const _log = createLogger('LAUNCH_STRATEGIES');

function _elapsed(start) {
  return Date.now() - start;
}

export async function launchUri(method) {
  const start = Date.now();
  const uri = method.value;
  _log('info', `URI: ${uri}`);
  try {
    const r = await window.electronAPI.openBrowser(uri);
    return { success: r.success !== false, method: 'uri', output: r.output || '', path: uri, error: r.success ? null : (r.output || 'URI failed'), durationMs: _elapsed(start) };
  } catch (e) {
    return { success: false, method: 'uri', path: uri, error: e.message, durationMs: _elapsed(start) };
  }
}

export async function launchAppId(method) {
  const start = Date.now();
  const appId = method.value;
  _log('info', `AppId: ${appId}`);
  try {
    const r = await window.electronAPI.launchUwp(appId);
    return { success: r && r.success !== false, method: 'app_id', output: r ? r.output : '', appId, error: (r && r.success === false) ? (r.output || 'AppId failed') : null, durationMs: _elapsed(start) };
  } catch (e) {
    return { success: false, method: 'app_id', appId, error: e.message, durationMs: _elapsed(start) };
  }
}

export async function launchExecutable(method) {
  const start = Date.now();
  const exePath = method.path;
  _log('info', `Executable: ${exePath}`);

  // Try direct spawn first (returns PID for tracking)
  try {
    const r = await window.electronAPI.launchExec(exePath);
    if (r && r.success !== false) {
      return { success: true, method: 'executable', output: r.output || '', path: exePath, pid: r.pid || null, error: null, durationMs: _elapsed(start) };
    }
  } catch (e) {
    _log('warn', `Direct spawn failed for ${exePath}, falling back to openPath: ${e.message}`);
  }

  // Fallback to openPath (solo con ruta real: nombres pelados no existen en
  // disco y ShellExecute sobre un nombre inexistente muestra diálogos de error)
  const hasRealPath = exePath.includes('\\') || exePath.includes('/') || exePath.startsWith('shell:');
  if (hasRealPath) {
    try {
      const r = await window.electronAPI.openPath(exePath);
      const success = r && (r.success === undefined || r.success === true);
      return { success, method: 'executable', output: r ? r.output : '', path: exePath, pid: null, error: success ? null : (r ? r.output : 'openPath failed'), durationMs: _elapsed(start) };
    } catch (e) {
      return { success: false, method: 'executable', path: exePath, error: e.message, durationMs: _elapsed(start) };
    }
  }
  return { success: false, method: 'executable', path: exePath, error: 'path not found on disk', durationMs: _elapsed(start) };
}

export async function launchShortcut(method) {
  const start = Date.now();
  const lnkPath = method.path;
  _log('info', `Shortcut: ${lnkPath}`);
  try {
    const r = await window.electronAPI.openPath(lnkPath);
    const success = r && (r.success === undefined || r.success === true);
    return { success, method: 'shortcut', output: r ? r.output : '', path: lnkPath, error: success ? null : (r ? r.output : 'shortcut failed'), durationMs: _elapsed(start) };
  } catch (e) {
    return { success: false, method: 'shortcut', path: lnkPath, error: e.message, durationMs: _elapsed(start) };
  }
}

export async function launchShellCommand(method) {
  const start = Date.now();
  const cmd = method.command;
  _log('info', `Shell: ${cmd}`);
  try {
    const r = await window.electronAPI.runCmd(cmd);
    return { success: r.success !== false, method: 'shell_command', output: r.output || '', command: cmd, error: r.success ? null : (r.output || 'shell failed'), durationMs: _elapsed(start) };
  } catch (e) {
    return { success: false, method: 'shell_command', command: cmd, error: e.message, durationMs: _elapsed(start) };
  }
}

export async function launchStartProcess(method) {
  const start = Date.now();
  let target = method.value || method.path || method.command;
  if (!target) return { success: false, method: 'start_process', error: 'No target', durationMs: _elapsed(start) };

  _log('info', `Start-Process: ${target}`);
  try {
    // Direct cmd.exe /c start (no PS host, no security checks, instant)
    if (target.startsWith('shell:AppsFolder')) {
      const r = await window.electronAPI.startProcess(target);
      return { success: (r && r.success !== false), method: 'start_process', output: r ? r.output : '', path: target, error: (r && r.success === false) ? (r.output || 'explorer failed') : null, durationMs: _elapsed(start) };
    }
    const r = await window.electronAPI.startProcess(target);
    return { success: (r && r.success !== false), method: 'start_process', output: r ? r.output : '', path: target, error: (r && r.success === false) ? (r.output || 'start failed') : null, durationMs: _elapsed(start) };
  } catch (e) {
    return { success: false, method: 'start_process', path: target, error: e.message, durationMs: _elapsed(start) };
  }
}

export async function launchMethod(method) {
  if (!method || !method.type) {
    return { success: false, error: 'Invalid method' };
  }
  switch (method.type) {
    case 'uri': return launchUri(method);
    case 'app_id': return launchAppId(method);
    case 'executable': return launchExecutable(method);
    case 'shortcut': return launchShortcut(method);
    case 'shell_command': return launchShellCommand(method);
    case 'start_process': return launchStartProcess(method);
    default:
      _log('warn', `Unknown method type: ${method.type}`);
      return { success: false, error: `Unknown type: ${method.type}` };
  }
}

export async function launchWithFallback(methods) {
  if (!methods || methods.length === 0) {
    return { success: false, error: 'No methods available' };
  }
  const sorted = [...methods].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const errors = [];
  for (const method of sorted) {
    const attempt = await launchMethod(method);
    if (attempt.success) return attempt;
    errors.push({ type: method.type, error: attempt.error });
  }
  return { success: false, method: 'none', errors, error: errors.map(e => `${e.type}: ${e.error}`).join('; ') };
}
