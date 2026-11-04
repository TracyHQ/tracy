#!/usr/bin/env node
// Build the template's default 3D cup from code: a takeaway paper cup with a kraft sleeve and a
// plastic sip lid. Geometry is lathed from measured profiles (12 oz hot cup: 11 cm tall, 9 cm
// mouth, 6 cm base; 90 mm sip lid). Surface images (paper grain, uneven speckles, kraft fibres,
// debossed pattern, contact shadows) are painted pixel by pixel here. No AI, no bought or
// downloaded assets. Seeded random, so a rerun writes the same file.
//
// Output: one glTF binary, one mesh (no separately moving parts), Y up, front facing +Z, metres.
// Geometry is meshopt-compressed (EXT_meshopt_compression), images are WebP (EXT_texture_webp);
// the scene that loads it must register the meshopt decoder. See docs/object-template.md.
//
//   node tools/build-cup.mjs [--out public/models/default-cup.glb]
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const OUT = outIndex >= 0 ? args[outIndex + 1] : 'public/models/default-cup.glb'

// Measurements in metres.
const H = 0.11 // body height
const RT = 0.045 // mouth radius
const RB = 0.03 // base radius
const S0 = 0.034 // sleeve bottom
const S1 = 0.08 // sleeve top
const SLEEVE_GAP = 0.0009
const SEGS = 192

// The sleeve is printed plain: this UV box is left free for the scene to draw the shop name at
// runtime (u = around the cup, 0.5 = front; v = 0 at the sleeve top). Also written to the sleeve
// material's extras as `nameArea`.
const NAME_AREA = { u: [0.36, 0.64], v: [0.24, 0.76] }

const BODY_TEX = [2048, 1024]
const SLEEVE_TEX = [2048, 384]

// ---------- seeded random + tileable value noise ----------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const smooth = (t) => t * t * (3 - 2 * t)
// Value noise wrapping every `period` cells along x, so textures meet at the seam.
function noise(x, y, period, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const wx = (n) => ((n % period) + period) % period
  const a = hash(wx(x0), y0, seed)
  const b = hash(wx(x0 + 1), y0, seed)
  const c = hash(wx(x0), y0 + 1, seed)
  const d = hash(wx(x0 + 1), y0 + 1, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function fbm(u, v, cells, octaves, seed) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const f = cells * 2 ** o
    sum += amp * noise(u * f, v * f, f, seed + o)
    norm += amp
    amp *= 0.5
  }
  return sum / norm
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a)))

// ---------- shape ----------
// Slight random dents of the paper wall (fraction of radius); the sleeve follows them.
const DENTS = (() => {
  const r = rng(11)
  return Array.from({ length: 5 }, () => ({
    th: r() * Math.PI * 2,
    y: S0 * 0.4 + r() * (H - S0 * 0.6),
    w: 0.25 + r() * 0.35,
    h: 0.006 + r() * 0.012,
    a: 0.006 + r() * 0.008
  }))
})()
function dent(th, y) {
  let d = (fbm(th / (Math.PI * 2), y / H, 3, 2, 21) - 0.5) * 0.006
  for (const k of DENTS) {
    let dt = Math.abs(th - k.th) % (Math.PI * 2)
    if (dt > Math.PI) dt = Math.PI * 2 - dt
    d -= k.a * Math.exp(-((dt / k.w) ** 2) - ((y - k.y) / k.h) ** 2)
  }
  // The rolled rim and the base stay round.
  return d * smoothstep(0.004, 0.012, y) * (1 - smoothstep(H - 0.012, H - 0.004, y))
}
const wallR = (y) => RB + ((RT - RB) * y) / H

