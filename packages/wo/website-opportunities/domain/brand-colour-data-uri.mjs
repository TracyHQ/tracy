// An icon a template draws as an SVG data URI in its brand colour (a button arrow as `background-image`), recoloured
// with the logo's (spec TracyHQ/tracy#189, ADR 0023 amended 29/10/2026), for `brand-colour-css.mjs`.
//
// A data URI carries its picture inside the stylesheet, so declaring it again in the head block draws the same picture;
// only the `fill`, `stroke` and `stop-color` values equal to the brand colour are swapped, in every form a stylesheet
// writes them (`#e8402f`, URL-encoded `%23e8402f`, inside a base64 payload). A value that also names an external file is
// never declared again: its address would resolve against the page instead of the stylesheet.
import { rgbOf } from './brand-colour-maths.mjs'

const PAINT =
  /((?:fill|stroke|stop-color)\s*(?:=|%3D|:|%3A)\s*(?:["']|%22|%27)?\s*)(#|%23)([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi

/** Every `url(...)` of a CSS value: [start, end, body]. */
function urlsOf(value) {
  const out = []
  const re = /url\(\s*/gi
  let m = re.exec(value)
  while (m) {
    let i = re.lastIndex
    const quote = value[i] === '"' || value[i] === "'" ? value[i] : ''
    if (quote) i += 1
    const from = i
    while (i < value.length && !(quote ? value[i] === quote : value[i] === ')')) i += 1
    const body = value.slice(from, i)
    if (quote) i += 1
    while (i < value.length && value[i] !== ')') i += 1
    out.push({ start: m.index, end: i + 1, body, quote })
    re.lastIndex = i + 1
    m = re.exec(value)
  }
  return out
}

/** The SVG text with every brand paint swapped; `toneOf(hex)` gives the new `#rrggbb`, or null to keep it. */
function swapPaints(text, toneOf) {
  return text.replace(PAINT, (all, lead, hash, hex) => {
    const tone = rgbOf(`#${hex}`) ? toneOf(`#${hex}`) : null
    return tone ? `${lead}${hash}${tone.slice(1)}` : all
  })
}

/**
 * The value with its SVG data URIs recoloured, or null when nothing changed, a `url()` names an external file, or a
 * payload cannot be read.
 * @param {string} value
 * @param {(hex: string) => string | null} toneOf - the new colour for a brand colour, null for any other colour
 * @returns {string | null}
 */
export function recolourDataUris(value, toneOf) {
  const urls = urlsOf(value)
  if (!urls.length || urls.some((u) => !/^data:/i.test(u.body.trim()))) return null
  let out = ''
  let at = 0
  let changed = false
  for (const u of urls) {
    const body = u.body.trim()
    const comma = body.indexOf(',')
    const head = body.slice(0, comma)
    let next = body
    if (comma > 0 && /^data:image\/svg\+xml/i.test(head)) {
      const payload = body.slice(comma + 1)
      if (/;base64$/i.test(head)) {
        const text = Buffer.from(payload, 'base64').toString('utf8')
        const swapped = swapPaints(text, toneOf)
        if (swapped !== text) next = `${head},${Buffer.from(swapped, 'utf8').toString('base64')}`
      } else {
        next = `${head},${swapPaints(payload, toneOf)}`
      }
    }
    if (next !== body) changed = true
    out += `${value.slice(at, u.start)}url(${u.quote}${next}${u.quote})`
    at = u.end
  }
  return changed ? out + value.slice(at) : null
}

/** `value` with `fn` applied to every stretch outside its `url(...)`s, so a colour inside a picture is never read as CSS. */
export function outsideUrls(value, fn) {
  let out = ''
  let at = 0
  for (const u of urlsOf(value)) {
    out += fn(value.slice(at, u.start)) + value.slice(u.start, u.end)
    at = u.end
  }
  return out + fn(value.slice(at))
}
