// The home page timeline: six sections scroll past a sticky stage, and the cup on the stage takes
// one pose per section. Written after the "Sticky cinematic stage" recipe of the MotionSites skill
// (a runway with a `position: sticky` stage, the scroll read in pixels and smoothed, a window per
// section), with no animation library.
//
// The pure half (`poseAt`, `sectionAt`) runs in node (`tests/home-scroll.test.mjs`); `driveHome`
// is the browser half that feeds it the page's measurements on every scroll.

/**
 * A pose, in pixels of the stage: `x`, `y` move the middle of the cup from the middle of the stage
 * (y down), `h` is the height of the upright cup on screen; `tilt` leans it in the screen plane and
 * `turn` spins it about its own axis (radians, 0 = front); `glow` and `labels` fade the halo behind
 * the cup and the labels pointing at it (0–1); `sway` scales the scene's idle turn (1 in sections 1–4, 0 in the
 * card: a cup that has landed stands still in it, like a picture printed on the card); `clear` turns the default
 * cup's paper body to frosted glass showing the coffee inside (1 in section 4 only, `cup-scene.mjs`); `brew` is the
 * progress of the brewing scene above section 1 (`brew-shot.mjs`: 0 the page top, 1 done, and 1 in every section),
 * where `frame` (brewing only) is how far below the stage's middle the middle of the screen under the header is.
 * @typedef {{ x: number, y: number, h: number, tilt: number, turn: number, glow: number, labels: number, sway: number, clear: number, brew: number, frame?: number }} Pose
 */

const TAU = Math.PI * 2
/** Below this window width the text sits under the cup instead of beside it (`cup-scene.mjs` NARROW too). */
export const NARROW = 768
/** From `NARROW` to here the text still sits beside the cup but there is little room: the cup is drawn smaller. */
export const MID = 1100
/** Height of the cup in the default still image, as a share of the image side (`tools/capture-default-still.mjs`). */
export const STILL_SHARE = 0.62
/** The default cup is about this wide for its height; no object is drawn wider than a cup of its pose would be. */
export const CUP_ASPECT = 0.76

/**
 * The height an object of fitted size `size` takes on screen at pose height `h`: `h` itself, or less
 * when the object is wider than a cup, so a wide object (a jug, a cup lying on its side) takes the
 * footprint the default cup takes and the labels beside it keep their room.
 * @param {number} h the pose height, in stage pixels
 * @param {{ x: number, y: number, z: number }} size the object's fitted size in any one unit
 */
export function fitHeight(h, size) {
  const wide = Math.max(size.x, size.z)
  return wide > CUP_ASPECT * size.y ? (h * CUP_ASPECT * size.y) / wide : h
}

