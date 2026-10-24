// Cars: blocky models, arcade physics and traffic / police AI.
import * as THREE from '../lib/three.module.min.js';
import { DIRS, LANE, N, P, roadC, groundHeight, nearestNode } from './world.js';
import { PC } from './particles.js';

export const CAR_TYPES = {
  sedan: { name: 'Cruiser', len: 4.4, wid: 2.0, hgt: 0.62, cab: 0.58, cabLen: 0.5, cabOff: -0.06, maxSpeed: 32, accel: 12, mass: 1.2,
    colors: ['#c0392b', '#2471a3', '#1e8449', '#7d3c98', '#d4ac0d', '#5d6d7e', '#e8e8e8', '#212f3c', '#e67e22'] },
  sport: { name: 'Stinger', len: 4.5, wid: 2.05, hgt: 0.5, cab: 0.48, cabLen: 0.4, cabOff: -0.1, maxSpeed: 46, accel: 18, mass: 1.1,
    colors: ['#ff1f5a', '#ffd400', '#00e5ff', '#ff6a00', '#ffffff', '#7bff00'] },
  taxi: { name: 'Cabbie', len: 4.5, wid: 2.0, hgt: 0.62, cab: 0.6, cabLen: 0.5, cabOff: -0.06, maxSpeed: 30, accel: 11, mass: 1.2,
    colors: ['#f5c518'] },
  van: { name: 'Hauler', len: 5.2, wid: 2.25, hgt: 0.8, cab: 1.0, cabLen: 0.78, cabOff: -0.08, maxSpeed: 25, accel: 8, mass: 2,
    colors: ['#f4f4f4', '#8e9aa6', '#b03a2e', '#196f3d', '#f0e0c0'] },
  police: { name: 'Patrol', len: 4.6, wid: 2.05, hgt: 0.62, cab: 0.58, cabLen: 0.5, cabOff: -0.06, maxSpeed: 42, accel: 16, mass: 1.4,
    colors: ['#f4f4f4'] },
};

