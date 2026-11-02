// Joomla: the map a page draws from a block's own content. JoomlArt's map plugin (System - JA Google Map) replaces
// every `{jamap ...}{/jamap}` shortcode in the rendered page with a map; its `locations` attribute is JSON
// (`{"location":{"0":"Wall St"},"latitude":{"0":"40.70"},"longitude":{"0":"-74.00"},"info":{"0":""}}`): the map
// marks the latitude and longitude when both are numbers, else it looks the location text up in the visitor's
// browser. A free-HTML block (mod_custom) whose whole content is one such shortcode with one location is a map
// setting; anything else (more locations, other words around it) is left out, since rewriting it is not one value.
// The pattern is the plugin's own (`$_plgCodeNew` in plugins/system/jagooglemap/jagooglemap.php).
const JAMAP = /^\{jamap(.*?)\}\s*\{\/jamap\}$/i
const ATTRIBUTE = /([\w:-]+)\s?=\s?'([^']*)'/g

/** The attributes of a `{jamap ...}` shortcode, or null when the text is not exactly one shortcode. */
export function parseJamap(text) {
  const m = JAMAP.exec(String(text ?? '').trim())
  if (!m) return null
  const attributes = {}
  for (const [, name, value] of m[1].matchAll(ATTRIBUTE)) attributes[name] = value
  return attributes
}

/** One map setting of a free-HTML block row (`{id, content}`), or null. */
export function mapSettingOf(row) {
  const attributes = parseJamap(row?.content)
  if (!attributes?.locations) return null
  let locations
  try {
    locations = JSON.parse(attributes.locations)
  } catch {
    return null
  }
  const keys = Object.keys(locations?.location ?? {})
  if (keys.length !== 1) return null
  const [k] = keys
  const template = String(row.content)
    .trim()
    .replace(
      `locations='${attributes.locations}'`,
      `locations='{"location":{"0":"<address>"},"latitude":{"0":"<latitude>"},"longitude":{"0":"<longitude>"},"info":{"0":""}}'`
    )
  return {
    entity: `module-${row.id}`,
    column: 'content',
    template,
    location: {
      address: String(locations.location[k] ?? ''),
      latitude: String(locations.latitude?.[k] ?? ''),
      longitude: String(locations.longitude?.[k] ?? '')
    },
    drawnBy:
      'map shortcode {jamap} (plugin System - JA Google Map), attribute locations: location, latitude, longitude'
  }
}

/** The SQL that reads the published site blocks holding a map shortcode. */
export const mapRowsSql = (prefix) =>
  `SELECT id, content FROM ${prefix}modules WHERE client_id = 0 AND published = 1 AND module = 'mod_custom' AND content LIKE '%{jamap%'`
