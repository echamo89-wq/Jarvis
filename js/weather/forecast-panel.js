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

function _getCardClass(desc) {
  const d = desc.toLowerCase();
  if (d.includes('rain') || d.includes('drizzle') || d.includes('thunder') || d.includes('sleet') || d.includes('snow')) return 'rain';
  if (d.includes('clear') || d.includes('sunny') || d.includes('fine')) return 'sunny';
  return 'cloudy';
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
    const icon = _getIcon(desc);
    currentEl.textContent = `${icon} ${temp}°`;
  } else {
    currentEl.textContent = '';
  }

  cardsEl.textContent = '';
  forecast.slice(0, 5).forEach(day => {
    const date = day.date;
    const hourly = day.hourly?.[0] || {};
    const desc = hourly.weatherDesc?.[0]?.value || day.astronomy?.[0]?.weather || '—';
    const icon = _getIcon(desc);
    const hi = hourly.tempC || day.maxtempC || '—';
    const lo = hourly.tempC || day.mintempC || '—';
    const rain = hourly.chanceofrain || '—';
    const cardClass = _getCardClass(desc);

    const card = document.createElement('div');
    card.className = 'wp-card ' + cardClass;

    const daySpan = document.createElement('span');
    daySpan.className = 'wp-card-day';
    daySpan.textContent = _dayName(date);
    card.appendChild(daySpan);

    const iconSpan = document.createElement('span');
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

    if (rain !== '—') {
      const rainSpan = document.createElement('span');
      rainSpan.className = 'wp-card-rain';
      rainSpan.textContent = '💧' + rain + '%';
      card.appendChild(rainSpan);
    }

    cardsEl.appendChild(card);
  });

  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.classList.add('visible'));

  _hideTimer = setTimeout(() => {
    hideWeatherForecast();
  }, 30000);
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
