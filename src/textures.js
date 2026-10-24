// Procedurally generated pixel-art textures (all drawn on tiny canvases).
import * as THREE from '../lib/three.module.min.js';

export function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = rng(1337);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = repeat ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  t.generateMipmaps = repeat;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

function noise(ctx, w, h, base, spread, prob = 1) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (R() > prob) continue;
      ctx.fillStyle = shade(base, (R() - 0.5) * spread);
      ctx.fillRect(x, y, 1, 1);
    }
}

function px(ctx, x, y, col, w = 1, h = 1) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

export function makeTextures() {
  const T = {};

  // Plain near-white noise, tinted with vertex colors / material colors
  {
    const [c, g] = canvas(8, 8);
    px(g, 0, 0, '#ffffff', 8, 8);
    noise(g, 8, 8, '#f0f0f0', 0.12);
    T.plain = toTex(c);
  }

  // Asphalt
  {
    const [c, g] = canvas(32, 32);
    px(g, 0, 0, '#3c3a44', 32, 32);
    noise(g, 32, 32, '#3c3a44', 0.035);
    for (let i = 0; i < 14; i++) px(g, (R() * 32) | 0, (R() * 32) | 0, '#2a2830');
    for (let i = 0; i < 6; i++) px(g, (R() * 32) | 0, (R() * 32) | 0, '#55525e');
    T.asphalt = toTex(c);
  }

  // Sidewalk tiles
  {
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#b9b0b8', 16, 16);
    noise(g, 16, 16, '#b9b0b8', 0.06);
    px(g, 0, 0, '#958c96', 16, 1);
    px(g, 0, 0, '#958c96', 1, 16);
    px(g, 0, 8, '#a59ca6', 16, 1);
    px(g, 8, 0, '#a59ca6', 1, 16);
    T.sidewalk = toTex(c);
  }

  // Grass
  {
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#4f9a45', 16, 16);
    noise(g, 16, 16, '#4f9a45', 0.14);
    for (let i = 0; i < 10; i++) px(g, (R() * 16) | 0, (R() * 16) | 0, '#6fbf55');
    T.grass = toTex(c);
  }

  // Sand
  {
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#e8cf94', 16, 16);
    noise(g, 16, 16, '#e8cf94', 0.08);
    T.sand = toTex(c);
  }

  // Water
  {
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#2a7fb8', 16, 16);
    noise(g, 16, 16, '#2a7fb8', 0.05);
    for (let i = 0; i < 5; i++) {
      const x = (R() * 14) | 0, y = (R() * 16) | 0;
      px(g, x, y, '#7cc4e8', 3, 1);
    }
    T.water = toTex(c);
  }

  // Building walls (grayscale, tinted by vertex color). One tile = 4x4 m.
  {
    // A: one big window per tile
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#ffffff', 16, 16);
    noise(g, 16, 16, '#f2f2f2', 0.08);
    px(g, 3, 4, '#2c3550', 10, 8);
    px(g, 4, 5, '#46557e', 3, 2);
    px(g, 3, 12, '#9a9a9a', 10, 1);
    T.wallA = toTex(c);
  }
  {
    // B: two narrow windows
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#ffffff', 16, 16);
    noise(g, 16, 16, '#efefef', 0.1);
    for (const x of [2, 9]) {
      px(g, x, 3, '#26304a', 5, 9);
      px(g, x + 1, 4, '#4a5a86', 1, 3);
      px(g, x, 12, '#8c8c8c', 5, 1);
    }
    T.wallB = toTex(c);
  }
  {
    // C: glass curtain wall
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#c8d8e8', 16, 16);
    px(g, 0, 1, '#5d7ea0', 16, 13);
    noise(g, 16, 13, '#5d7ea0', 0.06);
    for (let x = 0; x < 16; x += 4) px(g, x, 1, '#9fb4c8', 1, 13);
    px(g, 2, 3, '#a8d0f0', 2, 1);
    px(g, 10, 7, '#a8d0f0', 3, 1);
    T.wallC = toTex(c);
  }
  {
    // Roof gravel
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#8d8590', 16, 16);
    noise(g, 16, 16, '#8d8590', 0.15);
    T.roof = toTex(c);
  }

  // Car body: light paint with slight noise, tinted via material color
  {
    const [c, g] = canvas(16, 16);
    px(g, 0, 0, '#ffffff', 16, 16);
    noise(g, 16, 16, '#f4f4f4', 0.05, 0.4);
    px(g, 0, 15, '#cfcfcf', 16, 1);
    T.carBody = toTex(c);
  }
  // Car glass
  {
    const [c, g] = canvas(16, 8);
    px(g, 0, 0, '#1d2433', 16, 8);
    px(g, 2, 1, '#5d7aa8', 3, 1);
    px(g, 3, 2, '#5d7aa8', 2, 1);
    px(g, 10, 1, '#3e5378', 4, 1);
    px(g, 7, 0, '#0c0f16', 1, 8);
    T.carGlass = toTex(c);
  }

  // Blood splat (transparent)
  {
    const [c, g] = canvas(16, 16);
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, r = Math.pow(R(), 0.8) * 7;
      px(g, (8 + Math.cos(a) * r) | 0, (8 + Math.sin(a) * r) | 0, R() < 0.5 ? '#7a0a0a' : '#9c1010');
    }
    px(g, 5, 5, '#8a0c0c', 6, 6);
    T.blood = toTex(c, false);
  }

  // Blob shadow
  {
    const [c, g] = canvas(16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d < 7) px(g, x, y, 'rgba(0,0,0,' + (d < 5 ? 0.45 : 0.25) + ')');
      }
    T.shadow = toTex(c, false);
  }

  // Sky gradient (vertical), sunset Vice palette
  {
    const [c, g] = canvas(1, 64);
    const stops = [
      [0, '#1d1840'],
      [0.3, '#4b2a6e'],
      [0.58, '#b04a8c'],
      [0.8, '#f2788a'],
      [1, '#f7a88a'],
    ];
    for (let y = 0; y < 64; y++) {
      const t = Math.min(1, y / 33); // upper hemisphere gets the gradient
      let i = 0;
      while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
      const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
      const col = new THREE.Color(c0).lerp(new THREE.Color(c1), (t - t0) / (t1 - t0));
      // posterize for the retro banding look
      col.r = Math.round(col.r * 20) / 20;
      col.g = Math.round(col.g * 20) / 20;
      col.b = Math.round(col.b * 20) / 20;
      px(g, 0, y, '#' + col.getHexString());
    }
    T.sky = toTex(c, false);
  }

  // Sun disc
  {
    const [c, g] = canvas(32, 32);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d < 15) {
          const band = y > 18 && y % 4 < 2; // retro sun stripes
          if (!band) px(g, x, y, y < 12 ? '#fff2a0' : y < 20 ? '#ffc070' : '#ff7a6a');
        }
      }
    T.sun = toTex(c, false);
  }

  // Cash pickup
  {
    const [c, g] = canvas(16, 16);
    px(g, 1, 4, '#1e6b2a', 14, 8);
    px(g, 2, 5, '#4fc25e', 12, 6);
    px(g, 6, 6, '#1e6b2a', 4, 4);
    px(g, 7, 7, '#9be89f', 2, 2);
    T.cash = toTex(c, false);
  }
  // Health pickup
  {
    const [c, g] = canvas(16, 16);
    px(g, 1, 1, '#ffffff', 14, 14);
    px(g, 6, 3, '#e01818', 4, 10);
    px(g, 3, 6, '#e01818', 10, 4);
    T.health = toTex(c, false);
  }

  return T;
}

// Pixel faces for the blocky people
const faceCache = new Map();
export function faceTexture(skin, kind = 'civ') {
  const key = skin + kind;
  if (faceCache.has(key)) return faceCache.get(key);
  const [c, g] = canvas(8, 8);
  px(g, 0, 0, skin, 8, 8);
  px(g, 0, 7, shade(skin, -0.08), 8, 1);
  if (kind === 'cop') {
    px(g, 1, 3, '#111111', 6, 1); // sunglasses
    px(g, 1, 3, '#222', 2, 2);
    px(g, 5, 3, '#222', 2, 2);
  } else {
    px(g, 2, 3, '#ffffff', 1, 1);
    px(g, 5, 3, '#ffffff', 1, 1);
    px(g, 2, 4, '#1a1a1a', 1, 1);
    px(g, 5, 4, '#1a1a1a', 1, 1);
  }
  px(g, 3, 6, shade(skin, -0.25), 2, 1);
  const t = toTex(c, false);
  faceCache.set(key, t);
  return t;
}
