// Tiny geometry builder that merges many boxes/quads into one BufferGeometry
// so the whole static city renders in a handful of draw calls.
import * as THREE from '../lib/three.module.min.js';

const _c = new THREE.Color();

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
  }

  quad(a, b, c, d, n, uvs, color) {
    _c.set(color ?? 0xffffff);
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(t[0], t[1]);
      this.col.push(_c.r, _c.g, _c.b);
    }
  }

  // Axis aligned box. y is the bottom. s = metres per texture tile.
  // opts.top: builder that receives the top face (or false to skip it),
  // opts.bottom: include bottom face, opts.color, opts.topColor.
  box(cx, y, cz, w, h, d, opts = {}) {
    const s = opts.s ?? 4;
    const col = opts.color;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y0 = y, y1 = y + h;
    const v0 = (opts.v0 ?? 0), vh = v0 + h / s;
    const uw = w / s, ud = d / s;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[0, v0], [uw, v0], [uw, vh], [0, vh]], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[0, v0], [uw, v0], [uw, vh], [0, vh]], col);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[0, v0], [ud, v0], [ud, vh], [0, vh]], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[0, v0], [ud, v0], [ud, vh], [0, vh]], col);
    const top = opts.top === undefined ? this : opts.top;
    if (top) {
      const ts = opts.topS ?? s;
      top.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0],
        [[x0 / ts, z1 / ts], [x1 / ts, z1 / ts], [x1 / ts, z0 / ts], [x0 / ts, z0 / ts]], opts.topColor ?? col);
    }
    if (opts.bottom) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
    }
  }

  // Flat horizontal rectangle facing up.
  flat(x0, z0, x1, z1, y, color, s = 1) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
      [[x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s], [x0 / s, z0 / s]], color);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }

  mesh(material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.build(), material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    return m;
  }
}
