const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadConfig } = require('../src/config');
const { AlertStore } = require('../src/store');
const { createSmsClient } = require('../src/sms');
const { createAlertService } = require('../src/alerts');
const { createApp } = require('../src/app');

const silent = { log() {}, error() {}, warn() {} };
const ANA = '+13055550101';
const LUIS = '+13055550102';
const CARLOS = '+13055550103';

function setup(envOverrides = {}) {
  let clock = Date.parse('2026-10-08T18:00:00Z');
  const config = loadConfig({
    EMPLOYEES: `Ana:${ANA}, Luis:${LUIS}, Carlos:${CARLOS}`,
    LOCATIONS_FILE: path.join(__dirname, '..', 'config', 'locations.json'),
    ADMIN_TOKEN: 'secret',
    ...envOverrides,
  }, { dataFile: null });
  const store = new AlertStore(null);
  const sms = createSmsClient(config, silent);
  const service = createAlertService({ config, store, sms, logger: silent, now: () => clock });
  const app = createApp({ config, service, logger: silent });
  return { config, store, sms, service, app, advance: (min) => { clock += min * 60000; } };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { server.close(); }
}

test('scan + submit sends an SMS to every employee', async () => {
  const { app, sms } = setup();
  await withServer(app, async (base) => {
    const page = await fetch(`${base}/r/mia-airport`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Miami Airport/);

    const res = await fetch(`${base}/api/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: 'mia-airport', plate: 'abc-123', spot: 'Fila B 12', lat: 25.79, lng: -80.29 }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.number, 1001);
  });
  assert.deepEqual(sms.sent.map((m) => m.to), [ANA, LUIS, CARLOS]);
  assert.match(sms.sent[0].body, /DEVOLUCION #1001/);
  assert.match(sms.sent[0].body, /Placa: ABC123/);
  assert.match(sms.sent[0].body, /maps\.google\.com\/\?q=25\.79,-80\.29/);
  assert.match(sms.sent[0].body, /Responde 1001/);
});

test('location "notify" list limits recipients', async () => {
  const { service, sms } = setup();
  await service.createReturn({ locationId: 'brickell', plate: 'XYZ9' });
  assert.deepEqual(sms.sent.map((m) => m.to), [ANA, CARLOS]);
});

test('rejects unknown location and missing plate', async () => {
  const { app, sms } = setup();
  await withServer(app, async (base) => {
    const post = (b) => fetch(`${base}/api/returns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    assert.equal((await post({ locationId: 'nope', plate: 'ABC' })).status, 400);
    assert.equal((await post({ locationId: 'mia-airport', plate: '' })).status, 400);
    assert.equal((await fetch(`${base}/r/nope`)).status, 404);
  });
  assert.equal(sms.sent.length, 0);
});

test('duplicate scan of same plate does not re-alert', async () => {
  const { service, sms, advance } = setup();
  const a = await service.createReturn({ locationId: 'mia-airport', plate: 'ABC123' });
  const b = await service.createReturn({ locationId: 'mia-airport', plate: 'abc 123' });
  assert.equal(b.duplicate, true);
  assert.equal(b.alert.number, a.alert.number);
  assert.equal(sms.sent.length, 3);
  advance(16);
  const c = await service.createReturn({ locationId: 'mia-airport', plate: 'ABC123' });
  assert.equal(c.duplicate, false);
});

test('first employee to reply claims it; others are told', async () => {
  const { service, sms, store } = setup();
  await service.createReturn({ locationId: 'mia-airport', plate: 'ABC123' });
  sms.sent.length = 0;

  const reply = await service.handleReply(LUIS, 'ok 1001');
  assert.match(reply, /asignado a ti/);
  assert.deepEqual(sms.sent.map((m) => m.to), [ANA, CARLOS]);
  assert.match(sms.sent[0].body, /lo toma Luis/);

  assert.match(await service.handleReply(ANA, '1001'), /ya lo tiene Luis/);
  assert.match(await service.handleReply(LUIS, 'Listo'), /cerrado/);
  assert.equal(store.findByNumber(1001).status, 'done');
  assert.match(await service.handleReply(ANA, '1001'), /ya esta cerrado/);
});

test('bare OK claims the only open alert, asks when several', async () => {
  const { service } = setup();
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1' });
  await service.createReturn({ locationId: 'mia-airport', plate: 'BBB2' });
  assert.match(await service.handleReply(ANA, 'ok'), /#1001, #1002/);
  await service.handleReply(ANA, '1001');
  assert.match(await service.handleReply(CARLOS, 'si'), /#1002 asignado a ti/);
});

test('unknown senders are ignored', async () => {
  const { service } = setup();
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1' });
  assert.equal(await service.handleReply('+19999999999', '1001'), null);
});

test('reminders are re-sent while unclaimed, up to MAX_REMINDERS', async () => {
  const { service, sms, advance } = setup({ REMINDER_MINUTES: '10', MAX_REMINDERS: '2' });
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1' });
  sms.sent.length = 0;
  advance(5);
  assert.equal(await service.sendReminders(), 0);
  advance(5);
  assert.equal(await service.sendReminders(), 1);
  assert.match(sms.sent[0].body, /RECORDATORIO: #1001 sin asignar hace 10 min/);
  advance(10);
  assert.equal(await service.sendReminders(), 1);
  advance(10);
  assert.equal(await service.sendReminders(), 0);
});

test('no reminders once claimed', async () => {
  const { service, advance } = setup();
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1' });
  await service.handleReply(ANA, '1001');
  advance(30);
  assert.equal(await service.sendReminders(), 0);
});

test('inbound webhook replies with TwiML', async () => {
  const { app, service } = setup();
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1' });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/sms/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: ANA, Body: '1001' }),
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<Message>#1001 asignado a ti/);
  });
});

test('English SMS templates', async () => {
  const { service, sms } = setup({ SMS_LANG: 'en' });
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1', notes: 'Tanque lleno, sin daños 🚗' });
  assert.match(sms.sent[0].body, /RETURN #1001/);
  assert.match(sms.sent[0].body, /Note: Tanque lleno, sin danos/);
  assert.doesNotMatch(sms.sent[0].body, /[^\x00-\x7F]/);
});

test('admin list requires token', async () => {
  const { app, service } = setup();
  await service.createReturn({ locationId: 'mia-airport', plate: 'AAA1' });
  await withServer(app, async (base) => {
    assert.equal((await fetch(`${base}/api/alerts`)).status, 401);
    const res = await fetch(`${base}/api/alerts`, { headers: { Authorization: 'Bearer secret' } });
    assert.equal((await res.json()).length, 1);
  });
});

test('EMPLOYEES must be US E.164 numbers', () => {
  assert.throws(() => loadConfig({ EMPLOYEES: 'Ana:3055550101' }), /E\.164/);
});
