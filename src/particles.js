// Square "pixel" particles: blood, sparks, smoke, fire, explosions.
import * as THREE from '../lib/three.module.min.js';

const MAX = 4000;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.s0 = new Float32Array(MAX);
    this.s1 = new Float32Array(MAX);
    this.c0 = new Float32Array(MAX * 3);
    this.c1 = new Float32Array(MAX * 3);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.next = 0;

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setAttribute('size', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 300 } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        uniform float scale;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size > 0.0 ? clamp(size * scale / -mv.z, 1.0, 14.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() { gl_FragColor = linearToOutputTexel(vec4(vColor, 1.0)); }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, o) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = this.max[i] = o.life ?? 1;
    this.s0[i] = o.size ?? 0.15;
    this.s1[i] = o.size1 ?? this.s0[i];
    const a = o.color, b = o.color1 ?? o.color;
    this.c0[i3] = a.r; this.c0[i3 + 1] = a.g; this.c0[i3 + 2] = a.b;
    this.c1[i3] = b.r; this.c1[i3 + 1] = b.g; this.c1[i3 + 2] = b.b;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  burst(p, n, o) {
    const sp = o.speed ?? 3;
    for (let k = 0; k < n; k++) {
      const dir = o.dir;
      let vx = (Math.random() - 0.5) * 2 * sp, vy = (Math.random() * (o.up ?? 1)) * sp, vz = (Math.random() - 0.5) * 2 * sp;
      if (dir) { vx += dir.x; vy += dir.y; vz += dir.z; }
      this.emit(p.x + (Math.random() - 0.5) * (o.spread ?? 0), p.y + (Math.random() - 0.5) * (o.spread ?? 0),
        p.z + (Math.random() - 0.5) * (o.spread ?? 0), vx, vy, vz,
        { ...o, life: (o.life ?? 1) * (0.6 + Math.random() * 0.6) });
    }
  }

  update(dt, renderer, camera) {
    const h = renderer.getDrawingBufferSize(_v2).y;
    this.material.uniforms.scale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.03) { this.pos[i3 + 1] = 0.03; this.vel[i3 + 1] *= -0.2; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      this.size[i] = this.life[i] > 0 ? this.s0[i] + (this.s1[i] - this.s0[i]) * t : 0;
      // stepped colour fade for a chunkier look
      const q = Math.floor(t * 4) / 4;
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * q;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * q;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * q;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

const _v2 = new THREE.Vector2();

export const PC = {
  blood: new THREE.Color('#b01010'),
  blood2: new THREE.Color('#5a0505'),
  spark: new THREE.Color('#fff2a0'),
  spark2: new THREE.Color('#ff8030'),
  dust: new THREE.Color('#a09890'),
  smoke: new THREE.Color('#5a5a60'),
  smoke2: new THREE.Color('#2a2a2e'),
  fire: new THREE.Color('#ffe060'),
  fire2: new THREE.Color('#e02a10'),
  glass: new THREE.Color('#a8d8f0'),
  white: new THREE.Color('#ffffff'),
};
