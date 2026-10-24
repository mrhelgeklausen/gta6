// Blocky pixel people: civilians, cops and the player.
import * as THREE from '../lib/three.module.min.js';
import { faceTexture } from './textures.js';
import { blockRect, groundHeight, nearestBlock, N } from './world.js';
import { PC } from './particles.js';

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a86b3c'];
const SHIRT = ['#e84a5f', '#2a9d8f', '#f4a261', '#e9c46a', '#264653', '#ffffff', '#8338ec', '#ff006e', '#3a86ff', '#06d6a0', '#f15bb5', '#9b5de5'];
const PANTS = ['#1d3557', '#3d405b', '#2b2d42', '#6b4f3a', '#a8a8a8', '#14213d', '#5c4033'];
const HAIR = ['#1a1a1a', '#3b2416', '#8a5a2b', '#d9b06c', '#7a1f1f', '#d0d0d0'];

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

const pick = (a) => a[(Math.random() * a.length) | 0];
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const geoms = {
  leg: BOX(0.24, 0.85, 0.26).translate(0, -0.425, 0),
  torso: BOX(0.6, 0.7, 0.32),
  arm: BOX(0.2, 0.72, 0.22).translate(0, -0.33, 0),
  head: BOX(0.42, 0.42, 0.42),
  gun: BOX(0.1, 0.42, 0.12).translate(0, -0.12, 0),
  hat: BOX(0.46, 0.12, 0.5),
};

function part(geo, material, parent, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildHuman(role) {
  const skin = pick(SKIN);
  let shirt = pick(SHIRT), pants = pick(PANTS), hair = pick(HAIR);
  if (role === 'cop') { shirt = '#2b4c9a'; pants = '#1b2650'; hair = '#1b2650'; }
  if (role === 'player') { shirt = '#f6f6f6'; pants = '#2e5fa8'; hair = '#2a1a10'; }

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  const legL = part(geoms.leg, mat(pants), body, -0.15, 0.9, 0);
  const legR = part(geoms.leg, mat(pants), body, 0.15, 0.9, 0);
  part(geoms.torso, mat(shirt), body, 0, 1.25, 0);
  const armL = part(geoms.arm, mat(role === 'player' ? skin : shirt), body, -0.41, 1.55, 0);
  const armR = part(geoms.arm, mat(role === 'player' ? skin : shirt), body, 0.41, 1.55, 0);
  const sm = mat(skin), hm = mat(hair);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(skin, role === 'cop' ? 'cop' : 'civ') });
  const head = part(geoms.head, [sm, sm, hm, sm, faceMat, hm], body, 0, 1.82, 0);
  if (role === 'cop') part(geoms.hat, mat('#14204a'), head, 0, 0.24, 0.02);
  const gun = part(geoms.gun, mat('#222226'), armR, 0, -0.6, 0.06);
  gun.visible = role === 'cop';
  return { root, body, legL, legR, armL, armR, head, gun, shirt };
}

let pedId = 0;

export class Ped {
  constructor(game, role, x, z) {
    this.id = pedId++;
    this.game = game;
    this.role = role;
    this.m = buildHuman(role);
    this.root = this.m.root;
    game.scene.add(this.root);
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.vel = new THREE.Vector3();
    this.facing = Math.random() * Math.PI * 2;
    this.health = role === 'cop' ? 60 : role === 'player' ? 100 : 30;
    this.state = 'walk';
    this.anim = Math.random() * 10;
    this.moveSpeed = 0;
    this.walkSpeed = 1.2 + Math.random() * 0.6;
    this.inset = 1.2 + Math.random() * 1.0;
    this.aiming = false;
    this.punchT = 0;
    this.deadT = 0;
    this.fleeT = 0;
    this.shootCD = 1 + Math.random();
    this.hostile = false;
    this.vy = 0;
    this.spin = 0;
    if (role !== 'player') this.initPath();
  }

  get alive() { return this.state !== 'dead' && this.state !== 'fly'; }

  corner(bi, bj, k) {
    const r = blockRect(bi, bj), i = this.inset;
    return [[r.x0 + i, r.z0 + i], [r.x1 - i, r.z0 + i], [r.x1 - i, r.z1 - i], [r.x0 + i, r.z1 - i]][k];
  }

