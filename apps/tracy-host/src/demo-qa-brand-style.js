/**
 * The site check's look at the brand style (#378): a page read with the module and again with it off, in the same browser
 * task so nothing else on the page can move between the two reads, on each side of the template's light and dark switch.
 * It answers every computed property that differs and every colour the page paints with the module on; the judging stays in
 * `apps/tracy-web/src/site-check/brand-accent.js`.
 */

/** What one page may report, so an odd page cannot make the answer huge. */
export const BRAND_STYLE_CAPS = Object.freeze({ changes: 300, colours: 300, valueLength: 240, ms: 20_000 })

/**
 * Runs inside the page (serialised by Playwright): it may use nothing from this module.
 * @param {{ caps: { changes: number, colours: number, valueLength: number, ms: number } }} arg
 */
export function readBrandStyleInPage({ caps }) {
  const style = document.getElementById('tracy-ds-slot')
  if (!style?.sheet) return { worn: false }
  const started = performance.now()
  const body = document.body
  const root = document.documentElement
  const COLOUR = /rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)/g
  const selectorOf = (el, pseudo) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    [...el.classList]
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('') +
    (pseudo ?? '')
  const shown = (el, cs) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const targets = []
  for (const el of body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue
    targets.push([el, null])
    for (const pseudo of ['::before', '::after'])
      if (getComputedStyle(el, pseudo).content !== 'none') targets.push([el, pseudo])
  }
  targets.push([body, null], [root, null])

  // A press on the switch, as far as computed styles go: only the mark on the body or the root moves.
  const was = {
    bodyClass: body.className,
    theme: root.getAttribute('data-theme'),
    bsTheme: root.getAttribute('data-bs-theme')
  }
  const hasClassMark = body.classList.contains('dark-active') || body.classList.contains('light-active')
  const attr = was.theme !== null ? 'data-theme' : was.bsTheme !== null ? 'data-bs-theme' : null
  const put = (side) => {
    if (hasClassMark) {
      body.classList.toggle('dark-active', side === 'dark')
      body.classList.toggle('light-active', side === 'light')
    } else if (attr) root.setAttribute(attr, side)
  }
  const restore = () => {
    body.className = was.bodyClass
    if (attr) root.setAttribute(attr, attr === 'data-theme' ? was.theme : was.bsTheme)
  }
  const opening = hasClassMark
    ? body.classList.contains('dark-active')
      ? 'dark'
      : 'light'
    : attr
      ? (was.theme ?? was.bsTheme)
      : 'only'
  const sides = hasClassMark || attr ? ['dark', 'light'] : ['only']

  const freeze = document.createElement('style')
  freeze.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.append(freeze)

  const answer = { worn: true, head: style.textContent.slice(0, 400), opening, sides: {} }
  try {
    for (const side of sides) {
      if (side !== 'only') put(side)
      const changes = new Map()
      const colours = new Map()
      let elements = 0
      let truncated = false
      style.sheet.disabled = false
      const readAll = (cs) => {
        const values = new Map()
        // Custom properties paint nothing themselves and come in no fixed order; what they feed is read as itself.
        for (let i = 0; i < cs.length; i++)
          if (!cs[i].startsWith('--')) values.set(cs[i], cs.getPropertyValue(cs[i]))
        return values
      }
      const on = targets.map(([el, pseudo]) => {
        const cs = getComputedStyle(el, pseudo)
        return { seen: pseudo ? shown(el, getComputedStyle(el)) : shown(el, cs), values: readAll(cs) }
      })
      style.sheet.disabled = true
      on.forEach((read, n) => {
        if (performance.now() - started > caps.ms) {
          truncated = true
          return
        }
        const [el, pseudo] = targets[n]
        const off = readAll(getComputedStyle(el, pseudo))
        elements++
        for (const [prop, withStyle] of read.values) {
          const without = off.get(prop) ?? ''
          if (read.seen)
            for (const colour of withStyle.match(COLOUR) ?? []) {
              const entry = colours.get(colour)
              if (entry) entry.count++
              else if (colours.size < caps.colours)
                colours.set(colour, { colour, prop, sample: selectorOf(el, pseudo), count: 1 })
            }
          if (withStyle === without) continue
          const key = `${prop}\n${withStyle}\n${without}`
          const entry = changes.get(key)
          if (entry) {
            entry.count++
            entry.seen ||= read.seen
          } else if (changes.size < caps.changes)
            changes.set(key, {
              prop,
              with: withStyle.slice(0, caps.valueLength),
              without: without.slice(0, caps.valueLength),
              sample: selectorOf(el, pseudo),
              seen: read.seen,
              count: 1
            })
          else truncated = true
        }
      })
      style.sheet.disabled = false
      answer.sides[side] = {
        elements,
        truncated,
        changes: [...changes.values()],
        colours: [...colours.values()]
      }
    }
  } finally {
    style.sheet.disabled = false
    restore()
    void getComputedStyle(body).color
    freeze.remove()
  }
  return answer
}

/** The brand style's read of one page, or null when the page would not answer. */
export async function readBrandStyle(page) {
  return page.evaluate(readBrandStyleInPage, { caps: BRAND_STYLE_CAPS }).catch(() => null)
}