// Lathe a profile [[r, y], ...] around Y. u = 0.5 faces +Z (front); the UV seam is at the back.
// `radius(r, y, th)` deforms; `vOf(j, y)` gives the image row.
function lathe(profile, { radius = (r) => r, vOf, lift = () => 0 }) {
  const cols = SEGS + 1
  const pos = new Float32Array(cols * profile.length * 3)
  const uv = new Float32Array(cols * profile.length * 2)
  for (let i = 0; i < cols; i++) {
    const u = i / SEGS
    const th = u * Math.PI * 2 + Math.PI
    for (let j = 0; j < profile.length; j++) {
      const [r0, y0] = profile[j]
      const y = y0 + lift(j, th)
      const r = radius(r0, y0, th)
      const k = i * profile.length + j
      pos.set([r * Math.sin(th), y, r * Math.cos(th)], k * 3)
      uv.set([u, vOf(j, y0)], k * 2)
    }
  }
  const idx = []
  for (let i = 0; i < SEGS; i++)
    for (let j = 0; j < profile.length - 1; j++) {
      const a = i * profile.length + j
      const b = a + profile.length
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const nor = normals(pos, idx)
  // Weld normals across the seam column and at poles (r = 0).
  for (let j = 0; j < profile.length; j++) {
    const ring = profile[j][0] === 0 ? [...Array(cols).keys()] : [0, SEGS]
    const s = [0, 0, 0]
    for (const i of ring) for (let c = 0; c < 3; c++) s[c] += nor[(i * profile.length + j) * 3 + c]
    const l = Math.hypot(...s) || 1
    for (const i of ring)
      nor.set(
        s.map((x) => x / l),
        (i * profile.length + j) * 3
      )
  }
  return { pos, nor, uv, idx }
}
function normals(pos, idx) {
  const n = new Float32Array(pos.length)
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3]
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]]
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v + k] += f[k]
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1
    n[v] /= l
    n[v + 1] /= l
    n[v + 2] /= l
  }
  return n
}

// Body: recessed base, tapered wall, rolled rim (curls out and under).
const bodyProfile = [
  [0, 0.0035],
  [RB - 0.0016, 0.0035],
  [RB - 0.0009, 0.0006],
  [RB - 0.0004, 0],
  [RB, 0.0004],
  ...Array.from({ length: 48 }, (_, k) => {
    const y = 0.001 + ((H - 0.0035) * (k + 1)) / 48
    return [wallR(y), y]
  }),
  [RT + 0.0006, H - 0.0018],
  [RT + 0.0014, H - 0.0016],
  [RT + 0.0019, H - 0.0008],
  [RT + 0.0016, H],
  [RT + 0.0008, H + 0.0004],
  [RT - 0.0002, H],
  [RT - 0.0006, H - 0.004]
]
const body = lathe(bodyProfile, {
  radius: (r, y, th) => (y > 0.001 && y < H - 0.002 ? r * (1 + dent(th, y)) : r),
  vOf: (_, y) => clamp(1 - y / H)
})

// Sleeve: a kraft band standing off the wall, with folded-in top and bottom edges.
const sleeveProfile = [
  [wallR(S0) + 0.0002, S0],
  [wallR(S0) + SLEEVE_GAP, S0],
  ...Array.from({ length: 13 }, (_, k) => {
    const y = S0 + ((S1 - S0) * k) / 12
    return [wallR(y) + SLEEVE_GAP + 0.0004, y + (k === 0 ? 0.0004 : k === 12 ? -0.0004 : 0)]
  }),
  [wallR(S1) + SLEEVE_GAP, S1],
  [wallR(S1) + 0.0002, S1]
]
const sleeve = lathe(sleeveProfile, {
  radius: (r, y, th) => r * (1 + dent(th, clamp(y, S0, S1))),
  vOf: (_, y) => clamp((S1 - y) / (S1 - S0))
})

