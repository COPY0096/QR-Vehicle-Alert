const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { ValidationError } = require('./alerts');
const { renderReturnPage, renderNotFound } = require('./page');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function createApp({ config, service, logger = console }) {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Heroku/nginx, so rate limiting sees the real IP
  app.disable('x-powered-by');
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.get('/health', (req, res) => res.json({ ok: true, dryRun: config.dryRun }));

  // Page opened by the QR code of each drop-off location.
  app.get('/r/:locationId', (req, res) => {
    const location = config.locations.get(req.params.locationId);
    if (!location) return res.status(404).send(renderNotFound());
    res.set('Cache-Control', 'no-store');
    res.send(renderReturnPage(location));
  });

  // Customers: at most 5 submissions per 10 minutes per IP, to stop SMS spam.
  const submitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
  });

  app.post('/api/returns', submitLimiter, express.json({ limit: '10kb' }), async (req, res) => {
    const body = req.body || {};
    if (body.website) return res.status(201).json({ number: 0 }); // honeypot: bots fill hidden fields
    try {
      const { alert, duplicate } = await service.createReturn(body);
      res.status(duplicate ? 200 : 201).json({ number: alert.number, duplicate });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      logger.error('createReturn failed:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Simple history for managers: curl -H "Authorization: Bearer $ADMIN_TOKEN" .../api/alerts
  app.get('/api/alerts', (req, res) => {
    const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!config.adminToken || !safeEqual(token, config.adminToken)) return res.status(401).json({ error: 'unauthorized' });
    res.json(service.store.list());
  });

  return app;
}

module.exports = { createApp };
