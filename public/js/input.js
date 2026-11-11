// Keyboard + touch/mouse swipe controls -> abstract actions.
export class Input {
  constructor(target, onAction) {
    this.on = onAction; this.enabled = true;
    const keys = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'roll', KeyS: 'roll',
      KeyP: 'pause', Escape: 'pause', Enter: 'confirm',
    };
    window.addEventListener('keydown', (e) => {
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
      active = true; id = e.pointerId; sx = e.clientX; sy = e.clientY; lastDir = null;
      try { target.setPointerCapture(id); } catch { /* ignore */ }
      this.on('touch', 'pointer');
    });
    target.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== id) return;
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
}
