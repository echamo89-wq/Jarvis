import { searchWeb, fetchUrlContent } from '../web.js';

export async function handleDeepResearch(call) {
  const topic = call.args.topic || '';
  const depth = call.args.depth || 'normal';
  if (!topic) return { success: false, output: 'No se especificó tema de investigación.' };

  const allFindings = [];
  const sources = [];

  const ddgResult = await searchWeb(topic, 'duckduckgo');
  if (ddgResult.success) {
    allFindings.push(`[DuckDuckGo] ${ddgResult.output}`);
    sources.push('DuckDuckGo');
  }

  const wikiResult = await searchWeb(topic, 'wikipedia');
  if (wikiResult.success && !wikiResult.output.includes('no se encontraron')) {
    allFindings.push(`[Wikipedia] ${wikiResult.output}`);
    sources.push('Wikipedia');
  }

  const newsResult = await fetchUrlContent(`https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=es&gl=MX&ceid=MX:es`);
  if (newsResult.success && newsResult.output.length > 100) {
    allFindings.push(`[Google News] ${newsResult.output.substring(0, 2000)}`);
    sources.push('Google News');
  }

  if (depth === 'deep') {
    const urls = [...ddgResult.output.matchAll(/https?:\/\/[^\s,)+]+/g)].slice(0, 3).map(m => m[0]);
    for (const url of urls) {
      const page = await fetchUrlContent(url);
      if (page.success) {
        allFindings.push(`[${url}] ${page.output}`);
        sources.push(url);
      }
    }
  }

  const combined = allFindings.join('\n\n---\n\n');
  const result = {
    success: true,
    output: `INVESTIGACIÓN COMPLETA sobre "${topic}" (${sources.length} fuentes: ${sources.join(', ')})\n\n${combined}`
  };

  try {
    const { showInfoPanel } = await import('../../ui/info-panel.js');
    const lines = combined.split('\n').filter(l => l.trim());
    const keyPoints = lines.filter(l => l.length > 20 && l.length < 200).slice(0, 8);
    const points = keyPoints.length > 0 ? keyPoints : [combined.substring(0, 200)];
    showInfoPanel({
      type: 'research',
      title: topic.toUpperCase(),
      source: `${sources.length} fuentes`,
      subtitle: `Investigación completa sobre ${topic}`,
      summary: combined.length > 300 ? combined.substring(0, 300) + '...' : combined,
      keyPoints: points,
      details: `Fuentes: ${sources.join(', ')}`,
      rawContent: combined,
      sources: sources.filter(s => !s.startsWith('DuckDuckGo')).slice(0, 8)
    });
  } catch (_) {}

  return result;
}
