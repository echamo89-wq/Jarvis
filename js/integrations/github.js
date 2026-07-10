import { createLogger } from '../utils/logger.js';
const _log = createLogger('GITHUB');

// Permisos y sus descripciones
const SCOPE_MAP = {
  'repo': 'Control total de repositorios privados y públicos',
  'repo:status': 'Acceso a estados de commit',
  'repo_deployment': 'Acceso a deployments',
  'public_repo': 'Acceso a repositorios públicos',
  'repo:invite': 'Gestión de invitaciones a repositorios',
  'delete_repo': 'Eliminación de repositorios',
  'admin:repo_hooks': 'Gestión de webhooks en repositorios',
  'admin:org': 'Control total de organizaciones',
  'admin:org_hook': 'Gestión de webhooks de organización',
  'user': 'Lectura y escritura del perfil de usuario',
  'user:email': 'Acceso a direcciones de email',
  'read:user': 'Lectura del perfil de usuario',
  'read:org': 'Lectura de membresías de organización',
  'gist': 'Creación de gists',
  'notifications': 'Acceso a notificaciones',
  'workflow': 'Gestión de workflows de GitHub Actions',
  'project': 'Gestión de proyectos',
  'write:packages': 'Publicación de paquetes',
  'read:packages': 'Descarga de paquetes',
  'delete:packages': 'Eliminación de paquetes'
};

// Operaciones destructivas que requieren verificación
const DESTRUCTIVE_TOOLS = {
  'github_delete_repo': { action: 'eliminar repositorio', risk: 'alta' },
  'github_create_repo': { action: 'crear repositorio', risk: 'media' },
  'github_create_issue': { action: 'crear issue', risk: 'baja' },
  'github_update_repo': { action: 'modificar repositorio', risk: 'media' }
};

async function _ghFetch(path, config, method = 'GET', body = null) {
  const url = `https://api.github.com${path}`;
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'JARVIS-Core/1.0'
  };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) {
      return { success: false, output: `GitHub API error (${res.status}): ${data.message || data}` };
    }
    return { success: true, data, headers: res.headers };
  } catch (e) {
    return { success: false, output: `Error de conexión: ${e.message}` };
  }
}

async function _detectScopes(config) {
  try {
    const r = await _ghFetch('/user', config);
    if (r.success && r.headers) {
      const scopesHeader = r.headers.get('X-OAuth-Scopes');
      if (scopesHeader) {
        const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean);
        config._scopes = scopes;
        config._scopesDetected = true;
        return scopes;
      }
    }
  } catch (e) {
    _log('warn', `No se pudieron detectar scopes: ${e.message}`);
  }
  config._scopes = [];
  config._scopesDetected = false;
  return [];
}

function _scopesAllow(config, requiredScopes) {
  if (!config._scopes || config._scopes.length === 0) return true;
  return requiredScopes.some(s => config._scopes.includes(s));
}

async function _deepSearch(path, config, minPages = 3, maxPages = 8) {
  const allItems = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await _ghFetch(`${path}${sep}per_page=100&page=${page}`, config);
    if (!r.success || !r.data) break;
    const items = Array.isArray(r.data) ? r.data : (r.data.items || []);
    if (items.length === 0) break;
    allItems.push(...items);
    if (page >= minPages && items.length < 100) break;
  }
  return allItems;
}

