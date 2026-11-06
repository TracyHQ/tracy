// In the page: every element printing a marker, in its own words or in an attribute. A control is one element; `title`
// says it prints at the page's largest shown text size, which is what a visitor reads as the title. Runs in the browser.
export function readFieldMarker(marker) {
  const shownSize = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none'
      ? Number.parseFloat(cs.fontSize)
      : 0
  }
  const all = [...document.body.querySelectorAll('*')]
  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.nodeValue)
      .join('')
  const largest = Math.max(0, ...all.filter((el) => ownText(el).trim()).map(shownSize))
  const out = []
  for (const el of all) {
    if (ownText(el).includes(marker)) {
      const size = shownSize(el)
      out.push({
        tag: el.tagName.toLowerCase(),
        attribute: 'text',
        classes: el.className?.toString?.() ?? '',
        shown: size > 0,
        ...(size > 0 && size >= largest ? { title: true } : {})
      })
    }
    for (const a of el.attributes)
      if (a.value.includes(marker))
        out.push({
          tag: el.tagName.toLowerCase(),
          attribute: a.name,
          classes: el.className?.toString?.() ?? '',
          shown: shownSize(el) > 0
        })
  }
  return out.map((c, at) => ({ ...c, at }))
}