  initPath() {
    [this.bi, this.bj] = nearestBlock(this.pos.x, this.pos.z);
    let best = 0, bd = Infinity;
    for (let k = 0; k < 4; k++) {
      const c = this.corner(this.bi, this.bj, k);
      const d = Math.hypot(c[0] - this.pos.x, c[1] - this.pos.z);
      if (d < bd) { bd = d; best = k; }
    }
    this.k = best;
    this.ringDir = Math.random() < 0.5 ? 1 : -1;
    this.cross = null;
    this.target = this.corner(this.bi, this.bj, this.k);
  }

  arrive() {
    if (this.cross) {
      [this.bi, this.bj, this.k] = this.cross;
      this.cross = null;
    }
    const opts = [];
    const { bi, bj, k } = this;
    const add = (ni, nj, nk) => { if (ni >= 0 && nj >= 0 && ni < N && nj < N) opts.push([ni, nj, nk]); };
    if (k === 0) { add(bi - 1, bj, 1); add(bi, bj - 1, 3); }
    if (k === 1) { add(bi + 1, bj, 0); add(bi, bj - 1, 2); }
    if (k === 2) { add(bi + 1, bj, 3); add(bi, bj + 1, 1); }
    if (k === 3) { add(bi - 1, bj, 2); add(bi, bj + 1, 0); }
    if (opts.length && Math.random() < 0.25) {
      this.cross = pick(opts);
      this.target = this.corner(this.cross[0], this.cross[1], this.cross[2]);
    } else {
      if (Math.random() < 0.1) this.ringDir *= -1;
      this.k = (this.k + this.ringDir + 4) % 4;
      this.target = this.corner(this.bi, this.bj, this.k);
    }
  }

  // Move with building collision. Returns true if blocked.
  move(dx, dz) {
    const r = this.game.world.collideCircle(this.pos.x + dx, this.pos.z + dz, 0.35, this.pos.y);
    this.pos.x = r.x;
    this.pos.z = r.z;
    return r.hit;
  }

