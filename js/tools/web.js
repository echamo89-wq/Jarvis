import { createLogger } from '../utils/logger.js';
const _log = createLogger('WEB');

const DEFAULT_FETCH_TIMEOUT = 10000;

async function _fetch(url, raw = true, timeoutMs = DEFAULT_FETCH_TIMEOUT) {
  if (!url) return null;

  const fetchPromise = window.electronAPI.fetchUrl(url, raw);
  const timeoutPromise = new Promise((resolve) => {
    const id = setTimeout(() => resolve({ success: false, output: 'Fetch timeout' }), timeoutMs);
    fetchPromise.then(() => clearTimeout(id)).catch(() => clearTimeout(id));
  });

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    if (result && result.success) return result.output;
    return null;
  } catch {
    return null;
  }
}

function _buildSearchResult(summary, source, details = []) {
  const parts = [];
  if (summary) parts.push(summary);
  if (source) parts.push(`Fuente: ${source}`);
  if (details.length) parts.push(...details);
  return { success: true, output: parts.join('\n\n') };
}

async function _searchWikipedia(query) {
  const isSpanish = /[áéíóúñü¿¡]/i.test(query);
  const wikiLang = isSpanish ? 'es' : 'en';
  const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=5&srqiprofile=popular_increasing`;
  const json = await _fetch(url, true, DEFAULT_FETCH_TIMEOUT);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    const results = parsed?.query?.search || [];
    if (!results.length) return null;
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const filtered = results.filter(r => !keywords.length || keywords.some(k => r.title.toLowerCase().includes(k)));
    const lines = filtered.slice(0, 3).map(r => `• ${r.title}: ${r.snippet.replace(/<[^>]+>/g, '').trim()}`);
    if (lines.length) return `Wikipedia:\n${lines.join('\n')}`;
  } catch {
    return null;
  }
  return null;
}

export async function searchWeb(query, engine) {
  query = (query || '').trim();
  engine = (engine || 'duckduckgo').toLowerCase();
  if (!query) return { success: false, output: 'No se especificó una consulta de búsqueda.' };

  try {
    _log('info', `Internal search: ${engine} → "${query}"`);

    if (engine === 'youtube') {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        success: true,
        output: `Resultados de YouTube para "${query}". Abre el navegador con:\n${searchUrl}`
      };
    }

    if (engine === 'wikipedia') {
      const wikiOutput = await _searchWikipedia(query);
      if (wikiOutput) return { success: true, output: wikiOutput };
      const wikiLang = /[áéíóúñü¿¡]/i.test(query) ? 'es' : 'en';
      const wikiSearchUrl = `https://${wikiLang}.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`;
      return {
        success: true,
        output: `No se encontraron artículos relevantes en Wikipedia para "${query}". Abre el navegador con:\n${wikiSearchUrl}`
      };
    }

    const ddgJson = await _fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, true, DEFAULT_FETCH_TIMEOUT);
    if (ddgJson) {
      try {
        const data = JSON.parse(ddgJson);
        const parts = [];
        if (data.AbstractText) parts.push(`Resumen: ${data.AbstractText}`);
        if (data.AbstractSource) parts.push(`Fuente: ${data.AbstractSource}`);
        if (Array.isArray(data.RelatedTopics) && data.RelatedTopics.length) {
          const related = data.RelatedTopics.filter(t => t.Text).slice(0, 5).map(t => `• ${t.Text}`);
          if (related.length) parts.push(`Temas relacionados:\n${related.join('\n')}`);
        }
        if (data.Infobox?.content) {
          const info = data.Infobox.content.filter(i => i.label && i.value).map(i => `${i.label}: ${Array.isArray(i.value) ? i.value.map(v => v.text || v).join(', ') : i.value.text || i.value}`).join('\n');
          if (info) parts.push(info);
        }
        if (parts.length > 0) {
          return { success: true, output: `🔍 Investigación para "${query}":\n${parts.join('\n')}` };
        }
      } catch (err) {
        _log('warn', `DuckDuckGo parse failed: ${err.message}`);
      }
    }

    const wikiOutput = await _searchWikipedia(query);
    if (wikiOutput) return { success: true, output: wikiOutput };

    return {
      success: true,
      output: `No se encontró un resultado directo para "${query}". Usa el navegador:\nhttps://duckduckgo.com/?q=${encodeURIComponent(query)}`
    };
  } catch (err) {
    _log('error', `searchWeb error: ${err.message}`);
    return { success: false, output: `Error en búsqueda: ${err.message}` };
  }
}

export async function openBrowser(url) {
  let targetUrl = (url || '').trim();
  if (!targetUrl) return { success: false, output: 'No se especificó una URL para abrir.' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(targetUrl)) {
    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    } else {
      targetUrl = 'https://' + targetUrl;
    }
  }
  const res = await window.electronAPI.openBrowser(targetUrl);
  return { success: res.success, output: res.output || '' };
}

export async function fetchUrlContent(url) {
  try {
    _log('info', `Fetching URL: ${url}`);
    const result = await window.electronAPI.fetchUrl(url);
    if (result.success) return { success: true, output: `Contenido de ${url}:\n${result.output}` };
    return { success: false, output: `Error al obtener ${url}: ${result.output}` };
  } catch (e) {
    return { success: false, output: `Error al obtener URL: ${e.message}` };
  }
}
