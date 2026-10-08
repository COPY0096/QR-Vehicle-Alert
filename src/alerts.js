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

  /** Customer submitted the drop-off form. */
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

    const alert = store.create({ ...fields, createdAt: new Date(now()).toISOString(), lastNotifiedAt: new Date(now()).toISOString() });
    const recipients = recipientsFor(location);
    const delivered = await broadcast(recipients, t.newAlert(alert, location, config.timeZone), alert);
    store.update(alert, { notified: delivered });
    if (!delivered) logger.error(`Alert #${alert.number}: no SMS could be delivered!`);
    return { alert, duplicate: false };
  }

  /** Re-send open, unclaimed alerts so a car is never forgotten at the curb. Call periodically. */
  async function sendReminders() {
    if (!config.reminderMinutes) return 0;
    const intervalMs = config.reminderMinutes * 60 * 1000;
    let sent = 0;
    for (const alert of store.open()) {
      if (alert.claimedBy || alert.remindersSent >= config.maxReminders) continue;
      if (now() - Date.parse(alert.lastNotifiedAt || alert.createdAt) < intervalMs) continue;
      const location = config.locations.get(alert.locationId);
      if (!location) continue;
      const minutes = Math.round((now() - Date.parse(alert.createdAt)) / 60000);
      store.update(alert, { remindersSent: alert.remindersSent + 1, lastNotifiedAt: new Date(now()).toISOString() });
      await broadcast(recipientsFor(location), t.reminder(alert, location, config.timeZone, minutes), alert);
      sent += 1;
    }
    return sent;
  }

  /**
   * Employee replied by SMS. Returns the text to answer them with (or null to stay silent).
   * Supported replies: "1042" / "OK 1042" (claim), "OK" (claim the only open alert),
   * "LISTO 1042" / "DONE 1042" / "LISTO" (close).
   */
  async function handleReply(from, rawBody) {
    const employee = config.employees.find((e) => e.phone === from);
    if (!employee) return null; // Unknown number: ignore silently.

    const body = clean(rawBody, 40).toUpperCase().replace(/#/g, '');
    if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'START', 'UNSTOP'].includes(body)) {
      return null; // Opt-out keywords are handled by Twilio itself.
    }
    const numberMatch = body.match(/(\d{3,})/);
    const number = numberMatch ? Number(numberMatch[1]) : null;
    const isDone = /\b(LISTO|DONE|TERMINADO|HECHO)\b/.test(body);

    if (isDone) {
      let alert;
      if (number) alert = store.findByNumber(number);
      else {
        alert = store.list().find((a) => a.status === 'claimed' && a.claimedPhone === employee.phone);
        if (!alert) return t.nothingToClose();
      }
      if (!alert) return t.notFound(number);
      if (alert.status === 'done') return t.alreadyDone(alert);
      store.update(alert, {
        status: 'done',
        doneAt: new Date(now()).toISOString(),
        claimedBy: alert.claimedBy || employee.name,
        claimedPhone: alert.claimedPhone || employee.phone,
      });
      return t.done(alert);
    }

    let alert;
    if (number) {
      alert = store.findByNumber(number);
      if (!alert) return t.notFound(number);
    } else if (/^(OK|SI|YES|Y|VOY|TOMO|YO)$/.test(body)) {
      const open = store.open();
      if (open.length === 0) return t.noneOpen();
      if (open.length > 1) return t.whichOne(open.map((a) => a.number));
      [alert] = open;
    } else {
      return t.help();
    }

    if (alert.status === 'done') return t.alreadyDone(alert);
    if (alert.status === 'claimed') {
      return alert.claimedPhone === employee.phone ? t.claimedYou(alert) : t.alreadyClaimed(alert);
    }

    store.update(alert, {
      status: 'claimed',
      claimedBy: employee.name,
      claimedPhone: employee.phone,
      claimedAt: new Date(now()).toISOString(),
    });
    const location = config.locations.get(alert.locationId);
    const others = (location ? recipientsFor(location) : config.employees).filter((e) => e.phone !== employee.phone);
    await broadcast(others, t.claimedOther(alert), alert);
    return t.claimedYou(alert);
  }

  return { createReturn, sendReminders, handleReply, recipientsFor, store };
}

module.exports = { createAlertService, ValidationError };
