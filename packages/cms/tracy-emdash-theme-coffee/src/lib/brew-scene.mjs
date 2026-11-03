// The brewing scene's world (`brew-shot.mjs`), built from code: a plain espresso machine (no make, no logo) on a
// simple bar counter, a wall behind it and a thin shelf with a few cups and jars, the water in the pipe and the two
// coffee streams. `update(s, surface)` poses it from the shot's state only. Drawn in the cup's scene
// (`cup-scene.mjs`), which places this world in front of its own camera and puts the cup on the drip tray.
//
// The machine, the wood, the steel, the copper, the hot water and the coffee keep the colours of the things they are
// (like the cup's own); the wall is the page's own colour with faint brick lines, read from the design roles on the
// stage (`--brew-wall`, `--brew-brick` in `CupStage.astro`), so the wall fades into the page as the cup flies on.
import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { DIM } from './brew-shot.mjs'

// Colours of the things in the scene, never tinted by the design system (like the cup's, `cup-scene.mjs`).
const INK = '#2b1c12' /* ds-keep: the thin edge lines drawn on the machine's glass shell */
const AMBER = '#e0892f' /* ds-keep: hot water glowing in the pipe and over the coffee */
const WATER_LIGHT = '#ffd08a' /* ds-keep: the hot water's light stripe */
const WATER_DEEP = '#c8701c' /* ds-keep: the hot water's deep stripe */
const STEEL = '#c9ced2' /* ds-keep: brushed stainless steel of the body */
const STEEL_LIGHT = '#d2d6da' /* ds-keep: polished steel of the group head and portafilter */
const STEEL_BRIGHT = '#e9ecee' /* ds-keep: the basket's bright steel */
const STEEL_DARK = '#8a8f94' /* ds-keep: the feet's dull steel */
const TRAY = '#9aa0a5' /* ds-keep: the drip tray's steel */
const GRILLE = '#6b6f74' /* ds-keep: the drip tray grille */
const GRILLE_HOLE = '#101012' /* ds-keep: the grille's holes */
const PIPE = '#9aa4ab' /* ds-keep: the see-through pipe */
const RUBBER = '#141211' /* ds-keep: black knobs, gasket and handle */
const COPPER = '#c1703c' /* ds-keep: the copper boiler */
const COPPER_BAND = '#7a4a2a' /* ds-keep: the boiler's bands */
const PUCK_DRY = '#a8743f' /* ds-keep: dry ground coffee in the basket */
const PUCK_WET = '#1a0d05' /* ds-keep: ground coffee soaked by the water */
const COFFEE = '#7a3d12' /* ds-keep: the espresso running from the spouts */
const COFFEE_GLOW = '#3a1a05' /* ds-keep: its warm glow */
const WOOD = '#9a6640' /* ds-keep: the counter's warm wood */
const WOOD_DARK = '#6b4428' /* ds-keep: the counter front and the shelf, darker wood */
const WOOD_GRAIN = '#5a3820' /* ds-keep: the wood's grain lines */
const CERAMIC = '#f1ebe1' /* ds-keep: white ceramic cups on the shelf */
const JAR = '#d6e0dd' /* ds-keep: glass jars on the shelf */
const BEANS = '#4a2c18' /* ds-keep: roasted beans in the jars */
const GAUGE_FACE = '#f4f1ea' /* ds-keep: the pressure gauge's dial */
const NEEDLE = '#b3261e' /* ds-keep: the gauge's needle */
const SHADOW = '#000000' /* ds-keep: soft contact shadow under the machine and the cup */

const { zg, spoutTip, spoutX } = DIM
const lerp = (a, b, k) => a + (b - a) * k
const V = (x, y, z) => new Vector3(x, y, z)
const lathe = (pts, seg = 48) =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    seg
  )

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// A polyline with rounded corners (quadratic arcs), as dense points for a smooth tube.
function roundedPath(pts, r) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]
    const a = c.clone().add(pts[i - 1].clone().sub(c).normalize().multiplyScalar(r))
    const b = c.clone().add(pts[i + 1].clone().sub(c).normalize().multiplyScalar(r))
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      out.push(
        a
          .clone()
          .multiplyScalar((1 - t) ** 2)
          .add(c.clone().multiplyScalar(2 * t * (1 - t)))
          .add(b.clone().multiplyScalar(t * t))
      )
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

