/** In-page probes and header readers of the real-page views (#322), kept apart from the capture flow. */
/** The pixel size of a PNG from its header, or null. */
export function pngSize(bytes) {
  const b = Buffer.from(bytes)
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/** The pixel size of the largest picture in an ICO, or null. */
export function icoSize(bytes) {
  const b = Buffer.from(bytes)
  if (b.length < 6 || b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) return null
  let best = null
  for (let i = 0; i < b.readUInt16LE(4) && 6 + i * 16 + 4 <= b.length; i++) {
    const w = b[6 + i * 16] || 256
    const h = b[7 + i * 16] || 256
    if (!best || w > best.width) best = { width: w, height: h }
  }
  return best
}

// The logo image shown inside a region: the largest visible image, with where it sits in `origin`'s coordinates.
export const PROBE = ({ selector, originSelector }) => {
  const region = [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().height > 0)
  if (!region) return null
  const origin = originSelector === 'region' ? region.getBoundingClientRect() : { left: 0, top: 0 }
  const images = [...region.querySelectorAll('img')]
    .map((img) => ({ img, r: img.getBoundingClientRect() }))
    .filter(({ img, r }) => r.width > 0 && r.height > 0 && getComputedStyle(img).visibility !== 'hidden')
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
  const top = images[0]
  const box = region.getBoundingClientRect()
  return {
    region: { width: Math.round(box.width), height: Math.round(box.height) },
    logo: top
      ? {
          src: top.img.currentSrc || top.img.src,
          alt: top.img.alt || '',
          naturalWidth: top.img.naturalWidth,
          naturalHeight: top.img.naturalHeight,
          rect: {
            x: Math.round(top.r.left - origin.left),
            y: Math.round(top.r.top - origin.top),
            width: Math.round(top.r.width),
            height: Math.round(top.r.height)
          }
        }
      : null
  }
}

// Every opaque colour the page paints in header, main and footer: text, background and border, with how often.
export const COLOURS = () => {
  const seen = new Map()
  const add = (value) => {
    const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value)
    if (!m || (m[4] !== undefined && Number(m[4]) < 1)) return
    const hex = `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
    seen.set(hex, (seen.get(hex) ?? 0) + 1)
  }
  for (const el of [document.body, ...document.querySelectorAll('header *, main *, footer, footer *')].slice(
    0,
    800
  )) {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') continue
    add(s.color)
    add(s.backgroundColor)
    if (Number.parseFloat(s.borderTopWidth) > 0) add(s.borderTopColor)
  }
  return [...seen].map(([hex, count]) => ({ hex, count }))
}

export const ICON_LINKS = () =>
  [
    ...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')
  ].map((l) => ({
    rel: l.getAttribute('rel'),
    sizes: l.getAttribute('sizes') || '',
    type: l.getAttribute('type') || '',
    href: l.href
  }))

export const FETCH_ICON = async ({ href, max }) => {
  try {
    const r = await fetch(href)
    const buf = new Uint8Array(await r.arrayBuffer())
    let bin = ''
    for (const byte of buf.slice(0, max)) bin += String.fromCharCode(byte)
    return {
      status: r.status,
      contentType: r.headers.get('content-type') || '',
      base64: btoa(bin),
      size: buf.length
    }
  } catch (error) {
    return { status: 0, contentType: '', base64: '', size: 0, error: String(error?.message ?? error) }
  }
}
