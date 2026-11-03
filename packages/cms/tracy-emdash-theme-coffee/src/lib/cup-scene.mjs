// The 3D cup on the home page: three.js, framed after the "Real 3D model hero" recipe of the
// MotionSites skill (rig mover > spinner > holder > model, intro turn, idle sway, render paused off-screen).
// Loaded only on the 3D route (`cup-route.mjs`), so the still and empty routes never fetch three.js
// or the model file. Every decoder ships with the template: meshopt is bundled from the `three`
// package, Draco is served from `public/decoders/draco/`; nothing loads from a CDN.
// The pose comes from the scroll timeline (`home-scroll.mjs`) through `setPose`; every move is on the
// rig, never on a part of the object. The changes to the object are the default cup's alone: its paper
// body turns see-through in section 4, and in the brewing scene above section 1 it fills with espresso seen through
// the paper, open, until its lid drops on (`buildInside`). The brewing scene's machine and bar (`brew-scene.mjs`) are
// drawn in this scene, with this camera: the scene moves their world in front of the camera along the brewing shot
// (`brew-shot.mjs`) and stands the cup on the drip tray, then flies it into section 1's pose.
// Every colour of the scene but the cup's own comes from the design roles through the stage's CSS
// (`--cup-shadow`, `--cup-bounce`, `--cup-rim`, in `CupStage.astro`), read again when the page
// switches light / dark or wears a design system; the cup's materials are never tinted.
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Scene,
  ShadowMaterial,
  Sphere,
  Vector3,
  WebGLRenderer
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { buildBrew } from './brew-scene.mjs'
import { DIM, shotAt } from './brew-shot.mjs'
import { fitHeight, NARROW } from './home-scroll.mjs'

const FOV = 30 // narrow lens: product-shot look
const ELEVATION = 0.18 // rad above the horizon; the camera looks at the front (+Z)
const SWAY = 0.15 // rad of idle turn either way; zero at the rest pose `tools/capture-default-still.mjs` holds
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const round = (v) => Math.round(v * 1e4) / 1e4
// The shop name on the default cup's sleeve: printing ink and a face of the cup itself, so neither
// follows the design system (the cup keeps its own colours). The system face has every Vietnamese mark.
const INK = '#2b1c12' /* ds-keep: printing ink on the cup's kraft sleeve, part of the object */
const FACE =
  '600 {px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

// What the default cup holds, seen through its paper body in section 4: colours of the object, like INK.
const MILK_COFFEE = '#9c6640' /* ds-keep: the coffee inside the default cup, part of the object */
const MILK_TOP = '#c79a72' /* ds-keep: its milky top */
const ICE = '#e9f1f3' /* ds-keep: the ice cubes */
const FROSTED = 0.78 // how much of the paper body fades away when the cup is fully clear
// The espresso the brewing scene pulls into the default cup: colours of the object, like INK.
const ESPRESSO = '#3a2214' /* ds-keep: espresso in the cup */
const ESPRESSO_GLOW = '#1a0e06' /* ds-keep: its warm depth */
const CREMA = '#c48e55' /* ds-keep: the crema on top */
const CREMA_EDGE = '#7a4c26' /* ds-keep: the crema's darker rim */
const CREMA_LIGHT = 'rgba(255,225,170,0.18)' /* ds-keep: light flecks in the crema */
const CREMA_DARK = 'rgba(80,40,14,0.22)' /* ds-keep: dark flecks in the crema */
const GHOST = 0.8 // how much of the paper body fades while the espresso rises (the sleeve fades a little less)
const PHONE = 390 / 844 // a phone's portrait window, the narrowest framing the brewing scene is tuned for
const LENS = Math.tan(MathUtils.degToRad(18)) / Math.tan(MathUtils.degToRad(15)) // the shot's 36° distances, at FOV
const BREW_TURN = 0.35 + MathUtils.degToRad(24) // the cup's turn on the tray: its sleeve's front to the camera

