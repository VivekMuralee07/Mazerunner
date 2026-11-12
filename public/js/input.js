// Keyboard + touch/mouse swipe controls -> abstract actions.
export class Input {
  constructor(target, onAction) {
    this.on = onAction; this.enabled = true; this.held = new Set(); this.dragAcc = 0; this.lastX = 0;
    const keys = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'roll', KeyS: 'roll',
      KeyP: 'pause', Escape: 'pause', Enter: 'confirm',
    };
    window.addEventListener('keyup', (e) => { this.held.delete(e.code); });
    window.addEventListener('keydown', (e) => {
      if (keys[e.code] === 'left' || keys[e.code] === 'right') this.held.add(e.code);
      const a = keys[e.code];
      if (!a || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      this.on(a, 'key');
    });

    // swipe: one action per swipe; changing direction mid-gesture (e.g. right, then up) fires again
    let sx = 0, sy = 0, active = false, id = -1, lastDir = null;
    const TH = 24;
    target.style.touchAction = 'none';
    target.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      active = true; id = e.pointerId; sx = e.clientX; sy = e.clientY; lastDir = null; this.lastX = e.clientX;
      try { target.setPointerCapture(id); } catch { /* ignore */ }
      this.on('touch', 'pointer');
    });
    target.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== id) return;
      this.dragAcc += e.clientX - this.lastX; this.lastX = e.clientX;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < TH) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'jump' : 'roll');
      sx = e.clientX; sy = e.clientY;
      if (dir === lastDir) return;           // same swipe still travelling
      lastDir = dir; this.on(dir, 'swipe');
    });
    const end = (e) => { if (e.pointerId === id) active = false; };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** -1 / 0 / +1 from the held left/right keys (used for steering the car). */
  axis() { return (this.held.has('ArrowRight') || this.held.has('KeyD') ? 1 : 0) - (this.held.has('ArrowLeft') || this.held.has('KeyA') ? 1 : 0); }
  /** Horizontal finger travel since the last call, in pixels (used for steering the car). */
  takeDrag() { const d = this.dragAcc; this.dragAcc = 0; return d; }
}
