import { executePowerShellCommand } from '../../system/powershell.js';
import { searchWeb, fetchUrlContent } from '../web.js';

export async function handleGetWeather(call, store) {
  let city = (call.args.city || '').trim();
  let result = null;
  if (!city) city = localStorage.getItem('jarvis_city') || '';
  if (!city) {
    try {
      const ipRes = await fetchUrlContent('https://ip-api.com/json/?fields=city', true);
      if (ipRes.success) {
        const data = JSON.parse(ipRes.output);
        if (data.city) city = data.city;
        localStorage.setItem('jarvis_city', city);
      }
    } catch (e) {}
  }
  if (!city) return { success: false, output: 'No se pudo determinar tu ciudad. Especifica la ciudad en el comando o configúrala manualmente.' };

  if (call.args.city && call.args.city.trim() !== localStorage.getItem('jarvis_city')) {
    localStorage.setItem('jarvis_city', call.args.city.trim());
  }
  try {
    const jsonUrl = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const jsonRes = await fetchUrlContent(jsonUrl, true);
    if (jsonRes.success) {
      const wdata = JSON.parse(jsonRes.output);
      const current = wdata.current_condition?.[0];
      const forecastDays = wdata.weather || [];
      let summary = `Clima en ${city}: `;
      if (current) {
        const desc = current.weatherDesc?.[0]?.value || '';
        const temp = current.temp_C || '—';
        const hum = current.humidity || '—';
        const wind = current.windspeedKmph || '—';
        summary += `${desc}, ${temp}°C, humedad ${hum}%, viento ${wind} km/h. `;
      }
      if (forecastDays.length > 0) {
        summary += 'Pronóstico: ';
        summary += forecastDays.slice(0, 3).map(d => {
          const h = d.hourly?.[0] || {};
          const desc = h.weatherDesc?.[0]?.value || '—';
          const hi = h.tempC || d.maxtempC || '—';
          const lo = h.tempC || d.mintempC || '—';
          const rain = h.chanceofrain || '—';
          return `${d.date}: ${desc}, ${hi}°/${lo}°, lluvia ${rain}%`;
        }).join(' | ');
      }
      result = { success: true, output: summary };
      const { showWeatherForecast } = await import('../../weather/forecast-panel.js');
      showWeatherForecast(wdata);
    } else {
      result = { success: false, output: `No se pudo obtener el clima de ${city}.` };
    }
  } catch (e) {
    result = { success: false, output: `Error al obtener clima: ${e.message}` };
  }
  return result;
}

