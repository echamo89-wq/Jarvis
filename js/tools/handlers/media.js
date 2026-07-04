import { executePowerShellCommand } from '../../system/powershell.js';
import { searchWeb, fetchUrlContent } from '../web.js';

export async function handleGetWeather(call, store) {
  let city = (call.args.city || '').trim();
  let result = null;
  if (!city) city = localStorage.getItem('jarvis_city') || '';
  if (!city) {
    try {
      const ipRes = await fetchUrlContent('https://ip-api.com/json/?fields=city');
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
    const jsonRes = await fetchUrlContent(jsonUrl);
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

export async function handleGetNews(call) {
  const topic = call.args.topic || '';
  const query = topic ? `${topic}+news` : 'news';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es&gl=MX&ceid=MX:es`;
  const result = await fetchUrlContent(url);
  if (result.success) {
    const lines = result.output.split('\n').filter(l => l.trim()).slice(0, 15);
    const headlines = lines.map(l => l.replace(/<[^>]*>/g, '').trim()).filter(l => l && l.length > 10).slice(0, 10);
    result.output = headlines.length > 0 ? headlines.join('\n') : result.output.substring(0, 1000);
    try {
      const { showInfoPanel } = await import('../../ui/info-panel.js');
      showInfoPanel({
        type: 'news',
        title: (topic || 'ÚLTIMAS NOTICIAS').toUpperCase(),
        source: 'Google News',
        subtitle: topic ? `Noticias sobre ${topic}` : 'Últimas noticias',
        keyPoints: headlines.slice(0, 6),
        rawContent: headlines.join('\n')
      });
    } catch (_) {}
  } else {
    return { success: false, output: 'No se pudieron obtener noticias.' };
  }
  return result;
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

  let formatArg = '';
  let subfolder = 'Video';
  if (fmt === 'audio') { formatArg = '-f "bestaudio[ext=m4a]/bestaudio"'; subfolder = 'Music'; }
  else if (fmt === 'custom' && formatCode) { formatArg = `-f "${formatCode}"`; subfolder = 'Custom'; }
  else { formatArg = '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]"'; }

  const psCmd = `$desk=[Environment]::GetFolderPath("Desktop"); $dir=Join-Path $desk "JARVIS_Youtube" | Join-Path -Child "${subfolder}"; New-Item -ItemType Directory -Path $dir -Force | Out-Null; try { $path=$(yt-dlp --no-warnings ${formatArg} -o "$dir/%(title)s.%(ext)s" --no-playlist --print after_move:filepath --compat-options filename-sanitization "${url}" 2>$null); if ($LASTEXITCODE -eq 0 -and $path) { "OK: $path" } else { "ERROR: El comando falló con código $LASTEXITCODE" } } catch { "ERROR: $_" }`;
  const psOutput = await executePowerShellCommand(psCmd, 'youtube_download', true);
  if (psOutput.success && !psOutput.output?.startsWith('ERROR:')) {
    const outputPath = psOutput.output?.replace(/^OK:\s*/, '').trim() || '';
    return { success: true, output: `${fmt === 'audio' ? '🎵 Música' : '🎬 Video'} descargado. ${outputPath ? 'Archivo: ' + outputPath : 'En Escritorio/JARVIS_Youtube/' + subfolder + '/'}` };
  }
  return { success: false, output: `Error descargando video: ${(psOutput.output || '').replace(/^ERROR:\s*/, '')}` };
}
