// The home page timeline: which section the reader is in and the pose the cup takes there, as a pure function of
// the scroll position (`src/lib/home-scroll.mjs`). The browser half (the scene really turning) is
// `tests/browser/cup-stage.mjs`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { shotAt } from '../src/lib/brew-shot.mjs'
import { CUP_ASPECT, POSES, fitHeight, poseAt, sectionAt } from '../src/lib/home-scroll.mjs'

// Six sections one screen tall, the first starting under a 64 px header, on a 1440 × 900 window.
const VIEW = { width: 1440, height: 900 }
const centres = [0, 1, 2, 3, 4, 5].map((i) => 64 + i * 900)
const dock = { x: -300, y: 120, h: 180 }
const at = (y) => poseAt(y, centres, VIEW, dock)

test('the section is the one whose middle is nearest the middle of the window', () => {
  assert.equal(sectionAt(0, centres), 1)
  assert.equal(sectionAt(centres[1], centres), 2)
  assert.equal(sectionAt(centres[3] + 400, centres), 4)
  assert.equal(sectionAt(centres[3] + 500, centres), 5)
  assert.equal(sectionAt(99999, centres), 6)
})

test('six sections, six poses, in the order of the story', () => {
  const home = readFileSync(new URL('../src/views/Home.astro', import.meta.url), 'utf8')
  assert.equal(POSES.length, home.match(/data-section="\d+"/g).length, 'one pose for each section of the home page')
  const [one, two, three, four] = [1, 2, 3, 4].map((n) => at(centres[n - 1]))
  assert.notEqual(one.tilt, 0, 'section 1 leans')
  assert.equal(two.tilt, 0, 'section 2 stands up')
  assert.ok(Math.abs(two.turn - one.turn - Math.PI) < 1e-9, 'section 2 turns half a round from section 1')
  assert.ok(four.h > three.h * 1.3, 'section 4 is the close-up')
  assert.equal(four.glow, 1)
  assert.equal(four.labels, 1)
  assert.equal(one.glow, 0)
})

test('in sections 5 and 6 the cup sits in the dock (the first featured card)', () => {
  for (const n of [5, 6]) {
    const p = at(centres[n - 1])
    assert.deepEqual([p.x, p.y, p.h], [dock.x, dock.y, dock.h], `section ${n}`)
  }
})

test('the idle sway runs in sections 1–4 and dies away as the cup lands in the card', () => {
  for (const n of [1, 2, 3, 4]) assert.equal(at(centres[n - 1]).sway, 1, `section ${n} sways`)
  for (const n of [5, 6]) assert.equal(at(centres[n - 1]).sway, 0, `section ${n} holds still`)
  const landing = at((centres[3] + centres[4]) / 2).sway
  assert.ok(landing > 0 && landing < 1, 'half-way into the card, half the sway')
})

test('the default cup turns see-through in section 4 only, and clouds over again on either side', () => {
  for (const n of [1, 2, 3, 5, 6]) assert.equal(at(centres[n - 1]).clear, 0, `section ${n} is paper`)
  assert.equal(at(centres[3]).clear, 1, 'section 4 shows the coffee inside')
  for (const y of [(centres[2] + centres[3]) / 2, (centres[3] + centres[4]) / 2]) {
    const c = at(y).clear
    assert.ok(c > 0 && c < 1, 'half-way to or from section 4, half clear')
  }
  assert.equal(
    poseAt(centres[3], centres, { width: 390, height: 844 }, dock).clear,
    1,
    'a phone sees inside too'
  )
})

test('on a tablet held upright the first cup leaves the shop name showing either side', () => {
  const view = { width: 768, height: 1024 }
  assert.ok(
    poseAt(centres[0], centres, view, dock).h <= view.width * 0.5,
    'section 1 at most half the width tall'
  )
})

test('under an 81 px header the first cup is placed in the screen left below it, and the others are not moved', () => {
  const view = { ...VIEW, top: 81 }
  const first = poseAt(0, centres, view, dock)
  assert.equal(first.y, -40.5, 'centred in the 819 px under the header')
  assert.equal(first.h, POSES[0].h * 819)
  assert.deepEqual(
    poseAt(centres[2], centres, view, dock),
    at(centres[2]),
    'section 3 as on a window with no header'
  )
})