const dotsTexture = () => {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = GRILLE
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = GRILLE_HOLE
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.beginPath()
        g.arc(16 + x * 32 + (y % 2) * 16, 16 + y * 32, 7, 0, 7)
        g.fill()
      }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(9, 11)
  return t
}

const stripeTexture = () => {
  const t = canvasTexture(128, 4, (g) => {
    const gr = g.createLinearGradient(0, 0, 128, 0)
    gr.addColorStop(0, WATER_LIGHT)
    gr.addColorStop(0.5, WATER_DEEP)
    gr.addColorStop(1, WATER_LIGHT)
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 4)
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

// Wood with fixed grain lines (no randomness: the same picture on every load).
const woodTexture = (base, rep) => {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = WOOD_GRAIN
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = 0.08 + (i % 5) * 0.03
      g.lineWidth = 1 + (i % 3)
      const y = (i * 97) % 256
      g.beginPath()
      g.moveTo(0, y)
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + 3 * Math.sin(x / 40 + i))
      g.stroke()
    }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(rep[0], rep[1])
  return t
}

const gaugeTexture = () =>
  canvasTexture(128, 128, (g) => {
    g.fillStyle = GAUGE_FACE
    g.beginPath()
    g.arc(64, 64, 62, 0, 7)
    g.fill()
    g.strokeStyle = INK
    g.lineWidth = 3
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.75 + (1.5 * i) / 10)
      g.beginPath()
      g.moveTo(64 + 44 * Math.cos(a), 64 + 44 * Math.sin(a))
      g.lineTo(64 + 54 * Math.cos(a), 64 + 54 * Math.sin(a))
      g.stroke()
    }
    g.strokeStyle = NEEDLE
    g.lineWidth = 4
    const a = Math.PI * (0.75 + 1.5 * 0.62)
    g.beginPath()
    g.moveTo(64, 64)
    g.lineTo(64 + 46 * Math.cos(a), 64 + 46 * Math.sin(a))
    g.stroke()
    g.fillStyle = INK
    g.beginPath()
    g.arc(64, 64, 6, 0, 7)
    g.fill()
  })

// A soft dark patch lying on the counter (fake, fixed): the machine's (square) and the cup's (round).
const blobTexture = (square) =>
  canvasTexture(128, 128, (g) => {
    if (square) {
      g.filter = 'blur(10px)'
      g.fillStyle = SHADOW
      g.fillRect(26, 26, 76, 76)
    } else {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64)
      gr.addColorStop(0, SHADOW)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 128, 128)
    }
  })

/**
 * Build the brewing world. `narrow` (a phone) leaves out the contact shadows, as the cup's scene drops its shadows there.
 * @param {{ narrow?: boolean }} [options]
 */
