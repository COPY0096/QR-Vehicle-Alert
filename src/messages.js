// SMS templates. Kept to plain GSM-7 characters (no emojis/accents) so each
// message fits in fewer SMS segments and costs less on Twilio.

function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function details(alert, location, lang, timeZone) {
  const time = new Date(alert.createdAt).toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const L = lang === 'en'
    ? { plate: 'Plate', contract: 'Contract', spot: 'Spot', vehicle: 'Vehicle', note: 'Note', map: 'Map', time: 'Time' }
    : { plate: 'Placa', contract: 'Contrato', spot: 'Lugar', vehicle: 'Vehiculo', note: 'Nota', map: 'Mapa', time: 'Hora' };
  const lines = [`${L.plate}: ${alert.plate}`];
  if (alert.contract) lines.push(`${L.contract}: ${alert.contract}`);
  if (alert.vehicle) lines.push(`${L.vehicle}: ${alert.vehicle}`);
  lines.push(`${L.spot}: ${alert.spot || location.address || '-'}`);
  if (alert.notes) lines.push(`${L.note}: ${alert.notes}`);
  if (alert.lat != null && alert.lng != null) {
    lines.push(`${L.map}: https://maps.google.com/?q=${alert.lat},${alert.lng}`);
  }
  lines.push(`${L.time}: ${time}`);
  return lines.join('\n');
}

const templates = {
  es: {
    newAlert: (a, loc, tz) => `DEVOLUCION #${a.number} - ${loc.name}\n${details(a, loc, 'es', tz)}`,
  },
  en: {
    newAlert: (a, loc, tz) => `RETURN #${a.number} - ${loc.name}\n${details(a, loc, 'en', tz)}`,
  },
};

function getTemplates(lang) {
  const t = templates[lang] || templates.es;
  // Wrap every template so user-provided text never introduces non-GSM characters.
  return Object.fromEntries(Object.entries(t).map(([k, fn]) => [k, (...args) => stripAccents(fn(...args))]));
}

module.exports = { getTemplates };
