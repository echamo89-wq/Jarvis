// ──────────────────────────────────────────────────────────────────
// reminders.js — Gestor de recordatorios con persistencia dual
// localStorage + archivo JSON de respaldo (sobrevive a auth reset)
// ──────────────────────────────────────────────────────────────────

import { createLogger } from '../utils/logger.js';
import { playSystemSound } from '../audio/playback.js';

const _log = createLogger('REMID');
let _checkInterval = null;
let _backupTimer = null;
const BACKUP_INTERVAL_MS = 30000; // cada 30s respaldo a archivo

// Estructura: [{ id, text, time, created, status: 'pending'|'triggered' }]

export async function initReminderEngine() {
  if (_checkInterval) clearInterval(_checkInterval);
  
  // Intentar recuperar desde archivo si localStorage está vacío
  const raw = localStorage.getItem('jarvis_reminders');
  if (!raw || raw === '[]') {
    const recovered = await _tryRecoverFromFile();
    if (recovered && recovered.length > 0) {
      const valid = recovered.filter(r => r.status === 'pending');
      if (valid.length > 0) {
        _saveReminders(valid);
        _log('info', `Recuperados ${valid.length} recordatorios desde archivo de respaldo`);
      }
    }
  }
  
  _checkInterval = setInterval(_checkReminders, 5000);
  _backupTimer = setInterval(_backupToFile, BACKUP_INTERVAL_MS);
  _updateRemindersUI();
  _log('info', 'Motor de recordatorios inicializado');
  
  // Respaldo inicial
  _backupToFile();
}

export function addLocalReminder(text, targetDate) {
  const reminders = _getReminders();
  const newReminder = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    text,
    time: targetDate.toISOString(),
    created: new Date().toISOString(),
    status: 'pending'
  };
  
  reminders.push(newReminder);
  _saveReminders(reminders);
  _backupToFile();
  _updateRemindersUI();
  _log('info', `Recordatorio guardado: "${text}" para ${targetDate.toLocaleString()}`);
  return newReminder;
}

