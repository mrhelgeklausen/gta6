// City layout, static geometry and static collision.
import * as THREE from '../lib/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { rng } from './textures.js';

export const N = 8;           // blocks per side
export const BLOCK = 44;      // block size (m)
export const ROAD = 14;       // road width (m)
export const P = BLOCK + ROAD;
export const CITY = N * P + ROAD;
export const HALF = CITY / 2;
export const LANE = 3.5;      // lane centre offset from road centre
export const CURB = 0.25;     // sidewalk height
export const LIMIT = HALF + 50; // walkable/driveable bound (beach)

export const roadC = (i) => -HALF + ROAD / 2 + i * P;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function blockRect(bi, bj) {
  const x0 = roadC(bi) + ROAD / 2, z0 = roadC(bj) + ROAD / 2;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
}

// Which block (if any) contains this point, -1 if on a road / outside.
function blockAxis(v) {
  const t = v - (-HALF + ROAD);
  const b = Math.floor(t / P);
  if (b < 0 || b >= N) return -1;
  return t - b * P < BLOCK ? b : -1;
}

export function groundHeight(x, z) {
  return blockAxis(x) >= 0 && blockAxis(z) >= 0 ? CURB : 0;
}

export function nearestBlock(x, z) {
  const f = (v) => Math.max(0, Math.min(N - 1, Math.floor((v - (-HALF + ROAD) + ROAD / 2) / P)));
  return [f(x), f(z)];
}

export function nearestNode(x, z) {
  const f = (v) => Math.max(0, Math.min(N, Math.round((v - roadC(0)) / P)));
  return [f(x), f(z)];
}

// Spatial hash of axis aligned boxes {x0,x1,y0,y1,z0,z1}
export class StaticWorld {
  constructor() {
    this.boxes = [];
    this.cell = 16;
    this.grid = new Map();
    this.stamp = 0;
    this._out = [];
  }

  key(i, j) { return i * 4096 + j; }

  add(b) {
    b._s = 0;
    this.boxes.push(b);
    const c = this.cell;
    for (let i = Math.floor(b.x0 / c); i <= Math.floor(b.x1 / c); i++)
      for (let j = Math.floor(b.z0 / c); j <= Math.floor(b.z1 / c); j++) {
        const k = this.key(i, j);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(b);
      }
  }

  query(x0, z0, x1, z1) {
    const out = this._out;
    out.length = 0;
    const s = ++this.stamp, c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (const b of list) if (b._s !== s) { b._s = s; out.push(b); }
      }
    return out;
  }

  // Push a circle out of all boxes. Returns {x, z, nx, nz, hit}.
  collideCircle(x, z, r, y = 0.5) {
    let hit = false, nx = 0, nz = 0;
    const boxes = this.query(x - r, z - r, x + r, z + r);
    for (let iter = 0; iter < 2; iter++) {
      for (const b of boxes) {
        if (y > b.y1 || y + 1.5 < b.y0) continue;
        const cx = Math.max(b.x0, Math.min(x, b.x1));
        const cz = Math.max(b.z0, Math.min(z, b.z1));
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          dx /= d; dz /= d;
          x += dx * (r - d);
          z += dz * (r - d);
        } else {
          // centre inside box: push out along shallowest axis
          const pens = [[x - b.x0 + r, -1, 0], [b.x1 - x + r, 1, 0], [z - b.z0 + r, 0, -1], [b.z1 - z + r, 0, 1]];
          pens.sort((a, c) => a[0] - c[0]);
          dx = pens[0][1]; dz = pens[0][2];
          x += dx * pens[0][0];
          z += dz * pens[0][0];
        }
        nx += dx; nz += dz;
      }
    }
    // world bounds
    if (x < -LIMIT) { x = -LIMIT; nx += 1; hit = true; }
    if (x > LIMIT) { x = LIMIT; nx -= 1; hit = true; }
    if (z < -LIMIT) { z = -LIMIT; nz += 1; hit = true; }
    if (z > LIMIT) { z = LIMIT; nz -= 1; hit = true; }
    const l = Math.hypot(nx, nz) || 1;
    return { x, z, nx: nx / l, nz: nz / l, hit };
  }

  // Ray vs boxes (slab test). dir must be normalised. Returns distance or Infinity.
  raycast(o, d, maxT) {
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
    const boxes = this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez));
    let best = maxT, hit = null;
    for (const b of boxes) {
      const t = rayBox(o, d, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      if (t >= 0 && t < best) { best = t; hit = b; }
    }
    return hit ? best : Infinity;
  }

  lineClear(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    d.divideScalar(len);
    return this.raycast(a, d, len) === Infinity;
  }
}