const WHEEL_R = 0.38;
const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 8).rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: '#1a1a1e' });
const hubMat = new THREE.MeshLambertMaterial({ color: '#a0a0a8' });
const hubGeo = new THREE.BoxGeometry(0.32, 0.22, 0.22);
const headMat = new THREE.MeshBasicMaterial({ color: '#fff6c0' });
const tailMat = new THREE.MeshBasicMaterial({ color: '#ff2020' });
const darkMat = new THREE.MeshLambertMaterial({ color: '#1c1c22' });
const burntMat = new THREE.MeshLambertMaterial({ color: '#222020' });
const redLight = new THREE.MeshBasicMaterial({ color: '#ff1010' });
const blueLight = new THREE.MeshBasicMaterial({ color: '#1040ff' });
const offLight = new THREE.MeshLambertMaterial({ color: '#303040' });

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function box(parent, w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Car {
  constructor(game, type, x, z, heading) {
    this.game = game;
    this.type = type;
    const T = (this.spec = CAR_TYPES[type]);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector2();
    this.heading = heading;
    this.spin = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = null; // null | 'ai' | 'player' | 'cop'
    this.dead = false;
    this.fireT = 0;
    this.wheelRot = 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.waitT = 0;
    this.ignoreT = 0;
    this.lightT = Math.random();
    this.input = { throttle: 0, steer: 0, brake: false };
    this.cruise = 11 + Math.random() * 4;

    const color = T.colors[(Math.random() * T.colors.length) | 0];
    this.bodyMat = new THREE.MeshLambertMaterial({ map: game.T.carBody, color });
    this.glassMat = new THREE.MeshLambertMaterial({ map: game.T.carGlass });

    const root = (this.root = new THREE.Group());
    const body = (this.body = new THREE.Group());
    root.add(body);
    const L = T.len, W = T.wid;
    const yb = 0.3;
    box(body, W, T.hgt, L, this.bodyMat, 0, yb + T.hgt / 2, 0);
    box(body, W + 0.06, 0.18, L + 0.06, darkMat, 0, yb + 0.05, 0); // bumper skirt
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, T.cab, L * T.cabLen),
      [this.glassMat, this.glassMat, this.bodyMat, this.bodyMat, this.glassMat, this.glassMat]);
    cab.position.set(0, yb + T.hgt + T.cab / 2, L * T.cabOff);
    cab.castShadow = true;
    body.add(cab);
    const cabTop = yb + T.hgt + T.cab;
    for (const s of [-1, 1]) {
      box(body, 0.42, 0.18, 0.08, headMat, s * (W / 2 - 0.35), yb + T.hgt - 0.18, L / 2 + 0.02);
      box(body, 0.42, 0.16, 0.08, tailMat, s * (W / 2 - 0.35), yb + T.hgt - 0.18, -L / 2 - 0.02);
    }
    if (type === 'police') {
      box(body, W + 0.02, T.hgt * 0.5, L * 0.36, darkMat, 0, yb + T.hgt * 0.3, 0.1);
      box(body, W * 0.86 + 0.02, 0.06, L * T.cabLen * 0.9, darkMat, 0, cabTop - 0.02, L * T.cabOff);
      this.lights = [box(body, 0.5, 0.16, 0.3, redLight, -0.3, cabTop + 0.08, L * T.cabOff),
        box(body, 0.5, 0.16, 0.3, blueLight, 0.3, cabTop + 0.08, L * T.cabOff)];
    }
    if (type === 'taxi') box(body, 0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: '#fff4a0' }), 0, cabTop + 0.11, L * T.cabOff);
    if (type === 'sport') box(body, W * 0.9, 0.08, 0.3, this.bodyMat, 0, yb + T.hgt + 0.25, -L / 2 + 0.2);

    this.wheels = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (W / 2 - 0.1), WHEEL_R, sz * (L / 2 - 0.85));
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      w.add(new THREE.Mesh(hubGeo, hubMat));
      pivot.add(w);
      root.add(pivot);
      this.wheels.push({ pivot, w, front: sz > 0 });
    }
    game.scene.add(root);
    this.sync(0);
  }

  get speed() { return this.vel.x * Math.sin(this.heading) + this.vel.y * Math.cos(this.heading); }
  get fwd() { return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading)); }
  get radius() { return this.spec.wid / 2; }
  get isPolice() { return this.type === 'police'; }

  // circle centres used for collisions
  circles() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const o = this.spec.len / 2 - this.spec.wid / 2;
    return [[this.pos.x + fx * o, this.pos.z + fz * o], [this.pos.x, this.pos.z], [this.pos.x - fx * o, this.pos.z - fz * o]];
  }

  damage(amount, byPlayer) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0 && this.fireT === 0) {
      this.health = 0;
      this.fireT = 4 + Math.random() * 2;
      this.fireByPlayer = byPlayer;
      if (this.driver === 'ai' || this.driver === 'cop') this.game.bailOut(this);
    }
  }

  update(dt) {
    const T = this.spec;
    const inp = this.dead || this.driver === null ? { throttle: 0, steer: 0, brake: this.driver === null } : this.input;

    // steering & yaw (bicycle model)
    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let s = this.vel.x * fx + this.vel.y * fz;
    this.steer += (inp.steer - this.steer) * Math.min(1, dt * 8);
    const sa = (this.steer * 0.62) / (1 + Math.abs(s) * 0.045);
    const yawRate = (s * Math.tan(sa)) / 2.6 * (inp.brake ? 1.35 : 1);
    this.heading -= yawRate * dt;
    this.heading += this.spin * dt;
    this.spin *= Math.exp(-5 * dt);

    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    s = this.vel.x * fx + this.vel.y * fz;
    let l = this.vel.x * rx + this.vel.y * rz;

    const th = inp.throttle;
    if (th > 0) {
      if (s < -0.5) s += 28 * th * dt;
      else s += T.accel * th * dt * Math.max(0, 1 - s / T.maxSpeed);
    } else if (th < 0) {
      if (s > 0.5) s += 28 * th * dt;
      else s += T.accel * 0.6 * th * dt * Math.max(0, 1 + s / 11);
    } else {
      s -= Math.sign(s) * Math.min(Math.abs(s), 2.5 * dt);
    }
    s -= s * 0.05 * dt;
    if (inp.brake) s -= Math.sign(s) * Math.min(Math.abs(s), (this.driver === null ? 20 : 9) * dt);
    const grip = inp.brake ? 1.0 : 6.5;
    const lost = l * (1 - Math.exp(-grip * dt));
    l -= lost;
    this.drift = Math.abs(l);
    this.vel.set(fx * s + rx * l, fz * s + rz * l);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // static collision with 3 circles
    const circles = this.circles();
    const offs = [1, 0, -1];
    let impact = 0;
    for (let i = 0; i < 3; i++) {
      const [cx, cz] = circles[i];
      const r = this.game.world.collideCircle(cx, cz, this.radius, this.pos.y + 0.2);
      if (!r.hit) continue;
      const dx = r.x - cx, dz = r.z - cz;
      this.pos.x += dx; this.pos.z += dz;
      for (const c of circles) { c[0] += dx; c[1] += dz; }
      const vn = this.vel.x * r.nx + this.vel.y * r.nz;
      if (vn < 0) {
        this.vel.x -= 1.35 * vn * r.nx;
        this.vel.y -= 1.35 * vn * r.nz;
        impact = Math.max(impact, -vn);
        const o = offs[i] * (T.len / 2 - T.wid / 2);
        this.spin += ((fx * o * r.nz - fz * o * r.nx) * -vn) * 0.12;
      }
    }
    if (impact > 4) this.onImpact(impact);

    const gh = groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (gh - this.pos.y) * Math.min(1, dt * 12);

    // damage effects
    if (this.fireT > 0) {
      this.fireT -= dt;
      const p = new THREE.Vector3(this.pos.x + fx * T.len * 0.35, this.pos.y + 1.1, this.pos.z + fz * T.len * 0.35);
      for (let k = 0; k < 2; k++) {
        this.game.particles.emit(p.x + (Math.random() - 0.5), p.y, p.z + (Math.random() - 0.5), (Math.random() - 0.5), 3 + Math.random() * 2, (Math.random() - 0.5),
          { color: PC.fire, color1: PC.fire2, size: 0.5, size1: 0.2, life: 0.6 });
      }
      if (this.fireT <= 0) this.game.explodeCar(this);
    } else if (!this.dead && this.health < 35 && Math.random() < 0.4) {
      const p = this.pos;
      this.game.particles.emit(p.x + fx * T.len * 0.4, p.y + 1.1, p.z + fz * T.len * 0.4, (Math.random() - 0.5), 2, (Math.random() - 0.5),
        { color: PC.smoke, color1: PC.smoke2, size: 0.4, size1: 1.0, life: 1.4 });
    }

    this.sync(dt, s);
  }

  onImpact(impact) {
    const g = this.game;
    this.damage(Math.max(0, impact - 6) * 2.2, this.driver === 'player');
    g.sfx.crash(Math.min(1, impact / 20) * g.volAt(this.pos));
    if (this.driver === 'player') g.shake(Math.min(1, impact / 18));
    if (impact > 9) {
      const p = new THREE.Vector3(this.pos.x, this.pos.y + 0.8, this.pos.z);
      g.particles.burst(p, 10, { color: PC.spark, color1: PC.spark2, speed: 4, up: 1.2, gravity: 12, size: 0.1, life: 0.5 });
      g.particles.burst(p, 6, { color: PC.glass, speed: 3, up: 1.5, gravity: 14, size: 0.1, life: 0.8 });
    }
  }

  sync(dt, s = this.speed) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    this.wheelRot += (s / WHEEL_R) * dt;
    for (const w of this.wheels) {
      w.w.rotation.x = this.wheelRot;
      if (w.front) w.pivot.rotation.y = -this.steer * 0.5;
    }
    // body roll & pitch
    const roll = clamp(this.steer * s * 0.004, -0.08, 0.08);
    this.body.rotation.z += (roll - this.body.rotation.z) * Math.min(1, dt * 6);
    if (this.lights && this.driver === 'cop' && this.game.wanted > 0) {
      this.lightT += dt;
      const on = (this.lightT * 4) % 2 < 1;
      this.lights[0].material = on ? redLight : offLight;
      this.lights[1].material = on ? offLight : blueLight;
    } else if (this.lights) {
      this.lights[0].material = offLight;
      this.lights[1].material = offLight;
    }
  }

  burn() {
    this.dead = true;
    this.fireT = 0;
    this.health = 0;
    this.bodyMat.color.set('#2a2626');
    this.bodyMat.map = null;
    this.bodyMat.needsUpdate = true;
    this.glassMat.color.set('#111');
    this.glassMat.map = null;
    this.glassMat.needsUpdate = true;
    if (this.lights) for (const l of this.lights) l.material = burntMat;
  }

  remove() { this.game.scene.remove(this.root); }

  // ---------------- AI ----------------

  laneLine() {
    const [i, j] = this.aiTarget;
    const [dx, dz] = DIRS[this.aiDir];
    // right of travel direction = (-dz, dx)
    return { px: roadC(i) - dz * LANE, pz: roadC(j) + dx * LANE, dx, dz };
  }

  routeFromHere() {
    const [ni, nj] = nearestNode(this.pos.x, this.pos.z);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let best = 0, bd = -2;
    for (let d = 0; d < 4; d++) {
      const dot = DIRS[d][0] * fx + DIRS[d][1] * fz;
      if (dot > bd) { bd = dot; best = d; }
    }
    this.aiDir = best;
    // target the node ahead of us along that direction
    const ahead = (DIRS[best][0] * (roadC(ni) - this.pos.x) + DIRS[best][1] * (roadC(nj) - this.pos.z)) > 2;
    let ti = ni, tj = nj;
    if (!ahead) { ti += DIRS[best][0]; tj += DIRS[best][1]; }
    if (ti < 0 || tj < 0 || ti > N || tj > N) { this.aiDir = (best + 2) % 4; ti = ni; tj = nj; }
    this.aiTarget = [ti, tj];
    this.aiNext = this.pickNext();
  }

  pickNext() {
    const [i, j] = this.aiTarget;
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (d === (this.aiDir + 2) % 4) continue;
      const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
      if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
      opts.push(d);
    }
    if (!opts.length) return (this.aiDir + 2) % 4;
    if (this.driver === 'cop' && this.game.wanted > 0) {
      // greedy towards the player
      const tp = this.game.playerPos;
      let best = opts[0], bd = Infinity;
      for (const d of opts) {
        const nx = roadC(i + DIRS[d][0]), nz = roadC(j + DIRS[d][1]);
        const dd = Math.hypot(tp.x - nx, tp.z - nz) + Math.random() * 10;
        if (dd < bd) { bd = dd; best = d; }
      }
      return best;
    }
    if (opts.includes(this.aiDir) && Math.random() < 0.5) return this.aiDir;
    return opts[(Math.random() * opts.length) | 0];
  }

  ai(dt) {
    const g = this.game;
    const inp = this.input;
    if (this.dead || this.fireT > 0) { inp.throttle = 0; inp.steer = 0; inp.brake = true; return; }
    if (!this.aiTarget) this.routeFromHere();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const s = this.speed;
    const chasing = this.driver === 'cop' && g.wanted > 0 && !g.player.dead;

    let tx, tz, desired = this.cruise, direct = false;
    if (chasing) {
      const tp = g.playerPos;
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      if (d < 50 && g.lineOfSight(this.pos, tp, 1)) {
        direct = true;
        const tv = g.playerVel;
        tx = tp.x + tv.x * 0.6; tz = tp.z + tv.y * 0.6;
        desired = g.player.inCar ? 45 : Math.min(30, d * 1.2);
        if (!g.player.inCar && d < 14) {
          desired = 0;
          if (Math.abs(s) < 3) { g.deployCops(this); return; }
        }
        this.lostDirect = true;
      } else {
        if (this.lostDirect) { this.lostDirect = false; this.routeFromHere(); }
        desired = 26;
      }
    }

    if (!direct) {
      let L = this.laneLine();
      let rem = -((this.pos.x - L.px) * L.dx + (this.pos.z - L.pz) * L.dz);
      const turn = this.aiNext === this.aiDir ? 0 : this.aiNext === (this.aiDir + 1) % 4 ? 1 : -1;
      const switchAt = turn === 1 ? 6.5 : turn === -1 ? -1.5 : 0;
      if (rem < switchAt) {
        const [i, j] = this.aiTarget;
        this.aiDir = this.aiNext;
        this.aiTarget = [i + DIRS[this.aiDir][0], j + DIRS[this.aiDir][1]];
        this.aiNext = this.pickNext();
        L = this.laneLine();
        rem = -((this.pos.x - L.px) * L.dx + (this.pos.z - L.pz) * L.dz);
      }
      const look = 6 + Math.abs(s) * 0.35;
      const along = Math.max(0, rem - look);
      tx = L.px - L.dx * along; tz = L.pz - L.dz * along;
      if (turn !== 0 && rem < 22 && !chasing) desired = Math.min(desired, 7);
      if (turn !== 0 && rem < 22 && chasing) desired = Math.min(desired, 14);
      if (rem > P * 1.5) this.routeFromHere(); // lost: re-route
    }

    // obstacle avoidance (traffic only)
    let blocked = false;
    if (!chasing && this.ignoreT <= 0) {
      const rx = -fz, rz = fx;
      const range = 7 + Math.abs(s) * 0.9;
      const check = (px, pz, w) => {
        const dx = px - this.pos.x, dz = pz - this.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 1 || ahead > range) return;
        if (Math.abs(dx * rx + dz * rz) > w) return;
        desired = Math.min(desired, Math.max(0, (ahead - 6.5) * 0.9));
        blocked = true;
      };
      for (const c of g.cars) if (c !== this && Math.abs(c.pos.x - this.pos.x) < 30 && Math.abs(c.pos.z - this.pos.z) < 30) check(c.pos.x, c.pos.z, 2.2);
      for (const p of g.peds) if (p.alive && Math.abs(p.pos.x - this.pos.x) < 20 && Math.abs(p.pos.z - this.pos.z) < 20) check(p.pos.x, p.pos.z, 1.6);
      if (!g.player.inCar && !g.player.dead) check(g.player.ped.pos.x, g.player.ped.pos.z, 1.6);
    }
    this.ignoreT -= dt;

    // steering towards target
    const ang = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const diff = wrap(ang - this.heading);
    let steer = clamp(-diff * 2.2, -1, 1);
    let throttle;
    if (s < desired - 0.5) throttle = Math.min(1, (desired - s) / 3);
    else if (s > desired + 1) throttle = -Math.min(1, (s - desired) / 4);
    else throttle = 0;
    if (direct && Math.abs(diff) > 2.2 && s < 8) { throttle = -1; steer = -steer; } // target behind: reverse-turn

    // stuck handling
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = -1;
      steer = -this.stuckSteer;
    } else if (throttle > 0.3 && Math.abs(s) < 0.6) {
      this.stuckT += dt;
      if (this.stuckT > 1.6) { this.reverseT = 1.3; this.stuckT = 0; this.stuckSteer = steer >= 0 ? 1 : -1; }
    } else this.stuckT = 0;

    if (blocked && Math.abs(s) < 0.5) {
      this.waitT += dt;
      if (this.waitT > 5) { this.ignoreT = 2; this.waitT = 0; if (g.volAt(this.pos) > 0.3) g.sfx.horn(); }
    } else this.waitT = 0;

    inp.throttle = throttle;
    inp.steer = steer;
    inp.brake = desired === 0 && Math.abs(s) < 2;
  }
}

export function lanePlacement(i, j, dir, t) {
  // point on the lane of segment starting at node (i,j) heading dir, fraction t along it
  const [dx, dz] = DIRS[dir];
  const x = roadC(i) + dx * P * t - dz * LANE;
  const z = roadC(j) + dz * P * t + dx * LANE;
  return { x, z, heading: Math.atan2(dx, dz), target: [i + dx, j + dz] };
}