let pixel = null
/**
 * The colour the stage's CSS gives `prop` (`var()` resolved, any CSS colour form) as a three.js
 * colour, or null when it does not resolve to one.
 * @param {HTMLElement} el
 * @param {string} prop
 */
function cssColour(el, prop) {
  const probe = document.createElement('i')
  probe.style.color = `var(${prop})`
  el.append(probe)
  const css = getComputedStyle(probe).color
  probe.remove()
  pixel ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  pixel.clearRect(0, 0, 1, 1)
  pixel.fillStyle = css
  pixel.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data
  return a ? new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace) : null
}

/**
 * Print `name` in the free area of the default cup's sleeve (the material's `nameArea` extras,
 * `tools/build-cup.mjs`): one line, shrunk down to a floor size, then cut with "…" (an empty name
 * leaves the sleeve plain). A file without that area (an owner's cup) is left as it is.
 * @returns {boolean} whether the file has a sleeve area to print on
 */
function printName(model, name) {
  let sleeve = null
  model.traverse((o) => {
    if (!sleeve && o.isMesh && o.material?.userData?.nameAreaPx && o.material.map?.image) sleeve = o
  })
  if (!sleeve) return false
  const text = name.trim()
  if (!text) return true
  const m = sleeve.material
  const img = m.map.image
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  // Texels are not square: the image's width goes round the cup, its height up the sleeve.
  sleeve.geometry.computeBoundingBox()
  const size = sleeve.geometry.boundingBox.getSize(new Vector3())
  const stretch = (Math.PI * size.x) / c.width / (size.y / c.height)
  const area = m.userData.nameAreaPx
  const room = area.width * stretch // width available, in texels as tall as they are wide
  const max = area.height * 0.5
  const min = area.height * 0.2
  g.font = FACE.replace('{px}', String(max))
  const px = Math.max(min, Math.min(max, (max * room) / g.measureText(text).width))
  g.font = FACE.replace('{px}', px.toFixed(1))
  let line = text
  while (line.length > 1 && g.measureText(line).width > room) line = `${line.slice(0, -2).trimEnd()}…`
  g.save()
  g.translate(area.x + area.width / 2, area.y + area.height / 2)
  g.scale(1 / stretch, 1)
  g.fillStyle = INK
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(line, 0, 0)
  g.restore()
  const map = m.map.clone()
  map.image = c
  map.needsUpdate = true
  m.map = map
  return true
}

function cremaTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128)
  gr.addColorStop(0, CREMA)
  gr.addColorStop(1, CREMA_EDGE)
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  // fixed flecks (no randomness: the same crema on every load)
  for (let i = 0; i < 260; i++) {
    const a = i * 2.399963
    const r = 118 * Math.sqrt(((i * 37) % 260) / 260)
    g.fillStyle = i % 3 ? CREMA_LIGHT : CREMA_DARK
    g.beginPath()
    g.arc(128 + r * Math.cos(a), 128 + r * Math.sin(a), 2 + (i % 4), 0, 7)
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * The default cup's inside: milk coffee to just over the sleeve, a few ice cubes floating, a gently
 * rippling top, drawn through the paper body as `clear` (the pose's, 0–1) rises; the lid and the
 * sleeve stay paper. In the brewing scene (`shot`, `brew-shot.mjs`) the cup is open instead: espresso with
 * crema rises to `shot.fill` seen through the fading paper (`shot.cupGhost`), and the lid (`lid` + `sip-hole`)
 * hangs `shot.lidUp` above its seat until it drops on. Built in the paper body's own units, from its wall; null for
 * a file without a `paper` body (an owner's cup is left as it is).
 * @returns {{ set(clear: number, now: number, shot?: ReturnType<typeof shotAt> | null): void, level(fill: number): number } | null}
 */
function buildInside(model) {
  let paper = null
  let sleeve = null
  const lid = []
  model.traverse((o) => {
    if (!o.isMesh) return
    if (!paper && o.material?.name === 'paper') paper = o
    if (!sleeve && o.material?.userData?.nameAreaPx) sleeve = o
    if (o.material?.name === 'lid' || o.material?.name === 'sip-hole') lid.push(o)
  })
  if (!paper) return null
  const whole = new Box3().setFromObject(model)
  const modelTall = whole.max.y - whole.min.y
  const pos = paper.geometry.attributes.position
  let [bottom, top] = [Infinity, -Infinity]
  for (let i = 0; i < pos.count; i++) {
    bottom = Math.min(bottom, pos.getY(i))
    top = Math.max(top, pos.getY(i))
  }
  const tall = top - bottom
  let [foot, mouth] = [0, 0]
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i))
    if (pos.getY(i) < bottom + tall * 0.02) foot = Math.max(foot, r)
    if (pos.getY(i) > top - tall * 0.02) mouth = Math.max(mouth, r)
  }
  const wall = (y) => (foot + ((mouth - foot) * (y - bottom)) / tall) * 0.95
  const floor = bottom + tall * 0.04
  const level = bottom + tall * 0.86
  const inside = new Group()
  inside.visible = false
  const coffee = new Mesh(
    new CylinderGeometry(wall(level), wall(floor), level - floor, 64),
    new MeshStandardMaterial({ color: MILK_COFFEE, roughness: 0.3 })
  )
  coffee.position.y = (level + floor) / 2
  const surface = new CircleGeometry(wall(level), 64, 0, Math.PI * 2).rotateX(-Math.PI / 2)
  const flat = surface.attributes.position.array.slice()
  const skin = new Mesh(surface, new MeshStandardMaterial({ color: MILK_TOP, roughness: 0.18 }))
  skin.position.y = level + tall * 0.002
  const side = wall(level) * 0.3
  const ice = [0, 1, 2, 3].map((i) => {
    const cube = new Mesh(
      new BoxGeometry(side, side, side),
      new MeshStandardMaterial({ color: ICE, roughness: 0.06 })
    )
    const a = i * 1.7 + 0.4
    const r = wall(level) * (i === 3 ? 0.08 : 0.5)
    cube.position.set(Math.cos(a) * r, level - side * 0.4, Math.sin(a) * r)
    cube.rotation.set(i * 0.7, i * 1.3, i * 0.4)
    return cube
  })
  inside.add(coffee, skin, ...ice)
  paper.add(inside)
  const body = paper.material

  // The brewing scene's espresso: a frustum along the wall up to the level (built again as the level moves, so the
  // taper follows it), crema on top; drawn after the see-through paper so the coffee is the strongest thing in the cup.
  const brewLevel = (fill) => floor + tall * DIM.full * fill
  // Built at the cup's floor (not a unit placeholder): the fit below measures every mesh, shown or not.
  const espresso = new Mesh(
    new CylinderGeometry(wall(floor), wall(floor), 1e-4, 48, 1, true),
    new MeshStandardMaterial({
      color: ESPRESSO,
      emissive: ESPRESSO_GLOW,
      roughness: 0.35,
      side: DoubleSide,
      transparent: true
    })
  )
  const crema = new Mesh(
    new CircleGeometry(wall(floor), 48).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ map: cremaTexture(), roughness: 0.5, transparent: true })
  )
  espresso.renderOrder = 3
  crema.renderOrder = 4
  paper.renderOrder = 1
  if (sleeve) sleeve.renderOrder = 2
  espresso.visible = crema.visible = false
  espresso.position.y = crema.position.y = floor
  paper.add(espresso, crema)
  let builtFill = -1
  const seats = lid.map((m) => m.position.y)
  const fade = (m, opacity) => {
    m.opacity = opacity
    const see = opacity < 0.999
    if (m.transparent !== see) {
      m.transparent = see
      m.depthWrite = !see
      m.needsUpdate = true
    }
  }
  return {
    paper: body,
    /** The espresso's top at `fill`, as a share of the whole cup's height from its foot (`brew-scene.mjs` streams). */
    level: (fill) => (brewLevel(fill) - whole.min.y) / modelTall,
    set(clear, now, shot = null) {
      const c = MathUtils.clamp(clear, 0, 1)
      const ghost = shot ? shot.cupGhost : 0
      inside.visible = c > 0.01
      fade(body, 1 - Math.max(FROSTED * c, GHOST * ghost))
      if (sleeve) fade(sleeve.material, 1 - 0.56 * GHOST * ghost)
      lid.forEach((m, i) => {
        m.position.y = seats[i] + (shot ? shot.lidUp * DIM.lidRise * modelTall : 0)
        m.visible = !shot || shot.lidUp < 0.999
        fade(m.material, shot ? shot.lidA : 1)
      })
      const fill = shot ? shot.fill : 0
      espresso.visible = crema.visible = fill > 0.001
      if (espresso.visible && fill !== builtFill) {
        builtFill = fill
        const level = brewLevel(fill)
        espresso.geometry.dispose()
        espresso.geometry = new CylinderGeometry(wall(level), wall(floor), level - floor, 48, 1, true)
        espresso.position.y = (level + floor) / 2
        crema.position.y = level
        crema.scale.setScalar((wall(level) * 0.98) / wall(floor))
      }
      if (!inside.visible) return
      const t = now / 1000
      const p = surface.attributes.position
      for (let i = 0; i < p.count; i++) {
        const x = flat[i * 3]
        const z = flat[i * 3 + 2]
        p.setY(
          i,
          tall *
            0.004 *
            Math.sin(Math.hypot(x, z) * (60 / tall) - t * 2.2) *
            Math.min(1, Math.hypot(x, z) / side)
        )
      }
      p.needsUpdate = true
      surface.computeVertexNormals()
      ice.forEach((cube, i) => {
        cube.position.y = level - side * 0.4 + tall * 0.006 * Math.sin(t * 1.3 + i * 2)
        cube.rotation.y += 0.002
      })
    }
  }
}