function _getReminders() {
  try {
    const raw = localStorage.getItem('jarvis_reminders');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function _saveReminders(arr) {
  localStorage.setItem('jarvis_reminders', JSON.stringify(arr));
}

async function _backupToFile() {
  try {
    const reminders = _getReminders();
    if (window.electronAPI?.remindersFileWrite) {
      await window.electronAPI.remindersFileWrite(reminders);
    }
  } catch (e) {
    // fail silently
  }
}

// Backup forzado síncrono (solo localStorage) + dispara backup a archivo inmediato
// Usado por forceReauth() antes de recargar la página
export function syncBackupNow() {
  const reminders = _getReminders();
  if (!reminders || reminders.length === 0) return;
  _backupToFile();
}

async function _tryRecoverFromFile() {
  try {
    if (window.electronAPI?.remindersFileRead) {
      const result = await window.electronAPI.remindersFileRead();
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        return result.data;
      }
    }
  } catch (e) {}
  return null;
}

function _checkReminders() {
  let reminders = _getReminders();
  
  // Si localStorage se vació (clear manual, etc), recuperar desde archivo
  if (!reminders || reminders.length === 0) {
    _tryRecoverFromFile().then(recovered => {
      if (recovered && recovered.length > 0) {
        const valid = recovered.filter(r => r.status === 'pending');
        if (valid.length === 0) {
          _log('info', `Archivo contiene ${recovered.length} recordatorios ya disparados, omitiendo`);
          _saveReminders([]);
          _backupToFile();
          return;
        }
        _saveReminders(valid);
        _updateRemindersUI();
        _log('info', `Recuperados ${valid.length} recordatorios desde archivo en caliente`);
      }
    });
    return;
  }
  
  const now = new Date();
  let changed = false;
  
  for (const r of reminders) {
    if (r.status === 'pending' && new Date(r.time) <= now) {
      r.status = 'triggered';
      changed = true;
      _triggerReminderAlert(r);
    }
  }
  
  if (changed) {
    _saveReminders(reminders);
    _backupToFile();
    _updateRemindersUI();
  }
}

function _triggerReminderAlert(r) {
  _log('info', `[ALERT] RECORDATORIO VENCIDO: "${r.text}"`);
  
  try { playSystemSound('ready'); } catch (e) {}
  
  _showReminderToast(r);
}

function _showReminderToast(r) {
  const panel = document.getElementById('reminders-dropdown');
  if (panel) {
    _updateRemindersUI();
    const trigger = document.getElementById('reminders-trigger');
    if (trigger) {
      trigger.classList.add('pulse-alert');
      setTimeout(() => trigger.classList.remove('pulse-alert'), 10000);
    }
  }
}

export function _updateRemindersUI() {
  const reminders = _getReminders();
  const pending = reminders.filter(r => r.status === 'pending');
  const triggered = reminders.filter(r => r.status === 'triggered');
  
  const panel = document.getElementById('reminders-panel');
  const countEl = document.getElementById('reminders-count');
  const listEl = document.getElementById('reminders-list');
  const trigger = document.getElementById('reminders-trigger');
  
  if (!panel || !countEl || !listEl) return;
  
  const totalAlerts = triggered.length;
  
  if (totalAlerts > 0) {
    panel.style.display = 'block';
    countEl.textContent = totalAlerts;
    countEl.style.display = 'inline-block';
    trigger?.classList.add('has-alerts');
  } else if (pending.length > 0) {
    panel.style.display = 'block';
    countEl.textContent = pending.length;
    countEl.style.display = 'inline-block';
    countEl.style.background = '#4ecdc4';
    trigger?.classList.remove('has-alerts');
  } else {
    panel.style.display = 'none';
    countEl.style.display = 'none';
    trigger?.classList.remove('has-alerts');
  }
  
  listEl.innerHTML = '';
  
  if (reminders.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.7rem;text-align:center;padding:10px 0;">No hay recordatorios pendientes</div>';
    return;
  }
  
  const sorted = [...reminders].sort((a, b) => {
    if (a.status === 'triggered' && b.status !== 'triggered') return -1;
    if (a.status !== 'triggered' && b.status === 'triggered') return 1;
    return new Date(a.time) - new Date(b.time);
  });
  
  // Botón "Limpiar todos" si hay triggered
  if (triggered.length > 0) {
    const clearAllBtn = document.createElement('div');
    clearAllBtn.style.cssText = `
      display:flex; gap:6px; margin-bottom:8px;
    `;
    const btn = document.createElement('button');
    btn.textContent = `✓ Limpiar ${triggered.length} completado${triggered.length > 1 ? 's' : ''}`;
    btn.style.cssText = `
      flex:1; padding:5px; border-radius:5px; border:1px solid rgba(78,205,196,0.3);
      background:rgba(78,205,196,0.08); color:#4ecdc4; font-size:0.65rem; cursor:pointer;
    `;
    btn.onclick = () => clearTriggeredReminders();
    clearAllBtn.appendChild(btn);
    listEl.appendChild(clearAllBtn);
  }
  
  sorted.forEach(r => {
    const item = document.createElement('div');
    item.className = `reminder-item ${r.status}`;
    const isTriggered = r.status === 'triggered';
    item.style.cssText = `
      padding: 8px;
      margin-bottom: 6px;
      border-radius: 6px;
      background: ${isTriggered ? 'rgba(255,107,107,0.12)' : 'rgba(255,255,255,0.03)'};
      border: 1px solid ${isTriggered ? 'rgba(255,107,107,0.25)' : 'rgba(99,179,237,0.1)'};
      font-size: 0.72rem;
      position: relative;
      opacity: ${isTriggered ? '0.85' : '1'};
    `;
    
    const dateText = new Date(r.time).toLocaleString();
    const remainingMs = new Date(r.time) - Date.now();
    let timeInfo = dateText;
    if (!isTriggered && remainingMs > 0) {
      const days = Math.floor(remainingMs / 86400000);
      const hours = Math.floor((remainingMs % 86400000) / 3600000);
      const mins = Math.floor((remainingMs % 3600000) / 60000);
      if (days > 0) timeInfo += ` (${days}d ${hours}h)`;
      else if (hours > 0) timeInfo += ` (${hours}h ${mins}m)`;
      else timeInfo += ` (${mins}m)`;
    }
    
    item.innerHTML = `
      <div style="font-weight:600;color:${isTriggered ? '#ff6b6b' : '#7ecfff'};margin-bottom:2px;">
        ${isTriggered ? '⚠️ ¡RECORDATORIO!' : '⏰ Programado'}
      </div>
      <div style="color:var(--text-color);margin-bottom:4px;word-break:break-all;">${r.text}</div>
      <div style="font-size:0.6rem;color:var(--text-dim);">${timeInfo}</div>
      <button class="reminder-delete-btn" data-id="${r.id}" style="
        position: absolute;
        top: 6px; right: 6px;
        background: none; border: none;
        color: var(--text-dim); cursor: pointer;
        font-size: 0.8rem;
        padding: 0 4px;
      ">✕</button>
    `;
    
    item.querySelector('.reminder-delete-btn').onclick = (e) => {
      e.stopPropagation();
      removeLocalReminder(r.id);
    };
    
    listEl.appendChild(item);
  });
}

export function removeLocalReminder(id) {
  const reminders = _getReminders();
  const filtered = reminders.filter(r => r.id !== id);
  _saveReminders(filtered);
  _backupToFile();
  _updateRemindersUI();
  _log('info', `Recordatorio eliminado: ${id}`);
}

export function clearTriggeredReminders() {
  const reminders = _getReminders();
  const pendingOnly = reminders.filter(r => r.status === 'pending');
  _saveReminders(pendingOnly);
  _backupToFile();
  _updateRemindersUI();
  _log('info', 'Recordatorios completados limpiados');
}
