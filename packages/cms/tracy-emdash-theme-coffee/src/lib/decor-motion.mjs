// The coffee tools (`Decor.astro`) come alive: each flies in the first time its corner scrolls into view,
// then floats (a slow drift up and down, a few degrees of turn), drifts a little against the scroll,
// steps aside from a mouse that comes near, and reacts to a click or a tap (beans burst out and drift
// back, a machine puffs steam, a kettle tips as if pouring, a table rocks). After the coffee sample's
// flying beans (`research-261029-bon-mau-scrolltide-trang-va-cuon.md`, TCH plans). A reader who turned
// motion off gets none of it: the tools stand still and take no pointer, as `Decor.astro` draws them.
//
// Every move stays within `REACH` px (and `REACH_TURN` degrees) of where the page places the tool, so a
// tool placed `REACH` clear of the text, the buttons and the cup never crosses them;
// `tests/browser/cup-stage.mjs` measures the placed boxes grown by that much.

/** Float: px up and down, degrees either way. */
const DRIFT = 6
const TURN = 3
/** Px a tool drifts against the scroll, at most, between the top and the bottom of the window. */
const PARALLAX = 10
/** A mouse nearer than `NEAR` px pushes the tool up to `DODGE` px away and leans it up to `LEAN` degrees. */
const NEAR = 180
const DODGE = 8
const LEAN = 3
/** How far, at most, a tool moves from where the page places it. */
export const REACH = DRIFT + PARALLAX + DODGE
export const REACH_TURN = TURN + LEAN
const FLY_MS = 900