  faceTowards(ang, dt, rate = 10) {
    let d = ang - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * rate);
  }

  scare(from, t = 6) {
    if (!this.alive || this.role === 'player') return;
    if (this.role === 'cop') return;
    if (this.state !== 'flee' && Math.random() < 0.3) this.game.sfx.scream(this.game.volAt(this.pos) * 0.6);
    this.state = 'flee';
    this.fleeFrom = from.clone();
    this.fleeT = t + Math.random() * 3;
  }

  damage(dmg, from, byPlayer) {
    if (!this.alive) return;
    this.health -= dmg;
    const g = this.game;
    g.particles.burst(new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z), 10 + dmg / 2, {
      color: PC.blood, color1: PC.blood2, speed: 2.5, up: 1.5, gravity: 14, size: 0.12, life: 0.8,
    });
    if (this.role === 'player') { g.onPlayerHurt(dmg); return; }
    if (this.health <= 0) this.die(from, byPlayer);
    else if (this.role === 'cop') { if (byPlayer) g.crime(30, this.pos); }
    else this.scare(from);
  }

  die(from, byPlayer) {
    this.health = 0;
    this.state = 'dead';
    this.deadT = 0;
    this.m.gun.visible = false;
    this.root.rotation.x = -Math.PI / 2;
    if (from) this.facing = Math.atan2(this.pos.x - from.x, this.pos.z - from.z) + Math.PI;
    this.game.onPedDeath(this, byPlayer);
  }

  // Launched by a car
  launch(vx, vy, vz, byPlayer) {
    if (!this.alive) return;
    this.state = 'fly';
    this.health = 0;
    this.vel.set(vx, vy, vz);
    this.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6);
    this.m.gun.visible = false;
    this.game.particles.burst(new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z), 18, {
      color: PC.blood, color1: PC.blood2, speed: 3, up: 2, gravity: 14, size: 0.14, life: 1,
    });
    this.game.sfx.splat(this.game.volAt(this.pos));
    this.game.onPedDeath(this, byPlayer);
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'fly') {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const r = g.world.collideCircle(this.pos.x, this.pos.z, 0.35, this.pos.y);
      if (r.hit) { this.vel.x *= -0.3; this.vel.z *= -0.3; this.pos.x = r.x; this.pos.z = r.z; }
      this.root.rotation.x += this.spin * dt;
      const gh = groundHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= gh && this.vel.y < 0) {
        this.pos.y = gh;
        if (this.vel.length() > 5) {
          this.vel.y = -this.vel.y * 0.3;
          this.vel.x *= 0.6; this.vel.z *= 0.6;
        } else {
          this.state = 'dead';
          this.deadT = 0;
          this.root.rotation.x = -Math.PI / 2;
          g.addBlood(this.pos);
        }
      }
      this.sync(dt);
      return;
    }
    if (this.state === 'dead') {
      this.deadT += dt;
      this.sync(dt);
      return;
    }
    if (this.role === 'player') return; // player is driven by the game

    let speed = 0, tx = 0, tz = 0;
    if (this.role === 'cop' && g.wanted > 0 && !g.player.dead && this.pos.distanceTo(g.playerPos) < 90) {
      // Hostile cop: chase and shoot
      const tp = g.playerPos;
      const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const los = d < 30 && g.lineOfSight(this.pos, tp);
      this.aiming = los && d < 26;
      this.m.gun.visible = true;
      if (this.aiming) {
        this.faceTowards(Math.atan2(dx, dz), dt, 12);
        if (d > 9) { speed = 1.6; tx = dx / d; tz = dz / d; }
        this.shootCD -= dt;
        if (this.shootCD <= 0) {
          this.shootCD = 1.1 + Math.random() * 1.2;
          g.copShoot(this);
        }
      } else {
        speed = 5.2;
        tx = dx / d; tz = dz / d;
      }
      this.state = 'chase';
    } else if (this.state === 'flee') {
      this.fleeT -= dt;
      let dx = this.pos.x - this.fleeFrom.x, dz = this.pos.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = dx / d; tz = dz / d;
      speed = 5;
      if (this.fleeT <= 0) { this.state = 'walk'; this.initPath(); }
    } else {
      if (this.state === 'chase') { this.state = 'walk'; this.initPath(); this.aiming = false; this.m.gun.visible = this.role === 'cop'; }
      const dx = this.target[0] - this.pos.x, dz = this.target[1] - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) this.arrive();
      else { tx = dx / d; tz = dz / d; speed = this.walkSpeed; }
      // wait for traffic when crossing
      if (this.cross && groundHeight(this.pos.x, this.pos.z) > 0 && g.carNear(this.pos, 9, 4)) speed = 0;
    }

    if (speed > 0) {
      if (!this.aiming) this.faceTowards(Math.atan2(tx, tz), dt, 8);
      const blocked = this.move(tx * speed * dt, tz * speed * dt);
      if (blocked && this.state === 'flee') {
        // slide around obstacles by turning
        this.fleeFrom.x += (Math.random() - 0.5) * 20;
        this.fleeFrom.z += (Math.random() - 0.5) * 20;
      }
      if (blocked && this.state === 'walk' && Math.random() < 0.02) this.initPath();
    }
    this.moveSpeed = speed;
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.sync(dt);
  }

  // Apply transform + walk cycle
  sync(dt) {
    const m = this.m;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    if (this.state === 'dead') {
      this.root.position.y += 0.17;
      m.legL.rotation.x = 0.1; m.legR.rotation.x = -0.1;
      m.armL.rotation.x = -0.4; m.armR.rotation.x = -2.6;
      m.armL.rotation.z = 0; m.armR.rotation.z = 0;
      return;
    }
    if (this.state === 'fly') {
      m.armL.rotation.x = -2.5; m.armR.rotation.x = 2.2;
      m.legL.rotation.x = 0.8; m.legR.rotation.x = -0.6;
      return;
    }
    this.root.rotation.x = 0;
    const sp = this.moveSpeed;
    this.anim += dt * (sp > 3 ? 11 : 7) * Math.min(1, sp);
    const amp = sp > 3 ? 0.9 : 0.55;
    const s = Math.sin(this.anim) * amp * Math.min(1, sp);
    m.legL.rotation.x = s;
    m.legR.rotation.x = -s;
    m.armL.rotation.x = -s * 0.8;
    m.body.position.y = sp > 0.1 ? Math.abs(Math.cos(this.anim)) * 0.06 : 0;
    if (this.punchT > 0) {
      this.punchT -= dt;
      m.armR.rotation.x = -Math.PI / 2 - Math.sin((this.punchT / 0.25) * Math.PI) * 0.4;
    } else if (this.aiming) {
      m.armR.rotation.x = -Math.PI / 2;
    } else {
      m.armR.rotation.x = s * 0.8;
    }
  }

  remove() {
    this.game.scene.remove(this.root);
  }
}
