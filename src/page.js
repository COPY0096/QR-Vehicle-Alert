function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
${body}
</body>
</html>`;
}

function renderReturnPage(location) {
  return layout(
    `Vehicle return - ${location.name}`,
    `<main class="card" data-location="${esc(location.id)}">
  <div class="lang">
    <button type="button" data-set-lang="en">English</button>
    <button type="button" data-set-lang="es">Español</button>
  </div>
  <h1><span data-i18n="title">Vehicle return</span></h1>
  <p class="location">${esc(location.name)}</p>
  ${location.instructions ? `<p class="instructions">${esc(location.instructions)}</p>` : ''}

  <form id="return-form" novalidate>
    <label><span><span data-i18n="plate">License plate</span> *</span>
      <input name="plate" required maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="ABC1234">
    </label>
    <label><span data-i18n="contract">Rental agreement # (optional)</span>
      <input name="contract" maxlength="20" inputmode="numeric" autocomplete="off">
    </label>
    <label><span data-i18n="vehicle">Color / model (optional)</span>
      <input name="vehicle" maxlength="40" autocomplete="off" data-i18n-ph="vehiclePh" placeholder="White Toyota Corolla">
    </label>
    <label><span data-i18n="spot">Where did you park?</span>
      <input name="spot" maxlength="60" autocomplete="off" data-i18n-ph="spotPh" placeholder="Row B, spot 12 / in front of the office">
    </label>
    <label><span data-i18n="notes">Notes (optional)</span>
      <textarea name="notes" maxlength="120" rows="2" data-i18n-ph="notesPh" placeholder="Fuel level, damage, etc."></textarea>
    </label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="geo" id="geo-status" data-i18n="geoAsk">We will ask for your location so staff can find the car faster.</p>
    <label class="check"><input type="checkbox" name="keys" required> <span data-i18n="keys">I left the keys in the key drop box</span></label>
    <button type="submit" id="submit" data-i18n="send">Notify staff</button>
    <p class="error" id="error" role="alert"></p>
  </form>

  <section id="done" hidden>
    <div class="ok">✓</div>
    <h2 data-i18n="thanks">Thank you! Our staff has been notified.</h2>
    <p><span data-i18n="ref">Reference</span>: <strong id="ref"></strong></p>
    <p data-i18n="bye">You can leave now. Thank you for renting with us!</p>
  </section>
</main>
<script src="/static/return.js" defer></script>`,
  );
}

function renderNotFound() {
  return layout('Not found', '<main class="card"><h1>QR code not recognized</h1><p>Please contact the counter.</p><p>Código QR no reconocido. Por favor contacte al mostrador.</p></main>');
}

module.exports = { renderReturnPage, renderNotFound };
