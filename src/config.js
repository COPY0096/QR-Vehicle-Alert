const fs = require('fs');
const path = require('path');

const E164 = /^\+1\d{10}$/;

function parseEmployees(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(':');
      const name = idx > 0 ? entry.slice(0, idx).trim() : entry;
      const phone = (idx > 0 ? entry.slice(idx + 1) : entry).replace(/[\s()-]/g, '');
      if (!E164.test(phone)) {
        throw new Error(`EMPLOYEES: "${entry}" must be Name:+1XXXXXXXXXX (US E.164)`);
      }
      return { name, phone };
    });
}

function loadLocations(file) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = new Map();
  for (const loc of list) {
    if (!loc.id || !/^[a-z0-9-]+$/.test(loc.id)) {
      throw new Error(`locations: invalid id "${loc.id}" (use lowercase letters, digits and dashes)`);
    }
    map.set(loc.id, loc);
  }
  return map;
}

function intEnv(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) throw new Error(`${key} must be a non-negative integer`);
  return n;
}

function loadConfig(env = process.env, overrides = {}) {
  const twilio = {
    accountSid: env.TWILIO_ACCOUNT_SID || '',
    authToken: env.TWILIO_AUTH_TOKEN || '',
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID || '',
    fromNumber: env.TWILIO_FROM_NUMBER || '',
  };
  const dryRun = !(twilio.accountSid && twilio.authToken);
  if (!dryRun && !twilio.messagingServiceSid && !twilio.fromNumber) {
    throw new Error('Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER');
  }

  return {
    port: intEnv(env, 'PORT', 3000),
    baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    dryRun,
    twilio,
    employees: parseEmployees(env.EMPLOYEES),
    locations: loadLocations(env.LOCATIONS_FILE || path.join(__dirname, '..', 'config', 'locations.json')),
    smsLang: env.SMS_LANG === 'en' ? 'en' : 'es',
    timeZone: env.TZ || 'America/New_York',
    dedupeMinutes: intEnv(env, 'DEDUPE_MINUTES', 15),
    adminToken: env.ADMIN_TOKEN || '',
    dataFile: env.DATA_FILE || path.join(__dirname, '..', 'data', 'alerts.json'),
    ...overrides,
  };
}

module.exports = { loadConfig, parseEmployees };