/**
 * Draw `src` inside `stage`. Calls `onFail` once when the file or the GPU context fails; the caller
 * then takes the still route. Writes the fitted pose to `stage.dataset.cupPose` and the pose the
 * timeline asked for to `stage.dataset.cupMotion` (read by the browser test and the acceptance
 * scripts), and the screen points of the labels and the cup's middle to CSS variables on the stage
 * (`--anchor-<i>-x/-y`, `--cup-cx/-cy`).
 *
 * @param {HTMLElement} stage the box the object is drawn in; the canvas is appended to it
 * @param {string} src the .glb to load
 * @param {() => void} onFail
 * The cup comes in at rest when a still image stands in for it while it loads (`still`), so the two
 * fade into each other in the same pose; with no still image it turns in. `name` is printed on the
 * default cup's sleeve (written to `stage.dataset.cupName` once printed); leave it out for an owner's cup. `brew`:
 * the page shows the brewing scene above section 1 (`[data-brew]`): the scene builds its machine and bar, and draws
 * them while the pose's `brew` is under 1, the line under them in the stage's `[data-brew-caption]`.
 * @param {{ labels?: number, still?: boolean, name?: string, brew?: boolean }} [options] `labels`: how many labels point at the cup (top to bottom, right side first)
 * @returns {{ setPose(pose: import('./home-scroll.mjs').Pose): void }}
 */
