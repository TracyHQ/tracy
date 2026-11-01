// In-page helpers that empty a frame and put it back (each function runs INSIDE the page, self-contained; DOM
// only, never the site's database). A frame is emptied the way an owner leaving the field blank would see it:
// its <img> (or <picture>) leaves, a background stops painting. When that changes nothing on screen the
// picture is painted by something else (a mask, a pseudo-element, a duplicate): `hidePainters` empties the
// elements `readFrames` tagged as painting over the frame.

/** Empty the frame `id`: its <img> (or <picture>) leaves, a background stops painting. */
export function hideFrame({ id }) {
  const slots = (window.__kitHidden ??= {})
  const left = []
  for (const el of document.querySelectorAll(`[data-kit-frame~="${id}"]`)) {
    if (!el.isConnected) continue
    if (el.tagName === 'IMG') {
      const node = el.parentElement?.tagName === 'PICTURE' ? el.parentElement : el
      const holder = node.parentElement
      const mark = document.createComment('kit-frame')
      node.replaceWith(mark)
      left.push({ mark, node, holder })
    } else {
      left.push({
        el,
        holder: el,
        bg: el.style.getPropertyValue('background-image'),
        prio: el.style.getPropertyPriority('background-image')
      })
      el.style.setProperty('background-image', 'none', 'important')
    }
  }
  slots[id] = left
  return left.length
}

/** Stop the painters of frame `id` painting: own background or mask, and pictures in ::before/::after. */
export function hidePainters({ id }) {
  const style =
    document.getElementById('kit-painters-off') ??
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'kit-painters-off' }))
  if (!style.textContent)
    style.textContent = [
      '[data-kit-off-before]::before{content:none!important}',
      '[data-kit-off-after]::after{content:none!important}',
      '[data-kit-off-self]{background-image:none!important;-webkit-mask-image:none!important;mask-image:none!important;visibility:hidden!important}'
    ].join('\n')
  let n = 0
  for (const el of document.querySelectorAll(`[data-kit-painter~="${id}"]`)) {
    for (const part of ['self', 'before', 'after'])
      if ((el.getAttribute(`data-kit-paints-${part}`) ?? '').split(/\s+/).includes(id)) {
        el.setAttribute(`data-kit-off-${part}`, id)
        n++
      }
  }
  return n
}

/** Let the painters of frame `id` paint again. */
export function restorePainters({ id }) {
  for (const part of ['self', 'before', 'after'])
    for (const el of document.querySelectorAll(`[data-kit-off-${part}="${id}"]`))
      el.removeAttribute(`data-kit-off-${part}`)
}

/** After hiding: does a holder that lost its picture stay as a sized box with nothing in it? */
export function emptyBoxLeft({ id }) {
  for (const s of window.__kitHidden?.[id] ?? []) {
    if (!s.holder?.isConnected) continue
    const r = s.holder.getBoundingClientRect()
    const text = s.holder.innerText.trim()
    const painted = [s.holder, ...s.holder.querySelectorAll('*')].some(
      (e) =>
        (e.tagName === 'IMG' || e.tagName === 'SVG' || /url\(/.test(getComputedStyle(e).backgroundImage)) &&
        !e.hasAttribute('data-kit-off-self')
    )
    if (r.width >= 40 && r.height >= 40 && !text && !painted)
      return { width: Math.round(r.width), height: Math.round(r.height) }
  }
  return null
}

/** After hiding: is the frame's row (a card among cards of its shape) now without a picture its siblings keep? */
export function unevenRow({ id }) {
  const sig = (el) => `${el.tagName}.${[...el.classList].sort().join('.')}`
  const painted = (el) =>
    [el, ...el.querySelectorAll('*')].some(
      (e) =>
        (e.tagName === 'IMG' && e.getBoundingClientRect().width > 0) ||
        /url\(/.test(getComputedStyle(e).backgroundImage)
    )
  for (const s of window.__kitHidden?.[id] ?? []) {
    for (let row = s.holder; row?.parentElement && row !== document.body; row = row.parentElement) {
      const twins = [...row.parentElement.children].filter((c) => c !== row && sig(c) === sig(row))
      if (!twins.length) continue
      if (!painted(row) && twins.some(painted))
        return `one ${sig(row)} lost its picture while the others keep theirs`
      break
    }
  }
  return null
}

/** Put the frame `id` back as it was. */
export function restoreFrame({ id }) {
  for (const s of window.__kitHidden?.[id] ?? []) {
    if (s.mark) s.mark.replaceWith(s.node)
    else s.el.style.setProperty('background-image', s.bg, s.prio)
  }
  delete window.__kitHidden?.[id]
}
