// On-screen touch controls for phones: a floating joystick on the left,
// swipe-to-look on the right and action buttons.
export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.moveX = 0;
    this.moveY = 0;
    this.fire = false;
    this.jump = false;
    this.stickId = null;
    this.lookId = null;
    this.radius = 55;

    const root = (this.root = document.getElementById('touch'));
    root.classList.remove('hidden');
    this.base = root.querySelector('#stick');
    this.knob = root.querySelector('#knob');

    const btn = (id, down, up) => {
      const el = root.querySelector('#' + id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('down'); up?.(); };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
      return el;
    };
    btn('b-fire', () => (this.fire = true), () => (this.fire = false));
    btn('b-jump', () => (this.jump = true), () => (this.jump = false));
    btn('b-car', () => game.toggleCar());
    this.weaponBtn = btn('b-weapon', () => game.setWeapon((game.player.weapon + 1) % 4));
    btn('b-horn', () => { if (game.player.inCar) game.sfx.horn(); });
    btn('b-pause', () => game.pause());

    const zone = root.querySelector('#touchzone');
    zone.addEventListener('touchstart', (e) => this.start(e), { passive: false });
    zone.addEventListener('touchmove', (e) => this.move(e), { passive: false });
    zone.addEventListener('touchend', (e) => this.end(e), { passive: false });
    zone.addEventListener('touchcancel', (e) => this.end(e), { passive: false });
  }

  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.45 && this.stickId === null) {
        this.stickId = t.identifier;
        this.sx = t.clientX;
        this.sy = t.clientY;
        this.base.style.left = t.clientX + 'px';
        this.base.style.top = t.clientY + 'px';
        this.base.classList.add('on');
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lx = t.clientX;
        this.ly = t.clientY;
      }
    }
  }

  move(e) {
    e.preventDefault();
    const g = this.game;
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickId) {
        let dx = t.clientX - this.sx, dy = t.clientY - this.sy;
        const d = Math.hypot(dx, dy);
        if (d > this.radius) { dx *= this.radius / d; dy *= this.radius / d; }
        this.moveX = dx / this.radius;
        this.moveY = -dy / this.radius;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === this.lookId) {
        const dx = t.clientX - this.lx, dy = t.clientY - this.ly;
        this.lx = t.clientX;
        this.ly = t.clientY;
        if (g.paused) continue;
        g.camYaw -= dx * 0.007;
        g.camPitch = Math.max(-1.2, Math.min(0.55, g.camPitch - dy * 0.005));
        if (Math.abs(dx) > 0.5) g.lastMouse = g.time;
      }
    }
  }

  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.moveX = this.moveY = 0;
        this.base.classList.remove('on');
      } else if (t.identifier === this.lookId) this.lookId = null;
    }
  }

  reset() {
    this.stickId = this.lookId = null;
    this.moveX = this.moveY = 0;
    this.fire = this.jump = false;
    this.base.classList.remove('on');
  }

  update() {
    const g = this.game;
    const pl = g.player;
    this.root.classList.toggle('driving', !!pl.inCar);
    const names = ['👊', 'PIST', 'SMG', 'HAGL'];
    this.weaponBtn.textContent = names[pl.weapon];
  }
}