test('on a short window the first cup moves up, then shrinks, to stay clear of the invitation under it', () => {
  const tall = poseAt(0, centres, { width: 1440, height: 1080, top: 81, under: 176 }, dock)
  assert.equal(tall.h, POSES[0].h * 999, 'room enough: the usual size')
  for (const height of [900, 768, 500]) {
    const view = { width: 1440, height, top: 81, under: 176 }
    const p = poseAt(0, centres, view, dock)
    const fromTop = view.height / 2 + p.y // the middle of the cup, from the top of the stage
    const room = height - 81 - 176
    assert.ok(
      fromTop + 0.56 * p.h <= room - 12 + 1e-9,
      `${height}: the drawn cup ends 12 px above the invitation`
    )
    assert.ok(fromTop - 0.52 * p.h >= 12 - 1e-9, `${height}: and starts below the header`)
  }
  assert.equal(
    poseAt(0, centres, { width: 1440, height: 768, top: 81, under: 176 }, dock).h,
    POSES[0].h * 687,
    '768: moved, not shrunk'
  )
  assert.ok(
    poseAt(0, centres, { width: 1440, height: 500, top: 81, under: 176 }, dock).h < POSES[0].h * 419,
    '500: shrunk'
  )
})

test('on a phone the first cup stands between the shop name and the invitation', () => {
  const view = { width: 360, height: 780, top: 81, under: 168, roof: 246 }
  const p = poseAt(0, centres, view, dock)
  const fromTop = view.height / 2 + p.y
  assert.ok(fromTop - 0.52 * p.h >= 246 + 12 - 1e-9, 'under the name')
  assert.ok(fromTop + 0.56 * p.h <= 780 - 81 - 168 - 12 + 1e-9, 'above the invitation')
  const wide = poseAt(0, centres, { width: 1440, height: 900, top: 81, under: 176, roof: 500 }, dock)
  assert.deepEqual(
    wide,
    poseAt(0, centres, { width: 1440, height: 900, top: 81, under: 176 }, dock),
    'a wide cup leans in front of the name'
  )
})

test('scrolling back gives back the same pose', () => {
  const ys = [0, 300, 1200, 2500, 3300, 4100]
  const down = ys.map(at)
  const up = [...ys].reverse().map(at).reverse()
  assert.deepEqual(up, down)
})

test('between two sections the pose moves continuously, held still around each middle', () => {
  const a = at(centres[0])
  assert.deepEqual(at(centres[0] + 100), a, 'held near the middle of section 1')
  const mid = at((centres[0] + centres[1]) / 2)
  const b = at(centres[1])
  assert.ok(mid.turn > a.turn && mid.turn < b.turn, 'half-way between, half-turned')
})

test('a narrow window keeps the cup above the text', () => {
  const narrow = poseAt(centres[1], centres, { width: 390, height: 844 }, dock)
  const wide = at(centres[1])
  assert.ok(narrow.y < 0, 'raised')
  assert.ok(narrow.h < wide.h)
})

test('an object wider than a cup is drawn at the cup footprint, any other keeps its pose height', () => {
  // the default cup (fitted 0.7547 x 1 x 0.7547) and a vase: the pose height stands
  assert.equal(fitHeight(720, { x: 0.7547, y: 1, z: 0.7547 }), 720)
  assert.equal(fitHeight(720, { x: 0.5, y: 1, z: 0.5 }), 720)
  // the cup lying on its side and the milk jug: the widest side on screen is a cup's
  for (const size of [
    { x: 1, y: 0.7547, z: 0.7547 },
    { x: 1, y: 0.7675, z: 0.6085 }
  ]) {
    const h = fitHeight(720, size)
    assert.ok(h < 720)
    assert.ok(Math.abs((h / size.y) * Math.max(size.x, size.z) - CUP_ASPECT * 720) < 1e-6)
  }
  assert.ok(fitHeight(720, { x: 1, y: 0.1, z: 1 }) > 0)
})

// The brewing scene before section 1 (`brew-shot.mjs`): the first screens pull an espresso into the cup, then the
// cup flies into section 1's pose. `brew`: the scroll where the brewing ends and the flight starts (`fly`) and where
// the cup lands in section 1 (`end`, section 1 just under the header).
const BREW = { fly: 2700, end: 3519 }
const brewCentres = centres.map((c) => c + 3519 + 40.5)
const brewView = { ...VIEW, top: 81, lift: 0 }
const brewing = (y) => poseAt(y, brewCentres, brewView, dock, BREW)

