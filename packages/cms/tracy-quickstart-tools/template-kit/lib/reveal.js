// In-page: bring a frame that is in the page but not shown into view the way a visitor would, so it can be
// measured (runs INSIDE the page, self-contained; DOM only). Each call runs ONE action, numbered `attempt`;
// the caller waits for layout and reads again, then tries the next. Actions, in order: the controls that open
// a hidden ancestor by its id (tabs, accordions: `aria-controls`, `data-bs-target`, `data-target`, `href`),
// the dots of the slider holding it, its next buttons, and last the active class the widget's own markup uses.
// A frame hidden by a theme marker (a light/dark twin) has none of these and stays hidden: that is not a widget.

/** @returns {{did: boolean, how?: string}} */
export function revealFrame({ id, attempt }) {
  const el = document.querySelector(`[data-kit-frame~="${id}"]`)
  if (!el) return { did: false }
  const hidden = (e) => {
    const s = getComputedStyle(e)
    return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0
  }
  const ancestors = []
  for (let e = el; e && e !== document.body; e = e.parentElement) ancestors.push(e)
  const actions = []
  const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : s)
  for (const a of ancestors.filter((e) => e.id && hidden(e))) {
    const sel = [
      `[aria-controls="${esc(a.id)}"]`,
      `[data-bs-target="#${esc(a.id)}"]`,
      `[data-target="#${esc(a.id)}"]`,
      `a[href="#${esc(a.id)}"]`
    ].join(',')
    for (const c of document.querySelectorAll(sel))
      actions.push({ how: `control of #${a.id}`, run: () => c.click() })
  }
  const SLIDER = /owl-carousel|swiper|slick-slider|carousel|slider/i
  const SLIDE = /owl-item|swiper-slide|slick-slide|carousel-item|tab-pane|accordion-collapse|collapse/i
  const slider = ancestors.find((e) => SLIDER.test(String(e.className)))
  if (slider) {
    const dots = slider.querySelectorAll(
      '.owl-dot, .swiper-pagination-bullet, .slick-dots button, [data-bs-slide-to], [data-slide-to]'
    )
    for (const [i, d] of [...dots].entries())
      actions.push({ how: `slider dot ${i + 1}`, run: () => d.click() })
    const next = slider.querySelector(
      '.owl-next, .swiper-button-next, .slick-next, .carousel-control-next, [data-bs-slide="next"], [data-slide="next"]'
    )
    if (next)
      for (let i = 0; i < 12; i++) actions.push({ how: `slider next x${i + 1}`, run: () => next.click() })
  }
  const item = ancestors.find((e) => SLIDE.test(String(e.className)) && hidden(e))
  if (item)
    actions.push({
      how: 'active class',
      run: () => {
        for (const sib of item.parentElement?.children ?? [])
          if (sib !== item) sib.classList.remove('active', 'show')
        item.classList.add('active', 'show')
      }
    })
  const a = actions[attempt]
  if (!a) return { did: false }
  a.run()
  return { did: true, how: a.how }
}
