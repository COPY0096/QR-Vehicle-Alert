// Generates a printable QR code (PNG + SVG) for every location in config/locations.json.
// Usage: npm run qr            -> files in ./qr-codes
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { loadConfig } = require('../src/config');

async function main() {
  const config = loadConfig();
  if (/localhost|example\.com/.test(config.baseUrl)) {
    console.warn(`WARNING: BASE_URL is ${config.baseUrl}. Set your public URL in .env before printing.`);
  }
  const outDir = path.join(__dirname, '..', 'qr-codes');
  fs.mkdirSync(outDir, { recursive: true });

  for (const loc of config.locations.values()) {
    const url = `${config.baseUrl}/r/${loc.id}`;
    const opts = { errorCorrectionLevel: 'H', margin: 2 };
    await QRCode.toFile(path.join(outDir, `${loc.id}.png`), url, { ...opts, width: 1200 });
    await QRCode.toFile(path.join(outDir, `${loc.id}.svg`), url, { ...opts, type: 'svg' });
    console.log(`${loc.name}: ${url}`);
  }
  console.log(`\nQR codes saved in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
