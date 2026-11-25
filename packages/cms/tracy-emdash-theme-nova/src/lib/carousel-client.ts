/**
 * Small vanilla behaviours of the JA Nova blocks (the source uses Owl Carousel and Bootstrap collapse/tabs through jQuery; none of it is shipped).
 *
 *  - `[data-nv-car]`   an endless carousel (clients logos, team cards). The CSS owns the layout: it sets `--nv-n` (items in view) and `--nv-g`
 *                      (gap) per breakpoint on the root, and sizes every item from them, so with no script the first items are already in place and
 *                      nothing moves. The script reads those two properties, adds a full set of clones on each side, and moves the track.
 *                      `data-auto` = ms between steps (absent = no autoplay), `data-speed` = ms a step takes, `data-nv-car-id` names the root
 *                      so arrow buttons (`data-nv-car-go="<id>"`, value `next` or `prev`) move this carousel only.
 *  - `[data-nv-acc]`   an accordion group: each trigger (`[data-nv-acc-btn]`) toggles its own panel and closes the others of the same group.
 *  - `[data-nv-tabs]`  a tab group: buttons `[role=tab]` show their `[role=tabpanel]`.
 *
 * No word is printed here; every label is in the markup the server wrote.
 */

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function initCarousel(root: HTMLElement): void {
  const view = root.querySelector<HTMLElement>('.nv-car-view')
  const track = root.querySelector<HTMLElement>('.nv-car-track')
  if (!view || !track) return
  const originals = Array.from(track.children) as HTMLElement[]
  const total = originals.length
  if (total < 1) return
  const auto = Number(root.dataset.auto || 0)
  const speed = Number(root.dataset.speed || 500)
  const id = root.dataset.nvCarId || ''

  let n = 0
  let gap = 0
  let step = 0
  let pos = 0 // index in the track, counting the clones before the first original
  let before = 0
  let timer = 0
  let paused = false
  let moving = false

  const read = (): void => {
    const cs = getComputedStyle(root)
    n = Math.max(1, parseFloat(cs.getPropertyValue('--nv-n')) || 1)
    gap = parseFloat(cs.getPropertyValue('--nv-g')) || 0
    step = (view.clientWidth + gap) / n
  }
  const place = (animate: boolean): void => {
    track.style.transition = animate ? `transform ${speed}ms linear` : 'none'
    track.style.transform = `translate3d(${-pos * step}px,0,0)`
  }
  const rebuild = (): void => {
    track.querySelectorAll('[data-nv-clone]').forEach((c) => c.remove())
    read()
    // clones: enough full sets on each side to fill the view and one step more
    const sets = Math.max(1, Math.ceil((Math.ceil(n) + 1) / total))
    before = sets * total
    const make = (src: HTMLElement): HTMLElement => {
      const c = src.cloneNode(true) as HTMLElement
      c.setAttribute('data-nv-clone', '')
      c.setAttribute('aria-hidden', 'true')
      c.querySelectorAll('a,button').forEach((a) => a.setAttribute('tabindex', '-1'))
      return c
    }
    const head: HTMLElement[] = []
    const tail: HTMLElement[] = []
    for (let s = 0; s < sets; s++)
      for (const o of originals) {
        head.push(make(o))
        tail.push(make(o))
      }
    track.prepend(...head)
    track.append(...tail)
    pos = before
    place(false)
  }
  const settle = (): void => {
    moving = false
    if (pos >= before + total) pos -= total
    else if (pos < before) pos += total
    place(false)
  }
  const go = (dir: 1 | -1): void => {
    if (moving) return
    moving = true
    pos += dir
    place(!reduced())
    if (reduced()) settle()
  }
  track.addEventListener('transitionend', (e) => {
    if (e.target === track) settle()
  })

  document
    .querySelectorAll<HTMLElement>(`[data-nv-car-go="${id}"]`)
    .forEach((b) => b.addEventListener('click', () => go(b.dataset.dir === 'prev' ? -1 : 1)))

  const stop = (): void => window.clearInterval(timer)
  const start = (): void => {
    stop()
    if (auto > 0 && !reduced())
      timer = window.setInterval(() => {
        if (!paused && !document.hidden) go(1)
      }, auto)
  }
  root.addEventListener('mouseenter', () => (paused = true))
  root.addEventListener('mouseleave', () => (paused = false))

  rebuild()
  root.classList.add('is-live')
  start()
  let lastN = n
  let lastW = view.clientWidth
  new ResizeObserver(() => {
    const w = view.clientWidth
    if (w === lastW) return
    lastW = w
    const was = (pos - before + total * 4) % total
    const prevN = lastN
    read()
    if (n !== prevN) {
      lastN = n
      rebuild()
      pos = before + was
    } else {
      step = (w + gap) / n
    }
    place(false)
  }).observe(view)
}