// Sip lid (90 mm class): skirt over the rim, shoulder, groove, raised drinking ring, recessed
// centre with a stacking ring. The drinking spout is the raised ring lifted at the front.
const L = H // lid seat
const lidProfile = [
  [RT + 0.0012, L - 0.0052],
  [RT + 0.0026, L - 0.0048],
  [RT + 0.003, L - 0.002],
  [RT + 0.003, L + 0.0018],
  [RT + 0.0024, L + 0.0036],
  [RT + 0.0008, L + 0.0044],
  [RT - 0.0006, L + 0.0042],
  [RT - 0.0014, L + 0.003], // groove
  [RT - 0.0024, L + 0.0029],
  [RT - 0.0032, L + 0.0042],
  [RT - 0.0042, L + 0.0098], // ring outer wall
  [RT - 0.0052, L + 0.0122],
  [RT - 0.0068, L + 0.0128], // ring top
  [RT - 0.0084, L + 0.012],
  [RT - 0.0094, L + 0.0084],
  [RT - 0.0102, L + 0.0068],
  [0.025, L + 0.0066],
  [0.0232, L + 0.0056], // stacking ring
  [0.0214, L + 0.0066],
  [0.008, L + 0.0072],
  [0, L + 0.0073]
]
const SPOUT_ROWS = new Set([9, 10, 11, 12, 13, 14])
const spoutShape = (th) => {
  let dt = Math.abs(th - Math.PI * 2) % (Math.PI * 2)
  if (dt > Math.PI) dt = Math.PI * 2 - dt
  return Math.exp(-((dt / 0.3) ** 4))
}
const lid = lathe(lidProfile, {
  vOf: (j) => j / (lidProfile.length - 1),
  lift: (j, th) => (SPOUT_ROWS.has(j) ? 0.0035 * spoutShape(th) * (j === 9 ? 0.4 : 1) : 0)
})

// Sip hole: a dark oval sitting on the spout, aligned to the lid surface at the front.
function sipHole() {
  const k = (SEGS / 2) * lidProfile.length + 11 // front column, outer shoulder of the ring top
  const c = Array.from(lid.pos.slice(k * 3, k * 3 + 3))
  const n = Array.from(lid.nor.slice(k * 3, k * 3 + 3))
  const t = [1, 0, 0]
  const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]
  const pos = c.map((x, i) => x + n[i] * 0.0002)
  const nor = [...n]
  const N = 32
  for (let s = 0; s < N; s++) {
    const a = (s / N) * Math.PI * 2
    const [x, y] = [Math.cos(a) * 0.006, Math.sin(a) * 0.0018]
    pos.push(...c.map((v, i) => v + t[i] * x + b[i] * y + n[i] * 0.0002))
    nor.push(...n)
  }
  const idx = []
  for (let s = 0; s < N; s++) idx.push(0, 1 + ((s + 1) % N), 1 + s)
  // Keep the winding facing along the lid normal.
  const p = (i) => pos.slice(i * 3, i * 3 + 3)
  const [a, b1, c1] = [p(idx[0]), p(idx[1]), p(idx[2])]
  const e1 = b1.map((v, i) => v - a[i])
  const e2 = c1.map((v, i) => v - a[i])
  const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
  if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] < 0)
    for (let s = 0; s < idx.length; s += 3) [idx[s + 1], idx[s + 2]] = [idx[s + 2], idx[s + 1]]
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx }
}
const hole = sipHole()

// ---------- surface images ----------
function canvas(w, h, rgb) {
  const px = new Float32Array(w * h * 3)
  for (let i = 0; i < w * h; i++) px.set(rgb, i * 3)
  return { w, h, px }
}
function blend(img, x, y, rgb, a) {
  const xi = ((Math.round(x) % img.w) + img.w) % img.w
  const yi = Math.round(y)
  if (yi < 0 || yi >= img.h || a <= 0) return
  const o = (yi * img.w + xi) * 3
  for (let c = 0; c < 3; c++) img.px[o + c] += (rgb[c] - img.px[o + c]) * a
}
function dot(img, x, y, radius, rgb, a) {
  const R = Math.ceil(radius + 1)
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy)
      blend(img, x + dx, y + dy, rgb, a * clamp(radius + 0.5 - d))
    }
}
function normalMap(w, h, height, strength) {
  const out = canvas(w, h, [128, 128, 255])
  const at = (x, y) => height[clamp(y, 0, h - 1) * w + (((x % w) + w) % w)]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength
      const l = Math.hypot(nx, ny, 1)
      out.px.set(
        [(nx / l) * 127.5 + 127.5, (ny / l) * 127.5 + 127.5, (1 / l) * 127.5 + 127.5],
        (y * w + x) * 3
      )
    }
  return out
}