/** The reaction of each tool to a click, by its name (`data-decor`). */
const REACTIONS = {
  beans: 'burst',
  spoon: 'burst',
  'green-beans': 'burst',
  'roasted-beans': 'burst',
  espresso: 'steam',
  moka: 'steam',
  roaster: 'steam',
  kettle: 'pour',
  pour: 'pour',
  'table-cup': 'rock'
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

/**
 * Something drawn for a moment beside a tool (a bean, a puff of steam): in the tool's own box, never
 * under the pointer, skipped by screen readers, gone when its animation ends.
 */
function spark(tool, make) {
  const el = make()
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', zIndex: '0' })
  tool.parentElement.append(el)
  return el
}

/** @param {HTMLImageElement} tool */
function react(tool) {
  const kind = REACTIONS[tool.dataset.decor] ?? 'rock'
  const x = tool.offsetLeft + tool.offsetWidth / 2
  const y = tool.offsetTop + tool.offsetHeight / 2
  if (kind === 'burst') {
    tool.animate({ scale: [1, 0.9, 1.08, 1] }, { duration: 520, easing: 'ease-out' })
    const size = Math.max(18, tool.offsetWidth * 0.22)
    for (let i = 0; i < 9; i++) {
      const bean = spark(tool, () =>
        Object.assign(new Image(), { src: tool.currentSrc || tool.src, alt: '' })
      )
      Object.assign(bean.style, {
        left: `${x - size / 2}px`,
        top: `${y - size / 2}px`,
        width: `${size}px`,
        height: 'auto'
      })
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5
      const r = tool.offsetWidth * (0.45 + Math.random() * 0.35)
      const out = `${Math.cos(a) * r}px ${Math.sin(a) * r}px`
      const turn = `${(Math.random() - 0.5) * 540}deg`
      bean
        .animate(
          [
            { translate: '0 0', rotate: '0deg', opacity: 0 },
            { translate: out, rotate: turn, opacity: 1, offset: 0.35 },
            { translate: out, rotate: turn, opacity: 1, offset: 0.55 },
            { translate: '0 0', rotate: '0deg', opacity: 0 }
          ],
          { duration: 1500 + i * 40, easing: 'cubic-bezier(.2,.7,.3,1)' }
        )
        .finished.then(
          () => bean.remove(),
          () => bean.remove()
        )
    }
  } else if (kind === 'steam') {
    tool.animate(
      { translate: ['0 0', '0 -6px', '0 0', '0 -3px', '0 0'] },
      { duration: 520, easing: 'ease-out' }
    )
    for (let i = 0; i < 4; i++) {
      const puff = spark(tool, () => document.createElement('span'))
      const s = tool.offsetWidth * 0.18
      Object.assign(puff.style, {
        left: `${x - s / 2 + (i - 1.5) * s * 0.4}px`,
        top: `${tool.offsetTop + tool.offsetHeight * 0.15}px`,
        width: `${s}px`,
        height: `${s}px`,
        borderRadius: '50%',
        background: 'color-mix(in srgb, var(--color-fg) 45%, transparent)',
        filter: `blur(${s * 0.25}px)`
      })
      puff
        .animate(
          [
            { translate: '0 0', scale: 0.4, opacity: 0 },
            { opacity: 0.8, offset: 0.25 },
            { translate: `${(i - 1.5) * 6}px ${-tool.offsetHeight * 0.45}px`, scale: 1.8, opacity: 0 }
          ],
          { duration: 1300, delay: i * 140, easing: 'ease-out', fill: 'backwards' }
        )
        .finished.then(
          () => puff.remove(),
          () => puff.remove()
        )
    }
  } else if (kind === 'pour') {
    tool.animate({ rotate: ['0deg', '-14deg', '-14deg', '0deg'] }, { duration: 1100, easing: 'ease-in-out' })
  } else {
    tool.animate({ rotate: ['0deg', '5deg', '-4deg', '2deg', '0deg'] }, { duration: 700, easing: 'ease-out' })
  }
}

/** @param {ParentNode} root */
export function liven(root = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const tools = [...root.querySelectorAll('img[data-decor]')].map((el, i) => ({
    el: /** @type {HTMLImageElement} */ (el),
    phase: i * 1.9,
    shown: 0, // when it started flying in; 0 = not yet
    seen: false,
    lift: 0,
    tx: 0, // the move last written, to read the placed box back from the drawn one
    ty: 0,
    dodge: { x: 0, y: 0, r: 0 },
    aim: { x: 0, y: 0, r: 0 }
  }))
  if (!tools.length) return
  let raf = 0
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tools.find((x) => x.el === e.target)
      if (!t) continue
      t.seen = e.isIntersecting
      if (t.seen && !t.shown) t.shown = performance.now()
    }
    wake()
  })
  for (const t of tools) {
    t.el.classList.add('is-live')
    t.el.style.opacity = '0'
    t.el.addEventListener('click', () => react(t.el))
    watch.observe(t.el)
  }
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      for (const t of tools) {
        if (!t.seen) continue
        const r = t.el.getBoundingClientRect()
        const dx = r.left + r.width / 2 - t.tx - e.clientX
        const dy = r.top + r.height / 2 - t.ty - e.clientY
        const far = Math.hypot(dx, dy) - Math.min(r.width, r.height) / 2
        const k = clamp(1 - far / NEAR, 0, 1)
        const d = Math.hypot(dx, dy) || 1
        t.aim = { x: (dx / d) * DODGE * k, y: (dy / d) * DODGE * k, r: Math.sign(dx) * LEAN * k }
      }
      wake()
    },
    { passive: true }
  )
  addEventListener('scroll', wake, { passive: true })

  function frame(now) {
    raf = 0
    const vh = innerHeight
    let busy = false
    for (const t of tools) {
      if (!t.seen || !t.shown) continue
      busy = true
      const fly = easeOutBack(clamp((now - t.shown) / FLY_MS, 0, 1))
      const r = t.el.getBoundingClientRect()
      const mid = r.top + r.height / 2 - t.ty
      t.lift = -PARALLAX * clamp((mid - vh / 2) / vh, -1, 1)
      for (const k of ['x', 'y', 'r']) t.dodge[k] += (t.aim[k] - t.dodge[k]) * 0.12
      const s = now / 1000 + t.phase
      const y = t.lift + DRIFT * Math.sin(s * 0.9) * fly + t.dodge.y + (1 - fly) * PARALLAX
      const turn = TURN * Math.sin(s * 0.6) + t.dodge.r - (1 - fly) * 12
      t.tx = t.dodge.x
      t.ty = y
      t.el.style.opacity = String(clamp(fly * 1.4, 0, 1))
      t.el.style.transform = `translate(${t.tx.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${turn.toFixed(2)}deg) scale(${(0.7 + 0.3 * Math.min(fly, 1)).toFixed(3)})`
    }
    if (busy) wake()
  }
}
