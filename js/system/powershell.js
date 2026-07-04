import { createLogger } from '../utils/logger.js';
const _log = createLogger('PS');

export async function executeWithFallback(command, description) {
  const lower = command.toLowerCase().trim();
  const isStartCmd = /^start-process\s|^start\s/i.test(lower);

  if (isStartCmd) {
    const appName = (command.match(/(?:start-process|start)\s+["']?([\w][\w\-.:]*)/i) || [])[1];
    if (appName) {
      if (/^[\w]+:/.test(appName) && !appName.endsWith('.exe')) {
        _log('info', `URI scheme: ${appName}`);
        const res = await window.electronAPI.openBrowser(appName);
        return res.success
          ? { success: true, output: `${appName} abierto.` }
          : { success: false, output: `No se pudo abrir ${appName}: ${res.output}` };
      }
      _log('info', `Abriendo aplicación: ${appName}`);
      try {
        const cmdResult = await window.electronAPI.runCmd(`start "" "${appName}"`);
        if (cmdResult.success) return { success: true, output: `Aplicación ${appName} iniciada.` };
      } catch (e) { _log('warn', `CMD start falló: ${e.message}`); }

      const psCommand = [
        `$ErrorActionPreference = 'Stop';`,
        `$foundPath = "";`,
        `try {`,
        `  $p = Get-Command "${appName}" -ErrorAction Stop;`,
        `  $foundPath = $p.Source;`,
        `  Start-Process $foundPath;`,
        `  Write-Output "OK:$foundPath";`,
        `} catch {`,
        `  $regPaths = @(`,
        `    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}.exe",`,
        `    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}.exe",`,
        `    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}",`,
        `    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${appName}"`,
        `  );`,
        `  foreach ($rp in $regPaths) {`,
        `    if (Test-Path $rp) {`,
        `      $val = (Get-ItemProperty $rp).'(default)';`,
        `      if ($val) { Start-Process $val; $foundPath = $val; break; }`,
        `    }`,
        `  }`,
        `  if (-not $foundPath) {`,
        `    $paths = @(`,
        `      "$env:ProgramFiles\\${appName}\\${appName}.exe",`,
        `      "$env:ProgramFiles(x86)\\${appName}\\${appName}.exe",`,
        `      "$env:LocalAppData\\Programs\\${appName}\\${appName}.exe",`,
        `      "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\${appName}.lnk"`,
        `    );`,
        `    foreach ($p in $paths) {`,
        `      if (Test-Path $p) { Start-Process $p; $foundPath = $p; break; }`,
        `    }`,
        `  }`,
        `  if ($foundPath) { Write-Output "OK:$foundPath"; }`,
        `  else { Write-Error "No se pudo encontrar '${appName}'."; exit 1; }`,
        `}`
      ].join('\n');
      return await window.electronAPI.runPowerShell(psCommand);
    }
  }

  let finalCommand = command;
  if (!command.includes('try {') && !command.includes('@"')) {
    finalCommand = `$ErrorActionPreference = 'Stop'; try { ${command} } catch { Write-Error $_.Exception.Message; exit 1 }`;
  }
  let result = await window.electronAPI.runPowerShell(finalCommand);
  if (!result.success && command.includes('Get-WmiObject')) {
    const fixed = command.replace(/Get-WmiObject/g, 'Get-CimInstance');
    if (!fixed.includes('try {') && !fixed.includes('@"')) {
      const fixedCommand = `$ErrorActionPreference = 'Stop'; try { ${fixed} } catch { Write-Error $_.Exception.Message; exit 1 }`;
      result = await window.electronAPI.runPowerShell(fixedCommand);
    } else {
      result = await window.electronAPI.runPowerShell(fixed);
    }
  }
  return result;
}

export async function executePowerShellCommand(command, description) {
  const lowerCmd = command.toLowerCase();
  const nonCacheableKeywords = [
    'volume', 'volumen', 'brightness', 'brillo', 'start-process', 'start ',
    'mkdir', 'new-item', 'stop-process', 'stop-service', 'restart-',
    'rename-', 'set-location', 'cd ', 'set-item', 'set-content',
    'out-file', 'add-content', 'copy-item', 'move-item', 'remove-item'
  ];
  const isQuery = ['get-', 'select-', 'write-output', 'ipaddress', 'computerinfo',
    'operatingsystem', 'operating_system', 'psdrive'
  ].some(kw => lowerCmd.includes(kw));
  const hasActionKeyword = nonCacheableKeywords.some(kw => lowerCmd.includes(kw));
  const cacheable = isQuery && !hasActionKeyword;

  if (cacheable) {
    const cacheKey = btoa(unescape(encodeURIComponent(command))).substring(0, 32);
    try {
      const memory = await window.electronAPI.memoryRead();
      if (!memory.systemCache) memory.systemCache = {};
      const cached = memory.systemCache[cacheKey];
      const now = Date.now();
      if (cached && (now - cached.timestamp) < 60 * 1000) {
        _log('info', `Cache hit: ${description || command}`);
        return { success: true, output: cached.value, fromCache: true };
      }
      const result = await executeWithFallback(command, description);
      if (result.success) {
        memory.systemCache[cacheKey] = { value: result.output, timestamp: now };
        const { default: bus } = await import('../utils/event-bus.js');
        bus.emit('memory:write-requested', memory);
      }
      return result;
    } catch (e) {
      _log('error', `Cache read/write: ${e.message}`);
    }
  }
  return await executeWithFallback(command, description);
}
