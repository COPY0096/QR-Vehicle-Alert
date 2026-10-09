// Runs in the browser on the static GitHub Pages demo (no server).
// Replaces POST /api/returns with the real alert logic from src/alerts.js,
// using an in-browser store and a fake SMS sender, and shows the SMS that
// would have been sent instead of sending it.
(function () {
  var demo = window.QR_DEMO;
  var require = window.QRDemoRequire;
  var createAlertService = require('./alerts').createAlertService;
  var KEY = 'qr-demo-alerts-v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }

  var saved = load();
  var store = {
    alerts: saved.alerts || [],
    nextNumber: saved.nextNumber || 1001,
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify({ alerts: this.alerts, nextNumber: this.nextNumber })); } catch (e) { /* private mode */ }
    },
    create: function (fields) {
      var alert = Object.assign({ number: this.nextNumber++, createdAt: new Date().toISOString() }, fields);
      this.alerts.push(alert);
      this.save();
      return alert;
    },
    update: function (alert, changes) { Object.assign(alert, changes); this.save(); return alert; },
    list: function () { return this.alerts.slice().reverse(); },
  };

  var sent = [];
  var sms = { send: function (to, body) { sent.push({ to: to, body: body }); return Promise.resolve({ sid: 'DEMO' }); } };

  var config = {
    locations: new Map([[demo.location.id, demo.location]]),
    employees: demo.employees,
    smsLang: demo.smsLang,
    timeZone: demo.timeZone,
    dedupeMinutes: demo.dedupeMinutes,
  };
  var service = createAlertService({ config: config, store: store, sms: sms, logger: console });

  function nameFor(phone) {
    var e = demo.employees.find(function (x) { return x.phone === phone; });
    return e ? e.name : phone;
  }

  function mapBlock(alert) {
    var p = document.createElement('p');
    p.className = 'demo-map';
    if (alert.lat != null && alert.lng != null) {
      var a = document.createElement('a');
      a.href = 'https://maps.google.com/?q=' + alert.lat + ',' + alert.lng;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Ver ubicacion en el mapa';
      p.appendChild(a);
    } else {
      p.textContent = 'Sin ubicacion GPS (no se compartio). Los empleados solo veran el lugar escrito: ' +
        (alert.spot || demo.location.address || '-');
    }
    return p;
  }

  function showPreview(alert, duplicate) {
    var done = document.getElementById('done');
    var old = document.getElementById('demo-sms');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'demo-sms';
    var title = document.createElement('p');
    title.className = 'demo-sms-title';
    if (duplicate) {
      title.textContent = 'DEMO: misma placa en los ultimos ' + demo.dedupeMinutes + ' min, no se envia otro SMS.';
      box.appendChild(title);
    } else {
      var names = sent.map(function (m) { return nameFor(m.to); });
      title.textContent = 'DEMO: este SMS se enviaria una sola vez a: ' + names.join(', ');
      var pre = document.createElement('pre');
      pre.textContent = sent.length ? sent[0].body : '';
      box.appendChild(title);
      box.appendChild(pre);
    }
    box.appendChild(mapBlock(alert));
    var history = document.createElement('a');
    history.href = './#historial';
    history.className = 'demo-history-link';
    history.textContent = 'Ver todas las devoluciones de prueba';
    box.appendChild(history);
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Probar otra devolucion';
    reset.addEventListener('click', function () { window.location.reload(); });
    box.appendChild(reset);
    done.appendChild(box);
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, options) {
    if (!/\/api\/returns$/.test(String(url))) return realFetch(url, options);
    sent.length = 0;
    var input = JSON.parse((options && options.body) || '{}');
    if (input.website) return Promise.resolve(new Response('{"number":0}', { status: 201 }));
    return service.createReturn(input).then(function (result) {
      showPreview(result.alert, result.duplicate);
      return new Response(JSON.stringify({ number: result.alert.number, duplicate: result.duplicate }), {
        status: result.duplicate ? 200 : 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }, function (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    });
  };
})();
