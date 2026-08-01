import { createLogger } from '../../utils/logger.js';
const _log = createLogger('APP_SCANNER');

const SCAN_CACHE = new Map();
const SCAN_TTL = 5 * 60 * 1000;

function _isCached(key) {
  const entry = SCAN_CACHE.get(key);
  if (entry && Date.now() - entry.ts < SCAN_TTL) return entry.data;
  return null;
}

function _setCache(key, data) {
  SCAN_CACHE.set(key, { data, ts: Date.now() });
}

function _parseItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

export default class AppScanner {

  async scanRegistry() {
    const cached = _isCached('registry');
    if (cached) return cached;

    _log('info', 'Scanning uninstall registry...');
    const cmd = `
      $ErrorActionPreference = 'SilentlyContinue';
      $results = @();
      foreach ($hive in @('HKLM', 'HKCU')) {
        foreach ($sub in @(
          'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
        )) {
          Get-ItemProperty "\${hive}:\\$sub" | ForEach-Object {
            $name = $_.DisplayName;
            if (-not $name) { return };
            $path = $null;
            if ($_.DisplayIcon) { $path = ($_.DisplayIcon -split ',')[0] };
            if ((-not $path) -and $_.InstallLocation) {
              $cand = Join-Path $_.InstallLocation ($_.DisplayName + '.exe');
              if (Test-Path $cand) { $path = $cand };
            }
            if ($path -and (Test-Path $path) -and ($path -match '\\.(exe|com|bat|cmd)$')) {
              $results += [PSCustomObject]@{ Name = $name; Path = $path; Type = 'executable' }
            }
          }
        }
      }
      $results | ConvertTo-Json -Compress
    `;
    try {
      const r = await window.electronAPI.runPowerShell(cmd);
      if (r.success && r.output) {
        const parsed = JSON.parse(r.output);
        const items = _parseItems(parsed);
        _setCache('registry', items);
        return items;
      }
    } catch (e) {
      _log('warn', 'Registry scan failed:', e.message);
    }
    return [];
  }

  async scanStartMenu() {
    const cached = _isCached('startMenu');
    if (cached) return cached;

    _log('info', 'Scanning start menu...');
    const cmd = `
      $ErrorActionPreference = 'SilentlyContinue';
      $dirs = @(
        [Environment]::GetFolderPath('StartMenu'),
        [Environment]::GetFolderPath('CommonStartMenu')
      );
      $results = @();
      foreach ($d in $dirs) {
        $lnks = Get-ChildItem -Path "$d\\Programs" -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue;
        foreach ($lnk in $lnks) {
          $results += [PSCustomObject]@{
            Name = $lnk.BaseName;
            Path = $lnk.FullName;
            Type = 'shortcut'
          }
        }
      }
      $results | ConvertTo-Json -Compress
    `;
    try {
      const r = await window.electronAPI.runPowerShell(cmd);
      if (r.success && r.output) {
        const parsed = JSON.parse(r.output);
        const items = _parseItems(parsed);
        _setCache('startMenu', items);
        return items;
      }
    } catch (e) {
      _log('warn', 'Start menu scan failed:', e.message);
    }
    return [];
  }

  async scanUwp() {
    const cached = _isCached('uwp');
    if (cached) return cached;

    _log('info', 'Scanning UWP apps...');
    try {
      const r = await window.electronAPI.runPowerShell('Get-StartApps | ConvertTo-Json -Compress');
      if (r.success && r.output) {
        const parsed = JSON.parse(r.output);
        const items = _parseItems(parsed).map(x => ({
          name: x.Name,
          appId: x.AppID,
          path: x.AppID,
          type: 'app_id',
        }));
        _setCache('uwp', items);
        return items;
      }
    } catch (e) {
      _log('warn', 'UWP scan failed:', e.message);
    }
    return [];
  }

  async scanAppPaths() {
    const cached = _isCached('appPaths');
    if (cached) return cached;

    _log('info', 'Scanning App Paths...');
    const cmd = `
      $ErrorActionPreference = 'SilentlyContinue';
      $results = @();
      foreach ($hive in @('HKLM', 'HKCU')) {
        Get-ChildItem "\${hive}:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths" | ForEach-Object {
          $val = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue;
          if ($val -and $val.'(default)' -and ($val.'(default)' -match '\\.exe$')) {
            $results += [PSCustomObject]@{
              Name = $_.PSChildName -replace '\\.exe$', '';
              Path = $val.'(default)';
              Type = 'executable'
            }
          }
        }
      }
      $results | ConvertTo-Json -Compress
    `;
    try {
      const r = await window.electronAPI.runPowerShell(cmd);
      if (r.success && r.output) {
        const parsed = JSON.parse(r.output);
        const items = _parseItems(parsed);
        _setCache('appPaths', items);
        return items;
      }
    } catch (e) {
      _log('warn', 'App Paths scan failed:', e.message);
    }
    return [];
  }

  invalidateCache() {
    SCAN_CACHE.clear();
    _log('info', 'Scan cache invalidated');
  }
}
