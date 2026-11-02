// Runs INSIDE the page: the fix proposed for a row of cards that packs a short last line to the left, and its
// trial. The row element gets a stable CSS selector derived from its own classes and its nearest classed
// ancestors (state classes and instance numbers of two or more digits left out), and one rule by its display:
// flex rows center their lines; grid rows center their tracks; other rows become wrapping centered flex rows.
// The rule is injected for the trial only; the template source is never edited.
export function tryRowFix({ block, path, shape, css }) {
  const STATE = /^(active|show|current|selected|in|fade|is-|swiper-slide-|owl-|slick-|aos-)/
  const sig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !STATE.test(c) && !/^[a-z]+-\d+$/.test(c))
      .sort()
      .join('.')}`
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return null
  let rows
  if (css) rows = [...root.querySelectorAll(css)]
  else {
    let parent = root
    for (const i of path) parent = parent?.children[i]
    rows = parent ? [...parent.children].filter((c) => sig(c) === shape) : []
  }
  const row = rows[0]?.parentElement
  if (!row) return null
  const keep = (c) => !STATE.test(c) && !/\d{2,}/.test(c)
  const part = (el) => {
    const cls = [...el.classList].filter(keep)
    return cls.length ? `${el.tagName.toLowerCase()}.${cls.map((c) => CSS.escape(c)).join('.')}` : null
  }
  const chain = [part(row) ?? row.tagName.toLowerCase()]
  for (let e = row.parentElement, n = 0; e && e !== document.body && n < 2; e = e.parentElement) {
    const p = part(e)
    if (p) {
      chain.unshift(p)
      n++
    }
  }
  const selector = chain.join(' ')
  const display = getComputedStyle(row).display
  const card = rows[0].getBoundingClientRect().width
  const rule = /flex/.test(display)
    ? 'justify-content: center'
    : /grid/.test(display)
      ? `grid-template-columns: repeat(auto-fit, ${Math.round(card)}px); justify-content: center`
      : 'display: flex; flex-wrap: wrap; justify-content: center'
  const style = document.createElement('style')
  style.setAttribute('data-kit-fix', '')
  style.textContent = `${selector} { ${rule.replace(/;/g, ' !important;')} !important; }`
  document.head.append(style)
  return { selector, display, rule, matches: document.querySelectorAll(selector).length }
}
