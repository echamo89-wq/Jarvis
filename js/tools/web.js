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

async function _googleSearch(query) {
  const apiKey = localStorage.getItem('jarvis_google_api_key') || '';
  const cx = localStorage.getItem('jarvis_google_cx') || '';
  if (!apiKey || !cx) return null;
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&lr=lang_es&num=7`;
    const json = await _fetch(url, true, 12000);
    if (!json) return null;
    const data = JSON.parse(json);
    const items = data.items || [];
    if (!items.length) return null;
    const lines = items.slice(0, 7).map(i => `• ${i.title}\n  ${i.snippet.replace(/\s+/g, ' ').trim()}\n  ${i.link}`);
    return lines.join('\n\n');
  } catch (e) {
    _log('warn', `Google search failed: ${e.message}`);
    return null;
  }
}

async function _searchWikipedia(query) {
  const isSpanish = /[áéíóúñü¿¡]/i.test(query);
  const wikiLang = isSpanish ? 'es' : 'en';
  const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=5`;
  const json = await _fetch(url, true, DEFAULT_FETCH_TIMEOUT);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    const results = parsed?.query?.search || [];
    if (!results.length) return null;
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    const filtered = results.filter(r => !keywords.length || keywords.some(k => r.title.toLowerCase().includes(k)));
    const lines = filtered.slice(0, 3).map(r => {
      const snip = r.snippet.replace(/<[^>]+>/g, '').trim();
      const link = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`;
      return `• ${r.title}\n  ${snip}\n  ${link}`;
    });
    if (lines.length) return lines.join('\n\n');
  } catch {
    return null;
  }
  return null;
}

// ── DuckDuckGo HTML (búsqueda web real, sin API key) ─────────────────────
async function _scrapeDDGHtml(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=es-es`;
  const html = await _fetch(url, true, 15000);
  if (!html) return null;
  try {
    const anchors = html.match(/<a[^>]*class="result__a"[^>]*>[\s\S]*?<\/a>/gi) || [];
    const snippets = html.match(/<a[^>]*class="result__snippet"[^>]*>[\s\S]*?<\/a>/gi) || [];
    if (!anchors.length) return null;
    const lines = [];
    anchors.slice(0, 7).forEach((a, i) => {
      const title = a.replace(/<[^>]+>/g, '').trim();
      if (!title) return;
      let link = '';
      try {
        const href = (a.match(/href="([^"]*)"/i) || [])[1] || '';
        if (href.includes('uddg=')) {
          link = new URL(href, 'https://html.duckduckgo.com').searchParams.get('uddg') || '';
        } else {
          link = href.replace(/^\/\//, 'https://');
        }
      } catch (_) {}
      if (!link || !/^https?:\/\//i.test(link)) return;
      const snip = (snippets[i] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
      lines.push(`• ${title}\n  ${snip}\n  ${link}`);
    });
    if (!lines.length) return null;
    return lines.join('\n\n');
  } catch (e) {
    _log('warn', `DDG scrape error: ${e.message}`);
    return null;
  }
}

// ── Google News RSS (noticias recientes, sin API key) ─────────────────────
async function _googleNewsRss(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es&gl=MX&ceid=MX:es`;
  const xml = await _fetch(url, true, DEFAULT_FETCH_TIMEOUT);
  if (!xml) return null;
  try {
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    if (!items.length) return null;
    const _clean = (s = '') => s.replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = items.slice(0, 7).map(itemXml => {
      const title = _clean((itemXml.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
      const link = ((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
      const date = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
      const desc = _clean((itemXml.match(/<description>([\s\S]*?)<\/description>/) || [])[1]).substring(0, 200);
      if (!title || !link) return null;
      const dateStr = date ? ` (${date.split(' ').slice(1, 3).join(' ')})` : '';
      return `• ${title}${dateStr}\n  ${desc}\n  ${link}`;
    }).filter(Boolean);
    if (!lines.length) return null;
    return lines.join('\n\n');
  } catch (e) {
    _log('warn', `Google News RSS failed: ${e.message}`);
    return null;
  }
}

// ── SerpAPI (Google Search API via serpapi.com) ──────────────────────────
async function _serpapiSearch(query) {
  const apiKey = localStorage.getItem('jarvis_serpapi_key') || '';
  if (!apiKey) return null;
  try {
    const url = `https://serpapi.com/search?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=7&hl=es&gl=es&source=web`;
    const json = await _fetch(url, true, 12000);
    if (!json) return null;
    const data = JSON.parse(json);
    const items = data.organic_results || [];
    if (!items.length) return null;
    return items.slice(0, 7).map(i => `• ${i.title}\n  ${(i.snippet || '').replace(/\s+/g, ' ').trim()}\n  ${i.link}`).join('\n\n');
  } catch (e) {
    _log('warn', `SerpAPI search failed: ${e.message}`);
    return null;
  }
}

// ── Tavily AI Search (optimized for AI research) ─────────────────────────
async function _tavilySearch(query) {
  const apiKey = localStorage.getItem('jarvis_tavily_key') || '';
  if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 7, include_answer: true }),
    });
    const data = await resp.json();
    if (!data.results?.length) return null;
    const answer = data.answer ? `Resumen: ${data.answer}\n\n` : '';
    const results = data.results.slice(0, 7).map(r => `• ${r.title}\n  ${(r.content || '').replace(/\s+/g, ' ').trim().substring(0, 200)}\n  ${r.url}`).join('\n\n');
    return answer + results;
  } catch (e) {
    _log('warn', `Tavily search failed: ${e.message}`);
    return null;
  }
}

