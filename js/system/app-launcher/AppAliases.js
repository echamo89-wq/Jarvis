import { createLogger } from '../../utils/logger.js';
const _log = createLogger('APP_ALIASES');

const ALIASES = [
  { triggers: ['settings', 'configuracion', 'ajustes', 'config', 'preferences', 'preferencias', 'system settings', 'windows settings'],
    name: 'Settings',
    path: 'ms-settings:',
    type: 'uri' },

  { triggers: ['control panel', 'panel de control', 'control'],
    name: 'Control Panel',
    path: 'control.exe',
    type: 'executable' },

  { triggers: ['explorer', 'file explorer', 'explorador', 'explorador de archivos', 'files', 'archivos', 'finder', 'this pc', 'mi pc', 'computer', 'equipo'],
    name: 'File Explorer',
    path: 'explorer.exe',
    type: 'executable' },

  { triggers: ['cmd', 'command prompt', 'terminal', 'simbolo del sistema', 'consola'],
    name: 'Command Prompt',
    path: 'cmd.exe',
    type: 'executable' },

  { triggers: ['powershell', 'pwsh'],
    name: 'PowerShell',
    path: 'powershell.exe',
    type: 'executable' },

  { triggers: ['notepad', 'bloc de notas', 'editor', 'libreta'],
    name: 'Notepad',
    path: 'notepad.exe',
    type: 'executable' },

  { triggers: ['calculator', 'calculadora', 'calc'],
    name: 'Calculator',
    path: 'calc.exe',
    type: 'executable' },

  { triggers: ['paint', 'mspaint', 'paint.net', 'dibujo'],
    name: 'Paint',
    path: 'mspaint.exe',
    type: 'executable' },

  { triggers: ['task manager', 'administrador de tareas', 'taskmgr'],
    name: 'Task Manager',
    path: 'taskmgr.exe',
    type: 'executable' },

  { triggers: ['regedit', 'registry editor', 'editor del registro'],
    name: 'Registry Editor',
    path: 'regedit.exe',
    type: 'executable' },

  { triggers: ['snipping tool', 'recortes', 'snip & sketch'],
    name: 'Snipping Tool',
    path: 'SnippingTool.exe',
    type: 'executable' },

  { triggers: ['edge', 'microsoft edge', 'internet'],
    name: 'Microsoft Edge',
    path: 'msedge.exe',
    type: 'executable' },

  { triggers: ['chrome', 'google chrome', 'google', 'navegador', 'browser'],
    name: 'Google Chrome',
    path: 'chrome.exe',
    type: 'executable' },

  { triggers: ['firefox', 'mozilla firefox', 'mozilla', 'fox'],
    name: 'Firefox',
    path: 'firefox.exe',
    type: 'executable' },

  { triggers: ['outlook', 'microsoft outlook', 'correo', 'mail'],
    name: 'Outlook',
    path: 'outlook.exe',
    type: 'executable' },

  { triggers: ['word', 'microsoft word', 'winword'],
    name: 'Microsoft Word',
    path: 'WINWORD.EXE',
    type: 'executable' },

  { triggers: ['excel', 'microsoft excel'],
    name: 'Microsoft Excel',
    path: 'EXCEL.EXE',
    type: 'executable' },

  { triggers: ['powerpoint', 'microsoft powerpoint'],
    name: 'Microsoft PowerPoint',
    path: 'POWERPNT.EXE',
    type: 'executable' },

  { triggers: ['teams', 'microsoft teams'],
    name: 'Microsoft Teams',
    path: 'ms-teams.exe',
    type: 'executable' },

  { triggers: ['vs code', 'vscode', 'visual studio code', 'code', 'opencode'],
    name: 'OpenCode',
    path: 'OpenCode.exe',
    type: 'executable' },

  { triggers: ['spotify', 'music', 'musica', 'reproductor'],
    name: 'Spotify',
    path: 'Spotify.exe',
    type: 'executable' },

  { triggers: ['discord'],
    name: 'Discord',
    path: 'Discord.exe',
    type: 'executable' },

  { triggers: ['slack'],
    name: 'Slack',
    path: 'slack.exe',
    type: 'executable' },

  { triggers: ['zoom'],
    name: 'Zoom',
    path: 'Zoom.exe',
    type: 'executable' },

  { triggers: ['vlc', 'vlc media player', 'reproductor vlc'],
    name: 'VLC Media Player',
    path: 'vlc.exe',
    type: 'executable' },

  { triggers: ['7-zip', '7zip', 'compressor', 'zip'],
    name: '7-Zip',
    path: '7zFM.exe',
    type: 'executable' },

  { triggers: ['obs', 'obs studio', 'grabar pantalla'],
    name: 'OBS Studio',
    path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
    type: 'executable' },
];

class AppAliases {
  constructor() {
    this._triggerMap = new Map();
    this._init();
  }

  _init() {
    for (const alias of ALIASES) {
      for (const trigger of alias.triggers) {
        const key = trigger.toLowerCase().trim();
        if (!this._triggerMap.has(key)) {
          this._triggerMap.set(key, alias);
        }
      }
    }
    _log('info', `Initialized ${ALIASES.length} alias groups, ${this._triggerMap.size} triggers`);
  }

  resolve(query) {
    if (!query || typeof query !== 'string') return null;
    const q = query.trim().toLowerCase();
    const exact = this._triggerMap.get(q);
    if (exact) return this._makeEntry(exact, 'exact');
    return null;
  }

  getAllEntries() {
    return ALIASES.map(a => ({
      name: a.name,
      path: a.path,
      type: a.type,
      source: 'alias',
      _aliases: a.triggers,
    }));
  }

  _makeEntry(alias, matchType) {
    return {
      name: alias.name,
      path: alias.path,
      type: alias.type,
      source: 'alias',
      _matchType: matchType,
    };
  }
}

export default new AppAliases();
