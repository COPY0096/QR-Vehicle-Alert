const fs = require('fs');
const path = require('path');

/**
 * Tiny JSON-file store. Good enough for one location server handling a few
 * hundred returns a day; swap for a real database if you run several instances.
 */
class AlertStore {
  constructor(file) {
    this.file = file;
    this.alerts = [];
    this.nextNumber = 1001;
    if (file && fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.alerts = data.alerts || [];
      this.nextNumber = data.nextNumber || this.nextNumber;
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ nextNumber: this.nextNumber, alerts: this.alerts }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  create(fields) {
    const alert = {
      number: this.nextNumber++,
      createdAt: new Date().toISOString(),
      ...fields,
    };
    this.alerts.push(alert);
    // Keep the file small: forget alerts older than 30 days.
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter((a) => Date.parse(a.createdAt) > cutoff);
    this.save();
    return alert;
  }

  update(alert, changes) {
    Object.assign(alert, changes);
    this.save();
    return alert;
  }

  list() {
    return [...this.alerts].reverse();
  }
}

module.exports = { AlertStore };
