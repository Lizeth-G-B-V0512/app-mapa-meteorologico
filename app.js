/* ==========================================================
   Mapa Meteorológico Integral: lógica de la aplicación
   APIs:
   - Nominatim (OpenStreetMap): geocodificación directa e inversa
   - Open-Meteo: clima actual y pronóstico de 5 días (sin API key)
   - Leaflet + teselas de OpenStreetMap: mapa interactivo
   ========================================================== */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

const form = document.getElementById('search-form');
const input = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const weatherCard = document.getElementById('weather-card');

/* ---------- Mapa ---------- */
const map = L.map('map', { zoomControl: true }).setView([19.2847, -99.5108], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let marker = null;

/* ---------- Códigos WMO de Open-Meteo ---------- */
const WMO = {
  0: ['Despejado', '☀️'], 1: ['Mayormente despejado', '🌤️'], 2: ['Parcialmente nublado', '⛅'],
  3: ['Nublado', '☁️'], 45: ['Niebla', '🌫️'], 48: ['Niebla con escarcha', '🌫️'],
  51: ['Llovizna ligera', '🌦️'], 53: ['Llovizna', '🌦️'], 55: ['Llovizna intensa', '🌧️'],
  56: ['Llovizna helada', '🌧️'], 57: ['Llovizna helada intensa', '🌧️'],
  61: ['Lluvia ligera', '🌦️'], 63: ['Lluvia', '🌧️'], 65: ['Lluvia intensa', '🌧️'],
  66: ['Lluvia helada', '🌧️'], 67: ['Lluvia helada intensa', '🌧️'],
  71: ['Nevada ligera', '🌨️'], 73: ['Nevada', '🌨️'], 75: ['Nevada intensa', '❄️'], 77: ['Granizo fino', '🌨️'],
  80: ['Chubascos ligeros', '🌦️'], 81: ['Chubascos', '🌧️'], 82: ['Chubascos violentos', '⛈️'],
  85: ['Chubascos de nieve', '🌨️'], 86: ['Chubascos de nieve intensos', '❄️'],
  95: ['Tormenta eléctrica', '⛈️'], 96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta con granizo intenso', '⛈️']
};

const describeCode = (code) => WMO[code] || ['Sin datos', '🌡️'];

const CONDITION_ICONS = {
  'Despejado': '☀️', 'Nublado': '☁️', 'Lluvia Ligera': '🌦️',
  'Tormenta Eléctrica': '⛈️', 'Tormenta Meteorológica': '⛈️'
};

/* ---------- Utilidades ---------- */
const escapeHTML = (text) => String(text).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const dayName = (isoDate) => new Date(`${isoDate}T12:00:00`)
  .toLocaleDateString('es-MX', { weekday: 'short' })
  .replace('.', '');

function showLoading(message) {
  weatherCard.innerHTML = `<div class="loading"><span class="spinner" aria-hidden="true"></span><p>${message}</p></div>`;
}

function showError(message) {
  weatherCard.innerHTML = `<p class="error-msg">${message}</p>`;
}

function setBusy(busy) {
  searchBtn.disabled = busy;
  searchBtn.textContent = busy ? 'Consultando…' : 'Consultar API';
}

/* ---------- Consumo de APIs ---------- */
async function geocode(query) {
  const url = `${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=es`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nominatim respondió ${response.status}`);
  const data = await response.json();
  return data[0] || null;
}

async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=es`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nominatim respondió ${response.status}`);
  return response.json();
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: 5
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!response.ok) throw new Error(`Open-Meteo respondió ${response.status}`);
  return response.json();
}

/* Parámetros simulados de respaldo (lógica original de la práctica) */
function simulatedWeather() {
  const conditions = ['Despejado', 'Nublado', 'Lluvia Ligera', 'Tormenta Eléctrica'];
  return {
    temp: (Math.random() * (35 - 5) + 5).toFixed(1),
    humidity: Math.floor(Math.random() * (100 - 40) + 40),
    condition: conditions[Math.floor(Math.random() * conditions.length)]
  };
}

/* ---------- Flujo principal ---------- */
async function buildReport(label, lugar) {
  const lat = Number(lugar.lat);
  const lon = Number(lugar.lon);

  let current = null;
  let daily = null;
  let source = 'live';

  try {
    const weather = await fetchWeather(lat, lon);
    const [condition, icon] = describeCode(weather.current.weather_code);
    current = {
      temp: weather.current.temperature_2m.toFixed(1),
      humidity: weather.current.relative_humidity_2m,
      feels: weather.current.apparent_temperature.toFixed(1),
      wind: weather.current.wind_speed_10m.toFixed(0),
      pressure: weather.current.surface_pressure.toFixed(0),
      condition,
      icon
    };
    daily = weather.daily;
  } catch (error) {
    console.warn('Open-Meteo no disponible, se usan datos simulados.', error);
    const sim = simulatedWeather();
    current = { ...sim, feels: '—', wind: '—', pressure: '—', icon: CONDITION_ICONS[sim.condition] };
    source = 'simulated';
  }

  // Lógica de negocio: si el usuario busca "Lerma", se fuerzan los datos solicitados por el cliente.
  if (label.toLowerCase() === 'lerma') {
    current.temp = '27.4';
    current.humidity = '91';
    current.condition = 'Tormenta Meteorológica';
    current.icon = CONDITION_ICONS['Tormenta Meteorológica'];
    source = 'client';
  }

  renderReport(label, lugar, current, daily, source);
  placeMarker(lat, lon, label, current);
}

function renderReport(label, lugar, current, daily, source) {
  const badges = {
    live: '<span class="badge">Clima en vivo de Open-Meteo</span>',
    simulated: '<span class="badge">Datos simulados: Open-Meteo no respondió</span>',
    client: '<span class="badge alert">Datos fijados por el cliente</span>'
  };

  const forecastHTML = daily ? `
    <h4>Pronóstico de 5 días</h4>
    <ul class="forecast">
      ${daily.time.map((day, i) => `
        <li>
          <span>${dayName(day)}</span>
          <span class="f-icon" aria-hidden="true">${describeCode(daily.weather_code[i])[1]}</span>
          <span class="f-max">${Math.round(daily.temperature_2m_max[i])}°</span>
          <span class="f-min">${Math.round(daily.temperature_2m_min[i])}°</span>
        </li>`).join('')}
    </ul>` : '';

  weatherCard.innerHTML = `
    <h3 class="place-name">🗺️ ${escapeHTML(label)}</h3>
    <p class="description"><strong>Descripción oficial:</strong> ${escapeHTML(lugar.display_name)}</p>
    <div class="geo-data">
      <p><strong>Latitud:</strong> ${Number(lugar.lat).toFixed(5)} &nbsp;|&nbsp; <strong>Longitud:</strong> ${Number(lugar.lon).toFixed(5)}</p>
    </div>

    <hr class="divider">

    <div class="weather-data">
      <div class="reading">
        <span class="reading-icon" aria-hidden="true">${current.icon}</span>
        <div>
          <div class="temp">${current.temp}<small>°C</small></div>
          <p class="condition">${current.condition}</p>
        </div>
      </div>
      ${badges[source]}

      <h4>Parámetros climatológicos</h4>
      <dl class="metrics">
        <div><dt>Humedad</dt><dd>${current.humidity}%</dd></div>
        <div><dt>Sensación</dt><dd>${current.feels}${current.feels === '—' ? '' : '°C'}</dd></div>
        <div><dt>Viento</dt><dd>${current.wind}${current.wind === '—' ? '' : ' km/h'}</dd></div>
        <div><dt>Presión</dt><dd>${current.pressure}${current.pressure === '—' ? '' : ' hPa'}</dd></div>
      </dl>

      ${forecastHTML}
    </div>

    <div class="success-footer">✓ Datos de mapa meteorológico sincronizados con éxito.</div>
  `;
}

function placeMarker(lat, lon, label, current) {
  if (marker) marker.remove();
  marker = L.marker([lat, lon]).addTo(map);
  marker.bindPopup(`<strong>${escapeHTML(label)}</strong><br>${current.icon} ${current.temp} °C, ${current.condition}`).openPopup();
  map.flyTo([lat, lon], 11, { duration: 1.2 });
}

async function searchPlace(query) {
  const city = query.trim();
  if (!city) {
    showError('⚠️ Escribe el nombre de un lugar para consultarlo.');
    input.focus();
    return;
  }

  setBusy(true);
  showLoading('Consultando base de datos geográfica y meteorológica remota…');

  try {
    const lugar = await geocode(city);
    if (!lugar) {
      showError(`❌ No se encontraron datos para «${escapeHTML(city)}». Revisa la ortografía o prueba con una ciudad cercana.`);
      return;
    }
    await buildReport(city, lugar);
  } catch (error) {
    console.error(error);
    showError('❌ Error en la comunicación asíncrona con el servidor. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    setBusy(false);
  }
}

/* ---------- Eventos ---------- */
form.addEventListener('submit', (event) => {
  event.preventDefault();
  searchPlace(input.value);
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.place;
    searchPlace(chip.dataset.place);
  });
});

// Clic en el mapa: geocodificación inversa + clima del punto elegido
map.on('click', async (event) => {
  const { lat, lng } = event.latlng;
  setBusy(true);
  showLoading('Identificando el punto seleccionado en el mapa…');
  try {
    const place = await reverseGeocode(lat, lng);
    const address = place.address || {};
    const label = address.city || address.town || address.village || address.municipality
      || address.county || address.state || place.name || 'Punto seleccionado';
    const lugar = {
      lat,
      lon: lng,
      display_name: place.display_name || `Coordenadas ${lat.toFixed(4)}, ${lng.toFixed(4)}`
    };
    input.value = label;
    await buildReport(label, lugar);
  } catch (error) {
    console.error(error);
    showError('❌ No fue posible identificar ese punto. Prueba con otro lugar del mapa.');
  } finally {
    setBusy(false);
  }
});