async function _parseRSSItems(text) {
  const items = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map(item => {
    const title = (item.match(/<title(?:[^>]*)>([^<]*)<\/title>/i) || [,''])[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const desc = (item.match(/<description(?:[^>]*)>([^<]*)<\/description>/i) || [,''])[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim();
    const source = (item.match(/<source[^>]*>([^<]*)<\/source>/i) || [,''])[1].trim();
    const link = (item.match(/<link[^>]*>([^<]*)<\/link>/i) || [,''])[1].trim();
    return { title, desc: desc.substring(0, 150), source, link };
  }).filter(i => i.title).slice(0, 10);
}

async function _fetchNewsRSS(topic, sport = false) {
  const query = topic ? (sport ? `${topic}+sports+news` : `${topic}+news`) : (sport ? 'sports+news' : 'news');
  // Try Google News RSS first
  const urls = [
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es&gl=MX&ceid=MX:es`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchUrlContent(url);
      if (res.success) {
        const items = _parseRSSItems(res.output);
        if (items.length >= 3) return items;
      }
    } catch (_) {}
  }
  return [];
}

export async function handleGetNews(call) {
  const topic = call.args.topic || '';
  const items = await _fetchNewsRSS(topic);
  if (items.length === 0) {
    // Fallback: use search_web for news
    try {
      const { searchWeb } = await import('../web.js');
      const result = await searchWeb(topic ? `últimas noticias ${topic} 2026` : 'últimas noticias', 'auto');
      return result;
    } catch (_) {
      return { success: false, output: 'No se pudieron obtener noticias.' };
    }
  }
  const headlines = items.map(i => i.title + (i.source ? ` [${i.source}]` : ''));
  const output = headlines.join('\n');
  try {
    const { showInfoPanel } = await import('../../ui/info-panel.js');
    showInfoPanel({
      type: 'news',
      title: (topic || 'ÚLTIMAS NOTICIAS').toUpperCase(),
      source: 'Google News',
      subtitle: topic ? `Noticias sobre ${topic}` : 'Últimas noticias',
      keyPoints: headlines.slice(0, 6),
      rawContent: output
    });
  } catch (_) {}
  return { success: true, output };
}

export async function handleGetSportsNews(call) {
  const sport = call.args.sport || '';
  const items = await _fetchNewsRSS(sport, true);
  if (items.length === 0) {
    try {
      const { searchWeb } = await import('../web.js');
      const q = sport ? `deportes ${sport} noticias 2026` : 'noticias deportivas 2026';
      const result = await searchWeb(q, 'auto');
      return result;
    } catch (_) {
      return { success: false, output: 'No se encontraron noticias deportivas.' };
    }
  }
  const headlines = items.map(i => `${i.title} [${i.source || 'Google News'}]`);
  const output = (sport ? `=== ${sport.toUpperCase()} — NOTICIAS ===` : '=== NOTICIAS DEPORTIVAS ===') + '\n\n' + headlines.join('\n\n');
  try {
    const { showInfoPanel } = await import('../../ui/info-panel.js');
    showInfoPanel({
      type: 'news',
      title: (sport || 'DEPORTES').toUpperCase(),
      source: 'Google News',
      subtitle: sport ? `Noticias deportivas: ${sport}` : 'Últimas noticias deportivas',
      keyPoints: headlines.slice(0, 5),
      rawContent: output
    });
  } catch (_) {}
  return { success: true, output };
}

export async function handleYoutubeAction(call) {
  const action = call.args.action || '';
  const query = call.args.query || '';
  if (action === 'search') return await searchWeb(query, 'youtube');
  if (action === 'info') {
    const result = await fetchUrlContent(query);
    if (result.success) {
      const titleMatch = result.output.match(/<title>([^<]+)<\/title>/i);
      result.output = titleMatch ? `Video: ${titleMatch[1]}` : 'Video encontrado.';
    }
    return result;
  }
  return { success: false, output: `Acción YouTube desconocida: ${action}` };
}

export async function handleYoutubeDownload(call) {
  const url = call.args.url || '';
  const fmt = call.args.format || 'video';
  const formatCode = call.args.format_code || '';
  if (!url) return { success: false, output: 'Se requiere una URL de YouTube.' };

  const result = await window.electronAPI.youtubeDownload({ url, format: fmt, formatCode });
  if (result.success) {
    return { success: true, output: `${fmt === 'audio' ? '🎵 Música' : '🎬 Video'} descargado. ${result.output}` };
  }
  return { success: false, output: result.output };
}

export async function handleEditVideo(call) {
  const args = call.args || {};
  const operation = args.operation || '';
  const input = args.input || '';

  if (!input) return { success: false, output: 'Especifica la ruta del video de entrada.' };
  if (!operation) return { success: false, output: 'Especifica una operación: trim, convert, extract_audio, merge, add_text, resize, speed, o compress.' };

  const checkCmd = 'Get-Command ffmpeg -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source';
  const check = await executePowerShellCommand(checkCmd, 'edit_video', false);
  if (!check.success || !check.output) {
    return { success: false, output: 'FFmpeg no está instalado. Descárgalo desde https://ffmpeg.org y agrégalo al PATH.' };
  }

  const outPath = args.output || input.replace(/(\.[^.]+)$/, `_${operation}$1`);
  let psCmd = '';
  switch (operation) {
    case 'trim': {
      const start = args.start || '0';
      const end = args.end || '';
      const duration = args.duration || '';
      if (!duration && !end) return { success: false, output: 'Especifica duration (ej: 30) o end (ej: 00:01:30).' };
      const t = duration ? `-t ${duration}` : `-to ${end}`;
      psCmd = `ffmpeg -y -i "${input}" -ss ${start} ${t} -c copy "${outPath}" 2>&1`;
      break;
    }
    case 'convert': {
      psCmd = `ffmpeg -y -i "${input}" "${outPath}" 2>&1`;
      break;
    }
    case 'extract_audio': {
      const aFmt = args.audio_format || 'mp3';
      const codec = aFmt === 'mp3' ? 'libmp3lame' : 'copy';
      psCmd = `ffmpeg -y -i "${input}" -vn -acodec ${codec} "${outPath}" 2>&1`;
      break;
    }
    case 'merge': {
      const files = args.files || '';
      if (!files) return { success: false, output: 'Especifica los archivos a unir separados por |' };
      const list = files.split('|').map(f => f.trim()).filter(Boolean);
      if (list.length < 2) return { success: false, output: 'Se necesitan al menos 2 archivos.' };
      const listFile = '$env:TEMP\\jarvis_merge.txt';
      const content = list.map(f => `file '${f.replace(/'/g,"'\\''")}'`).join('`n');
      psCmd = `Set-Content -Path ${listFile} -Value "${content}"; ffmpeg -y -f concat -safe 0 -i ${listFile} -c copy "${outPath}" 2>&1; Remove-Item ${listFile} -Force`;
      break;
    }
    case 'add_text': {
      const text = args.text || '';
      if (!text) return { success: false, output: 'Especifica el texto a agregar.' };
      const posMap = { top:'10:(h-text_h-10)', bottom:'10:(h-text_h-10)', center:'(w-text_w)/2:(h-text_h)/2' };
      const pos = posMap[args.position || 'bottom'] || posMap.bottom;
      psCmd = `ffmpeg -y -i "${input}" -vf "drawtext=text='${text.replace(/'/g,"'\\\\''")}':fontsize=${args.font_size||24}:fontcolor=white:box=1:boxcolor=black@0.5:x=${pos}:y=${pos}" "${outPath}" 2>&1`;
      break;
    }
    case 'resize': {
      psCmd = `ffmpeg -y -i "${input}" -vf "scale=${args.width||1280}:${args.height||720}" "${outPath}" 2>&1`;
      break;
    }
    case 'speed': {
      const s = Math.max(0.25, Math.min(4, parseFloat(args.speed) || 1));
      const sp = 1 / s;
      psCmd = `ffmpeg -y -i "${input}" -filter_complex "[0:v]setpts=${sp}*PTS[v];[0:a]atempo=${s}[a]" -map "[v]" -map "[a]" "${outPath}" 2>&1`;
      break;
    }
    case 'compress': {
      psCmd = `ffmpeg -y -i "${input}" -vcodec libx264 -crf ${args.crf||28} "${outPath}" 2>&1`;
      break;
    }
    default:
      return { success: false, output: `Operación desconocida: ${operation}.` };
  }

  const result = await executePowerShellCommand(psCmd, 'edit_video', true);
  if (result.success) {
    return { success: true, output: `${operation === 'extract_audio' ? 'Audio extraído' : 'Video editado'}: ${outPath}` };
  }
  return { success: false, output: `Error en ${operation}: ${(result.output||'').substring(0,500)}` };
}