export function buildBrew({ narrow = false } = {}) {
  const root = new Group()
  const regs = [] // every material that fades with the machine: { mat, glass, base, min }
  const lineMat = new LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false })
  const lineObjs = []

  const steel = (color = STEEL, rough = 0.45) =>
    new MeshStandardMaterial({ color, metalness: 0.9, roughness: rough, envMapIntensity: 0.6 })
  const reg = (mat, glass = false, base = 1, min = 0.09) => {
    regs.push({ mat, glass, base, min })
    return mat
  }
  const put = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  // A shell part: fades to glass and gets thin ink edge lines so its shape still reads.
  const shell = (parent, geo, mat, x, y, z, lineGeo, min) => {
    const m = put(parent, geo, reg(mat, true, 1, min), x, y, z)
    m.renderOrder = 5
    const l = new LineSegments(new EdgesGeometry(lineGeo || geo, 30), lineMat)
    l.renderOrder = 6
    m.add(l)
    lineObjs.push(l)
    return m
  }

  // ---- the bar: counter, wall, shelf ----------------------------------------------------------------------------
  const wallMat = reg(new MeshBasicMaterial({ toneMapped: false }))
  let brickColour = '#000'
  const wallTexture = canvasTexture(256, 256, () => {})
  wallTexture.wrapS = wallTexture.wrapT = RepeatWrapping
  wallTexture.repeat.set(10, 7)
  wallMat.map = wallTexture
  const wall = put(root, new PlaneGeometry(6, 4.2), wallMat, 0, 1.0, -0.34)
  wall.renderOrder = -3
  /** Paint the wall: the page colour, faint mortar lines of running-bond bricks. */
  function paintWall(bg, line) {
    brickColour = line
    const c = wallTexture.image
    const g = c.getContext('2d')
    g.fillStyle = bg
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = brickColour
    g.lineWidth = 3
    for (let row = 0; row < 4; row++) {
      const y = row * 64
      g.beginPath()
      g.moveTo(0, y + 1.5)
      g.lineTo(256, y + 1.5)
      g.stroke()
      for (let x = row % 2 ? 64 : 0; x < 256; x += 128) {
        g.beginPath()
        g.moveTo(x + 1.5, y)
        g.lineTo(x + 1.5, y + 64)
        g.stroke()
      }
    }
    wallTexture.needsUpdate = true
  }

  const woodTop = reg(new MeshStandardMaterial({ map: woodTexture(WOOD, [6, 2]), roughness: 0.62 }))
  put(root, new BoxGeometry(3.2, 0.04, 0.9), woodTop, 0, -0.02, 0.04)
  const woodFront = reg(new MeshStandardMaterial({ map: woodTexture(WOOD_DARK, [6, 3]), roughness: 0.7 }))
  put(root, new BoxGeometry(3.2, 1.2, 0.04), woodFront, 0, -0.64, 0.47)
  // A thin shelf on the wall, left of the machine, with two ceramic cups and two jars of beans.
  const shelfMat = reg(new MeshStandardMaterial({ map: woodTexture(WOOD_DARK, [2, 1]), roughness: 0.7 }))
  put(root, new BoxGeometry(0.46, 0.018, 0.09), shelfMat, -0.47, 0.36, -0.29)
  const ceramic = reg(new MeshStandardMaterial({ color: CERAMIC, roughness: 0.35 }))
  ceramic.side = DoubleSide
  for (const x of [-0.62, -0.555]) {
    put(
      root,
      lathe(
        [
          [0.016, 0],
          [0.022, 0.002],
          [0.026, 0.03],
          [0.027, 0.045],
          [0.025, 0.045],
          [0.023, 0.006],
          [0, 0.006]
        ],
        32
      ),
      ceramic,
      x,
      0.369,
      -0.285
    )
  }
  const glass = reg(new MeshStandardMaterial({ color: JAR, roughness: 0.1, metalness: 0.1 }), false, 0.45)
  const beans = reg(new MeshStandardMaterial({ color: BEANS, roughness: 0.8 }))
  for (const [x, h] of [
    [-0.43, 0.11],
    [-0.33, 0.085]
  ]) {
    put(root, new CylinderGeometry(0.0255, 0.0255, h * 0.7, 24), beans, x, 0.369 + h * 0.35, -0.29)
    const jar = put(root, new CylinderGeometry(0.03, 0.03, h, 24), glass, x, 0.369 + h / 2, -0.29)
    jar.renderOrder = 2
    put(root, new CylinderGeometry(0.032, 0.032, 0.012, 24), shelfMat, x, 0.369 + h + 0.006, -0.29)
  }

  // ---- base, feet, drip tray (always solid) ---------------------------------------------------------------------
  put(root, new RoundedBoxGeometry(0.34, 0.03, 0.52, 3, 0.008), reg(steel('#bfc5ca', 0.5)), 0, 0.029, 0.04)
  for (const sx of [-0.13, 0.13])
    for (const sz of [-0.17, 0.25])
      put(root, new CylinderGeometry(0.02, 0.022, 0.014, 24), reg(steel(STEEL_DARK, 0.6)), sx, 0.007, sz)
  const grille = reg(new MeshStandardMaterial({ metalness: 0.6, roughness: 0.55, map: dotsTexture() }))
  put(root, new BoxGeometry(0.3, 0.006, 0.28), grille, 0, 0.047, 0.15)
  put(
    root,
    new RoundedBoxGeometry(0.31, 0.01, 0.29, 2, 0.004),
    reg(steel(TRAY, 0.5)),
    0,
    0.0445,
    0.15
  ).renderOrder = -1

  // ---- body shell (fades to glass) --------------------------------------------------------------------------------
  shell(
    root,
    new RoundedBoxGeometry(0.34, 0.456, 0.2, 3, 0.012),
    steel(STEEL, 0.5),
    0,
    0.272,
    -0.12,
    new BoxGeometry(0.34, 0.456, 0.2)
  )
  // knobs, the pressure gauge and the steam wand stay solid: anchors while the body is glass
  const black = reg(new MeshStandardMaterial({ color: RUBBER, roughness: 0.6, metalness: 0.1 }))
  for (const sx of [-0.12, 0.12]) {
    const k = put(root, new CylinderGeometry(0.016, 0.019, 0.03, 20), black, sx, 0.37, -0.005)
    k.rotation.x = Math.PI / 2
  }
  const bezel = put(
    root,
    new CylinderGeometry(0.03, 0.03, 0.012, 32),
    reg(steel(STEEL_LIGHT, 0.35)),
    -0.105,
    0.29,
    -0.014
  )
  bezel.rotation.x = Math.PI / 2
  const dial = put(
    root,
    new CircleGeometry(0.025, 32),
    reg(new MeshStandardMaterial({ map: gaugeTexture(), roughness: 0.3 })),
    -0.105,
    0.29,
    -0.0075
  )
  dial.rotation.z = Math.PI
  const wandMat = reg(steel(STEEL_LIGHT, 0.3))
  const wandPath = new CatmullRomCurve3(
    roundedPath([V(0.13, 0.33, -0.02), V(0.15, 0.33, 0.02), V(0.16, 0.2, 0.05), V(0.155, 0.13, 0.06)], 0.02)
  )
  put(root, new TubeGeometry(wandPath, 40, 0.0055, 12, false), wandMat)
  put(root, new SphereGeometry(0.0075, 16, 12), wandMat, 0.155, 0.128, 0.06)
  const wandKnob = put(root, new CylinderGeometry(0.009, 0.009, 0.02, 16), black, 0.13, 0.33, -0.012)
  wandKnob.rotation.x = Math.PI / 2

  // ---- boiler (copper, lying along X inside the body's upper half) -------------------------------------------------
  const copper = reg(
    new MeshStandardMaterial({
      color: COPPER,
      metalness: 0.9,
      roughness: 0.38,
      envMapIntensity: 0.7,
      emissive: AMBER,
      emissiveIntensity: 0
    })
  )
  const BY = 0.445
  const BZ = -0.12
  const boiler = put(
    root,
    lathe(
      [
        [0, -0.13],
        [0.035, -0.13],
        [0.04, -0.122],
        [0.04, 0.122],
        [0.035, 0.13],
        [0, 0.13]
      ],
      40
    ),
    copper,
    0,
    BY,
    BZ
  )
  boiler.rotation.z = Math.PI / 2
  const band = reg(steel(COPPER_BAND, 0.5))
  for (const dx of [-0.07, 0.07])
    put(root, new TorusGeometry(0.0405, 0.0035, 8, 40), band, dx, BY, BZ).rotation.y = Math.PI / 2

  // ---- group head (fades) -----------------------------------------------------------------------------------------
  const group = new Group()
  group.position.set(0, 0, zg)
  root.add(group)
  const casing = steel(STEEL_LIGHT, 0.42)
  casing.side = DoubleSide
  shell(
    group,
    lathe([
      [0.034, 0.2855],
      [0.05, 0.2855],
      [0.05, 0.298],
      [0.042, 0.31],
      [0.04, 0.33],
      [0.04, 0.385],
      [0.03, 0.396],
      [0, 0.396]
    ]),
    casing,
    0,
    0,
    0
  )
  shell(
    group,
    new RoundedBoxGeometry(0.07, 0.065, 0.11, 3, 0.012),
    steel(STEEL_LIGHT, 0.42),
    0,
    0.3525,
    -0.05,
    new BoxGeometry(0.07, 0.065, 0.11)
  )
  put(group, new CylinderGeometry(0.014, 0.014, 0.013, 6), reg(steel('#e3e6e9', 0.4)), 0, 0.4025, 0)
  // shower screen + gasket, seen when the shell is glass
  put(group, new CylinderGeometry(0.03, 0.03, 0.0016, 40), reg(steel(TRAY, 0.4)), 0, 0.2875, 0)
  put(group, new TorusGeometry(0.0345, 0.0028, 8, 40), black, 0, 0.286, 0).rotation.x = Math.PI / 2

  // ---- portafilter -------------------------------------------------------------------------------------------------
  const pf = steel(STEEL_LIGHT, 0.42)
  pf.side = DoubleSide
  shell(
    group,
    lathe([
      [0.0335, 0.2845],
      [0.047, 0.2845],
      [0.047, 0.262],
      [0.04, 0.246],
      [0.02, 0.232],
      [0.014, 0.226],
      [0, 0.226]
    ]),
    pf,
    0,
    0,
    0
  )
  const basket = steel(STEEL_BRIGHT, 0.35)
  basket.side = DoubleSide
  // the basket goes almost clear, so the coffee inside reads while the water presses through it
  shell(
    group,
    lathe([
      [0.0315, 0.2845],
      [0.0315, 0.254],
      [0.03, 0.2525],
      [0, 0.2525]
    ]),
    basket,
    0,
    0,
    0,
    null,
    0.05
  )
  const funnel = reg(steel(STEEL_LIGHT, 0.42))
  funnel.side = DoubleSide
  put(
    group,
    lathe([
      [0.03, 0.2525],
      [0.016, 0.231],
      [0.016, 0.226]
    ]),
    funnel
  )
  // the puck: dry ground coffee, and a dark wet layer growing down from its top
  const puckTop = 0.2775
  const puckH = 0.024
  put(
    group,
    new CylinderGeometry(0.0305, 0.0305, puckH, 40),
    reg(new MeshStandardMaterial({ color: PUCK_DRY, roughness: 0.95 })),
    0,
    puckTop - puckH / 2,
    0
  )
  const puckWet = put(
    group,
    new CylinderGeometry(0.0308, 0.0308, puckH, 40),
    reg(new MeshStandardMaterial({ color: PUCK_WET, roughness: 0.6 })),
    0,
    puckTop,
    0
  )
  const showerMat = reg(
    new MeshStandardMaterial({
      color: AMBER,
      emissive: AMBER,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      transparent: true,
      depthWrite: false
    }),
    false,
    0.55
  )
  const shower = put(group, new CylinderGeometry(0.0295, 0.0295, 0.0088, 40), showerMat, 0, 0.2821, 0)
  shower.renderOrder = 3
  const layerMat = reg(
    new MeshStandardMaterial({
      color: AMBER,
      emissive: AMBER,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      transparent: true,
      depthWrite: false
    }),
    false,
    0.9
  )
  const layer = put(group, new CylinderGeometry(0.0306, 0.0306, 0.0016, 40), layerMat, 0, puckTop + 0.0008, 0)
  layer.renderOrder = 3
  // the handle, angled toward the front left, clear of the cup's way out to the front right
  const handle = new Group()
  handle.position.set(0, 0.268, 0)
  handle.rotation.y = (-28 * Math.PI) / 180
  group.add(handle)
  put(
    handle,
    new CylinderGeometry(0.007, 0.007, 0.035, 16),
    reg(steel(STEEL_LIGHT, 0.4)),
    0,
    0,
    0.0625
  ).rotation.x = Math.PI / 2
  put(handle, new CylinderGeometry(0.0125, 0.0105, 0.09, 20), black, 0, 0, 0.125).rotation.x = Math.PI / 2
  put(handle, new SphereGeometry(0.0105, 16, 12), black, 0, 0, 0.17)
  // spouts: a bar under the basket, two tubes ending at spoutTip
  const spoutMat = reg(steel('#d8dcdf', 0.38))
  put(group, new CylinderGeometry(0.018, 0.018, 0.014, 24), spoutMat, 0, 0.221, 0)
  for (const sx of [-spoutX, spoutX]) {
    const len = 0.221 - spoutTip
    put(group, new CylinderGeometry(0.0055, 0.0038, len, 14), spoutMat, sx, spoutTip + len / 2, 0)
  }

  // ---- the pipe from the boiler to the group, and the water in it ---------------------------------------------------
  const route = roundedPath([V(0, BY, BZ), V(0, 0.352, BZ), V(0, 0.352, zg), V(0, 0.2885, zg)], 0.018)
  const curve = new CatmullRomCurve3(route, false, 'centripetal')
  curve.arcLengthDivisions = 800
  const SEG = 200
  const pipeMat = reg(
    new MeshStandardMaterial({
      color: PIPE,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      depthWrite: false
    }),
    false,
    0.32
  )
  put(root, new TubeGeometry(curve, SEG, 0.0095, 14, false), pipeMat).renderOrder = 4
  const stripes = stripeTexture()
  stripes.repeat.set(curve.getLength() / 0.05, 1)
  const waterMat = reg(
    new MeshStandardMaterial({
      map: stripes,
      emissive: AMBER,
      emissiveMap: stripes,
      emissiveIntensity: 0.55,
      roughness: 0.3
    })
  )
  const water = put(root, new TubeGeometry(curve, SEG, 0.0055, 10, false), waterMat)
  const perSeg = water.geometry.index.count / SEG
  const tip = put(
    root,
    new SphereGeometry(0.0085, 16, 12),
    reg(
      new MeshStandardMaterial({
        color: WATER_LIGHT,
        emissive: AMBER,
        emissiveIntensity: 0.9,
        roughness: 0.3
      })
    )
  )

  // ---- streams and drops ----------------------------------------------------------------------------------------
  const streamMat = reg(
    new MeshStandardMaterial({
      color: COFFEE,
      roughness: 0.22,
      emissive: COFFEE_GLOW,
      emissiveIntensity: 0.4
    })
  )
  const streamGeo = new CylinderGeometry(1, 1, 1, 12, 1, true)
  const streams = [-spoutX, spoutX].map((sx) => {
    const m = put(root, streamGeo, streamMat, sx, 0, zg)
    m.visible = false
    return m
  })
  const dropGeo = new SphereGeometry(1, 12, 10)
  const drops = [0, 1, 2, 3].map((i) => {
    const m = put(root, dropGeo, streamMat, i % 2 ? spoutX : -spoutX, 0, zg)
    m.visible = false
    return m
  })

  // ---- contact shadows on the counter ---------------------------------------------------------------------------
  const blob = (square, w, d) => {
    const m = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ map: blobTexture(square), transparent: true, opacity: 0, depthWrite: false })
    )
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.0005
    m.renderOrder = -2
    m.visible = !narrow
    root.add(m)
    return m
  }
  const machineShadow = blob(true, 0.62, 0.8)
  machineShadow.position.z = 0.04
  const cupShadow = blob(false, 0.2, 0.2)

  /**
   * Pose the world at the shot's state `s`. `surface`: the height the streams fall to (the coffee's top in the
   * default cup, the top of an owner's cup); `cup`: where the cup's foot stands on the tray (x, z).
   */
  function update(s, surface, cup) {
    const vis = s.machineVis
    root.visible = vis > 0.003
    for (const { mat, glass, base, min } of regs) {
      const op = base * vis * (glass ? lerp(1, min, s.glass) : 1)
      mat.opacity = op
      const see = op < 0.999
      if (mat.transparent !== see) {
        mat.transparent = see
        mat.needsUpdate = true
      }
      mat.depthWrite = glass ? op > 0.999 : base >= 1
    }
    lineMat.opacity = 0.8 * s.glass * vis
    for (const l of lineObjs) l.visible = lineMat.opacity > 0.01

    // the water's front runs along the pipe, its tail follows when the flow stops
    const a = Math.floor(s.waterTail * SEG)
    const b = Math.floor(s.waterFront * SEG)
    water.geometry.setDrawRange(a * perSeg, Math.max(0, b - a) * perSeg)
    water.visible = b > a
    stripes.offset.x = -s.waterScroll
    tip.visible = s.waterFront > 0.002 && s.waterFront < 0.999 && s.waterTail < 0.01
    if (tip.visible) tip.position.copy(curve.getPointAt(s.waterFront))
    copper.emissiveIntensity = s.boilerGlow

    shower.visible = layer.visible = s.showerA > 0.01
    showerMat.opacity = 0.55 * s.showerA * vis
    layerMat.opacity = 0.9 * s.showerA * vis
    puckWet.visible = s.puckWet > 0.001
    puckWet.scale.y = Math.max(s.puckWet, 1e-3)
    puckWet.position.y = puckTop - (puckH * s.puckWet) / 2

    const fall = spoutTip - surface
    const yTop = spoutTip - s.streamTop * fall
    const yBot = spoutTip - s.streamBot * fall
    for (const m of streams) {
      m.visible = s.streamOn && yTop - yBot > 2e-4
      m.scale.set(s.streamR, Math.max(yTop - yBot, 1e-4), s.streamR)
      m.position.y = (yTop + yBot) / 2
    }
    s.drops.forEach((d, i) => {
      drops[i].visible = d.f >= 0
      if (d.f >= 0) {
        drops[i].scale.set(d.r, d.r * 1.25, d.r)
        drops[i].position.y = spoutTip - d.f * fall - d.r
      }
    })

    machineShadow.material.opacity = 0.3 * vis
    cupShadow.position.set(cup.x, DIM.trayTop + 0.0005, cup.z)
    cupShadow.material.opacity = 0.28 * vis
  }

  return { root, update, paintWall }
}