export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const ax = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (const [oo, dd, lo, hi] of ax) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return -1;
    } else {
      let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

const PASTELS = ['#f4b6c8', '#9fdbe8', '#f6e3b4', '#cfc0f2', '#b4ecc8', '#f6c9a8', '#e6e6e6', '#a8b4c4', '#f2a0a0', '#ffe08a'];

export function buildCity(scene, T) {
  const R = rng(42);
  const world = new StaticWorld();
  const blocks = [];

  const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra });
  const B = {
    wallA: new GeoBuilder(), wallB: new GeoBuilder(), wallC: new GeoBuilder(),
    roof: new GeoBuilder(), side: new GeoBuilder(), grass: new GeoBuilder(),
    plain: new GeoBuilder(), marks: new GeoBuilder(),
  };

  // Ground layers
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY, CITY), new THREE.MeshLambertMaterial({ map: T.asphalt }));
  T.asphalt.repeat.set(CITY / 8, CITY / 8);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sandSize = CITY + 2 * 58;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(sandSize, sandSize), new THREE.MeshLambertMaterial({ map: T.sand }));
  T.sand.repeat.set(sandSize / 4, sandSize / 4);
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.05;
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ map: T.water }));
  T.water.repeat.set(3000 / 6, 3000 / 6);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  scene.add(water);

  const healthSpots = [];

  for (let bi = 0; bi < N; bi++) {
    blocks.push([]);
    for (let bj = 0; bj < N; bj++) {
      const r = blockRect(bi, bj);
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const distC = Math.hypot(cx, cz) / HALF; // 0 centre .. ~1.4 corner
      const park = R() < 0.13;
      blocks[bi].push({ park, rect: r });

      // Sidewalk slab (whole block)
      B.side.box(cx, 0, cz, BLOCK, CURB, BLOCK, { s: 2, color: '#a89fa8', topColor: '#ffffff' });

      // Street lamps along the edge
      for (let k = 4; k < BLOCK; k += 13) {
        for (const [lx, lz] of [[r.x0 + k, r.z0 + 0.7], [r.x0 + k, r.z1 - 0.7], [r.x0 + 0.7, r.z0 + k], [r.x1 - 0.7, r.z0 + k]]) {
          B.plain.box(lx, CURB, lz, 0.18, 5, 0.18, { color: '#3a3a44' });
          B.plain.box(lx, CURB + 5, lz, 0.5, 0.25, 0.5, { color: '#ffe9a8' });
        }
      }

      const ix0 = r.x0 + 3, iz0 = r.z0 + 3, iw = BLOCK - 6;

      if (park) {
        B.grass.box(cx, CURB, cz, iw, 0.15, iw, { s: 4, color: '#3d7a35', topColor: '#ffffff' });
        // trees
        for (let t = 0; t < 9; t++) {
          const tx = ix0 + 3 + R() * (iw - 6), tz = iz0 + 3 + R() * (iw - 6);
          if (Math.hypot(tx - cx, tz - cz) < 4) continue;
          if (R() < 0.5) palm(B.plain, world, tx, CURB + 0.15, tz, R);
          else tree(B.plain, world, tx, CURB + 0.15, tz, R);
        }
        // fountain in the middle
        B.side.box(cx, CURB, cz, 5, 0.7, 5, { s: 2, color: '#d8d0d8' });
        B.plain.box(cx, CURB + 0.2, cz, 4.2, 0.55, 4.2, { color: '#4aa8d8' });
        B.plain.box(cx, CURB, cz, 0.6, 2.2, 0.6, { color: '#e0d8e0' });
        world.add({ x0: cx - 2.5, x1: cx + 2.5, z0: cz - 2.5, z1: cz + 2.5, y0: 0, y1: 1 });
        healthSpots.push(new THREE.Vector3(cx + 4, CURB + 0.15, cz));
        continue;
      }

      // Subdivide into lots
      const lots = [];
      const pattern = R();
      const g = 1.5; // gap between buildings
      const hw = (iw - g) / 2;
      if (pattern < 0.2) lots.push([ix0, iz0, iw, iw]);
      else if (pattern < 0.45) {
        if (R() < 0.5) { lots.push([ix0, iz0, hw, iw], [ix0 + hw + g, iz0, hw, iw]); }
        else { lots.push([ix0, iz0, iw, hw], [ix0, iz0 + hw + g, iw, hw]); }
      } else if (pattern < 0.7) {
        lots.push([ix0, iz0, hw, iw], [ix0 + hw + g, iz0, hw, hw], [ix0 + hw + g, iz0 + hw + g, hw, hw]);
      } else {
        lots.push([ix0, iz0, hw, hw], [ix0 + hw + g, iz0, hw, hw], [ix0, iz0 + hw + g, hw, hw], [ix0 + hw + g, iz0 + hw + g, hw, hw]);
      }

      for (const [lx, lz, lw, ld] of lots) {
        const tall = Math.max(0, 1.1 - distC);
        let h = 8 + R() * 14 + tall * tall * R() * 70;
        h = Math.round(h / 4) * 4;
        const glass = h > 40 && R() < 0.6;
        const wall = glass ? B.wallC : R() < 0.5 ? B.wallA : B.wallB;
        const color = glass ? (R() < 0.5 ? '#8fd0f0' : '#b0a0f0') : PASTELS[(R() * PASTELS.length) | 0];
        const bx = lx + lw / 2, bz = lz + ld / 2;
        // slight inset variation so buildings aren't all flush
        const w = lw - R() * 1.5, d = ld - R() * 1.5;
        wall.box(bx, CURB, bz, w, h, d, { s: 4, color, top: B.roof, topS: 4, topColor: '#ffffff' });
        world.add({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, y0: 0, y1: CURB + h });
        // ledge / parapet
        B.plain.box(bx, CURB + h, bz, w + 0.4, 0.5, d + 0.4, { color: shadeHex(color, -0.15) });
        // stepped tower top
        if (h > 36 && R() < 0.7) {
          const w2 = w * (0.5 + R() * 0.25), d2 = d * (0.5 + R() * 0.25), h2 = 8 + Math.round(R() * 4) * 4;
          wall.box(bx, CURB + h + 0.5, bz, w2, h2, d2, { s: 4, color, top: B.roof, topS: 4, topColor: '#ffffff' });
          if (R() < 0.6) B.plain.box(bx, CURB + h + 0.5 + h2, bz, 0.3, 8, 0.3, { color: '#c03030' });
        }
        // rooftop clutter
        for (let k = 0; k < 3; k++) {
          if (R() < 0.4) continue;
          const ax = bx + (R() - 0.5) * (w - 3), az = bz + (R() - 0.5) * (d - 3);
          B.plain.box(ax, CURB + h + 0.5, az, 1.2 + R(), 1 + R(), 1.2 + R(), { color: '#9a9aa2' });
        }
        // awning at street level
        if (!glass && R() < 0.5) {
          const ac = ['#e04060', '#30a0a0', '#f0a030', '#6040c0'][(R() * 4) | 0];
          B.plain.box(bx, CURB + 3.2, bz, w + 1.4, 0.3, d + 1.4, { color: ac });
        }
      }
    }
  }

  // Road markings: dashed centre lines and zebra crossings
  for (let line = 0; line <= N; line++) {
    for (let seg = 0; seg < N; seg++) {
      const a = roadC(seg) + ROAD / 2, b = roadC(seg + 1) - ROAD / 2;
      const c = roadC(line);
      for (let t = a + 4.5; t < b - 4.5; t += 4) {
        B.marks.flat(t, c - 0.2, t + 2.2, c + 0.2, 0.02, '#f0d040');
        B.marks.flat(c - 0.2, t, c + 0.2, t + 2.2, 0.02, '#f0d040');
      }
      for (const e of [a, b - 3]) {
        for (let k = -ROAD / 2 + 0.8; k < ROAD / 2 - 0.5; k += 1.4) {
          B.marks.flat(e, c + k, e + 3, c + k + 0.7, 0.02, '#e8e8e8');
          B.marks.flat(c + k, e, c + k + 0.7, e + 3, 0.02, '#e8e8e8');
        }
      }
    }
  }

  // Beach palms around the city
  for (let k = 0; k < 70; k++) {
    const side = (R() * 4) | 0, t = (R() - 0.5) * (CITY + 60), o = HALF + 8 + R() * 35;
    const [x, z] = [[t, -o], [t, o], [-o, t], [o, t]][side];
    palm(B.plain, world, x, -0.05, z, R);
  }

  scene.add(B.wallA.mesh(lam(T.wallA)));
  scene.add(B.wallB.mesh(lam(T.wallB)));
  scene.add(B.wallC.mesh(lam(T.wallC)));
  scene.add(B.roof.mesh(lam(T.roof)));
  scene.add(B.side.mesh(lam(T.sidewalk)));
  scene.add(B.grass.mesh(lam(T.grass)));
  scene.add(B.plain.mesh(lam(T.plain)));
  scene.add(B.marks.mesh(lam(T.plain), { cast: false }));

  return { world, blocks, water, healthSpots };
}

