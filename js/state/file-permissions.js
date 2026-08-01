const PERMISSION_KEY = 'jarvis_file_permissions';

function _getPerms() {
  const raw = localStorage.getItem(PERMISSION_KEY);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function _savePerms(perms) {
  localStorage.setItem(PERMISSION_KEY, JSON.stringify(perms));
}

export function isPathAllowed(path) {
  if (!path) return false;
  const perms = _getPerms();
  const normalized = path.toLowerCase().replace(/\\/g, '/');
  for (const allowed of Object.keys(perms)) {
    if (normalized.startsWith(allowed)) return true;
  }
  return false;
}

export function grantFullAccess(path) {
  const perms = _getPerms();
  const normalized = path.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
  perms[normalized] = 'full';
  _savePerms(perms);
}

export function grantOnce(path) {
  const perms = _getPerms();
  const normalized = path.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
  perms[normalized] = 'once';
  _savePerms(perms);
}

export function consumeOnce(path) {
  const perms = _getPerms();
  const normalized = path.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
  if (perms[normalized] === 'once') {
    delete perms[normalized];
    _savePerms(perms);
  }
}

export function revokeAll() {
  _savePerms({});
}

export function getPermissionPaths() {
  return Object.keys(_getPerms());
}
