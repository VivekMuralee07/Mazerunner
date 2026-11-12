// Thin WebSocket client for the two-player rooms (see server.js). All callbacks are optional.
export class Net {
  constructor() { this.ws = null; this.on = {}; this.open = false; }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === 1) return resolve();
      let ws;
      try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); } catch (e) { return reject(e); }
      this.ws = ws;
      const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error('Could not reach the game server.')); }, 8000);
      ws.onopen = () => { clearTimeout(timer); this.open = true; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the game server.')); };
      ws.onclose = () => { this.open = false; this.on.close && this.on.close(); };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        const h = this.on[m.t]; if (h) h(m);
        this.on.any && this.on.any(m);
      };
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 15000);
    });
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  close() { clearInterval(this.pingTimer); this.on = {}; try { this.ws && this.ws.close(); } catch { /* ignore */ } this.ws = null; this.open = false; }
}