function paintBody() {
  const [w, h] = BODY_TEX
  const img = canvas(w, h, [234, 224, 203])
  const height = new Float32Array(w * h)
  const yOf = (y) => (1 - (y + 0.5) / h) * H
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w
      const v = y / h
      const mottle = fbm(u, v * 0.5, 6, 4, 3) - 0.5
      const grain = fbm(u, v * 0.5, 180, 2, 5) - 0.5
      const fibre = noise(u * 900, v * 120, 900, 7) - 0.5
      const k = 1 + mottle * 0.06 + grain * 0.05 + fibre * 0.025
      const o = (y * w + x) * 3
      img.px[o] *= k
      img.px[o + 1] *= k
      img.px[o + 2] *= k * 0.995
      height[y * w + x] = grain * 0.9 + fibre * 0.6
    }
  // Speckles: clustered, varied size and tone, so they never read as an even print.
  const r = rng(31)
  for (let n = 0; n < 26000; n++) {
    const x = r() * w
    const y = r() * h
    const density = smoothstep(0.42, 0.75, fbm(x / w, y / h / 2, 5, 3, 41))
    if (r() > density * 0.9 + 0.05) continue
    const tone = r()
    const rgb = tone < 0.6 ? [150, 128, 104] : tone < 0.85 ? [120, 116, 110] : [196, 170, 132]
    dot(img, x, y, 0.3 + r() ** 3 * 1.8, rgb, 0.18 + r() * 0.45)
  }
  // Contact shadows: under the lid skirt, above and below the sleeve edges.
  const lidEdge = L - 0.0052
  for (let y = 0; y < h; y++) {
    const yy = yOf(y)
    const s =
      0.55 * smoothstep(lidEdge - 0.005, lidEdge, yy) ** 2 +
      0.5 * smoothstep(S0 - 0.004, S0, yy) ** 2 * (yy < S0 ? 1 : 0) +
      0.28 * (1 - smoothstep(S1, S1 + 0.004, yy)) * (yy > S1 ? 1 : 0)
    const k = 1 - clamp(s, 0, 0.65)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3
      img.px[o] *= k
      img.px[o + 1] *= k
      img.px[o + 2] *= k
    }
  }
  return { color: img, normal: normalMap(w, h, height, 1) }
}

function paintSleeve() {
  const [w, h] = SLEEVE_TEX
  const img = canvas(w, h, [186, 152, 112])
  const height = new Float32Array(w * h)
  const [u0, u1] = NAME_AREA.u
  const [v0, v1] = NAME_AREA.v
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w
      const v = y / h
      const mottle = fbm(u, v * 0.19, 10, 4, 51) - 0.5
      const fine = fbm(u, v * 0.19, 260, 2, 53) - 0.5
      const k = 1 + mottle * 0.1 + fine * 0.07
      const o = (y * w + x) * 3
      img.px[o] *= k
      img.px[o + 1] *= k
      img.px[o + 2] *= k
      // Debossed knurl of small diamonds, kept off the edges and out of the name area.
      const cell = 22
      const fx = (x % cell) / cell - 0.5
      const fy = ((y + (Math.floor(x / cell) % 2) * cell * 0.5) % cell) / cell - 0.5
      const diamond = 1 - smoothstep(0.16, 0.24, Math.abs(fx) + Math.abs(fy))
      const du = Math.min(Math.abs(u - u0), Math.abs(u - u1))
      const inName = u > u0 && u < u1 && v > v0 && v < v1
      const mask =
        (inName ? 0 : smoothstep(0, 0.012, du) + (u < u0 || u > u1 ? 1 : 0)) *
        smoothstep(0.08, 0.13, v) *
        (1 - smoothstep(0.87, 0.92, v))
      const line = Math.exp(-(((v - 0.055) / 0.008) ** 2)) + Math.exp(-(((v - 0.945) / 0.008) ** 2))
      height[y * w + x] = fine * 0.8 - diamond * clamp(mask) * 1.6 - line * 1.2
      // Ink-free deboss still darkens slightly in the pressed areas; edges darker from handling.
      const press = 1 - (diamond * clamp(mask) + line) * 0.06
      const edge = 1 - 0.2 * (1 - smoothstep(0, 0.05, v)) - 0.22 * smoothstep(0.95, 1, v)
      img.px[o] *= press * edge
      img.px[o + 1] *= press * edge
      img.px[o + 2] *= press * edge
    }
  // Kraft fibres: short strokes, lighter and darker than the board.
  const r = rng(61)
  for (let n = 0; n < 30000; n++) {
    let x = r() * w
    let y = r() * h
    const a = (r() - 0.5) * Math.PI * 0.9
    const len = 3 + r() * 12
    const rgb = r() < 0.55 ? [214, 186, 146] : [140, 108, 74]
    const alpha = 0.12 + r() * 0.25
    for (let s = 0; s < len; s++) {
      blend(img, x, y, rgb, alpha)
      x += Math.cos(a)
      y += Math.sin(a) * 0.6
    }
  }
  return { color: img, normal: normalMap(w, h, height, 2.2) }
}

