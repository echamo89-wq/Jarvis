import { createLogger } from '../utils/logger.js';
const _log = createLogger('OWM');

async function _owmFetch(path, config, params = {}) {
  params.appid = config.apiKey;
  params.lang = 'es';
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `https://api.openweathermap.org/data/2.5${path}?${qs}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `Error HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data.cod === 401 || data.message?.toLowerCase().includes('invalid api')) {
          msg = 'API Key inválida. Regístrate gratis en https://openweathermap.org/api para obtener una.';
        } else if (data.cod === 404) {
          msg = 'Ciudad no encontrada. Verifica el nombre.';
        } else {
          msg = data.message || msg;
        }
      } catch {}
      return { success: false, output: msg };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (e) {
    return { success: false, output: `Error de conexión: ${e.message}` };
  }
}

function _kelvinToC(k) { return Math.round(k - 273.15); }

function _windDir(d) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(d / 22.5) % 16];
}

export const openweathermap = {
  id: 'openweathermap',
  name: 'OpenWeatherMap',
  icon: '☀',
  description: 'Clima detallado con pronóstico de 5 días, humedad, viento, presión y alertas meteorológicas. API key gratuita en openweathermap.org/api.',
  guideSteps: [
    '1. Regístrate gratis en openweathermap.org y confirma tu correo.',
    '2. Ve a API Keys en tu panel (https://home.openweathermap.org/api_keys).',
    '3. Copia tu API Key (por defecto se genera una automática al registrarte).',
    '4. Pégala en el campo de abajo y haz clic en "Probar conexión".'
  ],
  authUrl: 'https://home.openweathermap.org/api_keys',
  _status: 'disconnected',

  configFields: [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'ej: 1a2b3c4d5e6f7g8h9i0j' }
  ],

  async testConnection(config) {
    if (!config.apiKey || config.apiKey.length < 10) {
      return { success: false, error: 'API Key parece inválida. Obtén una gratis en openweathermap.org/api' };
    }
    const r = await _owmFetch('/weather', config, { q: 'London' });
    return r.success
      ? { success: true, data: r.data }
      : { success: false, error: r.output };
  },

  getFunctionDeclarations() {
    return [
      {
        name: 'get_weather_current',
        description: 'Obtiene el clima actual de una ciudad: temperatura, sensación térmica, humedad, viento, presión, visibilidad, amanecer/atardecer, descripción del cielo.',
        parameters: { type: 'object', properties: {
          city: { type: 'string', description: 'Nombre de la ciudad (ej: "Mexico City", "Madrid", "Buenos Aires, AR")' },
          country_code: { type: 'string', description: 'Código de país opcional (ej: "MX", "ES", "AR")' }
        }, required: ['city'] }
      },
      {
        name: 'get_weather_forecast',
        description: 'Obtiene el pronóstico del clima a 5 días para una ciudad, cada 3 horas. Incluye temperatura, sensación, humedad, viento, probabilidad de lluvia, descripción del cielo.',
        parameters: { type: 'object', properties: {
          city: { type: 'string', description: 'Nombre de la ciudad' },
          country_code: { type: 'string', description: 'Código de país opcional' },
          days: { type: 'integer', description: 'Días de pronóstico (max: 5, default: 3)' }
        }, required: ['city'] }
      },
      {
        name: 'get_weather_by_coords',
        description: 'Obtiene clima actual usando coordenadas geográficas (latitud y longitud).',
        parameters: { type: 'object', properties: {
          lat: { type: 'number', description: 'Latitud (ej: 19.4326)' },
          lon: { type: 'number', description: 'Longitud (ej: -99.1332)' }
        }, required: ['lat', 'lon'] }
      }
    ];
  },

  async executeTool(name, args, config) {
    switch (name) {
      case 'get_weather_current': {
        const q = args.country_code ? `${args.city},${args.country_code}` : args.city;
        const r = await _owmFetch('/weather', config, { q });
        if (!r.success) return { success: false, output: `No se pudo obtener clima para "${args.city}". Verifica el nombre.` };
        const d = r.data;
        const sunrise = new Date(d.sys.sunrise * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        const sunset = new Date(d.sys.sunset * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        return {
          success: true,
          output: `🌤️ Clima actual en ${d.name}, ${d.sys.country}\n` +
            `🌡️ ${_kelvinToC(d.main.temp)}°C (sensación: ${_kelvinToC(d.main.feels_like)}°C)\n` +
            `📊 ${d.weather[0].description}\n` +
            `💧 Humedad: ${d.main.humidity}%\n` +
            `💨 Viento: ${d.wind.speed} m/s (${_windDir(d.wind.deg)})\n` +
            `🌬️ Ráfagas: ${d.wind.gust ? d.wind.gust + ' m/s' : 'N/A'}\n` +
            `🔽 Mín: ${_kelvinToC(d.main.temp_min)}°C / 🔼 Máx: ${_kelvinToC(d.main.temp_max)}°C\n` +
            `📏 Presión: ${d.main.pressure} hPa\n` +
            `👁️ Visibilidad: ${(d.visibility / 1000).toFixed(1)} km\n` +
            `☀️ Amanecer: ${sunrise} / 🌇 Atardecer: ${sunset}\n` +
            `☁️ Nubes: ${d.clouds.all}%`
        };
      }

      case 'get_weather_forecast': {
        const q = args.country_code ? `${args.city},${args.country_code}` : args.city;
        const r = await _owmFetch('/forecast', config, { q });
        if (!r.success) return { success: false, output: `No se pudo obtener pronóstico para "${args.city}".` };
        const days = Math.min(args.days || 3, 5);
        const list = r.data.list || [];
        const byDay = {};
        list.forEach(item => {
          const date = item.dt_txt.split(' ')[0];
          if (!byDay[date]) byDay[date] = [];
          byDay[date].push(item);
        });
        const dates = Object.keys(byDay).slice(0, days);
        const lines = [`📅 Pronóstico para ${args.city} (${days} días):`];
        dates.forEach(date => {
          const items = byDay[date];
          const mins = items.map(i => _kelvinToC(i.main.temp_min));
          const maxs = items.map(i => _kelvinToC(i.main.temp_max));
          const descs = items.map(i => i.weather[0].description);
          const rain = items.filter(i => i.pop > 0);
          const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
          lines.push(`\n📆 ${dateLabel}`);
          lines.push(`   🌡️ ${Math.min(...mins)}°C / ${Math.max(...maxs)}°C`);
          lines.push(`   ☁️ ${descs[Math.floor(descs.length / 2)]}`);
          if (rain.length > 0) {
            const maxPop = Math.max(...items.map(i => i.pop));
            lines.push(`   🌧️ Prob. lluvia: ${Math.round(maxPop * 100)}%`);
          }
          lines.push(`   💧 Humedad: ${items[Math.floor(items.length / 2)].main.humidity}%`);
          lines.push(`   💨 Viento: ${items[Math.floor(items.length / 2)].wind.speed} m/s`);
        });
        return { success: true, output: lines.join('\n') };
      }

      case 'get_weather_by_coords': {
        const r = await _owmFetch('/weather', config, { lat: args.lat, lon: args.lon });
        if (!r.success) return { success: false, output: 'No se pudo obtener clima para esas coordenadas.' };
        const d = r.data;
        return {
          success: true,
          output: `🌤️ Clima en ${d.name}, ${d.sys.country} (${args.lat}, ${args.lon})\n` +
            `🌡️ ${_kelvinToC(d.main.temp)}°C | ${d.weather[0].description}\n` +
            `💧 ${d.main.humidity}% | 💨 ${d.wind.speed} m/s | 🌡️ ${_kelvinToC(d.main.feels_like)}°C`
        };
      }

      default:
        return { success: false, output: `Herramienta OWM "${name}" no implementada.` };
    }
  }
};