// Sections 1–4 as shares of the stage (x of its width, y and h of its height); 5 and 6 take the dock.
// 1 leans in front of the shop name · 2 stands up and turns half a round · 3 stands in the middle of
// the four reasons · 4 is the close-up with the halo, the labels and the coffee seen through the cup.
const WIDE = [
  { x: 0, y: 0, h: 0.54, tilt: -0.2, turn: 0.35, glow: 0, labels: 0, sway: 1, clear: 0 },
  { x: 0, y: 0.02, h: 0.56, tilt: 0, turn: 0.35 + Math.PI, glow: 0, labels: 0, sway: 1, clear: 0 },
  { x: 0, y: 0.02, h: 0.5, tilt: 0, turn: TAU, glow: 0, labels: 0, sway: 1, clear: 0 },
  { x: 0, y: 0.03, h: 0.8, tilt: 0, turn: TAU + 0.3, glow: 1, labels: 1, sway: 1, clear: 1 }
]
const NARROW_POSES = [
  { ...WIDE[0], y: 0.04, h: 0.38 },
  { ...WIDE[1], y: -0.2, h: 0.32 },
  { ...WIDE[2], y: -0.22, h: 0.3 },
  { ...WIDE[3], y: -0.18, h: 0.42 }
]
// The leaning cup of section 1 as drawn, with its shadow, in pose heights: FIRST_DRAWN tall, FIRST_BELOW of
// it under the pose's middle; FIRST_GAP px kept free above and below it. Measured on the default cup: an
// owner's object of another shape may come a few pixels closer to the invitation.
const FIRST_DRAWN = 1.08
const FIRST_BELOW = 0.56
const FIRST_GAP = 12
/** The six sections; `null` is "in the dock". */
export const POSES = [...WIDE, null, null]

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smoothstep = (e0, e1, v) => {
  const t = clamp((v - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const mix = (a, b, t) => {
  const out = {}
  for (const k of Object.keys(a)) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

/**
 * The pose of one section on a stage of `view` size; a docked section takes `dock` (the first
 * featured card, in stage pixels), or shrinks to nothing when the page has none.
 * @param {number} n section number 1–6
 * @param {{ width: number, height: number, top?: number, lift?: number, under?: number, roof?: number }} view `top`: the
 *   site header's height above section 1 · `lift`: how far below the window's top the stage starts when section 1
 *   sits under the header (`top` when section 1 opens the page, 0 under the brewing scene, the stage stuck to the
 *   top) · `under`: how far above the bottom of section 1 its invitation starts · `roof`: how far below the top of
 *   section 1 the shop name ends
 * @param {{ x: number, y: number, h: number } | null} dock
 * @returns {Pose}
 */
function sectionPose(n, view, dock) {
  if (n >= 5)
    return {
      x: dock?.x ?? 0,
      y: dock?.y ?? 0,
      h: dock?.h ?? 0,
      tilt: 0,
      turn: TAU,
      glow: 0,
      labels: 0,
      sway: 0,
      clear: 0,
      brew: 1
    }
  const p = (view.width < NARROW ? NARROW_POSES : WIDE)[n - 1]
  // Section 1 is the first screen under the site header (`view.top` high): the cup is placed in
  // that screen, as on a window that much shorter.
  const top = n === 1 ? (view.top ?? 0) : 0
  const height = view.height - top
  // A cup is about 0.76 times as wide as tall: on a tall, thin screen the width bounds it.
  let h = Math.min(p.h * height, view.width * 1.05)
  // In a mid-width window the text columns of 2 and 3 leave 0.4 of the width for the cup, and the
  // labels of 4 need the sides: the cup takes what is left (it is about 0.76 times as wide as tall).
  // In 1 the shop name, as wide as the window, must still show either side of the cup.
  if (view.width >= NARROW && view.width < MID)
    h = Math.min(h, view.width * (n === 4 ? 0.6 : n === 1 ? 0.5 : 0.45))
  // The middle of the cup, from the top of that screen.
  let mid = height / 2 + p.y * height
  // The invitation (`view.under` px above the bottom of section 1) stays clear of the leaning cup, and
  // on a narrow screen, where the cup stands under the shop name, so does the name (its bottom
  // `view.roof` px below the top of section 1): the cup moves, and shrinks only when the room is short.
  const room = n === 1 && view.under ? height - view.under : 0
  if (room) {
    const roof = view.width < NARROW ? (view.roof ?? 0) : 0
    h = Math.min(h, (room - roof - 2 * FIRST_GAP) / FIRST_DRAWN)
    mid = Math.min(mid, room - FIRST_GAP - FIRST_BELOW * h)
    mid = Math.max(mid, roof + FIRST_GAP + (FIRST_DRAWN - FIRST_BELOW) * h)
  }
  const lift = n === 1 ? (view.lift ?? top) : 0
  return { ...p, x: p.x * view.width, y: mid - height / 2 + top / 2 - lift, h, brew: 1 }
}

/**
 * The brewing scene's progress at `scroll` (`brew-shot.mjs`): 0 at the page top, 0.9 at `brew.fly` (the brewing
 * screens scrolled past, section 1 coming up), 1 at `brew.end` (section 1 just under the header).
 * @param {number} scroll
 * @param {{ fly: number, end: number }} brew
 */
export function brewAt(scroll, brew) {
  if (scroll <= brew.fly) return 0.9 * clamp(scroll / brew.fly)
  return 0.9 + 0.1 * clamp((scroll - brew.fly) / (brew.end - brew.fly))
}

/**
 * The section the reader is in: the one whose middle is nearest the middle of the window.
 * @param {number} scroll the page scroll, in pixels
 * @param {number[]} centres for each section, the scroll at which its middle is the window's middle
 */
export function sectionAt(scroll, centres) {
  let n = 1
  while (n < centres.length && scroll >= (centres[n - 1] + centres[n]) / 2) n++
  return n
}

/**
 * The cup's pose at `scroll`: held still around the middle of each section, moving smoothly
 * between two. The same scroll always gives the same pose, so scrolling back returns the cup to
 * where it was.
 * @param {number} scroll
 * @param {number[]} centres see `sectionAt`
 * @param {{ width: number, height: number, top?: number, lift?: number, under?: number, roof?: number }} view see `sectionPose`
 * @param {{ x: number, y: number, h: number } | null} dock
 * @param {{ fly: number, end: number } | null} [brew] the brewing scene above section 1, when the page shows it
 *   (`brewAt`): until `brew.end` the cup is in it, bound for section 1's pose
 * @returns {Pose}
 */
export function poseAt(scroll, centres, view, dock, brew = null) {
  if (brew && scroll < brew.end) {
    // The stage is at the runway's top, stuck to the window's once the runway reaches it: the middle of the screen
    // left under the header is `frame` px below the stage's middle (above it while the stage is not yet stuck).
    const top = view.top ?? 0
    const frame = top / 2 - Math.max(0, top - scroll)
    return { ...sectionPose(1, view, dock), brew: brewAt(scroll, brew), frame }
  }
  let i = 0
  while (i < centres.length - 1 && scroll >= centres[i + 1]) i++
  const from = sectionPose(i + 1, view, dock)
  if (i === centres.length - 1 || scroll <= centres[i]) return from
  const t = smoothstep(0.25, 0.75, (scroll - centres[i]) / (centres[i + 1] - centres[i]))
  return t === 0 ? from : mix(from, sectionPose(i + 2, view, dock), t)
}

/**
 * Run the timeline on a page: measure the sections and the dock, smooth the scroll (lerp 0.14, as
 * the recipe) while a scene draws the cup, and write the section on the stage (`data-cup-section`,
 * read by CSS, the browser test and the acceptance scripts) and, above section 1, the brewing progress
 * (`data-cup-brew`, 0–1, gone once the cup has landed; the brewing block is `[data-brew]`). The scene, when there is one, is
 * `stage.cupScene` (`cup-scene.mjs`): it gets the pose on every frame. Without it the scroll is not
 * smoothed (nothing moves but the text) and the still image is placed where the cup stands in
 * section 1; under 1100 px it follows the cup's place and size in each section instead (from 768 px, in section 4, also stepping right clear of the labels).
 * @param {HTMLElement} runway the element holding the stage and the `[data-section]` blocks
 * @param {HTMLElement} stage
 */
export function driveHome(runway, stage) {
  const sections = [...runway.querySelectorAll('[data-section]')]
  const dockEl = runway.querySelector('[data-cup-dock]')
  const floor = runway.querySelector('[data-cup-floor]')
  const roof = runway.querySelector('[data-cup-roof]')
  const brewEl = runway.querySelector('[data-brew]')
  let smooth = null
  let stepped = null
  let pending = false

  function update() {
    const scene = stage.cupScene
    const target = window.scrollY
    // One smoothing step per frame, however often this runs in it (the scroll event and the frame callback).
    const now = document.timeline?.currentTime ?? performance.now()
    if (smooth === null || !scene) smooth = target
    else if (now !== stepped) smooth += (target - smooth) * 0.14
    stepped = now
    if (Math.abs(smooth - target) < 0.5) smooth = target
    const vh = window.innerHeight
    const centres = sections.map((s) => {
      const r = s.getBoundingClientRect()
      return r.top + target + r.height / 2 - vh / 2
    })
    const sr = stage.getBoundingClientRect()
    const top = runway.getBoundingClientRect().top + target
    // The brewing scene, when the page shows it (the 3D route, `CupStage.astro`): its screens end where section 1
    // comes up from the window's bottom, and the cup lands in section 1 as it sits just under the header.
    const b = brewEl?.getBoundingClientRect()
    const brew = b?.height
      ? { fly: b.bottom + target - vh, end: sections[0].getBoundingClientRect().top + target - top }
      : null
    const view = {
      width: sr.width,
      height: sr.height,
      top,
      lift: brew ? 0 : top,
      under: floor ? sections[0].getBoundingClientRect().bottom - floor.getBoundingClientRect().top : 0,
      roof: roof ? roof.getBoundingClientRect().bottom - sections[0].getBoundingClientRect().top : 0
    }
    const d = dockEl?.getBoundingClientRect()
    // The dock where the card is now, not where the smoothed scroll would put it: the smoothing only
    // paces the flight in, so once the cup has landed it sits on the card in every frame, like a
    // picture printed on it, and goes off the screen with it in section 6.
    const dock = d?.height
      ? {
          x: d.left + d.width / 2 - (sr.left + sr.width / 2),
          y: d.top + d.height / 2 - (sr.top + sr.height / 2),
          h: d.height * 0.84
        }
      : null
    const section = String(sectionAt(smooth, centres))
    if (stage.dataset.cupSection !== section) stage.dataset.cupSection = section
    const first = sectionPose(1, view, dock)
    const capture = /** @type {any} */ (window).__cupCapture === true
    let pose = poseAt(smooth, centres, view, dock, capture ? null : brew)
    // `tools/capture-default-still.mjs`: the section 1 pose, centred, at the still image's share.
    if (capture) pose = { ...first, x: 0, y: 0, h: STILL_SHARE * Math.min(view.width, view.height) }
    // The still stays where the cup stands in section 1. Where the text sits under the cup (< 768) or
    // the room beside it is small (< 1100) it follows the cup's place and size in each section;
    // in the mid-width close-up it also steps right, clear of the label list the still route prints.
    const mid = view.width < MID
    const at = mid
      ? { ...pose, x: pose.x + (view.width < NARROW ? 0 : pose.labels * 0.2 * view.width) }
      : first
    stage.style.setProperty('--still-x', `${at.x}px`)
    stage.style.setProperty('--still-y', `${at.y}px`)
    stage.style.setProperty('--still-side', `${at.h / STILL_SHARE}px`)
    const brewing = pose.brew < 1 ? pose.brew.toFixed(4) : undefined
    if (stage.dataset.cupBrew !== brewing) {
      if (brewing === undefined) delete stage.dataset.cupBrew
      else stage.dataset.cupBrew = brewing
    }
    stage.style.setProperty('--glow', pose.glow.toFixed(3))
    stage.style.setProperty('--labels', pose.labels.toFixed(3))
    scene?.setPose(pose)
    if (smooth !== target) tick()
  }
  function frame() {
    pending = false
    update()
  }
  function tick() {
    if (!pending) {
      pending = true
      requestAnimationFrame(frame)
    }
  }
  // The pose is set in the scroll event itself: it fires before this frame's animation callbacks, so the
  // scene draws the cup where the card is in the same frame (from a callback of its own, queued after
  // the scene's, it would always draw the frame before and trail the card by one scroll step).
  addEventListener('scroll', update, { passive: true })
  addEventListener('resize', tick)
  new ResizeObserver(tick).observe(runway)
  stage.addEventListener('cup:scene', tick)
  tick()
}