function shadeHex(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

function palm(b, world, x, y, z, R) {
  const h = 6 + R() * 4;
  const lean = (R() - 0.5) * 0.25, leanZ = (R() - 0.5) * 0.25;
  const segs = 6;
  let px = x, pz = z;
  for (let i = 0; i < segs; i++) {
    b.box(px, y + (i * h) / segs, pz, 0.45, h / segs + 0.05, 0.45, { color: i % 2 ? '#8a6a40' : '#9c7a4a' });
    px += lean * (i / segs) * 1.2;
    pz += leanZ * (i / segs) * 1.2;
  }
  const top = y + h;
  const leafCol = ['#3c9a3c', '#2f8a46', '#4caf3c'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R();
    for (let s = 1; s <= 3; s++) {
      const r = s * 0.9;
      b.box(px + Math.cos(a) * r, top - s * s * 0.15, pz + Math.sin(a) * r, 1.0, 0.18, 1.0, { color: leafCol[i % 3] });
    }
  }
  b.box(px, top - 0.3, pz, 0.8, 0.6, 0.8, { color: '#5a4a2a' });
  world.add({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: h });
}

function tree(b, world, x, y, z, R) {
  const h = 2 + R() * 1.5;
  b.box(x, y, z, 0.5, h, 0.5, { color: '#6a4a2a' });
  const s = 2.4 + R() * 1.2;
  const col = R() < 0.5 ? '#2f7a32' : '#3f8f3a';
  b.box(x, y + h, z, s, s * 0.8, s, { color: col });
  b.box(x, y + h + s * 0.8, z, s * 0.6, s * 0.5, s * 0.6, { color: '#4ea548' });
  world.add({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, y0: 0, y1: h + s });
}