export const github = {
  id: 'github',
  name: 'GitHub',
  icon: '◆',
  description: 'Control total de repositorios, issues, pull requests y perfil de GitHub. Usa un Personal Access Token (PAT) con scopes repo, user.',
  guideSteps: [
    '1. Ve a GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).',
    '2. Haz clic en "Generate new token (classic)" y selecciona los scopes que necesitas (repo, user, workflow, etc.).',
    '3. Copia el token generado (empieza con ghp_) y pégalo en el campo de abajo.',
    '4. Guarda la configuración y haz clic en "Probar conexión" para verificar.'
  ],
  authUrl: 'https://github.com/settings/tokens',
  _status: 'disconnected',

  configFields: [
    { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...' }
  ],

  async testConnection(config) {
    if (!config.token || !config.token.startsWith('ghp_')) {
      return { success: false, error: 'Token inválido. Debe empezar con ghp_' };
    }
    const result = await _ghFetch('/user', config);
    if (result.success) {
      // Detectar scopes automáticamente
      await _detectScopes(config);
      return { success: true, data: result.data, scopes: config._scopes };
    }
    return { success: false, error: result.output };
  },

  async checkPermissions(config) {
    if (!config._scopesDetected) await _detectScopes(config);
    const scopes = config._scopes || [];
    const allScopes = Object.keys(SCOPE_MAP);
    return {
      available: scopes,
      missing: allScopes.filter(s => !scopes.includes(s)),
      canDelete: scopes.includes('delete_repo'),
      canWrite: scopes.includes('repo') || scopes.includes('public_repo'),
      canAdmin: scopes.includes('admin:org') || scopes.includes('admin:repo_hooks'),
      isFullAccess: scopes.includes('repo') && scopes.includes('delete_repo')
    };
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'github_get_scopes',
        description: 'REGLAS DE PERMISOS: Antes de cualquier operación en GitHub, USA ESTA HERRAMIENTA para verificar qué permisos tiene el token configurado. Detecta automáticamente los scopes del token (repo, delete_repo, admin:org, user, workflow, etc.) y te dice si puedes ejecutar la operación solicitada. DEBES usarla antes de eliminar, modificar o crear cualquier recurso en GitHub.',
        parameters: { type: 'object', properties: {}, required: []
      }},
      {
        name: 'github_get_user',
        description: 'Obtiene información detallada del perfil del usuario autenticado: login, nombre, email, bio, empresa, ubicación, repos públicos/privados, seguidores, siguiendo, fecha de creación, URL del perfil.',
        parameters: { type: 'object', properties: {}, required: []
      }},
      {
        name: 'github_list_repos',
        description: 'INVESTIGACIÓN PROFUNDA: Lista TODOS los repositorios del usuario autenticado con búsqueda multi-página automática. Devuelve nombre, visibilidad (público/privado), estrellas, forks, lenguaje, descripción. Opcional: filtrar por tipo (all, owner, public, private, member) y ordenar.',
        parameters: { type: 'object', properties: {
          type: { type: 'string', enum: ['all', 'owner', 'public', 'private', 'member'], description: 'Tipo de repos (default: owner)' },
          sort: { type: 'string', enum: ['created', 'updated', 'pushed', 'full_name'], description: 'Orden (default: created)' },
          deep: { type: 'boolean', description: 'true = investigación exhaustiva multi-página (tarda 6-9s), false = solo primera página (default: true)' }
        }, required: [] }
      },
      {
        name: 'github_search_repos',
        description: 'INVESTIGACIÓN PROFUNDA: Busca repositorios públicos en GitHub por query con análisis multi-página. Devuelve nombre completo, descripción, estrellas, forks, lenguaje, URL. Para búsquedas importantes, realiza hasta 3 páginas automáticamente.',
        parameters: { type: 'object', properties: {
          query: { type: 'string', description: 'Término de búsqueda detallado (ej: "machine learning python tensorflow")' },
          deep: { type: 'boolean', description: 'true = investigación exhaustiva multi-página (tarda 6-9s), false = solo mejores resultados (default: true)' }
        }, required: ['query'] }
      },
      {
        name: 'github_get_repo',
        description: 'Obtiene detalles COMPLETOS de un repositorio específico: descripción, estrellas, forks, issues abiertos, lenguaje, fecha creación, última actualización, licencia, homepage, topics.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo (usuario u organización)' },
          repo: { type: 'string', description: 'Nombre del repositorio' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_create_issue',
        description: '[MODIFICACIÓN] Crea un issue en un repositorio. Requiere permisos de escritura. Antes de llamar esta herramienta, DEBES verificar scopes con github_get_scopes y CONFIRMAR con el usuario.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' },
          title: { type: 'string', description: 'Título del issue' },
          body: { type: 'string', description: 'Cuerpo/descripción del issue (markdown)' },
          labels: { type: 'string', description: 'Labels separados por coma (ej: "bug,urgente")' }
        }, required: ['owner', 'repo', 'title'] }
      },
      {
        name: 'github_list_issues',
        description: 'Lista issues de un repositorio con filtros. Devuelve número, título, estado, autor, labels.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Estado (default: open)' },
          labels: { type: 'string', description: 'Filtrar por labels separados por coma' },
          per_page: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_list_pull_requests',
        description: 'Lista pull requests de un repositorio. Devuelve número, título, estado, autor, ramas base/head.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Estado (default: open)' },
          per_page: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_create_repo',
        description: '[MODIFICACIÓN - RIESGO MEDIO] Crea un nuevo repositorio en GitHub. Antes de llamar esta herramienta, DEBES verificar scopes con github_get_scopes y CONFIRMAR con el usuario el nombre y visibilidad.',
        parameters: { type: 'object', properties: {
          name: { type: 'string', description: 'Nombre del repositorio (único para el usuario)' },
          description: { type: 'string', description: 'Descripción del repositorio' },
          private: { type: 'boolean', description: 'true = privado, false = público (default: false)' },
          auto_init: { type: 'boolean', description: 'Inicializar con README (default: true)' }
        }, required: ['name'] }
      },
      {
        name: 'github_get_readme',
        description: 'Obtiene el contenido completo del README.md de un repositorio (hasta 2000 caracteres).',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_search_code',
        description: 'INVESTIGACIÓN PROFUNDA: Busca código en repositorios de GitHub por query con múltiples páginas de resultados. Devuelve archivo, repositorio, URL.',
        parameters: { type: 'object', properties: {
          query: { type: 'string', description: 'Término de búsqueda (ej: "function calculateTotal language:javascript")' },
          deep: { type: 'boolean', description: 'true = investigación exhaustiva multi-página (tarda 6-9s), false = solo mejores resultados (default: true)' }
        }, required: ['query'] }
      },
      {
        name: 'github_delete_repo',
        description: '[DESTRUCTIVO - RIESGO ALTO] ELIMINA PERMANENTEMENTE un repositorio de GitHub. REQUIERE verificación: Antes de llamar esta herramienta, DEBES: 1) Verificar scopes con github_get_scopes (necesita scope delete_repo), 2) PREGUNTAR al usuario "¿Estás seguro de eliminar el repositorio [owner/repo]? Esta acción es irreversible.", 3) SOLO ejecutar si el usuario CONFIRMA explícitamente.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio a ELIMINAR' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_update_repo',
        description: '[MODIFICACIÓN - RIESGO MEDIO] Actualiza la configuración de un repositorio existente (nombre, descripción, visibilidad pública/privada, homepage, topics, etc.). REQUIERE verificación con el usuario antes de ejecutar.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre actual del repositorio' },
          name: { type: 'string', description: 'Nuevo nombre del repositorio (renombrar)' },
          description: { type: 'string', description: 'Nueva descripción' },
          private: { type: 'boolean', description: 'true = hacer privado, false = hacer público' },
          homepage: { type: 'string', description: 'Nueva URL de homepage' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_get_orgs',
        description: 'INVESTIGACIÓN COMPLETA: Lista TODAS las organizaciones a las que pertenece el usuario autenticado. Devuelve login, descripción, email, ubicación, repos públicos, seguidores, URL. Incluye búsqueda multi-página automática.',
        parameters: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'github_get_repo_contents',
        description: 'INVESTIGACIÓN: Lista el contenido de un directorio en un repositorio (archivos y subdirectorios). Devuelve nombre, tipo (file/dir), tamaño, URL de descarga. Sin parámetro path, muestra la raíz.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' },
          path: { type: 'string', description: 'Ruta del directorio (default: raíz del repo)' },
          ref: { type: 'string', description: 'Rama o tag (default: rama default)' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_get_repo_commits',
        description: 'INVESTIGACIÓN: Lista los commits recientes de un repositorio. Devuelve SHA, autor, fecha, mensaje del commit. Ideal para ver actividad reciente del proyecto.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' },
          branch: { type: 'string', description: 'Rama específica (default: rama default)' },
          per_page: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_get_repo_contributors',
        description: 'INVESTIGACIÓN: Lista los contribuidores de un repositorio ordenados por número de contribuciones. Devuelve login, contribuciones, tipo (User/Bot), URL del perfil.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' },
          per_page: { type: 'integer', description: 'Máx resultados (default: 10, max: 50)' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_get_user_events',
        description: 'INVESTIGACIÓN: Obtiene la actividad reciente del usuario autenticado en GitHub. Devuelve tipo de evento (Push, Create, Issues, PR, Star, Fork, etc.), repositorio, fecha, y detalles del evento.',
        parameters: { type: 'object', properties: {
          per_page: { type: 'integer', description: 'Máx resultados (default: 10, max: 30)' }
        }, required: [] }
      },
      {
        name: 'github_get_repo_branches',
        description: 'INVESTIGACIÓN: Lista todas las ramas de un repositorio. Devuelve nombre de rama, SHA del commit más reciente, y si es la rama protegida/default.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' }
        }, required: ['owner', 'repo'] }
      },
      {
        name: 'github_get_repo_languages',
        description: 'INVESTIGACIÓN: Obtiene el desglose de lenguajes de programación de un repositorio con porcentajes. Devuelve los lenguajes y los bytes de código de cada uno.',
        parameters: { type: 'object', properties: {
          owner: { type: 'string', description: 'Dueño del repo' },
          repo: { type: 'string', description: 'Nombre del repositorio' }
        }, required: ['owner', 'repo'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    switch (name) {
      case 'github_get_scopes': {
        const perms = await this.checkPermissions(config);
        if (!config._scopesDetected) {
          return { success: true, output: 'No se pudieron detectar los scopes del token. Verifica que el token sea válido.' };
        }
        let out = '=== PERMISOS DETECTADOS DEL TOKEN ===\n';
        if (perms.available.length > 0) {
          out += `\n✅ Permisos activos (${perms.available.length}):\n`;
          for (const s of perms.available) {
            out += `  • ${s}: ${SCOPE_MAP[s] || 'Permiso desconocido'}\n`;
          }
        } else {
          out += '\n⚠️  No se detectaron scopes específicos (token de acceso público solamente)\n';
        }
        out += `\nCapacidades derivadas:\n`;
        out += `  ${perms.canDelete ? '✅' : '❌'} Eliminar repositorios\n`;
        out += `  ${perms.canWrite ? '✅' : '❌'} Escribir en repositorios\n`;
        out += `  ${perms.canAdmin ? '✅' : '❌'} Administrar organización\n`;
        out += `  ${perms.isFullAccess ? '✅' : '❌'} Acceso completo\n`;
        if (perms.missing.length > 0) {
          out += `\n❌ Permisos NO disponibles (${perms.missing.length}):\n`;
          for (const s of perms.missing.slice(0, 10)) {
            out += `  • ${s}: ${SCOPE_MAP[s] || 'Permiso desconocido'}\n`;
          }
          if (perms.missing.length > 10) out += `  ... y ${perms.missing.length - 10} más\n`;
        }
        return { success: true, output: out };
      }

      case 'github_get_user': {
        const r = await _ghFetch('/user', config);
        if (!r.success) return r;
        const u = r.data;
        return { success: true, output: `=== PERFIL DE GITHUB ===\nUsuario: ${u.login}\nNombre: ${u.name || 'No establecido'}\nEmail: ${u.email || 'No público'}\nRepos públicos: ${u.public_repos}\nRepos privados: ${u.total_private_repos || 'N/A'}\nSeguidores: ${u.followers}\nSiguiendo: ${u.following}\nBio: ${u.bio || 'Vacía'}\nEmpresa: ${u.company || 'N/A'}\nUbicación: ${u.location || 'N/A'}\nCuenta creada: ${u.created_at}\nURL: ${u.html_url}` };
      }

      case 'github_list_repos': {
        const type = args.type || 'owner';
        const sort = args.sort || 'created';
        const deep = args.deep !== false;
        let repos;
        if (deep) {
          repos = await _deepSearch(`/user/repos?type=${type}&sort=${sort}`, config, 3, 8);
        } else {
          const r = await _ghFetch(`/user/repos?type=${type}&sort=${sort}&per_page=30`, config);
          if (!r.success) return r;
          repos = r.data || [];
        }
        if (repos.length === 0) return { success: true, output: 'No hay repositorios.' };
        const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);
        const totalForks = repos.reduce((s, r) => s + r.forks_count, 0);
        const languages = [...new Set(repos.map(r => r.language).filter(Boolean))];
        const privCount = repos.filter(r => r.private).length;
        const pubCount = repos.filter(r => !r.private).length;
        let out = `=== REPOSITORIOS (${repos.length}) ===\n📊 ${pubCount} públicos, ${privCount} privados\n⭐ ${totalStars} estrellas totales, 🍴 ${totalForks} forks totales\n`;
        if (languages.length > 0) out += `📌 Lenguajes: ${languages.join(', ')}\n`;
        out += '\n';
        const lines = repos.map(r =>
          `${r.private ? '🔒' : '📂'} ${r.full_name} ⭐${r.stargazers_count} 🍴${r.forks_count} ${r.language || ''} — ${r.description || 'Sin descripción'}`
        );
        out += lines.join('\n');
        return { success: true, output: out };
      }

      case 'github_search_repos': {
        const deep = args.deep !== false;
        const maxPages = deep ? 4 : 1;
        const allItems = await _deepSearch(`/search/repositories?q=${encodeURIComponent(args.query)}&sort=stars`, config, 2, maxPages);
        if (allItems.length === 0) return { success: true, output: 'Sin resultados.' };
        const totalStars = allItems.reduce((s, i) => s + i.stargazers_count, 0);
        const languages = [...new Set(allItems.map(i => i.language).filter(Boolean))];
        let out = `=== RESULTADOS PARA "${args.query}" (${allItems.length} repositorios) ===\n⭐ ${totalStars} estrellas combinadas\n`;
        if (languages.length > 0) out += `📌 Lenguajes: ${languages.join(', ')}\n`;
        out += '\n';
        const lines = allItems.slice(0, 20).map(i =>
          `📦 ${i.full_name} ⭐${i.stargazers_count} 🍴${i.forks_count} ${i.language || ''}\n   ${i.description || 'Sin descripción'}\n   ${i.html_url}`
        );
        out += lines.join('\n\n');
        if (allItems.length > 20) out += `\n\n... y ${allItems.length - 20} resultados más`;
        return { success: true, output: out };
      }

      case 'github_get_repo': {
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}`, config);
        if (!r.success) return r;
        const d = r.data;
        const topics = d.topics?.length > 0 ? `🏷️ Topics: ${d.topics.join(', ')}` : '';
        return { success: true, output: `📦 ${d.full_name}\nDescripción: ${d.description || 'N/A'}\n⭐ Estrellas: ${d.stargazers_count}\n🍴 Forks: ${d.forks_count}\n⚠️ Issues abiertos: ${d.open_issues_count}\n📊 Lenguaje principal: ${d.language || 'N/A'}\n📝 Licencia: ${d.license?.spdx_id || 'N/A'}\n📅 Creado: ${d.created_at}\n🔄 Último push: ${d.pushed_at}\n🌐 ${d.html_url}\n${d.homepage ? '🏠 ' + d.homepage : ''}\n${topics}\n📁 Rama default: ${d.default_branch}\n${d.archived ? '🗄️ ARCHIVADO' : ''}${d.disabled ? '🚫 DESHABILITADO' : ''}${d.fork ? '🔀 ES UN FORK' : ''}` };
      }

      case 'github_create_issue': {
        const body = { title: args.title };
        if (args.body) body.body = args.body;
        if (args.labels) body.labels = args.labels.split(',').map(l => l.trim());
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}/issues`, config, 'POST', body);
        if (!r.success) return r;
        return { success: true, output: `✅ Issue #${r.data.number} creado en ${args.owner}/${args.repo}\n📋 Título: ${r.data.title}\n🔗 ${r.data.html_url}` };
      }

      case 'github_list_issues': {
        let url = `/repos/${args.owner}/${args.repo}/issues?state=${args.state || 'open'}&per_page=${Math.min(args.per_page || 10, 50)}&sort=created&direction=desc`;
        if (args.labels) url += `&labels=${encodeURIComponent(args.labels)}`;
        const r = await _ghFetch(url, config);
        if (!r.success) return r;
        const items = r.data || [];
        if (items.length === 0) return { success: true, output: 'Sin issues.' };
        const openCount = items.filter(i => i.state === 'open').length;
        const closedCount = items.filter(i => i.state === 'closed').length;
        let out = `=== Issues de ${args.owner}/${args.repo} (${items.length}) ===\n🟢 ${openCount} abiertos | 🔴 ${closedCount} cerrados\n\n`;
        const lines = items.map(i =>
          `${i.state === 'open' ? '🟢' : '🔴'} #${i.number} ${i.title}\n   👤 ${i.user?.login}${i.labels?.length ? ' 🏷️ ' + i.labels.map(l => l.name).join(', ') : ''}`
        );
        out += lines.join('\n\n');
        return { success: true, output: out };
      }

      case 'github_list_pull_requests': {
        const per = Math.min(args.per_page || 10, 50);
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}/pulls?state=${args.state || 'open'}&per_page=${per}&sort=created&direction=desc`, config);
        if (!r.success) return r;
        const items = r.data || [];
        if (items.length === 0) return { success: true, output: 'Sin pull requests.' };
        let out = `=== Pull Requests de ${args.owner}/${args.repo} (${items.length}) ===\n\n`;
        const lines = items.map(pr =>
          `${pr.state === 'open' ? '🟢' : '🔵'} #${pr.number} ${pr.title}\n   👤 ${pr.user?.login} → ${pr.base?.ref} ← ${pr.head?.ref}`
        );
        out += lines.join('\n\n');
        return { success: true, output: out };
      }

      case 'github_create_repo': {
        const body = {
          name: args.name,
          description: args.description || '',
          private: args.private || false,
          auto_init: args.auto_init !== false
        };
        const r = await _ghFetch('/user/repos', config, 'POST', body);
        if (!r.success) return r;
        return { success: true, output: `✅ Repositorio creado: ${r.data.full_name}\n🔗 ${r.data.html_url}${r.data.private ? '\n🔒 Privado' : '\n📂 Público'}` };
      }

      case 'github_get_readme': {
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}/readme`, config);
        if (!r.success) return r;
        const content = atob(r.data.content);
        const preview = content.length > 2000 ? content.substring(0, 2000) + '\n... [truncado]' : content;
        return { success: true, output: `README.md de ${args.owner}/${args.repo}:\n\n${preview}` };
      }

      case 'github_search_code': {
        const deep = args.deep !== false;
        const maxPages = deep ? 3 : 1;
        let allItems = [];
        for (let page = 1; page <= maxPages; page++) {
          const r = await _ghFetch(`/search/code?q=${encodeURIComponent(args.query)}&per_page=50&page=${page}`, config);
          if (!r.success || !r.data?.items) break;
          allItems.push(...r.data.items);
          if (r.data.items.length < 50) break;
        }
        if (allItems.length === 0) return { success: true, output: 'Sin resultados de código.' };
        const repos = [...new Set(allItems.map(i => i.repository.full_name))];
        let out = `=== CÓDIGO ENCONTRADO (${allItems.length} archivos en ${repos.length} repositorios) ===\n\n`;
        // Agrupar por repositorio
        const grouped = {};
        for (const item of allItems) {
          if (!grouped[item.repository.full_name]) grouped[item.repository.full_name] = [];
          grouped[item.repository.full_name].push(item);
        }
        for (const [repoName, files] of Object.entries(grouped)) {
          out += `📦 ${repoName} (${files.length} archivos):\n`;
          for (const f of files.slice(0, 5)) {
            out += `   📄 ${f.path}\n`;
          }
          if (files.length > 5) out += `   ... y ${files.length - 5} más\n`;
          out += '\n';
        }
        return { success: true, output: out };
      }

      case 'github_delete_repo': {
        const perms = await this.checkPermissions(config);
        if (!perms.canDelete) {
          return { success: false, output: 'ERROR DE PERMISOS: El token no tiene el scope "delete_repo" necesario para eliminar repositorios. Scopes actuales: ' + (perms.available.join(', ') || 'ninguno') };
        }
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}`, config, 'DELETE');
        if (!r.success) return r;
        return { success: true, output: `🗑️ Repositorio ${args.owner}/${args.repo} ELIMINADO permanentemente.` };
      }

      case 'github_update_repo': {
        const body = {};
        if (args.name) body.name = args.name;
        if (args.description !== undefined) body.description = args.description;
        if (args.private !== undefined) body.private = args.private;
        if (args.homepage !== undefined) body.homepage = args.homepage;
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}`, config, 'PATCH', body);
        if (!r.success) return r;
        const changes = Object.keys(body).map(k => `${k}: ${body[k]}`).join(', ');
        return { success: true, output: `✅ Repositorio ${args.owner}/${args.repo} actualizado.\nCambios: ${changes}\n🔗 ${r.data.html_url}` };
      }

      case 'github_get_orgs': {
        const orgs = await _deepSearch('/user/orgs', config, 2, 5);
        if (orgs.length === 0) return { success: true, output: 'No perteneces a ninguna organización.' };
        let out = `=== ORGANIZACIONES (${orgs.length}) ===\n\n`;
        const lines = orgs.map(o => {
          let s = `🏢 ${o.login}\n   ${o.description || 'Sin descripción'}`;
          if (o.location) s += `\n   📍 ${o.location}`;
          if (o.email) s += `\n   📧 ${o.email}`;
          s += `\n   📦 Repos públicos: ${o.public_repos || 0}`;
          s += `\n   👥 Seguidores: ${o.followers || 0}`;
          s += `\n   🔗 ${o.html_url || `https://github.com/${o.login}`}`;
          return s;
        });
        out += lines.join('\n\n---\n\n');
        return { success: true, output: out };
      }

      case 'github_get_repo_contents': {
        let url = `/repos/${args.owner}/${args.repo}/contents`;
        if (args.path) url += `/${encodeURIComponent(args.path)}`;
        if (args.ref) url += `?ref=${encodeURIComponent(args.ref)}`;
        const r = await _ghFetch(url, config);
        if (!r.success) return r;
        const items = Array.isArray(r.data) ? r.data : [r.data];
        if (items.length === 0) return { success: true, output: 'Directorio vacío.' };
        let out = `=== 📁 ${args.path || 'raíz'} de ${args.owner}/${args.repo} (${items.length} items) ===\n\n`;
        const dirs = items.filter(i => i.type === 'dir');
        const files = items.filter(i => i.type === 'file');
        if (dirs.length > 0) {
          out += '📁 Directorios:\n';
          for (const d of dirs) out += `  📂 ${d.name}\n`;
          out += '\n';
        }
        if (files.length > 0) {
          out += '📄 Archivos:\n';
          for (const f of files) out += `  📄 ${f.name} (${(f.size / 1024).toFixed(1)} KB)\n`;
          out += '\n';
        }
        const others = items.filter(i => i.type !== 'dir' && i.type !== 'file');
        if (others.length > 0) {
          out += '🔗 Otros:\n';
          for (const o of others) out += `  🔗 ${o.name} (${o.type})\n`;
        }
        return { success: true, output: out };
      }

      case 'github_get_repo_commits': {
        const per = Math.min(args.per_page || 10, 50);
        let url = `/repos/${args.owner}/${args.repo}/commits?per_page=${per}`;
        if (args.branch) url += `&sha=${encodeURIComponent(args.branch)}`;
        const r = await _ghFetch(url, config);
        if (!r.success) return r;
        const commits = r.data || [];
        if (commits.length === 0) return { success: true, output: 'Sin commits.' };
        let out = `=== Commits recientes de ${args.owner}/${args.repo} (${commits.length}) ===\n\n`;
        for (const c of commits) {
          const sha = c.sha.substring(0, 7);
          const msg = (c.commit.message || '').split('\n')[0];
          const author = c.commit.author?.name || c.author?.login || 'Desconocido';
          const date = c.commit.author?.date ? new Date(c.commit.author.date).toLocaleDateString('es-MX') : '';
          out += `🔹 [${sha}] ${msg}\n   👤 ${author} 📅 ${date}\n\n`;
        }
        return { success: true, output: out };
      }

      case 'github_get_repo_contributors': {
        const per = Math.min(args.per_page || 10, 50);
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}/contributors?per_page=${per}`, config);
        if (!r.success) return r;
        const contribs = r.data || [];
        if (contribs.length === 0) return { success: true, output: 'Sin contribuidores.' };
        const total = contribs.reduce((s, c) => s + c.contributions, 0);
        let out = `=== Contribuidores de ${args.owner}/${args.repo} (${contribs.length}, ${total} contribuciones) ===\n\n`;
        for (const c of contribs) {
          out += `👤 ${c.login} — ${c.contributions} contribuciones\n`;
          if (c.type === 'Bot') out += '   🤖 Bot\n';
          out += `   🔗 ${c.html_url}\n\n`;
        }
        return { success: true, output: out };
      }

      case 'github_get_user_events': {
        const per = Math.min(args.per_page || 10, 30);
        const userResult = await _ghFetch('/user', config);
        if (!userResult.success) return { success: false, output: 'No se pudo obtener el usuario autenticado.' };
        const username = userResult.data.login;
        const r = await _ghFetch(`/users/${username}/events?per_page=${per}`, config);
        if (!r.success) return r;
        const events = r.data || [];
        if (events.length === 0) return { success: true, output: 'Sin actividad reciente.' };
        const EVENT_ICONS = {
          'PushEvent': '📤', 'CreateEvent': '➕', 'DeleteEvent': '🗑️',
          'IssuesEvent': '⚠️', 'IssueCommentEvent': '💬', 'PullRequestEvent': '🔀',
          'PullRequestReviewEvent': '👁️', 'PullRequestReviewCommentEvent': '💬',
          'WatchEvent': '⭐', 'ForkEvent': '🔱', 'ReleaseEvent': '📦',
          'MemberEvent': '👤', 'PublicEvent': '🌍', 'SponsorshipEvent': '❤️'
        };
        let out = `=== Actividad reciente de GitHub (${events.length} eventos) ===\n\n`;
        for (const e of events) {
          const icon = EVENT_ICONS[e.type] || '🔔';
          const repo = e.repo?.name || 'desconocido';
          const date = e.created_at ? new Date(e.created_at).toLocaleString('es-MX') : '';
          out += `${icon} ${e.type.replace('Event', '')}\n   📦 ${repo}\n   📅 ${date}\n`;
          if (e.payload?.action) out += `   🔄 ${e.payload.action}\n`;
          if (e.payload?.commits?.length) out += `   📝 ${e.payload.commits.length} commit(s)\n`;
          out += '\n';
        }
        return { success: true, output: out };
      }

      case 'github_get_repo_branches': {
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}/branches?per_page=100`, config);
        if (!r.success) return r;
        const branches = r.data || [];
        if (branches.length === 0) return { success: true, output: 'Sin ramas.' };
        let out = `=== Ramas de ${args.owner}/${args.repo} (${branches.length}) ===\n\n`;
        for (const b of branches) {
          const isDefault = b.name === 'main' || b.name === 'master';
          out += `🌿 ${b.name}${isDefault ? ' (⭐ default)' : ''}\n   📌 SHA: ${b.commit.sha.substring(0, 7)}\n\n`;
        }
        return { success: true, output: out };
      }

      case 'github_get_repo_languages': {
        const r = await _ghFetch(`/repos/${args.owner}/${args.repo}/languages`, config);
        if (!r.success) return r;
        const langs = r.data || {};
        const entries = Object.entries(langs);
        if (entries.length === 0) return { success: true, output: 'Sin lenguajes detectados.' };
        const total = entries.reduce((s, [, v]) => s + v, 0);
        let out = `=== Lenguajes de ${args.owner}/${args.repo} ===\n\n`;
        entries.sort((a, b) => b[1] - a[1]);
        const LANG_ICONS = {
          'JavaScript': '🟨', 'TypeScript': '🔵', 'Python': '🐍', 'Java': '☕',
          'Go': '🔷', 'Rust': '🦀', 'C': '⚙️', 'C++': '⚡', 'C#': '💜',
          'Ruby': '💎', 'PHP': '🐘', 'HTML': '🌐', 'CSS': '🎨', 'Swift': '🍎',
          'Kotlin': '🟣', 'Dart': '🎯', 'Shell': '🐚', 'PowerShell': '💻',
          'Lua': '🌙', 'R': '📊', 'Scala': '🔴', 'Perl': '🐪'
        };
        for (const [lang, bytes] of entries) {
          const pct = ((bytes / total) * 100).toFixed(1);
          const icon = LANG_ICONS[lang] || '📄';
          const barLen = Math.max(1, Math.round(pct / 5));
          const bar = '█'.repeat(barLen) + '░'.repeat(Math.max(0, 20 - barLen));
          out += `${icon} ${lang}: ${bar} ${pct}% (${(bytes / 1024).toFixed(0)} KB)\n`;
        }
        return { success: true, output: out };
      }

      default:
        return { success: false, output: `Herramienta GitHub "${name}" no implementada.` };
    }
  }
};