// ── Source Credibility Scoring ───────────────────────────────────────────
export function scoreSource(url) {
  const domain = (url || '').replace(/https?:\/\//, '').replace(/\/.*$/, '').replace('www.', '').toLowerCase();
  const highDomains = [
    'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'wsj.com',
    'washingtonpost.com', 'theguardian.com', 'economist.com', 'bloomberg.com', 'ft.com',
    'nature.com', 'science.org', 'sciencedirect.com', 'who.int', 'un.org', 'worldbank.org',
    'imf.org', 'nasa.gov', 'nih.gov', 'cdc.gov', 'noaa.gov', 'europa.eu', 'britannica.com',
  ];
  if (highDomains.some(d => domain === d || domain.endsWith('.' + d)) ||
      domain.endsWith('.gov') || domain.endsWith('.gob') ||
      domain.endsWith('.edu') || domain.endsWith('.ac.')) {
    return { score: 3, label: '🔵 Alta', type: 'high' };
  }
  const mediumDomains = [
    'cnn.com', 'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'politico.com',
    'thehill.com', 'forbes.com', 'businessinsider.com', 'techcrunch.com', 'wired.com',
    'theverge.com', 'arstechnica.com', 'elpais.com', 'elmundo.es',
    'lavanguardia.com', 'clarin.com', 'infobae.com', 'lanacion.com.ar',
    'elespectador.com', 'eltiempo.com', 'newsweek.com', 'time.com',
  ];
  if (mediumDomains.some(d => domain === d || domain.endsWith('.' + d))) {
    return { score: 2, label: '🟡 Media', type: 'medium' };
  }
  return { score: 1, label: '⚪ General', type: 'low' };
}

function _parseResultsLines(text) {
  if (!text) return [];
  const results = [];
  const blocks = text.split(/\n• /);
  for (let i = 0; i < blocks.length; i++) {
    const block = (i === 0 ? blocks[i] : '• ' + blocks[i]).trim();
    if (!block) continue;
    const lines = block.split('\n').filter(Boolean);
    if (!lines.length) continue;
    const title = lines[0].replace(/^•\s*/, '').trim();
    if (!title || title.startsWith('http')) continue;
    const snippet = lines.find(l => /^\s{2}/.test(l) && !l.trim().startsWith('http'))?.trim() || '';
    const url = lines.find(l => l.trim().startsWith('http'))?.trim() || '';
    if (title) results.push({ title, snippet, url });
  }
  return results;
}

export async function searchWeb(query, engine) {
  query = (query || '').trim();
  engine = (engine || 'auto').toLowerCase();
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

    // ── Recolectar de múltiples fuentes ──────────────────────────────────
    const seen = new Set();
    const allResults = [];

    function addResults(source, text) {
      if (!text) return;
      const items = _parseResultsLines(text);
      for (const item of items) {
        if (!item.title || item.title.length < 3) continue;
        if (/^(wikipedia|google|duckduckgo|serpapi|tavily|resumen):/i.test(item.title)) continue;
        if (item.url && seen.has(item.url)) continue;
        if (item.url) seen.add(item.url);
        allResults.push({ source, ...item });
      }
    }

    async function addDDGInstant() {
      const json = await _fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, true, DEFAULT_FETCH_TIMEOUT);
      if (!json) return;
      try {
        const data = JSON.parse(json);
        const parts = [];
        if (data.AbstractText) parts.push(`• ${data.AbstractText}\n  ${data.AbstractSource || ''}\n  ${data.AbstractURL || ''}`);
        if (Array.isArray(data.RelatedTopics)) {
          data.RelatedTopics.filter(t => t.Text).slice(0, 5).forEach(t => {
            parts.push(`• ${t.Text}\n  ${t.FirstURL || ''}`);
          });
        }
        if (parts.length) addResults('DuckDuckGo', parts.join('\n\n'));
      } catch (_) {}
    }

    async function addWikipedia() {
      const text = await _searchWikipedia(query);
      if (text) addResults('Wikipedia', text);
    }

    // Recolectar según engine
    if (engine === 'wikipedia') {
      const wikiText = await _searchWikipedia(query);
      if (wikiText) addResults('Wikipedia', wikiText);
      // Fallthrough: seguir recolectando de otras fuentes
    }

    if (engine === 'google' || engine === 'auto' || engine === 'wikipedia') {
      addResults('SerpAPI', await _serpapiSearch(query));
      addResults('Google', await _googleSearch(query));
      const tavilyText = await _tavilySearch(query);
      if (tavilyText) {
        const ansMatch = tavilyText.match(/^Resumen: (.+?)(?:\n\n|$)/);
        const ans = ansMatch ? `Resumen: ${ansMatch[1]}` : '';
        addResults('Tavily', tavilyText);
        if (ans) allResults.unshift({ source: 'Tavily', title: '', snippet: ans, url: '' });
      }
      addResults('DuckDuckGo', await _scrapeDDGHtml(query));
      addResults('Google News', await _googleNewsRss(query));
    }

    if (engine === 'auto') {
      await addDDGInstant();
      await addWikipedia();
    }

    if (allResults.length === 0) {
      if (engine === 'google') {
        return { success: true, output: `Google Search no disponible. Configura SerpAPI o Google API Key en Ajustes > API Keys.\nhttps://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` };
      }
      return {
        success: true,
        output: `No obtuve resultados automáticos para "${query}". Probá con fetch_url:\nhttps://es.wikipedia.org/wiki/Especial:Buscar?search=${encodeURIComponent(query)}\nhttps://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      };
    }

    // ── Deep fetch: para resultados con snippets cortos, obtener página completa ──
    const deepFetchResults = [];
    const topResults = allResults.filter(r => r.url).slice(0, 3);
    for (const r of topResults) {
      if (!r.snippet || r.snippet.length < 100) {
        _log('info', `Deep fetch: ${r.url}`);
        const content = await _fetch(r.url, false, DEFAULT_FETCH_TIMEOUT);
        if (content && content.length > 100) {
          const clean = content
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1500);
          deepFetchResults.push({ url: r.url, title: r.title, content: clean });
        }
      }
    }

    // ── Agrupar por fuente y formatear ──────────────────────────────────
    const sourceCount = new Set(allResults.map(r => r.source)).size;
    const bySource = {};
    for (const r of allResults) {
      if (!bySource[r.source]) bySource[r.source] = [];
      bySource[r.source].push(r);
    }

    let output = `🔍 BÚSQUEDA — "${query}" (${allResults.length} resultados, ${sourceCount} fuentes)\n\n`;
    for (const [source, items] of Object.entries(bySource)) {
      output += `── ${source} ──\n`;
      for (const item of items) {
        if (item.title) output += `• ${item.title}\n`;
        if (item.snippet) output += `  ${item.snippet}\n`;
        if (item.url) output += `  ${item.url}\n`;
      }
      output += '\n';
    }

    if (deepFetchResults.length > 0) {
      output += `── CONTENIDO COMPLETO ──\n`;
      for (const df of deepFetchResults) {
        output += `• ${df.title}\n  ${df.url}\n  ${df.content.substring(0, 800)}\n\n`;
      }
    }

    const links = [];
    for (const r of allResults) {
      if (r.url && !links.some(l => l === r.url)) links.push(r.url);
      if (links.length >= 5) break;
    }

    return { success: true, output: output.trim(), links };
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

export async function fetchUrlContent(url, raw = false) {
  try {
    _log('info', `Fetching URL: ${url}`);
    const result = await window.electronAPI.fetchUrl(url, raw);
    if (result.success) {
      if (raw) return { success: true, output: result.output };
      return { success: true, output: `Contenido de ${url}:\n${result.output}` };
    }
    return { success: false, output: `Error al obtener ${url}: ${result.output}` };
  } catch (e) {
    return { success: false, output: `Error al obtener URL: ${e.message}` };
  }
}

export async function analyzePage(url) {
  try {
    _log('info', `Analyzing page: ${url}`);
    const result = await window.electronAPI.analyzePage(url);
    if (!result || !result.success) {
      return { success: false, output: result?.output || 'Error al analizar la página' };
    }
    let output = `📄 ${result.meta.title || 'Sin título'}\n`;
    if (result.meta.description) output += `${result.meta.description}\n\n`;
    output += result.output;
    const MAX_LEN = 80000;
    if (result.length > MAX_LEN) output += `\n\n[... contenido truncado de ${result.length} caracteres totales]`;
    return { success: true, output, screenshot: result.screenshot };
  } catch (e) {
    return { success: false, output: `Error al analizar página: ${e.message}` };
  }
}
