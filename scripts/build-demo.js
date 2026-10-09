// Builds a static, server-less demo of the customer flow into ./docs for GitHub Pages.
// The page is the real one (src/page.js + public/), and submissions run the real
// alert logic (src/alerts.js) in the browser. No SMS is ever sent.
// Usage: npm run demo:build   (DEMO_BASE_URL overrides the Pages URL used in the QR codes)
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { renderReturnPage } = require('../src/page');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const BASE_URL = (process.env.DEMO_BASE_URL || 'https://copy0096.github.io/QR-Vehicle-Alert').replace(/\/$/, '');

// Fictional staff for the demo: names only are shown, numbers are never used.
const EMPLOYEES = [
  { name: 'Maria', phone: '+13055550101' },
  { name: 'Luis', phone: '+13055550102' },
  { name: 'Carlos', phone: '+13055550103' },
];

const BANNER = '<div class="demo-banner">DEMO · No se envían SMS reales · No real texts are sent</div>';

const DEMO_CSS = `
.demo-banner { background: #f2a541; color: #14213d; font-weight: 700; text-align: center; padding: 8px 12px; font-size: 14px; }
#demo-sms { margin-top: 24px; text-align: left; border: 1px dashed var(--border); border-radius: 12px; padding: 16px; }
.demo-sms-title { margin: 0 0 12px; font-weight: 600; color: var(--muted); }
#demo-sms pre { white-space: pre-wrap; word-break: break-word; margin: 0 0 16px; padding: 14px; border-radius: 12px; background: var(--bg); font: 15px/1.45 ui-monospace, Menlo, Consolas, monospace; }
#demo-sms button { font: inherit; font-weight: 600; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--accent); background: transparent; color: var(--accent); width: 100%; }
.loc-list { display: grid; gap: 16px; margin-top: 24px; }
.loc { display: flex; gap: 16px; align-items: center; padding: 16px; border: 1px solid var(--border); border-radius: 12px; color: var(--text); text-decoration: none; }
.loc img { width: 112px; height: 112px; border-radius: 8px; background: #fff; flex: none; }
.loc strong { display: block; font-size: 1.1rem; }
.loc span { color: var(--muted); font-size: 0.9rem; }
`;

// Bundles CommonJS modules that have no Node-only dependencies so they run in the browser.
function bundle(modules) {
  const defs = Object.entries(modules)
    .map(([name, file]) => `defs[${JSON.stringify(name)}] = function (module, exports, require) {\n${fs.readFileSync(file, 'utf8')}\n};`)
    .join('\n');
  return `(function () {
var defs = {}, cache = {};
function require(name) {
  if (!cache[name]) { var m = { exports: {} }; cache[name] = m; defs[name](m, m.exports, require); }
  return cache[name].exports;
}
${defs}
window.QRDemoRequire = require;
})();\n`;
}

function demoPage(location) {
  const data = {
    location,
    employees: EMPLOYEES,
    smsLang: 'es',
    timeZone: 'America/New_York',
    dedupeMinutes: 15,
  };
  return renderReturnPage(location)
    .replace('href="/static/style.css"', 'href="style.css"')
    .replace('<body>', `<body>\n${BANNER}`)
    .replace(
      '<script src="/static/return.js" defer></script>',
      `<script>window.QR_DEMO = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script src="app-bundle.js" defer></script>
<script src="demo-mock.js" defer></script>
<script src="return.js" defer></script>`,
    );
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function main() {
  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'locations.json'), 'utf8'));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  fs.writeFileSync(path.join(OUT, 'style.css'), fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8') + DEMO_CSS);
  fs.copyFileSync(path.join(ROOT, 'public', 'return.js'), path.join(OUT, 'return.js'));
  fs.copyFileSync(path.join(__dirname, 'demo-mock.js'), path.join(OUT, 'demo-mock.js'));
  fs.writeFileSync(
    path.join(OUT, 'app-bundle.js'),
    bundle({ './messages': path.join(ROOT, 'src', 'messages.js'), './alerts': path.join(ROOT, 'src', 'alerts.js') }),
  );

  const cards = [];
  for (const loc of locations) {
    const url = `${BASE_URL}/${loc.id}.html`;
    fs.writeFileSync(path.join(OUT, `${loc.id}.html`), demoPage(loc));
    await QRCode.toFile(path.join(OUT, `qr-${loc.id}.png`), url, { errorCorrectionLevel: 'H', margin: 2, width: 600 });
    cards.push(`<a class="loc" href="${loc.id}.html"><img src="qr-${loc.id}.png" alt="QR ${esc(loc.name)}"><div><strong>${esc(loc.name)}</strong><span>${esc(loc.address || '')}</span></div></a>`);
    console.log(`${loc.name}: ${url}`);
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QR Vehicle Alert - Demo</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
${BANNER}
<main class="card">
<h1>QR Vehicle Alert</h1>
<p class="instructions">Demo del flujo del cliente: escanee un código con el celular o toque un punto de devolución, llene el formulario y vea el SMS que recibirían los empleados. Nada se envía de verdad.</p>
<div class="loc-list">
${cards.join('\n')}
</div>
</main>
</body>
</html>
`);
  console.log(`\nDemo written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
