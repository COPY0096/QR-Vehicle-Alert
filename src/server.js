require('dotenv').config();
const { loadConfig } = require('./config');
const { AlertStore } = require('./store');
const { createSmsClient } = require('./sms');
const { createAlertService } = require('./alerts');
const { createApp } = require('./app');

const config = loadConfig();
if (!config.employees.length) {
  console.error('No employees configured. Set EMPLOYEES=Name:+1XXXXXXXXXX,... in .env');
  process.exit(1);
}

const store = new AlertStore(config.dataFile);
const sms = createSmsClient(config);
const service = createAlertService({ config, store, sms });
const app = createApp({ config, service });

setInterval(() => {
  service.sendReminders().catch((err) => console.error('Reminder job failed:', err));
}, 30 * 1000).unref();

app.listen(config.port, () => {
  console.log(`QR Vehicle Alert listening on port ${config.port}${config.dryRun ? ' (DRY_RUN: SMS are only logged)' : ''}`);
  console.log(`Employees: ${config.employees.map((e) => e.name).join(', ')}`);
  for (const loc of config.locations.values()) console.log(`  ${loc.name}: ${config.baseUrl}/r/${loc.id}`);
});
