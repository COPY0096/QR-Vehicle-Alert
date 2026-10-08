const twilio = require('twilio');

/**
 * Returns an object with send(to, body). In DRY_RUN mode (no Twilio
 * credentials) messages are only logged and kept in `sent` for tests.
 */
function createSmsClient(config, logger = console) {
  const sent = [];

  if (config.dryRun) {
    return {
      sent,
      async send(to, body) {
        sent.push({ to, body });
        logger.log(`[DRY_RUN SMS] to ${to}:\n${body}\n`);
        return { sid: `DRY${sent.length}` };
      },
    };
  }

  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return {
    sent,
    async send(to, body) {
      const params = { to, body };
      if (config.twilio.messagingServiceSid) params.messagingServiceSid = config.twilio.messagingServiceSid;
      else params.from = config.twilio.fromNumber;
      const msg = await client.messages.create(params);
      sent.push({ to, body, sid: msg.sid });
      return msg;
    },
  };
}

module.exports = { createSmsClient };
