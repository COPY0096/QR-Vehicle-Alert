(function () {
  var I18N = {
    en: {
      title: 'Vehicle return',
      plate: 'License plate',
      contract: 'Rental agreement # (optional)',
      vehicle: 'Color / model (optional)',
      vehiclePh: 'White Toyota Corolla',
      spot: 'Where did you park?',
      spotPh: 'Row B, spot 12 / in front of the office',
      notes: 'Notes (optional)',
      notesPh: 'Fuel level, damage, etc.',
      geoAsk: 'We will ask for your location so staff can find the car faster.',
      geoOk: 'Location attached.',
      geoNo: 'Location not shared. Please describe where you parked.',
      keys: 'I left the keys in the key drop box',
      send: 'Notify staff',
      sending: 'Sending...',
      thanks: 'Thank you! Our staff has been notified.',
      ref: 'Reference',
      bye: 'You can leave now. Thank you for renting with us!',
      errPlate: 'Please enter the license plate.',
      errKeys: 'Please confirm you left the keys.',
      errSpot: 'Please describe where you parked.',
      errLimit: 'Too many attempts. Please wait a few minutes or contact the counter.',
      errGeneric: 'Something went wrong. Please try again or contact the counter.',
    },
    es: {
      title: 'Devolución de vehículo',
      plate: 'Placa / tablilla',
      contract: 'N.º de contrato (opcional)',
      vehicle: 'Color / modelo (opcional)',
      vehiclePh: 'Toyota Corolla blanco',
      spot: '¿Dónde lo estacionó?',
      spotPh: 'Fila B, espacio 12 / frente a la oficina',
      notes: 'Notas (opcional)',
      notesPh: 'Nivel de gasolina, daños, etc.',
      geoAsk: 'Le pediremos su ubicación para que el personal encuentre el auto más rápido.',
      geoOk: 'Ubicación adjunta.',
      geoNo: 'Ubicación no compartida. Describa dónde estacionó.',
      keys: 'Dejé las llaves en el buzón de llaves',
      send: 'Avisar al personal',
      sending: 'Enviando...',
      thanks: '¡Gracias! Nuestro personal fue notificado.',
      ref: 'Referencia',
      bye: 'Ya puede retirarse. ¡Gracias por rentar con nosotros!',
      errPlate: 'Ingrese la placa del vehículo.',
      errKeys: 'Confirme que dejó las llaves.',
      errSpot: 'Describa dónde estacionó.',
      errLimit: 'Demasiados intentos. Espere unos minutos o contacte al mostrador.',
      errGeneric: 'Ocurrió un error. Intente de nuevo o contacte al mostrador.',
    },
  };

  var lang = (navigator.language || 'en').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  var coords = null;
  var geoState = 'geoAsk';
  var form = document.getElementById('return-form');
  var errorEl = document.getElementById('error');
  var submitBtn = document.getElementById('submit');
  var geoEl = document.getElementById('geo-status');

  function t(key) { return I18N[lang][key] || key; }

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.setLang === lang));
    });
    geoEl.textContent = t(geoState);
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { lang = b.dataset.setLang; applyLang(); });
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (pos) { coords = pos.coords; geoState = 'geoOk'; geoEl.textContent = t(geoState); },
      function () { geoState = 'geoNo'; geoEl.textContent = t(geoState); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    errorEl.textContent = '';
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.plate || data.plate.trim().length < 2) { errorEl.textContent = t('errPlate'); return; }
    if (!coords && !(data.spot || '').trim()) { errorEl.textContent = t('errSpot'); return; }
    if (!form.keys.checked) { errorEl.textContent = t('errKeys'); return; }

    data.locationId = document.querySelector('main').dataset.location;
    if (coords) { data.lat = coords.latitude; data.lng = coords.longitude; }
    delete data.keys;

    submitBtn.disabled = true;
    submitBtn.textContent = t('sending');
    fetch('/api/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (res) {
        return res.json().then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (r) {
        if (r.status === 200 || r.status === 201) {
          form.hidden = true;
          document.getElementById('ref').textContent = '#' + r.body.number;
          document.getElementById('done').hidden = false;
          window.scrollTo(0, 0);
          return;
        }
        throw new Error(r.status === 429 ? 'errLimit' : r.body.error === 'plate_required' ? 'errPlate' : 'errGeneric');
      })
      .catch(function (err) {
        errorEl.textContent = t(I18N[lang][err.message] ? err.message : 'errGeneric');
        submitBtn.disabled = false;
        submitBtn.textContent = t('send');
      });
  });

  applyLang();
})();
