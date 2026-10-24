// GRAND THEFT PIXEL — main game loop, player, weapons, police and HUD.
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { buildCity, blockRect, groundHeight, roadC, rayBox, DIRS, N, HALF, CITY, CURB } from './world.js';
import { Particles, PC } from './particles.js';
import { Sfx } from './audio.js';
import { Ped } from './human.js';
import { Car, lanePlacement } from './car.js';

const WEAPONS = [
  { name: 'Knyttneve', melee: true, rate: 0.4, dmg: 22 },
  { name: 'Pistol', rate: 0.26, dmg: 34, spread: 0.008, pellets: 1, auto: false, kind: 1 },
  { name: 'Maskinpistol', rate: 0.085, dmg: 15, spread: 0.03, pellets: 1, auto: true, kind: 2 },
  { name: 'Hagle', rate: 0.85, dmg: 13, spread: 0.075, pellets: 9, auto: false, kind: 3 },
];
const STAR_HEAT = [0, 20, 70, 150, 260, 400];
const CIV_COUNT = 90;
const TRAFFIC_COUNT = 42;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.pixelScale = 3;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game';
    document.body.prepend(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#f7a88a', 60, 240);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1500);

    this.T = makeTextures();
    const city = buildCity(this.scene, this.T);
    this.world = city.world;
    this.blocks = city.blocks;
    this.healthSpots = city.healthSpots;

    this.tracers = [];
    this.setupSky();

    this.particles = new Particles(this.scene);
    this.sfx = new Sfx();
    this.peds = [];
    this.cars = [];
    this.pickups = [];
    this.bloods = [];
    this.heat = 0;
    this.wanted = 0;
    this.lastCrime = -100;
    this.time = 0;
    this.shakeAmt = 0;
    this.camYaw = 0;
    this.camPitch = -0.2;
    this.lastMouse = -10;
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.started = false;
    this.paused = true;
    this.shootCD = 0;
    this.aimT = 0;
    this.seenT = 0;
    this.lastHurt = 0;

    this.setupPlayer();
    this.populate();
    this.setupHealthPickups();
    this.setupMinimap();
    this.setupInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- setup

  setupSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16),
      new THREE.MeshBasicMaterial({ map: this.T.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -2;
    this.scene.add(sky);
    this.sky = sky;

    this.sunDir = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(140, 140),
      new THREE.MeshBasicMaterial({ map: this.T.sun, transparent: true, alphaTest: 0.5, fog: false, depthWrite: false }));
    sun.renderOrder = -1;
    this.scene.add(sun);
    this.sun = sun;

    this.scene.add(new THREE.HemisphereLight('#ffd6f0', '#6a4a70', 1.5));
    const dl = new THREE.DirectionalLight('#ffcf9a', 2.4);
    dl.castShadow = true;
    dl.shadow.mapSize.set(2048, 2048);
    const sc = dl.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 400;
    dl.shadow.bias = -0.0006;
    this.scene.add(dl, dl.target);
    this.sunLight = dl;

    this.flash = new THREE.PointLight('#ffa040', 0, 40, 1.5);
    this.scene.add(this.flash);

    // blood decal resources
    this.bloodGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.bloodMat = new THREE.MeshLambertMaterial({ map: this.T.blood, transparent: true, alphaTest: 0.5, depthWrite: false });
    // tracers
    const tm = new THREE.LineBasicMaterial({ color: '#fff4a0' });
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, tm);
      l.frustumCulled = false;
      l.visible = false;
      l.life = 0;
      this.scene.add(l);
      this.tracers.push(l);
    }
  }

  setupPlayer() {
    const r = blockRect(N / 2 - 1, N / 2 - 1);
    const ped = new Ped(this, 'player', r.x1 - 1.5, r.z1 - 6);
    ped.m.gun.visible = true;
    this.player = { ped, inCar: null, dead: false, health: 100, money: 0, weapon: 1, deadT: 0, vy: 0 };
    this.camYaw = Math.PI / 2;
  }

  populate() {
    for (let i = 0; i < CIV_COUNT; i++) this.spawnPed('civ', 0);
    for (let i = 0; i < 8; i++) this.spawnPed('cop', 20);
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.spawnTraffic(15);
    // a shiny sports car waiting for the player
    const pp = this.player.ped.pos;
    const c = new Car(this, 'sport', roadC(N / 2) - 3.5, pp.z - 4, Math.PI);
    this.cars.push(c);
  }

  randomSidewalk(minDist) {
    for (let tries = 0; tries < 50; tries++) {
      const bi = (Math.random() * N) | 0, bj = (Math.random() * N) | 0;
      const r = blockRect(bi, bj), ins = 1.2 + Math.random();
      const k = (Math.random() * 4) | 0, t = Math.random();
      const cs = [[r.x0 + ins, r.z0 + ins], [r.x1 - ins, r.z0 + ins], [r.x1 - ins, r.z1 - ins], [r.x0 + ins, r.z1 - ins]];
      const a = cs[k], b = cs[(k + 1) % 4];
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (this.player && Math.hypot(x - this.playerPos.x, z - this.playerPos.z) < minDist) continue;
      return [x, z];
    }
    return [0, 0];
  }

  spawnPed(role, minDist = 60) {
    const [x, z] = this.randomSidewalk(minDist);
    const p = new Ped(this, role, x, z);
    this.peds.push(p);
    return p;
  }

  randomCarType() {
    const r = Math.random();
    return r < 0.42 ? 'sedan' : r < 0.58 ? 'taxi' : r < 0.72 ? 'van' : r < 0.9 ? 'sport' : 'police';
  }

  spawnTraffic(minDist = 70, type = this.randomCarType(), near = null) {
    for (let tries = 0; tries < 40; tries++) {
      const i = (Math.random() * (N + 1)) | 0, j = (Math.random() * (N + 1)) | 0, d = (Math.random() * 4) | 0;
      const ti = i + DIRS[d][0], tj = j + DIRS[d][1];
      if (ti < 0 || tj < 0 || ti > N || tj > N) continue;
      const pl = lanePlacement(i, j, d, 0.25 + Math.random() * 0.5);
      const dp = Math.hypot(pl.x - this.playerPos.x, pl.z - this.playerPos.z);
      if (dp < minDist) continue;
      if (near && (dp > near || this.inView(pl.x, pl.z))) continue;
      if (this.cars.some((c) => Math.hypot(c.pos.x - pl.x, c.pos.z - pl.z) < 9)) continue;
      const c = new Car(this, type, pl.x, pl.z, pl.heading);
      c.driver = type === 'police' ? 'cop' : 'ai';
      c.aiDir = d;
      c.aiTarget = pl.target;
      c.aiNext = c.pickNext();
      const f = c.fwd;
      c.vel.set(f.x * 8, f.y * 8);
      this.cars.push(c);
      return c;
    }
    return null;
  }

  setupHealthPickups() {
    const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const mat = new THREE.MeshBasicMaterial({ map: this.T.health });
    for (const p of this.healthSpots) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p).add(new THREE.Vector3(0, 0.8, 0));
      this.scene.add(m);
      this.pickups.push({ kind: 'health', mesh: m, pos: m.position, respawn: 0 });
    }
  }

  dropCash(pos, amount) {
    const m = new THREE.Mesh(this.cashGeo ??= new THREE.BoxGeometry(0.6, 0.1, 0.6),
      this.cashMat ??= new THREE.MeshBasicMaterial({ map: this.T.cash }));
    m.position.set(pos.x + (Math.random() - 0.5), groundHeight(pos.x, pos.z) + 0.4, pos.z + (Math.random() - 0.5));
    this.scene.add(m);
    this.pickups.push({ kind: 'cash', mesh: m, pos: m.position, amount, life: 40 });
  }

  addBlood(pos) {
    let d;
    if (this.bloods.length < 50) {
      d = new THREE.Mesh(this.bloodGeo, this.bloodMat);
      this.scene.add(d);
      this.bloods.push(d);
    } else {
      d = this.bloods.shift();
      this.bloods.push(d);
    }
    d.position.set(pos.x, groundHeight(pos.x, pos.z) + 0.03, pos.z);
    d.rotation.y = Math.random() * Math.PI * 2;
    d.scale.setScalar(1.4 + Math.random() * 1.2);
  }

  // ---------------------------------------------------------------- input

  setupInput() {
    const overlay = $('overlay');
    const start = () => {
      this.sfx.init();
      this.sfx.resume();
      if (this.noLock) { this.begin(); return; }
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => { this.noLock = true; this.begin(); });
      if (!this.canvas.requestPointerLock) { this.noLock = true; this.begin(); }
    };
    overlay.addEventListener('click', start);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) this.begin();
      else if (!this.noLock) this.pause();
    });
    document.addEventListener('pointerlockerror', () => { this.noLock = true; this.begin(); });
    document.addEventListener('mousemove', (e) => {
      if (this.paused) return;
      // ignore spurious jumps some browsers emit when pointer lock engages
      if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;
      this.camYaw -= e.movementX * 0.0025;
      this.camPitch = clamp(this.camPitch - e.movementY * 0.0025, -1.2, 0.55);
      if (Math.abs(e.movementX) > 1) this.lastMouse = this.time;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      if (e.button === 0) { this.mouse.left = true; this.trigger = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (this.paused) return;
      this.setWeapon((this.player.weapon + (e.deltaY > 0 ? 1 : 3)) % 4);
    });
    document.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (this.paused) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF' || e.code === 'KeyE' || e.code === 'Enter') this.toggleCar();
      if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < 4) this.setWeapon(n); }
      if (e.code === 'KeyQ') this.setWeapon((this.player.weapon + 3) % 4);
      if (e.code === 'KeyH' && this.player.inCar) this.sfx.horn();
      if (e.code === 'KeyM') this.toast(this.sfx.toggleMute() ? 'Lyd av' : 'Lyd på');
      if (e.code === 'KeyP') {
        this.pixelScale = this.pixelScale >= 5 ? 1 : this.pixelScale + 1;
        this.resize();
        this.toast('Pikselstørrelse: ' + this.pixelScale);
      }
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
  }

  begin() {
    this.started = true;
    this.paused = false;
    $('overlay').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.sfx.resume();
  }

  pause() {
    this.paused = true;
    this.keys.clear();
    this.mouse.left = this.mouse.right = false;
    $('overlay').classList.remove('hidden');
    $('start-text').textContent = 'PAUSE — klikk for å fortsette';
    this.sfx.engine(false, 0);
    this.sfx.siren(0);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.max(1, Math.floor(w / this.pixelScale)), Math.max(1, Math.floor(h / this.pixelScale)), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  key(...codes) { return codes.some((c) => this.keys.has(c)); }

  setWeapon(n) {
    if (n === this.player.weapon) return;
    this.player.weapon = n;
    this.sfx.click();
    this.player.ped.m.gun.visible = n > 0;
    this.shootCD = Math.max(this.shootCD, 0.15);
  }

  toast(text, t = 2) {
    const el = $('toast');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => (el.style.opacity = 0), t * 1000);
  }

  // ---------------------------------------------------------------- helpers

  get playerPos() { return this.player.inCar ? this.player.inCar.pos : this.player.ped.pos; }
  get playerVel() {
    if (this.player.inCar) return this.player.inCar.vel;
    return this._pv ??= new THREE.Vector2();
  }

  volAt(p) {
    const d = this.camera.position.distanceTo(p);
    return d > 150 ? 0 : clamp(1 / (1 + d * 0.035), 0, 1);
  }

  inView(x, z) {
    const dx = x - this.camera.position.x, dz = z - this.camera.position.z;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    return (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) > 0.35;
  }

  lineOfSight(a, b, h = 1.4) {
    return this.world.lineClear(new THREE.Vector3(a.x, a.y + h, a.z), new THREE.Vector3(b.x, b.y + h, b.z));
  }

  carNear(pos, r, minSpeed) {
    for (const c of this.cars) {
      if (Math.abs(c.speed) < minSpeed) continue;
      if (Math.abs(c.pos.x - pos.x) < r && Math.abs(c.pos.z - pos.z) < r) return true;
    }
    return false;
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  crime(amount, pos) {
    const before = this.wanted;
    this.heat = Math.min(500, this.heat + amount);
    this.lastCrime = this.time;
    this.updateWanted();
    if (this.wanted > before) this.sfx.star();
  }

  updateWanted() {
    let s = 0;
    for (let i = 1; i <= 5; i++) if (this.heat >= STAR_HEAT[i]) s = i;
    if (s === 0 && this.wanted > 0) {
      // chase over: police go back to normal duty
      for (const c of this.cars) if (c.driver === 'cop') c.routeFromHere();
      for (const p of this.peds) if (p.role === 'cop' && p.alive) { p.state = 'walk'; p.aiming = false; p.initPath(); }
    }
    this.wanted = s;
  }

  // ---------------------------------------------------------------- combat

  raycast(origin, dir, maxT, skipCar, tMin = 0) {
    let best = Math.min(maxT, this.world.raycast(origin, dir, maxT));
    let hit = { t: best, ped: null, car: null, ground: false };
    if (dir.y < -1e-4) {
      const tg = -origin.y / dir.y;
      if (tg > tMin && tg < best) { best = tg; hit = { t: tg, ground: true }; }
    }
    for (const p of this.peds) {
      if (p.state === 'dead') continue;
      const dx = p.pos.x - origin.x, dz = p.pos.z - origin.z;
      if (dx * dx + dz * dz > (best + 2) * (best + 2)) continue;
      const fly = p.state === 'fly';
      const t = rayBox(origin, dir, p.pos.x - 0.45, p.pos.y + (fly ? -0.5 : 0), p.pos.z - 0.45, p.pos.x + 0.45, p.pos.y + (fly ? 1.5 : 2.05), p.pos.z + 0.45);
      if (t >= tMin && t < best) { best = t; hit = { t, ped: p }; }
    }
    const lo = new THREE.Vector3(), ld = new THREE.Vector3();
    for (const c of this.cars) {
      if (c === skipCar) continue;
      const dx = c.pos.x - origin.x, dz = c.pos.z - origin.z;
      if (dx * dx + dz * dz > (best + 4) * (best + 4)) continue;
      // transform ray into car space
      const cs = Math.cos(-c.heading), sn = Math.sin(-c.heading);
      const ox = origin.x - c.pos.x, oz = origin.z - c.pos.z;
      lo.set(ox * cs + oz * sn, origin.y - c.pos.y, -ox * sn + oz * cs);
      ld.set(dir.x * cs + dir.z * sn, dir.y, -dir.x * sn + dir.z * cs);
      const S = c.spec;
      const t = rayBox(lo, ld, -S.wid / 2, 0.2, -S.len / 2, S.wid / 2, 0.3 + S.hgt + S.cab, S.len / 2);
      if (t >= tMin && t < best) { best = t; hit = { t, car: c }; }
    }
    hit.point = origin.clone().addScaledVector(dir, hit.t);
    return hit;
  }

  addTracer(a, b) {
    const l = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0];
    const pa = l.geometry.attributes.position;
    pa.setXYZ(0, a.x, a.y, a.z);
    pa.setXYZ(1, b.x, b.y, b.z);
    pa.needsUpdate = true;
    l.visible = true;
    l.life = 0.05;
  }

  muzzlePos() {
    const pl = this.player;
    if (pl.inCar) {
      const c = pl.inCar;
      const right = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
      return c.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(right, 0.6);
    }
    pl.ped.root.updateMatrixWorld(true);
    return pl.ped.m.gun.localToWorld(new THREE.Vector3(0, -0.36, 0));
  }

  playerAttack() {
    const pl = this.player;
    const w = WEAPONS[pl.weapon];
    if (w.melee) {
      if (pl.inCar) return;
      const ped = pl.ped;
      ped.punchT = 0.25;
      this.aimT = 0.5;
      ped.facing = this.camYaw;
      const fx = Math.sin(ped.facing), fz = Math.cos(ped.facing);
      let hitAny = false;
      for (const p of this.peds) {
        if (!p.alive) continue;
        const dx = p.pos.x - ped.pos.x, dz = p.pos.z - ped.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.9 && (dx * fx + dz * fz) / (d || 1) > 0.5) {
          p.damage(w.dmg, ped.pos, true);
          if (p.alive) p.move(fx * 0.6, fz * 0.6);
          hitAny = true;
        }
      }
      this.sfx.punch(hitAny ? 1 : 0.3);
      return;
    }
    this.aimT = 1.2;
    const cam = this.camera;
    const origin = cam.position.clone();
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const tMin = pl.inCar ? 0 : origin.distanceTo(pl.ped.pos) - 0.6;
    const muzzle = this.muzzlePos();
    for (let k = 0; k < w.pellets; k++) {
      const dir = fwd.clone();
      dir.x += (Math.random() - 0.5) * 2 * w.spread;
      dir.y += (Math.random() - 0.5) * 2 * w.spread;
      dir.z += (Math.random() - 0.5) * 2 * w.spread;
      dir.normalize();
      const hit = this.raycast(origin, dir, 220, pl.inCar, Math.max(0, tMin));
      if (hit.ped && hit.ped !== pl.ped) {
        hit.ped.damage(w.dmg, pl.ped.pos.clone(), true);
        if (hit.ped.alive) hit.ped.move(dir.x * 0.3, dir.z * 0.3);
      } else if (hit.car) {
        hit.car.damage(w.dmg * 0.45, true);
        this.particles.burst(hit.point, 6, { color: PC.spark, color1: PC.spark2, speed: 3, up: 1, gravity: 10, size: 0.08, life: 0.35 });
        if (hit.car.driver === 'ai') this.panicDriver(hit.car);
        if (hit.car.driver === 'cop') this.crime(4, hit.car.pos);
      } else if (hit.t < 219) {
        this.particles.burst(hit.point, 5, { color: PC.dust, speed: 1.5, up: 1, gravity: 6, size: 0.1, life: 0.4 });
        this.particles.burst(hit.point, 2, { color: PC.spark, speed: 2, up: 1, gravity: 8, size: 0.06, life: 0.15 });
      }
      this.addTracer(muzzle, hit.point);
    }
    this.particles.burst(muzzle, 4, { color: PC.fire, color1: PC.spark2, speed: 1, up: 0.6, size: 0.16, life: 0.06 });
    this.flash.position.copy(muzzle);
    this.flash.intensity = Math.max(this.flash.intensity, 15);
    this.sfx.shot(w.kind, 0.9);
    this.camPitch += w.kind === 3 ? 0.035 : 0.008;
    // gunfire scares people and alerts nearby cops
    const pp = this.playerPos;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = p.pos.distanceTo(pp);
      if (d < 40) p.scare(pp);
      if (p.role === 'cop' && d < 30 && this.wanted === 0) { this.crime(20, pp); }
    }
  }

  panicDriver(car) {
    car.cruise = 26;
    car.ignoreT = 6;
  }

  copShoot(cop) {
    const pl = this.player;
    const o = cop.pos.clone().add(new THREE.Vector3(Math.sin(cop.facing) * 0.5, 1.45, Math.cos(cop.facing) * 0.5));
    const target = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    const d = o.distanceTo(target);
    let chance = clamp(0.6 - d * 0.015, 0.12, 0.6);
    if (pl.inCar) chance *= clamp(1 - Math.abs(pl.inCar.speed) / 30, 0.3, 1);
    const hitP = Math.random() < chance;
    const end = target.clone();
    if (!hitP) end.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
    this.addTracer(o, end);
    this.particles.burst(o, 3, { color: PC.fire, speed: 0.6, size: 0.12, life: 0.05 });
    this.sfx.shot(1, this.volAt(cop.pos) * 0.8);
    if (hitP) {
      if (pl.inCar) pl.inCar.damage(4, false);
      else pl.ped.damage(5, cop.pos);
    }
  }

  onPlayerHurt(dmg) {
    const pl = this.player;
    if (pl.dead) return;
    this.lastHurt = this.time;
    pl.health -= dmg;
    this.sfx.hurt();
    const f = $('flash');
    f.style.opacity = 0.45;
    setTimeout(() => (f.style.opacity = 0), 90);
    if (pl.health <= 0) this.wasted();
  }

  onPedDeath(ped, byPlayer) {
    if (ped.state === 'dead') this.addBlood(ped.pos);
    this.sfx.splat(this.volAt(ped.pos));
    if (Math.random() < 0.8) this.dropCash(ped.pos, 5 + ((Math.random() * (ped.role === 'cop' ? 80 : 50)) | 0));
    if (byPlayer) this.crime(ped.role === 'cop' ? 70 : 22, ped.pos);
    for (const p of this.peds) if (p.alive && p.pos.distanceTo(ped.pos) < 22) p.scare(ped.pos);
  }

  bailOut(car) {
    const role = car.driver === 'cop' ? 'cop' : 'civ';
    car.driver = null;
    const p = this.exitPos(car);
    const ped = new Ped(this, role, p.x, p.z);
    this.peds.push(ped);
    ped.scare(car.pos, 8);
  }

  deployCops(car) {
    car.driver = null;
    const pp = this.playerPos;
    const near = this.peds.filter((p) => p.role === 'cop' && p.alive && p.pos.distanceTo(pp) < 80).length;
    const n = clamp(2 + this.wanted * 2 - near, 0, 2);
    for (let i = 0; i < n; i++) {
      const p = this.exitPos(car, i === 0 ? 1 : -1);
      const ped = new Ped(this, 'cop', p.x, p.z);
      this.peds.push(ped);
    }
    this.sfx.door();
  }

  exitPos(car, side = 1) {
    const f = car.fwd;
    for (const s of [side, -side]) {
      const x = car.pos.x - f.y * s * (car.spec.wid / 2 + 0.7);
      const z = car.pos.z + f.x * s * (car.spec.wid / 2 + 0.7);
      const r = this.world.collideCircle(x, z, 0.35);
      if (!r.hit) return { x, z };
    }
    const r = this.world.collideCircle(car.pos.x + f.x * (car.spec.len / 2 + 0.8), car.pos.z + f.y * (car.spec.len / 2 + 0.8), 0.35);
    return { x: r.x, z: r.z };
  }

  explodeCar(car) {
    car.burn();
    const p = car.pos.clone().add(new THREE.Vector3(0, 1, 0));
    this.particles.burst(p, 90, { color: PC.fire, color1: PC.fire2, speed: 7, up: 1.2, gravity: 2, drag: 2, size: 0.9, size1: 0.3, life: 0.9, spread: 2 });
    this.particles.burst(p, 50, { color: PC.smoke, color1: PC.smoke2, speed: 3, up: 2, gravity: -1, drag: 1, size: 1.2, size1: 2.4, life: 2.6, spread: 2 });
    this.particles.burst(p, 30, { color: PC.spark, color1: PC.spark2, speed: 12, up: 1.5, gravity: 14, size: 0.12, life: 1.2 });
    this.flash.position.copy(p);
    this.flash.intensity = 400;
    this.sfx.explosion(Math.max(0.2, this.volAt(car.pos)));
    const dCam = this.camera.position.distanceTo(car.pos);
    this.shake(clamp(1.5 - dCam / 40, 0, 1.2));
    this.addBlood(car.pos);
    const R = 8;
    if (car.fireByPlayer) this.crime(15, car.pos);
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      const d = ped.pos.distanceTo(car.pos);
      if (d < R) {
        const dx = (ped.pos.x - car.pos.x) / (d || 1), dz = (ped.pos.z - car.pos.z) / (d || 1);
        ped.launch(dx * 10, 8 + Math.random() * 4, dz * 10, car.fireByPlayer);
      } else if (d < 40) ped.scare(car.pos);
    }
    for (const c of this.cars) {
      if (c === car || c.dead) continue;
      const d = c.pos.distanceTo(car.pos);
      if (d < R) {
        c.damage(70 * (1 - d / R) + 10, car.fireByPlayer);
        const dx = (c.pos.x - car.pos.x) / (d || 1), dz = (c.pos.z - car.pos.z) / (d || 1);
        c.vel.x += dx * 8; c.vel.y += dz * 8;
        c.spin += (Math.random() - 0.5) * 4;
      }
    }
    const pl = this.player;
    if (pl.inCar === car) { this.exitCar(true); this.onPlayerHurt(999); }
    else if (!pl.inCar && !pl.dead) {
      const d = pl.ped.pos.distanceTo(car.pos);
      if (d < R) this.onPlayerHurt(90 * (1 - d / R));
    }
    if (car.driver === 'player') car.driver = null;
  }

  // ---------------------------------------------------------------- cars

  toggleCar() {
    const pl = this.player;
    if (pl.dead) return;
    if (pl.inCar) { this.exitCar(); return; }
    let best = null, bd = 4.2;
    for (const c of this.cars) {
      if (c.dead) continue;
      const d = c.pos.distanceTo(pl.ped.pos);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    if (best.driver === 'ai' || best.driver === 'cop') {
      // carjack!
      const wasCop = best.driver === 'cop';
      const p = this.exitPos(best);
      const ped = new Ped(this, wasCop ? 'cop' : 'civ', p.x, p.z);
      this.peds.push(ped);
      ped.facing = Math.atan2(p.x - best.pos.x, p.z - best.pos.z);
      if (wasCop) this.crime(50, best.pos);
      else {
        ped.scare(pl.ped.pos, 8);
        if (this.peds.some((q) => q.role === 'cop' && q.alive && q.pos.distanceTo(best.pos) < 30)) this.crime(20, best.pos);
      }
      this.toast('Biltyveri!', 1.5);
    }
    pl.inCar = best;
    best.driver = 'player';
    best.input.throttle = 0;
    pl.ped.root.visible = false;
    this.sfx.door();
    this.camYaw = best.heading;
    const name = $('carname');
    name.textContent = best.spec.name;
    name.style.opacity = 1;
    clearTimeout(this.nameT);
    this.nameT = setTimeout(() => (name.style.opacity = 0), 2500);
  }

  exitCar(force = false) {
    const pl = this.player;
    const c = pl.inCar;
    if (!c) return;
    if (!force && Math.abs(c.speed) > 12) { this.toast('Kjører for fort til å hoppe ut!', 1.2); return; }
    const p = this.exitPos(c);
    pl.ped.pos.set(p.x, groundHeight(p.x, p.z), p.z);
    pl.ped.facing = c.heading;
    pl.ped.root.visible = true;
    pl.inCar = null;
    c.driver = null;
    c.input.throttle = 0;
    this.sfx.door();
    this.sfx.engine(false, 0);
  }

  driveInput() {
    const c = this.player.inCar;
    const inp = c.input;
    const up = this.key('KeyW', 'ArrowUp'), down = this.key('KeyS', 'ArrowDown');
    inp.throttle = (up ? 1 : 0) - (down ? 1 : 0);
    inp.steer = (this.key('KeyD', 'ArrowRight') ? 1 : 0) - (this.key('KeyA', 'ArrowLeft') ? 1 : 0);
    inp.brake = this.key('Space');
  }

  collideCars(dt) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        if (dx * dx + dz * dz > 36) continue;
        const ca = a.circles(), cb = b.circles();
        const ra = a.radius, rb = b.radius;
        let best = null;
        for (const p of ca) for (const q of cb) {
          const ex = q[0] - p[0], ez = q[1] - p[1];
          const d = Math.hypot(ex, ez);
          if (d < ra + rb && (!best || d < best.d)) best = { d, nx: ex / (d || 1), nz: ez / (d || 1) };
        }
        if (!best) continue;
        const ma = a.spec.mass * (a.dead ? 1.5 : 1), mb = b.spec.mass * (b.dead ? 1.5 : 1);
        const pen = ra + rb - best.d;
        a.pos.x -= best.nx * pen * (mb / (ma + mb));
        a.pos.z -= best.nz * pen * (mb / (ma + mb));
        b.pos.x += best.nx * pen * (ma / (ma + mb));
        b.pos.z += best.nz * pen * (ma / (ma + mb));
        const vn = (b.vel.x - a.vel.x) * best.nx + (b.vel.y - a.vel.y) * best.nz;
        if (vn < 0) {
          const jImp = (-(1.3) * vn) / (1 / ma + 1 / mb);
          a.vel.x -= (jImp / ma) * best.nx; a.vel.y -= (jImp / ma) * best.nz;
          b.vel.x += (jImp / mb) * best.nx; b.vel.y += (jImp / mb) * best.nz;
          a.spin += (Math.random() - 0.5) * -vn * 0.05;
          b.spin += (Math.random() - 0.5) * -vn * 0.05;
          if (-vn > 4) {
            a.onImpact(-vn * 0.8);
            b.onImpact(-vn * 0.8);
            const pc = a.driver === 'player' ? b : b.driver === 'player' ? a : null;
            if (pc && pc.driver === 'cop' && -vn > 7) this.crime(8, pc.pos);
            if (pc && pc.driver === 'ai') this.panicDriver(pc);
          }
        }
      }
    }
  }

  carHitsPeople() {
    const pl = this.player;
    for (const c of this.cars) {
      const sp = Math.hypot(c.vel.x, c.vel.y);
      const circles = c.circles();
      const r = c.radius + 0.35;
      const check = (ped, isPlayer) => {
        if (Math.abs(ped.pos.x - c.pos.x) > 4 || Math.abs(ped.pos.z - c.pos.z) > 4) return;
        if (ped.pos.y > c.pos.y + 1.6) return;
        for (const [cx, cz] of circles) {
          const dx = ped.pos.x - cx, dz = ped.pos.z - cz;
          const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          const nx = dx / (d || 1), nz = dz / (d || 1);
          const vn = c.vel.x * nx + c.vel.y * nz;
          if (sp > 5 && vn > 3) {
            if (isPlayer) {
              this.onPlayerHurt(sp * 2.2);
              ped.move(nx * 2.5 + c.vel.x * 0.12, nz * 2.5 + c.vel.y * 0.12);
              this.shake(0.6);
            } else {
              ped.launch(c.vel.x * 1.15 + nx * 2, 4 + sp * 0.22, c.vel.y * 1.15 + nz * 2, c.driver === 'player');
              if (c.driver === 'player') this.shake(0.25);
            }
            this.sfx.crash(0.4 * this.volAt(c.pos));
            c.vel.multiplyScalar(0.93);
          } else {
            ped.move(nx * (r - d), nz * (r - d));
          }
          return;
        }
      };
      for (const p of this.peds) if (p.alive) check(p, false);
      if (!pl.inCar && !pl.dead) check(pl.ped, true);
    }
  }

  // ---------------------------------------------------------------- player

  updatePlayer(dt) {
    const pl = this.player;
    const ped = pl.ped;
    if (pl.dead) {
      pl.deadT += dt;
      ped.update(dt);
      if (pl.deadT > 4.5) this.respawn();
      return;
    }
    // health regen when calm
    if (this.time - this.lastHurt > 8 && pl.health < 60) pl.health += dt * 2;

    this.shootCD -= dt;
    this.aimT -= dt;
    const w = WEAPONS[pl.weapon];
    const wantFire = w.auto ? this.mouse.left : this.trigger;
    this.trigger = false;
    if (wantFire && this.shootCD <= 0 && !(pl.inCar && w.melee)) {
      this.shootCD = w.rate;
      this.playerAttack();
    }

    if (pl.inCar) {
      this.driveInput();
      const c = pl.inCar;
      ped.pos.copy(c.pos);
      this.sfx.engine(true, clamp(Math.abs(c.speed) / c.spec.maxSpeed, 0, 1) + (c.input.throttle !== 0 ? 0.15 : 0));
      if (c.fireT > 0) $('hint').textContent = 'BILEN BRENNER! Hopp ut med F!';
      return;
    }

    // on foot movement
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -fz, rz = fx;
    let mx = 0, mz = 0;
    if (this.key('KeyW', 'ArrowUp')) { mx += fx; mz += fz; }
    if (this.key('KeyS', 'ArrowDown')) { mx -= fx; mz -= fz; }
    if (this.key('KeyD', 'ArrowRight')) { mx += rx; mz += rz; }
    if (this.key('KeyA', 'ArrowLeft')) { mx -= rx; mz -= rz; }
    const ml = Math.hypot(mx, mz);
    const aiming = this.mouse.right || this.aimT > 0;
    let speed = 0;
    if (ml > 0) {
      mx /= ml; mz /= ml;
      speed = this.key('ShiftLeft', 'ShiftRight') && !this.mouse.right ? 7.5 : aiming ? 3.2 : 4.5;
      ped.move(mx * speed * dt, mz * speed * dt);
      if (!aiming) ped.faceTowards(Math.atan2(mx, mz), dt, 12);
    }
    if (aiming && pl.weapon > 0) ped.faceTowards(this.camYaw, dt, 20);
    ped.aiming = aiming && pl.weapon > 0;
    ped.moveSpeed = speed;
    // jumping
    const gh = groundHeight(ped.pos.x, ped.pos.z);
    if (this.key('Space') && ped.pos.y <= gh + 0.01) pl.vy = 6.5;
    pl.vy -= 20 * dt;
    ped.pos.y += pl.vy * dt;
    if (ped.pos.y <= gh) { ped.pos.y = gh; pl.vy = 0; }
    if (ped.pos.y > gh) ped.moveSpeed = Math.min(ped.moveSpeed, 0.5);
    ped.sync(dt);
    if (this._pv) this._pv.set(mx * speed, mz * speed);

    // pickups
    for (const p of this.pickups) {
      if (p.respawn > 0) continue;
      if (Math.abs(p.pos.x - ped.pos.x) < 1.2 && Math.abs(p.pos.z - ped.pos.z) < 1.2) this.collect(p);
    }

    // context hint
    let near = null;
    for (const c of this.cars) if (!c.dead && c.pos.distanceTo(ped.pos) < 4.2) { near = c; break; }
    $('hint').textContent = near ? `Trykk F for å ${near.driver ? 'stjele' : 'ta'} bilen (${near.spec.name})` : '';
  }

  collect(p) {
    if (p.kind === 'cash') {
      this.player.money += p.amount;
      this.sfx.cash();
      this.toast('+$' + p.amount, 1);
      this.scene.remove(p.mesh);
      p.dead = true;
    } else if (p.kind === 'health') {
      if (this.player.health >= 100) return;
      this.player.health = 100;
      this.sfx.heal();
      this.toast('Helse fylt opp', 1.2);
      p.respawn = 45;
      p.mesh.visible = false;
    }
  }

  wasted() {
    const pl = this.player;
    pl.dead = true;
    pl.health = 0;
    pl.deadT = 0;
    if (pl.inCar) this.exitCar(true);
    pl.ped.root.visible = true;
    pl.ped.state = 'dead';
    pl.ped.root.rotation.x = -Math.PI / 2;
    pl.ped.m.gun.visible = false;
    this.addBlood(pl.ped.pos);
    this.sfx.wasted();
    this.sfx.engine(false, 0);
    $('wasted').classList.add('show');
    this.canvas.classList.add('gray');
  }

  respawn() {
    const pl = this.player;
    const spot = this.healthSpots[(Math.random() * this.healthSpots.length) | 0] ?? new THREE.Vector3();
    pl.ped.pos.set(spot.x - 3, CURB + 0.15, spot.z + 3);
    pl.ped.state = 'walk';
    pl.ped.root.rotation.x = 0;
    pl.ped.m.gun.visible = pl.weapon > 0;
    pl.dead = false;
    pl.health = 100;
    const fee = Math.min(pl.money, 100);
    pl.money -= fee;
    this.heat = 0;
    this.updateWanted();
    $('wasted').classList.remove('show');
    this.canvas.classList.remove('gray');
    if (fee) this.toast(`Sykehusregning: -$${fee}`, 3);
  }

  // ---------------------------------------------------------------- world sim

  updatePolice(dt) {
    // heat decays unless police can see you
    this.seenT -= dt;
    if (this.seenT <= 0 && this.wanted > 0) {
      this.seenT = 0.5;
      this.seen = false;
      const pp = this.playerPos;
      for (const p of this.peds) {
        if (p.role === 'cop' && p.alive && p.pos.distanceTo(pp) < 35 && this.lineOfSight(p.pos, pp)) { this.seen = true; break; }
      }
      if (!this.seen) for (const c of this.cars) {
        if (c.driver === 'cop' && c.pos.distanceTo(pp) < 40 && this.lineOfSight(c.pos, pp)) { this.seen = true; break; }
      }
    }
    if (this.wanted > 0) {
      if (this.seen) this.lastCrime = Math.max(this.lastCrime, this.time - 6);
      if (this.time - this.lastCrime > 10) {
        this.heat -= dt * (this.wanted <= 2 ? 9 : 5);
        if (this.heat < 0) this.heat = 0;
        this.updateWanted();
      }
    }
    // dispatch
    this.dispatchT = (this.dispatchT ?? 0) - dt;
    if (this.wanted > 0 && this.dispatchT <= 0 && !this.player.dead) {
      this.dispatchT = 6 - this.wanted * 0.6;
      const pp = this.playerPos;
      const chasing = this.cars.filter((c) => c.driver === 'cop' && c.pos.distanceTo(pp) < 160).length;
      if (chasing < Math.min(6, this.wanted + 1)) this.spawnTraffic(55, 'police', 130);
    }
    let sirenVol = 0;
    if (this.wanted > 0) {
      for (const c of this.cars) if (c.driver === 'cop') sirenVol = Math.max(sirenVol, this.volAt(c.pos));
    }
    this.sfx.siren(sirenVol);
  }

  housekeeping(dt) {
    this.hkT = (this.hkT ?? 0) - dt;
    if (this.hkT > 0) return;
    this.hkT = 1;
    const pp = this.playerPos;
    // remove old bodies / far cops
    this.peds = this.peds.filter((p) => {
      const d = p.pos.distanceTo(pp);
      const drop = (p.state === 'dead' && p.deadT > 30 && d > 30) || (p.role === 'cop' && d > 180 && this.peds.length > CIV_COUNT + 20);
      if (drop) p.remove();
      return !drop;
    });
    const civs = this.peds.filter((p) => p.role === 'civ' && p.alive).length;
    for (let i = civs; i < CIV_COUNT; i++) this.spawnPed('civ', 60);
    // burnt / abandoned cars far away
    let empty = 0;
    this.cars = this.cars.filter((c) => {
      const d = c.pos.distanceTo(pp);
      if (c.driver === null && !c.dead) empty++;
      const drop = c !== this.player.inCar && d > 90 && !this.inView(c.pos.x, c.pos.z) &&
        ((c.dead) || (c.driver === null && empty > 12) || (c.driver === 'cop' && this.wanted === 0 && d > 200));
      if (drop) c.remove();
      return !drop;
    });
    const traffic = this.cars.filter((c) => c.driver === 'ai' || (c.driver === 'cop' && this.wanted === 0)).length;
    if (traffic < TRAFFIC_COUNT) this.spawnTraffic(80);
    // pickups
    this.pickups = this.pickups.filter((p) => {
      if (p.kind === 'cash') {
        p.life -= 1;
        if (p.life <= 0) { this.scene.remove(p.mesh); return false; }
      }
      return !p.dead;
    });
  }

  updateCamera(dt) {
    const pl = this.player;
    const cam = this.camera;
    let target, dist, shoulder, fov = 65;
    if (pl.inCar) {
      const c = pl.inCar;
      target = c.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
      dist = 7.5 + Math.abs(c.speed) * 0.06;
      shoulder = 0;
      fov = 65 + Math.abs(c.speed) * 0.35;
      if (this.time - this.lastMouse > 1.2 && !this.mouse.left) {
        const s = c.speed;
        const want = s < -3 ? c.heading + Math.PI : c.heading;
        this.camYaw += wrap(want - this.camYaw) * Math.min(1, dt * 3);
        this.camPitch += (-0.2 - this.camPitch) * Math.min(1, dt * 2);
      }
    } else {
      target = pl.ped.pos.clone().add(new THREE.Vector3(0, 1.65, 0));
      const aim = this.mouse.right && pl.weapon > 0;
      dist = aim ? 2.6 : 4.4;
      shoulder = aim ? 0.75 : 0.55;
      fov = aim ? 50 : 65;
    }
    this.camDist = (this.camDist ?? dist) + (dist - (this.camDist ?? dist)) * Math.min(1, dt * 6);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();
    const cp = Math.cos(this.camPitch);
    const fwd = new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    const pivot = target.clone().addScaledVector(right, shoulder);
    const back = fwd.clone().negate();
    let d = this.camDist;
    const hit = this.world.raycast(pivot, back, d + 0.4);
    if (hit < d + 0.4) d = Math.max(0.6, hit - 0.4);
    const pos = pivot.addScaledVector(back, d);
    const gh = groundHeight(pos.x, pos.z) + 0.3;
    if (pos.y < gh) pos.y = gh;
    if (this.shakeAmt > 0) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      pos.y += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      pos.z += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    cam.position.copy(pos);
    cam.lookAt(pos.clone().add(fwd));

    // sky, sun & shadow camera follow
    this.sky.position.copy(pos);
    this.sun.position.copy(pos).addScaledVector(this.sunDir, 700);
    this.sun.lookAt(pos);
    const t = this.playerPos;
    const snap = 140 / 2048;
    const lx = Math.round(t.x / snap) * snap, lz = Math.round(t.z / snap) * snap;
    this.sunLight.target.position.set(lx, 0, lz);
    this.sunLight.position.set(lx, 0, lz).addScaledVector(this.sunDir, 200);
  }

  // ---------------------------------------------------------------- HUD

  setupMinimap() {
    const M = 60;
    const size = Math.ceil(CITY + M * 2);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#2a7fb8';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#e8cf94';
    g.fillRect(2, 2, size - 4, size - 4);
    g.fillStyle = '#4a4752';
    g.fillRect(M, M, CITY, CITY);
    for (let bi = 0; bi < N; bi++)
      for (let bj = 0; bj < N; bj++) {
        const r = blockRect(bi, bj);
        g.fillStyle = '#9d94a0';
        g.fillRect(r.x0 + HALF + M, r.z0 + HALF + M, r.x1 - r.x0, r.z1 - r.z0);
        if (this.blocks[bi][bj].park) {
          g.fillStyle = '#4f9a45';
          g.fillRect(r.x0 + HALF + M + 3, r.z0 + HALF + M + 3, r.x1 - r.x0 - 6, r.z1 - r.z0 - 6);
        }
      }
    g.fillStyle = '#6a6070';
    for (const b of this.world.boxes) {
      if (b.x1 - b.x0 < 2) continue;
      g.fillRect(b.x0 + HALF + M, b.z0 + HALF + M, b.x1 - b.x0, b.z1 - b.z0);
    }
    this.mapImg = c;
    this.mapOff = HALF + M;
    this.mm = $('minimap').getContext('2d');
    this.mm.imageSmoothingEnabled = false;
  }

  drawMinimap() {
    const ctx = this.mm;
    const W = ctx.canvas.width, Hh = ctx.canvas.height;
    const cx = W / 2, cy = Hh / 2, scale = 0.9;
    const pp = this.playerPos;
    const rot = Math.PI + this.camYaw;
    ctx.save();
    ctx.fillStyle = '#2a7fb8';
    ctx.fillRect(0, 0, W, Hh);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-(pp.x + this.mapOff), -(pp.z + this.mapOff));
    ctx.drawImage(this.mapImg, 0, 0);
    ctx.restore();

    const toMap = (x, z) => {
      const dx = (x - pp.x) * scale, dz = (z - pp.z) * scale;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [cx + dx * c - dz * s, cy + dx * s + dz * c];
    };
    const dot = (x, z, col, sz = 4) => {
      let [mx, my] = toMap(x, z);
      const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy), maxR = W / 2 - 4;
      if (d > maxR) { mx = cx + (dx / d) * maxR; my = cy + (dy / d) * maxR; }
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(mx - sz / 2), Math.round(my - sz / 2), sz, sz);
    };
    for (const p of this.pickups) {
      if (p.respawn > 0) continue;
      if (p.kind === 'health') dot(p.pos.x, p.pos.z, '#ff3030', 5);
      else if (p.pos.distanceTo(pp) < 60) dot(p.pos.x, p.pos.z, '#40ff60', 3);
    }
    const blink = (this.time * 4) % 2 < 1;
    for (const c of this.cars) if (c.driver === 'cop' && this.wanted > 0) dot(c.pos.x, c.pos.z, blink ? '#ff2020' : '#2040ff', 6);
    for (const p of this.peds) if (p.role === 'cop' && p.alive && this.wanted > 0 && p.pos.distanceTo(pp) < 80) dot(p.pos.x, p.pos.z, blink ? '#2040ff' : '#ff2020', 4);

    // player arrow
    const face = this.player.inCar ? this.player.inCar.heading : this.player.ped.facing;
    const [ax, ay] = toMap(pp.x + Math.sin(face), pp.z + Math.cos(face));
    const ang = Math.atan2(ay - cy, ax - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  updateHUD() {
    const pl = this.player;
    $('money').textContent = '$' + String(Math.floor(pl.money)).padStart(8, '0');
    $('healthbar').style.width = clamp(pl.health, 0, 100) + '%';
    const stars = $('stars').children;
    const blink = (this.time * 3) % 2 < 1;
    for (let i = 0; i < 5; i++) {
      const on = i < this.wanted;
      stars[i].className = on ? (this.seen && blink ? 'star on blink' : 'star on') : 'star';
    }
    $('weapon').textContent = WEAPONS[pl.weapon].name.toUpperCase() + (pl.weapon > 0 ? '  ∞' : '');
    $('crosshair').style.display = !pl.inCar && !pl.dead && pl.weapon > 0 ? 'block' : 'none';
    if (pl.inCar) {
      $('speed').textContent = Math.round(Math.abs(pl.inCar.speed) * 3.6) + ' KM/T';
      $('carhp').style.width = pl.inCar.health + '%';
      $('carbox').style.display = 'block';
    } else $('carbox').style.display = 'none';
    this.drawMinimap();
  }

  // ---------------------------------------------------------------- loop

  frame() {
    let dt = Math.min(0.05, this.clock.getDelta());
    if (this.paused && this.started) dt = 0;
    this.time += dt;
    if (dt > 0) {
      this.updatePlayer(dt);
      for (const c of this.cars) if (c.driver === 'ai' || c.driver === 'cop') c.ai(dt);
      const steps = 2;
      for (let s = 0; s < steps; s++) {
        for (const c of this.cars) c.update(dt / steps);
        this.collideCars(dt / steps);
      }
      this.carHitsPeople();
      for (const p of this.peds) p.update(dt);
      this.updatePolice(dt);
      this.housekeeping(dt);
      for (const p of this.pickups) {
        if (p.respawn > 0) { p.respawn -= dt; if (p.respawn <= 0) p.mesh.visible = true; continue; }
        p.mesh.rotation.y += dt * 2.5;
        p.mesh.position.y += Math.sin(this.time * 3 + p.pos.x) * 0.004;
      }
      for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.visible = false; }
      this.flash.intensity *= Math.exp(-dt * 12);
      this.T.water.offset.x += dt * 0.02;
    } else if (!this.started) {
      // attract mode: slow orbit before the game starts
      this.camYaw += 0.0015;
    }
    this.updateCamera(dt);
    // cull far dynamic objects
    const cp = this.camera.position;
    for (const p of this.peds) p.root.visible = (p !== this.player.ped || !this.player.inCar) && p.pos.distanceTo(cp) < 200;
    this.player.ped.root.visible = !this.player.inCar;
    for (const c of this.cars) c.root.visible = c.pos.distanceTo(cp) < 230;
    this.particles.update(dt, this.renderer, this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.started) this.updateHUD();
  }
}

window.game = new Game();
