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
    newAlert: (a, loc, tz) =>
      `DEVOLUCION #${a.number} - ${loc.name}\n${details(a, loc, 'es', tz)}\nResponde ${a.number} para tomarlo.`,
    reminder: (a, loc, tz, minutes) =>
      `RECORDATORIO: #${a.number} sin asignar hace ${minutes} min (riesgo de multa)\n${loc.name}\n${details(a, loc, 'es', tz)}\nResponde ${a.number} para tomarlo.`,
    claimedYou: (a) => `#${a.number} asignado a ti (placa ${a.plate}). Responde LISTO ${a.number} cuando lo muevas.`,
    claimedOther: (a) => `#${a.number} (placa ${a.plate}) lo toma ${a.claimedBy}. No hace falta ir.`,
    alreadyClaimed: (a) => `#${a.number} ya lo tiene ${a.claimedBy}.`,
    alreadyDone: (a) => `#${a.number} ya esta cerrado.`,
    done: (a) => `#${a.number} cerrado. Gracias!`,
    notFound: (n) => `No hay una alerta #${n}.`,
    nothingToClose: () => 'No tienes alertas asignadas. Usa LISTO <numero>.',
    whichOne: (nums) => `Hay varias alertas abiertas: ${nums.map((n) => `#${n}`).join(', ')}. Responde con el numero.`,
    noneOpen: () => 'No hay alertas abiertas ahora.',
    help: () => 'Responde el numero (ej. 1042) para tomar un vehiculo y LISTO 1042 al terminar.',
  },
  en: {
    newAlert: (a, loc, tz) =>
      `RETURN #${a.number} - ${loc.name}\n${details(a, loc, 'en', tz)}\nReply ${a.number} to take it.`,
    reminder: (a, loc, tz, minutes) =>
      `REMINDER: #${a.number} unassigned for ${minutes} min (ticket risk)\n${loc.name}\n${details(a, loc, 'en', tz)}\nReply ${a.number} to take it.`,
    claimedYou: (a) => `#${a.number} is yours (plate ${a.plate}). Reply DONE ${a.number} once it is moved.`,
    claimedOther: (a) => `#${a.number} (plate ${a.plate}) taken by ${a.claimedBy}. No need to go.`,
    alreadyClaimed: (a) => `#${a.number} is already taken by ${a.claimedBy}.`,
    alreadyDone: (a) => `#${a.number} is already closed.`,
    done: (a) => `#${a.number} closed. Thanks!`,
    notFound: (n) => `There is no alert #${n}.`,
    nothingToClose: () => 'You have no assigned alerts. Use DONE <number>.',
    whichOne: (nums) => `Several open alerts: ${nums.map((n) => `#${n}`).join(', ')}. Reply with the number.`,
    noneOpen: () => 'There are no open alerts right now.',
    help: () => 'Reply the number (e.g. 1042) to take a vehicle and DONE 1042 when finished.',
  },
};

function getTemplates(lang) {
  const t = templates[lang] || templates.es;
  // Wrap every template so user-provided text never introduces non-GSM characters.
  return Object.fromEntries(Object.entries(t).map(([k, fn]) => [k, (...args) => stripAccents(fn(...args))]));
}

module.exports = { getTemplates };