async function webp({ w, h, px }, quality) {
  const raw = Buffer.alloc(w * h * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = clamp(Math.round(px[i]), 0, 255)
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .webp({ quality, effort: 6 })
    .toBuffer()
}

// ---------- glTF binary with EXT_meshopt_compression ----------
async function main() {
  await MeshoptEncoder.ready
  const bodyImg = paintBody()
  const sleeveImg = paintSleeve()
  const images = [
    await webp(bodyImg.color, 82),
    await webp(bodyImg.normal, 80),
    await webp(sleeveImg.color, 84),
    await webp(sleeveImg.normal, 82)
  ]

  const bin = [] // compressed + image bytes (buffer 0, the GLB chunk)
  let binLen = 0
  let fallbackLen = 0
  const json = {
    asset: { version: '2.0', generator: 'tracy-coffee tools/build-cup.mjs' },
    extensionsUsed: ['EXT_meshopt_compression', 'EXT_texture_webp'],
    extensionsRequired: ['EXT_meshopt_compression', 'EXT_texture_webp'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'cup', mesh: 0 }],
    meshes: [{ name: 'cup', primitives: [] }],
    materials: [],
    textures: [],
    images: [],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }],
    accessors: [],
    bufferViews: [],
    buffers: []
  }
  const push = (bytes) => {
    const offset = binLen
    bin.push(bytes)
    binLen += bytes.length
    const pad = (4 - (binLen % 4)) % 4
    if (pad) {
      bin.push(new Uint8Array(pad))
      binLen += pad
    }
    return offset
  }
  const compressed = (data, count, stride, mode, target) => {
    const raw = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const enc = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode)
    const byteOffset = push(enc)
    const view = {
      buffer: 1,
      byteOffset: fallbackLen,
      byteLength: raw.length,
      target,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset,
          byteLength: enc.length,
          byteStride: stride,
          count,
          mode
        }
      }
    }
    if (mode === 'ATTRIBUTES') view.byteStride = stride
    fallbackLen += raw.length + ((4 - (raw.length % 4)) % 4)
    json.bufferViews.push(view)
    return json.bufferViews.length - 1
  }
  const accessor = (a) => json.accessors.push(a) - 1
  const attr = (data, comps, type, minmax) => {
    const count = data.length / comps
    const view = compressed(data, count, comps * 4, 'ATTRIBUTES', 34962)
    const a = { bufferView: view, componentType: 5126, count, type }
    if (minmax) {
      a.min = [Infinity, Infinity, Infinity]
      a.max = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < data.length; i++) {
        a.min[i % 3] = Math.min(a.min[i % 3], data[i])
        a.max[i % 3] = Math.max(a.max[i % 3], data[i])
      }
    }
    return accessor(a)
  }
  const texture = (bytes) => {
    const view = push(bytes)
    json.bufferViews.push({ buffer: 0, byteOffset: view, byteLength: bytes.length })
    json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: 'image/webp' })
    json.textures.push({ sampler: 0, extensions: { EXT_texture_webp: { source: json.images.length - 1 } } })
    return json.textures.length - 1
  }
  const material = (m) => json.materials.push(m) - 1
  const primitive = (geo, mat) => {
    const vertexCount = geo.pos.length / 3
    const indices = vertexCount < 65536 ? new Uint16Array(geo.idx) : new Uint32Array(geo.idx)
    const attributes = { POSITION: attr(geo.pos, 3, 'VEC3', true), NORMAL: attr(geo.nor, 3, 'VEC3') }
    if (geo.uv) attributes.TEXCOORD_0 = attr(geo.uv, 2, 'VEC2')
    // Uint16 indices: pad the fallback view to 4 bytes, the meshopt stride stays 2.
    const iView = compressed(indices, indices.length, indices.BYTES_PER_ELEMENT, 'TRIANGLES', 34963)
    const ind = accessor({
      bufferView: iView,
      componentType: indices.BYTES_PER_ELEMENT === 2 ? 5123 : 5125,
      count: indices.length,
      type: 'SCALAR'
    })
    json.meshes[0].primitives.push({ attributes, indices: ind, material: mat })
  }

  const [bodyColor, bodyNormal, sleeveColor, sleeveNormal] = images.map(texture)
  primitive(
    body,
    material({
      name: 'paper',
      pbrMetallicRoughness: {
        baseColorTexture: { index: bodyColor },
        metallicFactor: 0,
        roughnessFactor: 0.86
      },
      normalTexture: { index: bodyNormal, scale: 0.2 }
    })
  )
  primitive(
    sleeve,
    material({
      name: 'kraft-sleeve',
      pbrMetallicRoughness: {
        baseColorTexture: { index: sleeveColor },
        metallicFactor: 0,
        roughnessFactor: 0.93
      },
      normalTexture: { index: sleeveNormal, scale: 1 },
      extras: { nameArea: NAME_AREA, nameAreaPx: nameAreaPx() }
    })
  )
  primitive(
    lid,
    material({
      name: 'lid',
      pbrMetallicRoughness: {
        baseColorFactor: [0.74, 0.72, 0.68, 1],
        metallicFactor: 0,
        roughnessFactor: 0.46
      }
    })
  )
  primitive(
    { ...hole, uv: null },
    material({
      name: 'sip-hole',
      pbrMetallicRoughness: {
        baseColorFactor: [0.02, 0.018, 0.016, 1],
        metallicFactor: 0,
        roughnessFactor: 0.7
      }
    })
  )
  json.buffers.push(
    { byteLength: binLen },
    { byteLength: fallbackLen, extensions: { EXT_meshopt_compression: { fallback: true } } }
  )

  const glb = toGlb(json, Buffer.concat(bin))
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, glb)
  console.log(`wrote ${OUT} (${glb.length} bytes)`)
}

function nameAreaPx() {
  const [w, h] = SLEEVE_TEX
  return {
    x: Math.round(NAME_AREA.u[0] * w),
    y: Math.round(NAME_AREA.v[0] * h),
    width: Math.round((NAME_AREA.u[1] - NAME_AREA.u[0]) * w),
    height: Math.round((NAME_AREA.v[1] - NAME_AREA.v[0]) * h)
  }
}

function toGlb(json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json))
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)])
  const binBuf = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])
  const header = Buffer.alloc(12)
  header.write('glTF', 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8)
  const chunk = (buf, type) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(buf.length, 0)
    head.write(type, 4, 'latin1')
    return Buffer.concat([head, buf])
  }
  return Buffer.concat([header, chunk(jsonBuf, 'JSON'), chunk(binBuf, 'BIN\0')])
}

await main()
