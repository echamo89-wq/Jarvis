const { ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let _startAppsCache = null;

async function _refreshStartApps() {
  _startAppsCache = new Map();
  try {
    const lines = await new Promise((resolve) => {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Get-StartApps -EA 0 | Sort-Object Name | ForEach-Object { Write-Output ($_.Name.Replace(\"`r\",\"\")+\"|\"+$_.AppID) }'
      ], { timeout: 15000 }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        resolve(stdout.trim().split('\r\n').filter(Boolean));
      });
    });
    for (const line of lines) {
      const sep = line.indexOf('|');
      if (sep > 0) {
        const name = line.substring(0, sep).toLowerCase().trim();
        const appId = line.substring(sep + 1).trim();
        if (name && appId && !_startAppsCache.has(name)) {
          _startAppsCache.set(name, appId);
        }
      }
    }
  } catch (e) {}
}

function _getAppIdFromCache(appName) {
  if (!_startAppsCache || _startAppsCache.size === 0) return null;
  const name = appName.toLowerCase();
  const clean = name.replace(/[\s'\-\.]/g, '');

  if (_startAppsCache.has(name)) return _startAppsCache.get(name);
  for (const [key, val] of _startAppsCache) {
    const kc = key.replace(/[\s'\-\.]/g, '');
    if (key.includes(name) || name.includes(key) || kc.includes(clean) || clean.includes(kc)) {
      return val;
    }
  }
  return null;
}

async function _findInPath(exeName) {
  return new Promise((resolve) => {
    execFile('where.exe', [exeName], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const p = stdout.trim().split('\r\n')[0].trim();
      if (p && fs.existsSync(p)) return resolve(p);
      resolve(null);
    });
  });
}

function _findInLocations(exeName, appName) {
  const windir = process.env.windir || 'C:\\Windows';
  const vars = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : null,
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    path.join(windir, 'System32'),
    path.join(windir, 'SysWOW64'),
    windir,
  ].filter(Boolean);
  for (const base of vars) {
    for (const p of [`${base}\\${appName}\\${exeName}`, `${base}\\${appName}\\${appName}.exe`, `${base}\\${exeName}`]) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function _findInRegistry(exeName) {
  for (const hive of ['HKLM', 'HKCU']) {
    try {
      const p = await new Promise((resolve) => {
        execFile('reg', ['query', `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`, '/ve'], { timeout: 2000 }, (err, stdout) => {
          if (err) return resolve(null);
          const m = stdout.match(/\(DEFAULT\)\s+REG_\w+\s+(.+)/);
          if (m) { const p2 = m[1].trim(); if (fs.existsSync(p2)) return resolve(p2); }
          resolve(null);
        });
      });
      if (p) return p;
    } catch (e) {}
  }
  return null;
}

async function _findInLnk(appName) {
  return new Promise((resolve) => {
    const escaped = appName.replace(/'/g, "''");
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `$s=New-Object -ComObject WScript.Shell;$d=@("$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs","$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs");$r=$null;foreach($dir in $d){Get-ChildItem $dir -Recurse -Filter *.lnk -EA 0|ForEach-Object{try{$t=$s.CreateShortcut($_.FullName).TargetPath;if($t-and(Test-Path $t)-and(\$_.BaseName-like'*${escaped}*'-or'${escaped}'-like\"*\$_.BaseName*\")){$r=$t;break}}catch{}};if($r){break}}try{$s.Dispose()}catch{};if($r){Write-Output \"OK:$r\"}else{Write-Output 'NOTFOUND'}`
    ], { timeout: 8000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const m = stdout.trim().match(/^OK:(.+)/);
      resolve(m ? m[1].trim() : null);
    });
  });
}

function _launchUwp(appId) {
  // shell.openExternal nativo (ShellExecute) — el `cmd /c start` se colgaba 8s en GUI apps
  return shell.openExternal(`shell:AppsFolder\\${appId}`)
    .then(() => ({ success: true }))
    .catch((e) => ({ success: false, output: e.message }));
}

function registerAppFinder() {
  _refreshStartApps();

  setInterval(() => _refreshStartApps().catch(() => {}), 300000);

  ipcMain.handle('find-app', async (event, { exeTargets, appName, name }) => {
    const appId = _getAppIdFromCache(appName || name);
    if (appId) return { found: `shell:AppsFolder\\${appId}`, method: 'startapps' };

    for (const exe of exeTargets || []) {
      let p = await _findInPath(exe);
      if (!p) p = _findInLocations(exe, name);
      if (!p) p = await _findInRegistry(exe);
      if (p) return { found: p, method: 'exe' };
    }

    const lnk = await _findInLnk(name);
    if (lnk) return { found: lnk, method: 'lnk' };

    return { found: null, method: null };
  });

  ipcMain.handle('launch-uwp', async (event, appId) => {
    return _launchUwp(appId);
  });

  ipcMain.handle('scan-apps', async () => {
    const results = {};

    if (_startAppsCache) {
      for (const [key, val] of _startAppsCache) {
        const k = key.replace(/[\s'\-\.]/g, '');
        if (k && !results[k]) results[k] = `shell:AppsFolder\\${val}`;
      }
    }

    const dirs = [
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    ];
    const lnkFiles = [];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const walk = (d) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const fp = path.join(d, e.name);
            if (e.isDirectory()) walk(fp);
            else if (e.name.toLowerCase().endsWith('.lnk')) lnkFiles.push({ base: e.name.replace(/\.lnk$/i, ''), fp });
          }
        };
        walk(dir);
      } catch (e) {}
    }

    for (let i = 0; i < lnkFiles.length; i += 30) {
      const chunk = lnkFiles.slice(i, i + 30);
      const psScript = chunk.map(l => {
        const n = l.base.replace(/'/g, "''");
        const fp2 = l.fp.replace(/'/g, "''");
        return `try{$sc=$s.CreateShortcut('${fp2}');$t=$sc.TargetPath;if($t-and(Test-Path $t)){Write-Output('${n}|'+$t)}}catch{}`;
      }).join(';');
      try {
        const lines = await new Promise((resolve) => {
          execFile('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command',
            `$s=New-Object -ComObject WScript.Shell;${psScript};try{$s.Dispose()}catch{}`
          ], { timeout: 10000 }, (err, stdout) => {
            resolve(err ? [] : stdout.trim().split('\r\n').filter(Boolean));
          });
        });
        for (const line of lines) {
          const sep = line.indexOf('|');
          if (sep > 0) {
            const key = line.substring(0, sep).toLowerCase().trim().replace(/[\s'\-\.]/g, '');
            const val = line.substring(sep + 1).trim();
            if (key && val && !results[key]) results[key] = val;
          }
        }
      } catch (e) {}
    }

    const regPaths = ['HKLM', 'HKCU'];
    for (const hive of regPaths) {
      try {
        const lines = await new Promise((resolve) => {
          execFile('reg', ['query', `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths`, '/s', '/ve'], { timeout: 5000 }, (err, stdout) => {
            resolve(err ? [] : stdout.trim().split('\r\n'));
          });
        });
        let curKey = null;
        for (const line of lines) {
          if (/^HKEY_/.test(line)) { curKey = line.trim(); continue; }
          const m = line.match(/\(DEFAULT\)\s+REG_\w+\s+(.+)/);
          if (m && curKey) {
            const p2 = m[1].trim();
            const kn = path.basename(curKey).replace(/\.exe$/i, '').toLowerCase();
            if (p2 && fs.existsSync(p2) && !results[kn]) results[kn] = p2;
          }
        }
      } catch (e) {}
    }

    return results;
  });
}

module.exports = { registerAppFinder };
