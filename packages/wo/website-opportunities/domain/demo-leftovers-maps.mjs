// C18, the maps that are not a Google iframe (spec TracyHQ/tracy#189). A template draws its map in several ways: a shortcode
// a plugin turns into a map at view time, an iframe of another provider, or a container a script fills from coordinates. All
// three carry the demo's place unless the page shows the brief's own. Read by structure (a map-shaped shortcode, a map
// provider's embed, a map-shaped container holding coordinates), never by one extension's name. Pure.

/** Embeds of map providers other than Google's (that one is read by the generic map rule). */
const OTHER_MAP_EMBED =
  /openstreetmap\.org|bing\.com\/maps|mapbox|yandex\.[a-z.]+\/map|baidu\.com\/map|here\.com|waze\.com|mapquest/i
/** A shortcode whose name says map: `{jamap ...}`, `{gmap ...}`, `[map ...]`-style braces. */
const MAP_SHORTCODE = /\{\s*\/?[a-z][\w-]*map[\w-]*\b[^{}]{0,400}/gi
/** A container whose class or id says it is a map. */
const MAP_CONTAINER =
  /<(?:div|section|figure)\b[^>]*\s(?:class|id)\s*=\s*["'][^"']*(?:leaflet-container|mapboxgl-map|ol-viewport|(?<![A-Za-z0-9])[\w-]*map[\w-]*?(?:canvas|wrap|container|box|view)|(?<![A-Za-z0-9])(?:gmap|ja-?map)[\w-]*)[^"']*["'][^>]*>/gi
const COORDINATE = /(?:lat(?:itude)?|lng|lon(?:gitude)?)["'\]]*\s*[:=]\s*["']?(-?\d{1,3}\.\d{3,})/gi
/** How far past a container's opening tag its coordinates may sit (a script's data right after it). */
const REACH = 800

/** Whether a coordinate (three decimals) is written in the brief: the business's own place. */
function ownCoordinate(own, number) {
  const cut = number.slice(0, number.indexOf('.') + 4)
  return own.includes(cut)
}

/**
 * @param {{served: Array<{path: string, html: string}>, demo: {own: string}}} ctx
 * @param {(ctx: any, src: string) => boolean} showsBriefPlace
 * @returns {Array<{page: string, place: string, found: string}>}
 */
export function otherMapLeftovers(ctx, showsBriefPlace) {
  const out = []
  for (const page of ctx.served) {
    const html = page.html
    for (const [, src] of html.matchAll(/<iframe\b[^>]*\ssrc\s*=\s*["']([^"']*)["']/gi))
      if (OTHER_MAP_EMBED.test(src) && !showsBriefPlace(ctx, decodeURIComponent(src).toLowerCase()))
        out.push({ page: page.path, place: 'map', found: src.slice(0, 80) })
    for (const m of html.matchAll(MAP_SHORTCODE)) {
      const code = m[0].trim()
      if (!code.startsWith('{/'))
        out.push({ page: page.path, place: 'map shortcode', found: code.slice(0, 80) })
    }
    for (const m of html.matchAll(MAP_CONTAINER)) {
      const around = html.slice(m.index, m.index + m[0].length + REACH)
      const demo = [...around.matchAll(COORDINATE)].find((c) => !ownCoordinate(ctx.demo.own, c[1]))
      if (demo) out.push({ page: page.path, place: 'map container', found: `coordinates ${demo[1]}` })
    }
  }
  return out
}
