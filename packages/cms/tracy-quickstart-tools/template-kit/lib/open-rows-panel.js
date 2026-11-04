// In-page: open the closed panel a set of rows sits in (a tab, an accordion) the way a visitor would, so the rows
// can be measured: the control of the nearest hidden ancestor with an id is clicked (`aria-controls`,
// `data-bs-target`, `data-target`, `href`). Runs INSIDE the page, self-contained; DOM only.

/** @returns {{opened: string|null}} the id of the panel opened, or null when the rows show or nothing opens them */
export function openRowsPanel({ block, path, shape, css }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return { opened: null }
  let first = null
  if (css) first = root.querySelector(css)
  else {
    let parent = root
    for (const i of path ?? []) parent = parent?.children[i]
    const tag = String(shape ?? '').split('.')[0]
    first = [...(parent?.children ?? [])].find((c) => c.tagName === tag) ?? null
  }
  if (!first || first.getClientRects().length) return { opened: null }
  const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : s)
  for (let e = first.parentElement; e && e !== document.body; e = e.parentElement) {
    if (!e.id || getComputedStyle(e).display !== 'none') continue
    const control = document.querySelector(
      [
        `[aria-controls="${esc(e.id)}"]`,
        `[data-bs-target="#${esc(e.id)}"]`,
        `[data-target="#${esc(e.id)}"]`,
        `a[href="#${esc(e.id)}"]`
      ].join(',')
    )
    if (!control) continue
    control.click()
    return { opened: e.id }
  }
  return { opened: null }
}
