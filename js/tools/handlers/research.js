import { fetchUrlContent } from '../web.js';

const SOURCE_ICONS = {
  'DuckDuckGo': '🦆',
  'Wikipedia': '📖',
  'Google News': '📰',
  'Reddit': '💬',
  'YouTube': '🎬',
  'GitHub': '🐙',
  'Stack Overflow': '📋',
  'Medium': '✏️',
  'Dev.to': '👨‍💻',
  'Hacker News': '🔺',
  'BBC': '📺',
  'Reuters': '📰',
  'El País': '🇪🇸',
  'El Mundo': '🌍'
};

function _sourceIcon(name) {
  for (const [k, v] of Object.entries(SOURCE_ICONS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '🔗';
}

async function _fetchText(url, maxLen = 2500) {
  try {
    const r = await fetchUrlContent(url);
    if (r.success && r.output && r.output.length > 80) {
      const clean = r.output.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return clean.substring(0, maxLen);
    }
  } catch (_) {}
  return '';
}

// Google Custom Search API (cuando está configurada)
async function _searchGoogle(query) {
  const apiKey = localStorage.getItem('jarvis_google_api_key') || '';
  const cx = localStorage.getItem('jarvis_google_cx') || '';
  if (!apiKey || !cx) return '';
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&lr=lang_es&num=7`;
    const r = await fetchUrlContent(url);
    if (!r.success) return '';
    const json = r.output.match(/\{.*\}/s);
    if (!json) return '';
    const data = JSON.parse(json[0]);
    const items = data.items || [];
    if (!items.length) return '';
    return items.slice(0, 7).map(i => `• ${i.title}\n  ${i.snippet.replace(/\s+/g, ' ').trim()}\n  ${i.link}`).join('\n\n');
  } catch (_) { return ''; }
}

// DuckDuckGo HTML scraping (fallback si Google no está configurado)
async function _searchDDG(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const r = await fetchUrlContent(url);
    if (!r.success) return '';
    const html = r.output;
    const results = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null && results.length < 5) {
      const link = m[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/[&?]rut=.*/, '');
      const title = m[2].replace(/<[^>]*>/g, '').trim();
      if (title && link) results.push(`• ${title} — ${decodeURIComponent(link)}`);
    }
    if (results.length === 0) {
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let s;
      while ((s = snippetRegex.exec(html)) !== null && results.length < 3) {
        results.push(`• ${s[1].replace(/<[^>]*>/g, '').trim()}`);
      }
    }
    if (results.length > 0) return results.join('\n');
    return '';
  } catch (_) { return ''; }
}

// Wikipedia API real
async function _searchWikipedia(topic) {
  const lang = /[áéíóúñü¿¡]/i.test(topic) ? 'es' : 'en';
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3`;
    const r = await fetchUrlContent(url);
    if (!r.success) return '';
    const json = r.output.match(/\{.*\}/s);
    if (!json) return '';
    const data = JSON.parse(json[0]);
    const pages = data?.query?.search || [];
    if (pages.length === 0) return '';
    const lines = pages.map(p => `• ${p.title} — ${p.snippet.replace(/<[^>]*>/g, '')}`);
    return lines.join('\n');
  } catch (_) { return ''; }
}

// RSS a texto plano
async function _fetchRSS(url, maxItems = 5) {
  const text = await _fetchText(url, 5000);
  if (!text) return '';
  const items = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, maxItems).map(item => {
    const title = (item.match(/<title>([^<]*)<\/title>/i) || [,''])[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const desc = (item.match(/<description>([^<]*)<\/description>/i) || [,''])[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim().substring(0, 100);
    return title ? `• ${title}${desc ? ': ' + desc : ''}` : '';
  }).filter(Boolean).join('\n');
}

export async function handleDeepResearch(call) {
  const topic = call.args.topic || '';
  const depth = call.args.depth || 'normal';
  if (!topic) return { success: false, output: 'No se especificó tema de investigación.' };

  const results = [];
  const encoded = encodeURIComponent(topic);

  // 1. Google Search (primero) o DuckDuckGo (fallback)
  const google = await _searchGoogle(topic);
  if (google) results.push({ name: 'Google', icon: '🔍', content: google });
  else {
    const ddg = await _searchDDG(topic);
    if (ddg) results.push({ name: 'DuckDuckGo', icon: '🦆', content: ddg });
  }

  // 2. Wikipedia — API real
  const wiki = await _searchWikipedia(topic);
  if (wiki) results.push({ name: 'Wikipedia', icon: '📖', content: wiki });

  // 3. Google News RSS
  const gn = await _fetchRSS(`https://news.google.com/rss/search?q=${encoded}&hl=es&gl=MX&ceid=MX:es`);
  if (gn) results.push({ name: 'Google News', icon: '📰', content: gn });

  // 4. Reddit RSS
  const reddit = await _fetchRSS(`https://www.reddit.com/r/search/.rss?q=${encoded}&sort=relevance&t=year`, 4);
  if (reddit) results.push({ name: 'Reddit', icon: '💬', content: reddit });

  if (depth === 'deep') {
    // 5. YouTube RSS
    const yt = await _fetchRSS(`https://www.youtube.com/feeds/videos.xml?search_query=${encoded}`, 3);
    if (yt) results.push({ name: 'YouTube', icon: '🎬', content: yt });

    // 6. GitHub — search API via fetch
    const gh = await _fetchText(`https://api.github.com/search/repositories?q=${encoded}&sort=stars&per_page=5`, 2000);
    if (gh) {
      try {
        const json = gh.match(/\{.*\}/s);
        if (json) {
          const data = JSON.parse(json[0]);
          const items = (data.items || []).slice(0, 5);
          if (items.length > 0) {
            const lines = items.map(i => `• ${i.full_name} ⭐${i.stargazers_count} — ${(i.description || '').substring(0, 80)}`);
            results.push({ name: 'GitHub', icon: '🐙', content: lines.join('\n') });
          }
        }
      } catch (_) {}
    }

    // 7. Stack Overflow RSS
    const so = await _fetchRSS(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encoded}&site=stackoverflow&pagesize=5&filter=withbody`, 4);
    if (so && so.length > 20) results.push({ name: 'Stack Overflow', icon: '📋', content: so });

    // 8. Hacker News — Algolia search
    const hn = await _fetchText(`https://hn.algolia.com/api/v1/search?query=${encoded}&hitsPerPage=5`, 1500);
    if (hn) {
      try {
        const json = hn.match(/\{.*\}/s);
        if (json) {
          const data = JSON.parse(json[0]);
          const hits = (data.hits || []).slice(0, 5);
          if (hits.length > 0) {
            const lines = hits.map(h => `• ${h.title} (${h.points || 0} pts, ${h.author})`);
            results.push({ name: 'Hacker News', icon: '🔺', content: lines.join('\n') });
          }
        }
      } catch (_) {}
    }
  }

  if (depth !== 'quick') {
    // 9. Dev.to RSS
    const dev = await _fetchRSS(`https://dev.to/search/feeds?q=${encoded}`, 3);
    if (dev) results.push({ name: 'Dev.to', icon: '👨‍💻', content: dev });
  }

  // 10. URLs directas desde DuckDuckGo (modo deep)
  if (depth === 'deep' && ddg) {
    const urls = [...ddg.matchAll(/https?:\/\/[^\s,)+"]+/g)].slice(0, 3).map(m => m[0]);
    const seen = new Set();
    for (const url of urls) {
      const domain = url.replace(/https?:\/\//, '').split('/')[0].replace('www.', '').split('.')[0];
      if (seen.has(domain) || domain.length > 25) continue;
      seen.add(domain);
      const name = domain.charAt(0).toUpperCase() + domain.slice(1);
      const text = await _fetchText(url, 2000);
      if (text) results.push({ name, icon: _sourceIcon(name), content: text.substring(0, 1000) });
    }
  }

  const successfulSources = results.filter(r => r.content && r.content.length > 20);

  let combined = '';
  const sourceEntries = [];
  for (const r of successfulSources) {
    const clean = r.content.replace(/<[^>]*>/g, '').substring(0, 1500);
    combined += `\n\n── ${r.icon} ${r.name} ──\n${clean}`;
    sourceEntries.push({ name: r.name, icon: r.icon });
  }

  const output = `INVESTIGACIÓN SOBRE "${topic.toUpperCase()}"\nFuentes consultadas: ${sourceEntries.length}\n\n${combined}`;

  try {
    const { showInfoPanel } = await import('../../ui/info-panel.js');
    const sentences = combined.split(/[.!?]\s+/).filter(s => s.trim().length > 30).map(s => s.trim());
    const keyPoints = sentences.slice(0, 8);
    const sourceLabels = sourceEntries.map(s => `${s.icon} ${s.name}`);

    showInfoPanel({
      type: 'research',
      title: topic.toUpperCase(),
      source: `${sourceEntries.length} fuentes`,
      subtitle: `Análisis completo sobre ${topic}`,
      summary: keyPoints.slice(0, 3).join('. ') + '.',
      keyPoints: keyPoints,
      details: sourceLabels.join(' · '),
      rawContent: combined,
      sources: sourceLabels.slice(0, 13)
    });
  } catch (_) {}

  return { success: true, output: output.substring(0, 6000) };
}
