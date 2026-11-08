// Runs INSIDE the page (Playwright `page.evaluate`): no imports, no closures over Node values.

/**
 * How the content around a set of rows is aligned, to tell whether a short line pressed to the left is a hole or
 * simply follows its column. From the rows' container up (at most eight levels), the first ancestor that shows
 * content outside the container (headings, paragraphs, buttons, links, any element with its own words) is read:
 * `centered` when any of that content is centered (text-align center on a box at least half as wide as the
 * container, or a box narrower than the container whose
 * middle is the container's middle); `leftAligned` when content starts where the rows start (the left edge of its
 * words within `tol` px) and none is centered.
 */
export function readRowContext({ block, path, shape, css, tol = 8 }) {
  // Zebra classes (`cat-list-row0` / `cat-list-row1`, `odd` / `even`) alternate between rows of one set: state too.
  const STATE =
    /^(active|show|current|selected|in|fade|is-|swiper-slide-|owl-|slick-|aos-)|^[a-z]+-\d+$|(?:^|-)row\d$|^(?:odd|even)$/
  const sig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !STATE.test(c) && !(c.includes('--') && el.classList.contains(c.split('--')[0])))
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
  const container = rows[0]?.parentElement
  if (!container) return null
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const rowsLeft = Math.min(...rows.filter(shown).map((r) => r.getBoundingClientRect().left))
  const cBox = container.getBoundingClientRect()
  const cMid = cBox.left + cBox.width / 2
  // The left edge of an element's own words (where the text starts, not where its box starts).
  const wordsLeft = (el) => {
    // A link or button starts at its box (its label is inset by padding).
    if (/^(A|BUTTON)$/.test(el.tagName) && getComputedStyle(el).display !== 'inline')
      return el.getBoundingClientRect().left
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    if (!node) return el.getBoundingClientRect().left
    const range = document.createRange()
    range.selectNodeContents(node)
    return range.getBoundingClientRect().left
  }
  const ownWords = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  let around = []
  let scope = container.parentElement
  for (
    let n = 0;
    scope && scope !== document.body && n < 8 && !around.length;
    n++, scope = scope.parentElement
  )
    around = [...scope.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, button, span, div, li')].filter(
      (el) =>
        !container.contains(el) &&
        !el.contains(container) &&
        !el.closest('script, style, noscript') &&
        (ownWords(el) || /^(A|BUTTON)$/.test(el.tagName)) &&
        shown(el)
    )
  const samples = around.slice(0, 12).map((el) => {
    const r = el.getBoundingClientRect()
    const align = getComputedStyle(el).textAlign
    // text-align center counts only on a wide box (it then centers what it holds); a small button centering
    // its own label says nothing about where the button sits.
    // A box sits centered only alone on its line: a button that lands mid-container as one of a row is not.
    // (The box is the element, or the wrapper it is the only shown child of, such as a list item.)
    let item = el
    while (item.parentElement && [...item.parentElement.children].filter(shown).length === 1)
      item = item.parentElement
    const top = item.getBoundingClientRect().top
    const alone = ![...(item.parentElement?.children ?? [])].some(
      (c) => c !== item && shown(c) && Math.abs(c.getBoundingClientRect().top - top) < 4
    )
    const centered =
      (align === 'center' && r.width >= cBox.width / 2) ||
      (alone &&
        r.width < cBox.width - 2 * tol &&
        Math.abs(r.left + r.width / 2 - cMid) <= tol &&
        r.left - cBox.left > tol)
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      align,
      centered,
      startsWithRows: Math.abs(wordsLeft(el) - rowsLeft) <= tol
    }
  })
  const centered = samples.some((s) => s.centered)
  return {
    centered,
    leftAligned: !centered && samples.some((s) => s.startsWithRows),
    samples
  }
}