export function mountCupScene(
  stage,
  src,
  onFail,
  { labels = 0, still = false, name, brew: brewing = false } = {}
) {
  const narrow = window.innerWidth < NARROW
  let dead = false
  let raf = 0
  let visible = true
  let ready = false
  let introStart = 0
  let swayStart = 0
  let pose = null
  let motion = ''
  let inside = null
  let clear = null
  let brewDrawn = 1
  const api = {
    setPose(next) {
      pose = next
      wake()
    },
    /** The turn the cup was last drawn at, idle sway included (read by `tests/browser/cup-stage.mjs`). */
    get spin() {
      return spinner.rotation.y
    },
    /** How see-through the default cup was last drawn (0 paper – 1 clear); null for an owner's cup. */
    get clear() {
      return clear
    },
    /** The brewing progress last drawn (0–1; 1 once the cup has landed in section 1, or with no brewing scene). */
    get brew() {
      return brewDrawn
    },
    /** The default cup's paper opacity last drawn (1 paper); null for an owner's cup. */
    get paperOpacity() {
      return inside ? inside.paper.opacity : null
    },
    /**
     * The espresso machine's screen box last drawn, the cup where it stands on the tray included, in the stage's px
     * ({ left, top, right, bottom }); null with no brewing scene or once the cup has landed. Read by
     * `tests/browser/cup-stage.mjs`: the first frame's menu sheet stays clear of it.
     */
    get machineBox() {
      if (!brew || brewDrawn >= 1) return null
      const w = stage.clientWidth
      const h = stage.clientHeight
      const out = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
      const r = DIM.cupH / 2
      for (const x of [MACHINE[0][0], Math.max(MACHINE[0][1], cupAt.x + r)])
        for (const y of MACHINE[1])
          for (const z of [MACHINE[2][0], Math.max(MACHINE[2][1], cupAt.z + r)]) {
            const v = corner.set(x, y, z).applyMatrix4(brew.root.matrix).project(camera)
            const [sx, sy] = [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]
            out.left = Math.min(out.left, sx)
            out.right = Math.max(out.right, sx)
            out.top = Math.min(out.top, sy)
            out.bottom = Math.max(out.bottom, sy)
          }
      return out
    }
  }
  const fail = () => {
    if (dead) return
    dead = true
    cancelAnimationFrame(raf)
    canvas.remove()
    // the brewing scene's line goes with the scene: the fallback route has no scene for it to describe
    const line = stage.querySelector('[data-brew-caption]')
    if (line) line.textContent = ''
    onFail()
  }

  let renderer
  try {
    renderer = new WebGLRenderer({ antialias: !narrow, alpha: true, powerPreference: 'high-performance' })
  } catch {
    onFail()
    return api
  }
  const canvas = renderer.domElement
  canvas.className = 'cup-stage__canvas'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    fail()
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NeutralToneMapping
  renderer.shadowMap.enabled = !narrow
  stage.append(canvas)

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  // The key light is white so the cup shows its own colours; the bounce (the page around the cup)
  // and the rim (the accent) are the design roles.
  const key = new DirectionalLight(undefined, 1.5)
  key.castShadow = !narrow
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0005
  scene.add(key)
  const bounce = new HemisphereLight(undefined, undefined, 0.35)
  scene.add(bounce)
  const rim = new DirectionalLight(undefined, 0.6)
  scene.add(rim)

  const camera = new PerspectiveCamera(FOV, 1, 0.01, 100)
  let radius = 1
  let dist = 1
  let height = 1
  let fittedBox = { x: 0, y: 1, z: 0 }
  // mover = place + size on screen (carries the floor, so the shadow follows the cup);
  // spinner = lean, turn, intro + idle sway about the cup's middle; holder = centring + scale of the file.
  // Each owns one concern.
  const mover = new Group()
  const spinner = new Group()
  spinner.rotation.order = 'ZYX' // turn about the cup's own axis first, then lean in the screen plane
  const centring = new Group()
  const holder = new Group()
  centring.add(holder)
  spinner.add(centring)
  mover.add(spinner)
  scene.add(mover)
  const floorMaterial = new ShadowMaterial({ opacity: 0.22 })
  floorMaterial.depthWrite = false // a leaning cup dips below the floor; the floor must not cut it
  const floor = new Mesh(new PlaneGeometry(4, 4), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.visible = !narrow
  mover.add(floor)

  // The brewing scene's world: placed in front of the camera on every frame (`brewPlace`), never moved otherwise.
  const brew = brewing ? buildBrew({ narrow }) : null
  if (brew) {
    brew.root.matrixAutoUpdate = false
    scene.add(brew.root)
  }
  const caption = stage.querySelector('[data-brew-caption]')

  function recolour() {
    const set = (colour, prop) => {
      const c = cssColour(stage, prop)
      if (c) colour.copy(c)
    }
    set(floorMaterial.color, '--cup-shadow')
    set(bounce.color, '--cup-bounce')
    set(bounce.groundColor, '--cup-bounce')
    set(rim.color, '--cup-rim')
    if (brew) {
      const css = (prop) => `#${(cssColour(stage, prop) ?? new Color()).getHexString(SRGBColorSpace)}`
      brew.paintWall(css('--brew-wall'), css('--brew-brick'))
    }
    wake()
  }
  recolour()
  new MutationObserver(recolour).observe(document.documentElement, { attributes: true })

  /** Pixels per world unit at the cup's distance from the camera. */
  const unitPx = () => stage.clientHeight / (2 * dist * Math.tan(MathUtils.degToRad(FOV / 2)))

  function layout() {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const half = MathUtils.degToRad(FOV / 2)
    const halfH = Math.atan(Math.tan(half) * camera.aspect)
    dist = (radius / Math.sin(Math.min(half, halfH))) * 1.2
    camera.position.set(0, dist * Math.sin(ELEVATION), dist * Math.cos(ELEVATION))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    wake()
  }

  const right = new Vector3()
  const up = new Vector3()
  /** Place the rig at `pose`: pixels of the stage to world units on the plane of the cup. */
  function place(p, intro) {
    const u = unitPx()
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    mover.position
      .copy(right)
      .multiplyScalar(p.x / u)
      .addScaledVector(up, -p.y / u)
    mover.scale.setScalar(Math.max(1e-4, fitHeight(p.h, fittedBox) / (height * u)) * (0.9 + 0.1 * intro))
    spinner.rotation.set(0, p.turn + (1 - intro) * -0.9, p.tilt)
  }

  const ray = new Raycaster()
  const point = new Vector3()
  const origin = new Vector3()
  const toAxis = new Vector3()
  const corner = new Vector3()
  let box = null
  /** Where label `i` points: the cup's surface at its height, on the screen side the label sits. */
  function anchor(i) {
    const side = i % 2 === 0 ? 1 : -1
    const share = labels > 1 ? 0.86 - (0.74 * i) / (labels - 1) : 0.6
    point.set(
      (box.min.x + box.max.x) / 2,
      box.min.y + share * (box.max.y - box.min.y),
      (box.min.z + box.max.z) / 2
    )
    holder.localToWorld(point)
    origin.copy(point).addScaledVector(right, side * radius * 4 * mover.scale.x)
    toAxis.copy(right).multiplyScalar(-side)
    ray.set(origin, toAxis)
    const hit = ray.intersectObject(holder, true)[0]
    return (hit ? hit.point : point).project(camera)
  }
  function writeAnchors() {
    const w = stage.clientWidth
    const h = stage.clientHeight
    const px = (v) => [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]
    const [cx, cy] = px(mover.position.clone().project(camera))
    stage.style.setProperty('--cup-cx', `${cx.toFixed(1)}px`)
    stage.style.setProperty('--cup-cy', `${cy.toFixed(1)}px`)
    if (!box || !(pose?.labels > 0.01)) return
    // The object's screen edges: a label's line runs at least that far, so its text starts clear of
    // anything wider than the point it names (a jug's handle, a cup lying down).
    let [left, right] = [Infinity, -Infinity]
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const [sx] = px(holder.localToWorld(corner.set(x, y, z)).project(camera))
          left = Math.min(left, sx)
          right = Math.max(right, sx)
        }
    stage.style.setProperty('--cup-l', `${left.toFixed(1)}px`)
    stage.style.setProperty('--cup-r', `${right.toFixed(1)}px`)
    for (let i = 0; i < labels; i++) {
      const [x, y] = px(anchor(i))
      stage.style.setProperty(`--anchor-${i}-x`, `${x.toFixed(1)}px`)
      stage.style.setProperty(`--anchor-${i}-y`, `${y.toFixed(1)}px`)
    }
  }

  // The machine's bounds in its world (`brew-scene.mjs`): body, steam wand and drip tray; the cup's spot on the tray
  // (`cupAt`, it slides out late in the shot) widens them where it stands.
  const MACHINE = [
    [-0.17, 0.17],
    [0.04, 0.5],
    [-0.22, 0.3]
  ]
  const cupAt = { x: 0, z: DIM.zg }
  const eye = new PerspectiveCamera(FOV, 1, 0.01, 100)
  const shift = new Matrix4()
  const local = new Vector3()
  const posed = new Vector3()
  const turned = new Quaternion()
  const onTray = new Quaternion()
  const yAxis = new Vector3(0, 1, 0)
  const unused = new Vector3()
  /**
   * The brewing scene at progress `q` (`brew-shot.mjs`): its world in front of the camera as the shot's camera sees
   * it (framed in the screen under the header, `frame`), the cup on the drip tray, then flown into the pose the rig
   * already holds (section 1's) over the shot's last tenth. Nothing when the page has no brewing scene.
   */
  function brewPlace(q, frame) {
    brewDrawn = brew ? q : 1
    if (caption) {
      const s = q < 1 ? shotAt(q) : null
      if (caption.textContent !== (s?.caption ?? '')) caption.textContent = s?.caption ?? ''
      caption.style.opacity = s?.caption ? s.captionA.toFixed(3) : '0'
    }
    if (!brew) return null
    brew.root.visible = q < 1
    floorMaterial.opacity = 0.22
    if (q >= 1) return null
    const s = shotAt(q)
    const c = s.cam
    const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2))
    const fit = camera.aspect < 1 ? c.fitWPortrait : c.fitW
    // a portrait window wider than a phone (a tablet) keeps a phone's framing in its height: framed by its width the
    // machine grows into the corner where the first frame's menu sheet hangs
    const aspect = camera.aspect < 1 ? Math.min(camera.aspect, PHONE) : camera.aspect
    const d = Math.max(c.dist * LENS, fit / (2 * tanHalf * aspect))
    const az = MathUtils.degToRad(c.az)
    const el = MathUtils.degToRad(c.el)
    eye.position.set(
      c.tx + d * Math.sin(az) * Math.cos(el),
      c.ty + d * Math.sin(el),
      c.tz + d * Math.cos(az) * Math.cos(el)
    )
    eye.lookAt(c.tx, c.ty, c.tz)
    eye.updateMatrixWorld()
    // world -> the shot camera's view -> moved down `frame` px -> this camera's world
    const down = (frame * 2 * d * tanHalf) / (stage.clientHeight || 1)
    brew.root.matrix
      .copy(camera.matrixWorld)
      .multiply(shift.makeTranslation(0, -down, 0))
      .multiply(eye.matrixWorldInverse)
    brew.root.matrixWorldNeedsUpdate = true
    // the cup on the tray: drawn `cupH` tall (an owner's wider object smaller, as everywhere), turned to the camera
    const drawn = fitHeight(DIM.cupH, fittedBox)
    const cx = s.cupSlide * DIM.slide[0]
    const cz = DIM.zg + s.cupSlide * DIM.slide[1]
    cupAt.x = cx
    cupAt.z = cz
    brew.update(s, DIM.trayTop + drawn * (inside ? inside.level(s.fill) : 1), { x: cx, z: cz })
    brew.root.matrix.decompose(unused, onTray, unused)
    onTray.multiply(turned.setFromAxisAngle(yAxis, BREW_TURN))
    local.set(cx, DIM.trayTop + drawn / 2, cz).applyMatrix4(brew.root.matrix)
    const k = s.fly
    posed.copy(mover.position)
    mover.position.lerpVectors(local, posed, k)
    mover.scale.setScalar(MathUtils.lerp(drawn / height, mover.scale.x, k))
    spinner.quaternion.slerpQuaternions(onTray, spinner.quaternion.clone(), k)
    floorMaterial.opacity = 0.22 * k
    return s
  }

  function tick(now) {
    raf = 0
    if (!pose) return
    const intro = easeOutExpo(Math.min(1, (now - introStart) / 1600))
    place(pose, intro)
    // The pose's `sway` dies away as the cup lands in the card (`home-scroll.mjs`): there it stands still.
    spinner.rotation.y += intro * SWAY * (pose.sway ?? 1) * Math.sin(((now - swayStart) / 1000) * 0.55)
    const shot = brewPlace(pose.brew ?? 1, pose.frame ?? 0)
    if (inside) inside.set((clear = round(pose.clear ?? 0)), now, shot)
    renderer.render(scene, camera)
    writeAnchors()
    const m = JSON.stringify({
      x: round(pose.x),
      y: round(pose.y),
      h: round(pose.h),
      tilt: round(pose.tilt),
      turn: round(pose.turn)
    })
    if (m !== motion) stage.dataset.cupMotion = motion = m
    if (visible && !dead) raf = requestAnimationFrame(tick)
  }
  function wake() {
    if (!raf && visible && ready && !dead) raf = requestAnimationFrame(tick)
  }

  const draco = new DRACOLoader().setDecoderPath('/decoders/draco/')
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco)
  loader.load(
    src,
    (gltf) => {
      draco.dispose()
      if (dead) return
      const model = gltf.scene
      model.traverse((o) => {
        if (o.isMesh) o.castShadow = !narrow
      })
      if (name !== undefined && printName(model, name)) {
        stage.dataset.cupName = name.trim()
        inside = buildInside(model)
      }
      // Fit any object: measure its box, centre it on the floor's middle, stand it on the floor,
      // scale its longest side to one unit. The file is never trusted to be placed right.
      model.updateMatrixWorld(true)
      const raw = new Box3().setFromObject(model)
      const size = raw.getSize(new Vector3())
      const longest = Math.max(size.x, size.y, size.z)
      if (!(longest > 0) || !Number.isFinite(longest)) return fail()
      const centre = raw.getCenter(new Vector3())
      model.position.sub(new Vector3(centre.x, raw.min.y, centre.z))
      holder.scale.setScalar(1 / longest)
      holder.add(model)
      holder.updateMatrixWorld(true)
      const fitted = new Box3().setFromObject(holder)
      const fittedSize = fitted.getSize(new Vector3())
      const fittedCentre = fitted.getCenter(new Vector3())
      stage.dataset.cupPose = JSON.stringify({
        centre: [round(fittedCentre.x), round(fittedCentre.z)],
        floor: round(fitted.min.y),
        size: [round(fittedSize.x), round(fittedSize.y), round(fittedSize.z)],
        view: 'front'
      })
      // The rig turns and leans the cup about its middle; the floor stays under its foot.
      height = fittedSize.y
      fittedBox = { x: fittedSize.x, y: fittedSize.y, z: fittedSize.z }
      centring.position.y = -fittedCentre.y
      floor.position.y = -fittedSize.y / 2
      box = fitted.clone().applyMatrix4(holder.matrix.clone().invert()) // in the holder's own units
      radius = fitted.getBoundingSphere(new Sphere()).radius
      // High and in front: the shadow falls short and behind the cup, never out under the text beside it.
      key.position.set(radius, radius * 8, radius * 3)
      rim.position.set(-radius * 3, radius * 2, -radius * 4)
      Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.01, far: 20 })
      layout()
      const reveal = () => {
        if (dead) return
        ready = true
        swayStart = performance.now()
        introStart = still ? -Infinity : swayStart
        stage.classList.add('is-ready')
        wake()
      }
      renderer.compileAsync(scene, camera).then(reveal, reveal)
    },
    undefined,
    () => {
      draco.dispose()
      fail()
    }
  )

  new ResizeObserver(layout).observe(stage)
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    wake()
  }).observe(stage)
  return api
}
