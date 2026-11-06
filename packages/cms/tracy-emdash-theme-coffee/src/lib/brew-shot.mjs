// The brewing scene before the home page's six sections: an espresso machine on a bar counter pulls a shot into the
// cup, the cup slides out, its lid drops on, and it flies into section 1's pose. Everything is a pure function of one
// number, the brewing progress `q` (0 the page top – 1 the cup landed in section 1, `home-scroll.mjs` `brewAt`), so
// scrolling back runs it backwards. This half runs in node (`tests/home-scroll.test.mjs`); `brew-scene.mjs` draws it.
// Written after the brewing sample built with the teardown kit (machine, cup and lid timings), with no kit code.
//
// Units are metres of the machine's world: Y up, +Z toward the viewer, the counter top at y = 0.

export const DIM = {
  trayTop: 0.05, // the drip tray's grille, where the cup stands
  zg: 0.06, // the group head's axis (z): the spouts and the cup sit on it
  spoutTip: 0.185,
  spoutX: 0.012,
  cupH: 0.1104, // the cup's drawn height in the machine's world (an owner's wider object is drawn smaller, `fitHeight`)
  full: 0.8, // the espresso's depth when the cup is full, as a share of the paper body's height
  slide: [0.08, 0.18], // where the full cup slides (x right, away from the handle; z toward the viewer)
  lidRise: 0.62 // the lid's height above its seat when it shows, as a share of the cup's height
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (x) => {
  const k = clamp01(x)
  return k * k * (3 - 2 * k)
}
const lerp = (a, b, k) => a + (b - a) * k

// Camera keys: [q, [tx, ty, tz, azimuth°, elevation°, distance, fit width, fit width on a portrait screen]], the
// distance for a 36° lens (`brew-scene.mjs` converts it). A cubic Hermite spline runs through them, so the camera
// never stops at a key while the reader keeps scrolling; the ends have zero speed.
const HOLD = [0.04, 0.15, 0.17, 22, 14, 0.66, 0.36, 0.34] // the cup slides out and the lid drops, the camera still
const KEYS = [
  // the body's right side shows at these turns: aimed a little right of the group head, so the machine sits centred
  [0.0, [0.03, 0.25, 0.06, 30, 12, 1.12, 0.62, 0.54]],
  [0.12, [0.02, 0.26, 0.05, 26, 12, 1.06, 0.6, 0.5]],
  [0.2, [0, 0.29, 0.03, 20, 10, 0.86, 0.46, 0.4]],
  [0.3, [0, 0.3, 0.04, 18, 9, 0.62, 0.38, 0.36]], // tank, pipe and the cup's mouth stay framed until here
  [0.36, [0, 0.28, 0.05, 18, 9, 0.5, 0.3, 0.4]], // close on the puck while the water presses through
  [0.45, [0, 0.19, 0.05, 22, 12, 0.5, 0.3, 0.44]], // a phone: wide enough for the whole boiler
  [0.65, [0, 0.165, 0.06, 26, 14, 0.48, 0.3, 0.44]],
  [0.75, HOLD],
  [0.9, HOLD],
  [1.0, HOLD]
]

function spline(q) {
  const n = KEYS.length
  if (q <= KEYS[0][0]) return KEYS[0][1].slice()
  if (q >= KEYS[n - 1][0]) return KEYS[n - 1][1].slice()
  let i = 0
  while (q > KEYS[i + 1][0]) i++
  const [t0, v0] = KEYS[i]
  const [t1, v1] = KEYS[i + 1]
  const dt = t1 - t0
  const k = (q - t0) / dt
  const slope = (j) =>
    j === 0 || j === n - 1
      ? v0.map(() => 0)
      : v0.map((_, c) => (KEYS[j + 1][1][c] - KEYS[j - 1][1][c]) / (KEYS[j + 1][0] - KEYS[j - 1][0]))
  const [m0, m1] = [slope(i), slope(i + 1)]
  const h00 = 2 * k ** 3 - 3 * k ** 2 + 1
  const h10 = k ** 3 - 2 * k ** 2 + k
  const h01 = -2 * k ** 3 + 3 * k ** 2
  const h11 = k ** 3 - k ** 2
  return v0.map((_, c) => h00 * v0[c] + h10 * dt * m0[c] + h01 * v1[c] + h11 * dt * m1[c])
}

// One drop: forms at the spout tip (radius grows, f = 0), then falls (f 0–1 of the way down).
function drop(q, t0, dur) {
  const k = (q - t0) / dur
  if (k < 0 || k > 1) return { f: -1, r: 0 }
  if (k < 0.4) return { f: 0, r: lerp(0.0008, 0.0028, k / 0.4) }
  const f = (k - 0.4) / 0.6
  return { f: f * f, r: 0.0028 }
}

/** The line under the scene at each stretch: fixed words about the brewing, not the shop's (no admin field). */
export const CAPTIONS = [
  [0.0, 'Scroll to pull a shot'],
  [0.12, 'Hot water leaves the boiler'],
  [0.3, 'It presses through the coffee'],
  [0.43, 'Espresso fills the cup'],
  [0.67, 'Flow stops'],
  [0.76, 'Cup out, lid on'],
  [0.9, '']
]

/**
 * Everything the brewing scene shows at progress `q`. `fly` (0–1) carries the cup from the drip tray into section 1's
 * pose over the last tenth while the machine, the counter and the wall fade (`machineVis`).
 * @param {number} q
 */
export function shotAt(q) {
  q = clamp01(q)
  const c = spline(q)
  const streamOn = q >= 0.43 && q <= 0.7
  const lk = clamp01((q - 0.82) / 0.06)
  let caption = ''
  for (const [t, s] of CAPTIONS) if (q >= t) caption = s
  return {
    q,
    cam: { tx: c[0], ty: c[1], tz: c[2], az: c[3], el: c[4], dist: c[5], fitW: c[6], fitWPortrait: c[7] },
    glass: smooth((q - 0.12) / 0.07) * (1 - smooth((q - 0.665) / 0.085)),
    machineVis: 1 - smooth((q - 0.9) / 0.07),
    waterFront: clamp01((q - 0.13) / 0.165),
    waterTail: clamp01((q - 0.665) / 0.05),
    waterScroll: q * 14,
    showerA: smooth((q - 0.285) / 0.025) * (1 - smooth((q - 0.665) / 0.04)),
    puckWet: clamp01((q - 0.29) / 0.085),
    boilerGlow: smooth((q - 0.12) / 0.06) * (1 - smooth((q - 0.7) / 0.1)) * 0.3,
    streamOn,
    streamTop: streamOn ? smooth((q - 0.655) / 0.045) : 0,
    streamBot: streamOn ? smooth((q - 0.43) / 0.02) : 0,
    streamR: streamOn ? 0.0021 * clamp01((q - 0.43) / 0.02) * (1 - 0.7 * smooth((q - 0.64) / 0.06)) : 0,
    drops: [drop(q, 0.375, 0.03), drop(q, 0.395, 0.035), drop(q, 0.695, 0.03), drop(q, 0.72, 0.03)],
    fill: smooth((q - 0.425) / 0.245),
    cupSlide: smooth((q - 0.75) / 0.06),
    // the lid shows just above the slid-out cup, drops in 0.06 of q and settles with a small bounce
    lidUp:
      lk <= 0
        ? 1
        : lk >= 1
          ? 0
          : lk < 0.88
            ? 1 - (lk / 0.88) ** 2.2
            : 0.03 * Math.sin(((lk - 0.88) / 0.12) * Math.PI),
    lidA: smooth(lk / 0.15),
    // the paper body goes see-through while the level rises, so the reader sees it rise
    cupGhost: smooth((q - 0.36) / 0.05) * (1 - smooth((q - 0.68) / 0.05)),
    fly: smooth((q - 0.9) / 0.1),
    captionA: 1 - smooth((q - 0.86) / 0.04),
    caption
  }
}
