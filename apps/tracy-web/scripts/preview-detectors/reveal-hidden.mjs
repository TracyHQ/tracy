/**
 * Content hidden waiting for scroll-reveal (Moxie audit, 14/10/2026: ja-phio and ja-seven kept 23 and
 * 39 `data-aos` blocks at opacity 0, ja-resume 36 `.ja-animate` blocks, hero headlines included,
 * because the preview runs no script: the visitor judged a blank page).
 *
 * The probe walks every block a reveal library drives (`data-aos`, `.ja-animate`, wow / animate /
 * animated classes, `data-animate`, `data-animation`, `data-sal`, `data-scroll-reveal`) that holds
 * something to see (text, an image, a video) and is in the page's flow (laid out, not inside a
 * fixed layer such as an off-canvas menu or a modal). It is hidden when its own or an ancestor's
 * opacity leaves under 10%, its visibility is hidden, or its own transform puts it wholly outside the
 * page width. A hidden block inside another hidden one counts once.
 *
 * `detect` counts the hidden blocks of the worn page: the preview must show them all.
 */
export const kind = 'reveal-hidden'

export const probe = `(() => {
  const W = document.documentElement.clientWidth
  const MARK = '[data-aos], .ja-animate, .wow, .animated, .animate__animated, [class*="animate-"], [class*="-animate"], [data-animate], [data-animation], [data-sal], [data-scroll-reveal]'
  const label = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (e.getAttribute('data-aos') ? '[data-aos=' + e.getAttribute('data-aos') + ']' : '')
  const hidden = []
  const seen = new Set()
  for (const e of document.querySelectorAll(MARK)) {
    if ([...seen].some((h) => h.contains(e))) continue
    const r = e.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    let fixed = false, op = 1, vis = getComputedStyle(e).visibility === 'hidden'
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
      const cs = getComputedStyle(x)
      if (cs.position === 'fixed') fixed = true
      op *= +cs.opacity
    }
    if (fixed) continue
    const content = (e.innerText || e.textContent || '').trim().length > 0 || !!e.querySelector('img, picture, video, svg, canvas, iframe') || /^(IMG|PICTURE|VIDEO|SVG|CANVAS)$/i.test(e.tagName)
    if (!content) continue
    // off the page sideways because of its own transform (a slide-in waiting for its script); a carousel's
    // slides beyond the page width are laid out there, not moved. A transform that moves nothing (the
    // identity matrix a finished reveal leaves, JA Space's owl slides after moveFromBottom, 19/10/2026) is
    // no move either
    const t = getComputedStyle(e).transform
    const moved = t !== 'none' && !/^matrix\\(1, 0, 0, 1, 0, 0\\)$|^matrix3d\\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\\)$/.test(t)
    const off = (r.right <= 0 || r.left >= W) && moved
    if (op < 0.1 || vis || off) {
      seen.add(e)
      hidden.push({ at: label(e), why: op < 0.1 ? 'opacity' : vis ? 'visibility' : 'off-screen', top: Math.round(r.top + scrollY), area: Math.round(r.width * r.height) })
    }
  }
  return { hidden: hidden.slice(0, 200), total: hidden.length }
})()`

/**
 * @param {{ worn: { data?: { hidden?: { at: string, why: string, top: number, area: number }[], total?: number } } }} input
 * @returns {{ count: number, findings: { at: string, why: string, top: number, area: number }[] }}
 */
export function detect({ worn }) {
  const d = worn?.data
  const hidden = Array.isArray(d?.hidden) ? d.hidden : []
  const count = typeof d?.total === 'number' ? Math.max(d.total, hidden.length) : hidden.length
  return { count, findings: hidden.slice(0, 50) }
}
