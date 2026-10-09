const { getTemplates } = require('./messages');

const MAX_LEN = { plate: 12, contract: 20, vehicle: 40, spot: 60, notes: 120 };

/** Normalize free text from the customer: ASCII only, single line, trimmed, length-capped. */
function clean(value, max) {
  if (value == null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseCoord(value, limit) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return Math.round(n * 1e5) / 1e5;
}

class ValidationError extends Error {}

function createAlertService({ config, store, sms, logger = console, now = () => Date.now() }) {
  const t = getTemplates(config.smsLang);

  /** Employees listed in the location's "notify", or everyone when it is not set. */
  function recipientsFor(location) {
    if (Array.isArray(location.notify) && location.notify.length) {
      const wanted = new Set(location.notify.map((n) => n.toLowerCase()));
      const list = config.employees.filter((e) => wanted.has(e.name.toLowerCase()));
      if (list.length) return list;
    }
    return config.employees;
  }

  async function broadcast(recipients, body, alert) {
    const results = await Promise.allSettled(recipients.map((e) => sms.send(e.phone, body)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`SMS to ${recipients[i].name} (${recipients[i].phone}) failed for #${alert.number}:`, r.reason?.message || r.reason);
      }
    });
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  /** Customer submitted the drop-off form: send one SMS to each recipient, once. */
  async function createReturn(input) {
    const location = config.locations.get(input.locationId);
    if (!location) throw new ValidationError('unknown_location');

    const plate = clean(input.plate, MAX_LEN.plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (plate.length < 2) throw new ValidationError('plate_required');

    const fields = {
      locationId: location.id,
      plate,
      contract: clean(input.contract, MAX_LEN.contract),
      vehicle: clean(input.vehicle, MAX_LEN.vehicle),
      spot: clean(input.spot, MAX_LEN.spot),
      notes: clean(input.notes, MAX_LEN.notes),
      lat: parseCoord(input.lat, 90),
      lng: parseCoord(input.lng, 180),
    };
    if (fields.lat == null || fields.lng == null) fields.lat = fields.lng = null;

    // Same car scanned twice (customer double-tapped, or scanned again): don't re-alert.
    const dedupeMs = config.dedupeMinutes * 60 * 1000;
    const duplicate = store.alerts.find(
      (a) => a.locationId === location.id && a.plate === plate && now() - Date.parse(a.createdAt) < dedupeMs,
    );
    if (duplicate) return { alert: duplicate, duplicate: true };

    const alert = store.create({ ...fields, createdAt: new Date(now()).toISOString() });
    const recipients = recipientsFor(location);
    const delivered = await broadcast(recipients, t.newAlert(alert, location, config.timeZone), alert);
    store.update(alert, { notified: delivered });
    if (!delivered) logger.error(`Alert #${alert.number}: no SMS could be delivered!`);
    return { alert, duplicate: false };
  }

  return { createReturn, recipientsFor, store };
}

module.exports = { createAlertService, ValidationError };
