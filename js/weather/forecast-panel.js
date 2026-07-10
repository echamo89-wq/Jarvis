let _hideTimer = null;

const WEATHER_ICONS = {
  'clear': '☀️', 'sunny': '☀️', 'fine': '☀️',
  'partly cloudy': '⛅', 'cloudy': '☁️', 'overcast': '☁️',
  'mist': '🌫', 'fog': '🌫', 'freezing fog': '🌫',
  'light rain': '🌦', 'patchy rain': '🌦', 'drizzle': '🌦',
  'rain': '🌧', 'moderate rain': '🌧', 'heavy rain': '🌧',
  'light snow': '🌨', 'snow': '❄️', 'heavy snow': '❄️',
  'sleet': '🌨', 'thundery': '⛈', 'thunderstorm': '⛈',
  'blizzard': '❄️', 'ice pellets': '🧊',
};

function _getIcon(desc) {
  const d = desc.toLowerCase();
  for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
    if (d.includes(key)) return icon;
  }
  return '🌤';
}

function _getCardClass(desc, rainChance) {
  const d = desc.toLowerCase();
  const rainPct = parseInt(rainChance) || 0;
  if (d.includes('thunder')) return 'thunder';
  if (rainPct >= 60 || d.includes('rain') || d.includes('drizzle') || d.includes('sleet') || d.includes('snow')) return 'rain';
  if (d.includes('clear') || d.includes('sunny') || d.includes('fine')) return 'sunny';
  return 'cloudy';
}

function _getRainLevel(rainChance) {
  const pct = parseInt(rainChance) || 0;
  if (pct >= 80) return { level: 'muy alto', class: 'extreme', bars: 4 };
  if (pct >= 60) return { level: 'alto', class: 'high', bars: 3 };
  if (pct >= 40) return { level: 'moderado', class: 'moderate', bars: 2 };
  if (pct >= 20) return { level: 'bajo', class: 'low', bars: 1 };
  return { level: 'muy bajo', class: 'none', bars: 0 };
}

function _dayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date(); today.setHours(12,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const names = ['dom','lun','mar','mié','jue','vie','sáb'];
  return names[d.getDay()];
}

function _createRainBar(rainChance) {
  const pct = parseInt(rainChance) || 0;
  const info = _getRainLevel(rainChance);
  const container = document.createElement('div');
  container.className = 'wp-rain-bar-container';
  const bar = document.createElement('div');
  bar.className = `wp-rain-bar ${info.class}`;
  bar.style.width = Math.min(pct, 100) + '%';
  container.appendChild(bar);
  const label = document.createElement('span');
  label.className = 'wp-rain-label';
  label.textContent = pct + '%';
  if (pct >= 60) label.style.color = 'rgba(0,180,255,0.9)';
  else if (pct >= 40) label.style.color = 'rgba(255,200,50,0.9)';
  else label.style.color = 'var(--text-dim)';
  container.appendChild(label);
  return container;
}

export function showWeatherForecast(data) {
  const panel = document.getElementById('weather-panel');
  const cityEl = document.getElementById('wp-city');
  const currentEl = document.getElementById('wp-current');
  const cardsEl = document.getElementById('wp-cards');
  if (!panel || !cityEl || !cardsEl) return;

  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

  const city = data.city || data.nearestArea?.[0]?.areaName?.[0]?.value || '—';
  const current = data.current_condition?.[0];
  const forecast = data.weather || [];

  cityEl.textContent = `📍 ${city}`;

  if (current) {
    const temp = current.temp_C || '—';
    const desc = current.weatherDesc?.[0]?.value || '';
    const humidity = current.humidity || '—';
    const wind = current.windspeedKmph || '—';
    const feels = current.FeelsLikeC || temp;
    const icon = _getIcon(desc);
    currentEl.innerHTML = `${icon} ${temp}° <span style="opacity:0.5;font-size:0.5rem">(sens ${feels}° · 💨 ${wind}km/h · 💧 ${humidity}%)</span>`;
  } else {
    currentEl.textContent = '';
  }

  cardsEl.textContent = '';
  forecast.slice(0, 5).forEach(day => {
    const date = day.date;
    const astronomy = day.astronomy?.[0] || {};
    const sunrise = astronomy.sunrise || '—';
    const sunset = astronomy.sunset || '—';
    const hourly = day.hourly?.[0] || {};
    const desc = hourly.weatherDesc?.[0]?.value || '—';
    const icon = _getIcon(desc);
    const hi = hourly.tempC || day.maxtempC || '—';
    const lo = hourly.tempC || day.mintempC || '—';
    const rain = hourly.chanceofrain || '—';
    const humidity = hourly.humidity || '—';
    const wind = hourly.windspeedKmph || '—';
    const uv = hourly.uvIndex || '—';
    const cardClass = _getCardClass(desc, rain);

    const card = document.createElement('div');
    card.className = 'wp-card ' + cardClass;

    const daySpan = document.createElement('div');
    daySpan.className = 'wp-card-day';
    daySpan.textContent = _dayName(date);
    card.appendChild(daySpan);

    const dateSpan = document.createElement('div');
    dateSpan.className = 'wp-card-date';
    dateSpan.textContent = date.substring(5);
    card.appendChild(dateSpan);

    const iconSpan = document.createElement('div');
    iconSpan.className = 'wp-card-icon';
    iconSpan.textContent = icon;
    card.appendChild(iconSpan);

    const tempsDiv = document.createElement('div');
    tempsDiv.className = 'wp-card-temps';

    const highSpan = document.createElement('span');
    highSpan.className = 'wp-card-high';
    highSpan.textContent = hi + '°';
    tempsDiv.appendChild(highSpan);

    if (lo && lo !== hi) {
      const lowSpan = document.createElement('span');
      lowSpan.className = 'wp-card-low';
      lowSpan.textContent = lo + '°';
      tempsDiv.appendChild(lowSpan);
    }
    card.appendChild(tempsDiv);

    const rainBar = _createRainBar(rain);
    card.appendChild(rainBar);

    const details = document.createElement('div');
    details.className = 'wp-card-details';
    details.textContent = `💧${humidity}% 💨${wind}km/h ☀️${uv}`;
    card.appendChild(details);

    if (sunrise !== '—') {
      const sunDiv = document.createElement('div');
      sunDiv.className = 'wp-card-sun';
      sunDiv.textContent = `🌅 ${sunrise} · 🌇 ${sunset}`;
      card.appendChild(sunDiv);
    }

    cardsEl.appendChild(card);
  });

  const totalWidth = forecast.slice(0,5).length * 90;
  cardsEl.style.justifyContent = totalWidth > 400 ? 'flex-start' : 'center';

  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.classList.add('visible'));

  _hideTimer = setTimeout(() => {
    hideWeatherForecast();
  }, 45000);
}

export function hideWeatherForecast() {
  const panel = document.getElementById('weather-panel');
  if (!panel) return;
  panel.classList.remove('visible');
  setTimeout(() => { panel.style.display = 'none'; }, 250);
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

export function initWeatherPanel() {
  document.getElementById('wp-close')?.addEventListener('click', hideWeatherForecast);
}