test('the brewing scene comes first: the cup waits for section 1 while the shot runs, and is done from section 1 on', () => {
  assert.equal(brewing(0).brew, 0, 'the page opens on the machine')
  const mid = brewing(1350).brew
  assert.ok(mid > 0.4 && mid < 0.5, 'half-way down the brewing screens, half-way through the shot')
  assert.equal(brewing(BREW.fly).brew, 0.9, 'the flight takes the last tenth')
  assert.equal(brewing(BREW.end).brew, 1)
  for (const n of [1, 2, 3, 4, 5, 6]) assert.equal(brewing(brewCentres[n - 1]).brew, 1, `section ${n}`)
  for (const n of [1, 2, 3, 4, 5, 6])
    assert.equal(at(centres[n - 1]).brew, 1, `no brewing scene: section ${n}`)
  const first = brewing(BREW.end)
  for (const y of [0, 1350, BREW.fly]) {
    const { frame, ...p } = brewing(y)
    assert.deepEqual({ ...p, brew: 1 }, first, 'the pose the cup flies to is section 1')
    assert.equal(
      frame,
      y >= 81 ? 40.5 : 40.5 - (81 - y),
      'the brewing is framed in the screen under the header'
    )
  }
})

test('while the coffee runs the level only rises as the page scrolls down, and scrolling back runs it backwards', () => {
  let prev = -1
  for (let y = 0; y <= BREW.end; y += 5) {
    const s = shotAt(brewing(y).brew)
    assert.ok(s.fill >= prev - 1e-12, `the level drops at ${y}`)
    prev = s.fill
  }
  assert.equal(shotAt(0).fill, 0, 'an empty cup to start')
  assert.ok(shotAt(0.75).fill > 0.99, 'full before it slides out')
  const ys = [0, 600, 1300, 2100, 2800, 3400]
  assert.deepEqual(
    [...ys]
      .reverse()
      .map((y) => shotAt(brewing(y).brew))
      .reverse(),
    ys.map((y) => shotAt(brewing(y).brew))
  )
})

test('the lid is off only in the brewing scene: off under the spouts, dropped on once the cup slid out, on from section 1', () => {
  assert.equal(shotAt(0).lidUp, 1, 'no lid while the cup waits under the spouts')
  for (let i = 0; i <= 1000; i++) {
    const s = shotAt(i / 1000)
    if (s.cupSlide < 1e-9) assert.equal(s.lidUp, 1, `the lid comes down over the spouts at ${i / 1000}`)
    if (s.lidUp < 1) assert.ok(s.cupSlide > 0.999, `the lid moves before the cup is out at ${i / 1000}`)
  }
  assert.equal(shotAt(0.9).lidUp, 0, 'seated before the flight')
  for (const n of [1, 2, 3, 4, 5, 6])
    assert.equal(shotAt(brewing(brewCentres[n - 1]).brew).lidUp, 0, `section ${n}`)
})

test('the coffee streams are off at the start and the end of the brewing scene, and only run onto a still cup', () => {
  for (const q of [0, 0.9, 1]) {
    const s = shotAt(q)
    assert.equal(s.streamOn, false, `stream at ${q}`)
    assert.ok(
      s.drops.every((d) => d.f < 0),
      `drop at ${q}`
    )
  }
  let ran = false
  for (let i = 0; i <= 1000; i++) {
    const s = shotAt(i / 1000)
    ran ||= s.streamOn
    if (s.streamOn || s.drops.some((d) => d.f >= 0))
      assert.equal(s.cupSlide, 0, `coffee runs onto a moving cup at ${i / 1000}`)
  }
  assert.ok(ran, 'the coffee runs at some point')
})

test('with the brewing scene above it, section 1 sits under the header on a stage stuck to the window top', () => {
  const p = brewing(BREW.end)
  const old = poseAt(0, centres, { ...VIEW, top: 81 }, dock)
  assert.equal(p.y, old.y + 81, 'the stage starts 81 px higher, the cup stays where it was on the screen')
  assert.equal(p.h, old.h)
})