function initAccordion(group: HTMLElement): void {
  const btns = Array.from(group.querySelectorAll<HTMLButtonElement>('[data-nv-acc-btn]'))
  const panel = (b: HTMLElement): HTMLElement | null =>
    document.getElementById(b.getAttribute('aria-controls') || '')
  const set = (b: HTMLButtonElement, open: boolean): void => {
    const p = panel(b)
    if (!p) return
    b.setAttribute('aria-expanded', String(open))
    b.classList.toggle('is-open', open)
    const card = b.closest('.nv-acc-card')
    card?.classList.toggle('is-open', open)
    if (reduced()) {
      p.hidden = !open
      p.style.height = ''
      return
    }
    if (open) {
      p.hidden = false
      p.style.height = '0px'
      requestAnimationFrame(() => (p.style.height = `${p.scrollHeight}px`))
      const done = (): void => {
        p.style.height = ''
        p.removeEventListener('transitionend', done)
      }
      p.addEventListener('transitionend', done)
    } else {
      p.style.height = `${p.scrollHeight}px`
      requestAnimationFrame(() => (p.style.height = '0px'))
      const done = (): void => {
        if (b.getAttribute('aria-expanded') === 'false') p.hidden = true
        p.removeEventListener('transitionend', done)
      }
      p.addEventListener('transitionend', done)
    }
  }
  for (const b of btns)
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true'
      if (open) for (const o of btns) if (o !== b && o.getAttribute('aria-expanded') === 'true') set(o, false)
      set(b, open)
    })
  // Escape closes the open panel the focus is in (or on) and returns focus to its trigger
  group.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return
    const at = document.activeElement
    const b =
      btns.find((x) => x === at || panel(x)?.contains(at) === true) ??
      btns.find((x) => x.getAttribute('aria-expanded') === 'true')
    if (!b || b.getAttribute('aria-expanded') !== 'true') return
    set(b, false)
    b.focus()
  })
}

function initTabs(group: HTMLElement): void {
  const tabs = Array.from(group.querySelectorAll<HTMLElement>('[role="tab"]'))
  const show = (t: HTMLElement, focus: boolean): void => {
    for (const o of tabs) {
      const on = o === t
      o.setAttribute('aria-selected', String(on))
      o.tabIndex = on ? 0 : -1
      o.classList.toggle('is-active', on)
      const p = document.getElementById(o.getAttribute('aria-controls') || '')
      if (p) {
        p.hidden = !on
        p.classList.toggle('is-active', on)
      }
    }
    if (focus) t.focus()
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t, false))
    // Escape leaves the chosen tab for the first one; focus stays on the tab that has it
    t.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape' || t === tabs[0]) return
      show(tabs[0], false)
    })
    t.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key
      const to =
        k === 'ArrowDown' || k === 'ArrowRight'
          ? i + 1
          : k === 'ArrowUp' || k === 'ArrowLeft'
            ? i - 1
            : k === 'Home'
              ? 0
              : k === 'End'
                ? tabs.length - 1
                : -1
      if (to < 0) return
      e.preventDefault()
      show(tabs[(to + tabs.length) % tabs.length], true)
    })
  })
}

function boot(): void {
  document.querySelectorAll<HTMLElement>('[data-nv-car]:not(.is-live)').forEach(initCarousel)
  document.querySelectorAll<HTMLElement>('[data-nv-acc]').forEach(initAccordion)
  document.querySelectorAll<HTMLElement>('[data-nv-tabs]').forEach(initTabs)
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
else boot()
