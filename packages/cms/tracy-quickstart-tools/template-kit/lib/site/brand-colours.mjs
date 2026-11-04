// `site.brandColours` of the template kit, measured once when the kit is made (never at site build time): the main
// colour with the roles it paints, a secondary when the template has one, the status colours that are never brand,
// the template's sides (the page as it opens and every mode it switches to) with their grounds, every colour variable
// with where it is declared, the parts whose words sit on a picture, and where the brand colour lives inside
// pictures: SVG data URI icons in the stylesheets, inline SVG icons and image files measured in the browser.
import { coloursIn, cssOfColour, rgbOf, sideOfGround } from './colour-maths.mjs'
import { measureBrandColours, strong } from './colour-measure.mjs'
import { pictureGround, pictureScopesOf, scopeNames } from './colour-pictures.mjs'
import { resolveVars } from './colour-sides.mjs'

const PAINT =
  /(?:fill|stroke|stop-color)\s*(?:=|%3D|:|%3A)\s*(?:["']|%22|%27)?\s*(?:#|%23)([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi
/** The SVG data URI payloads of a CSS value: what follows `data:image/svg+xml` up to the end of its `url()`. */
const DATA_SVG =
  /url\(\s*(?:"data:image\/svg\+xml([^"]*)"|'data:image\/svg\+xml([^']*)'|data:image\/svg\+xml([^)]*))/gi

/** The `#rrggbb` paints of an SVG data URI payload (plain, URL-encoded or base64). */
export function paintsOfDataUri(payload) {
  let text = String(payload)
  const b64 = /^;base64,(.*)$/i.exec(text)
  if (b64) text = Buffer.from(b64[1], 'base64').toString('utf8')
  else
    try {
      text = decodeURIComponent(text)
    } catch {}
  const out = new Set()
  for (const m of text.matchAll(PAINT)) {
    const c = rgbOf(`#${m[1]}`)
    if (c) out.add(cssOfColour(c))
  }
  return [...out]
}

/** Every rule that draws an SVG data URI icon in one of `colours`: `{selector, side, paints}`. */
export function dataUriIconsOf(rules, colours) {
  const wanted = new Set(colours.filter(Boolean))
  const out = []
  for (const r of rules)
    for (const d of r.decls) {
      if (!/^(?:background(?:-image)?|list-style(?:-image)?|mask(?:-image)?|content)$/.test(d.prop)) continue
      for (const m of d.value.matchAll(DATA_SVG)) {
        const paints = paintsOfDataUri(m[1] ?? m[2] ?? m[3]).filter((p) => wanted.has(p))
        if (paints.length)
          out.push({ selector: r.selector, property: d.prop, paints, declaredIn: r.from ?? null })
      }
    }
  return out
}

/** The colour variables of every side: `{name, value, side, declaredIn, brand}`, value resolved. */
export function colourTokensOf(sides, primary, secondary) {
  const out = []
  for (const [side, s] of sides)
    for (const [name, own] of s.own) {
      const c = coloursIn(resolveVars(own.value, s.vars))[0]
      if (!c) continue
      const value = cssOfColour(c)
      const brand = value === primary ? 'primary' : value === secondary ? 'secondary' : null
      out.push({ name, value, side, declaredIn: own.from, ...(brand ? { brand } : {}) })
    }
  return out
}

/**
 * The colour variables a template declares outside its stylesheets (`[{name, value, declaredIn}]`, a T3 template's
 * LESS) as tokens of the side the page opens on.
 */
export function declaredTokensOf(variables, primary, secondary) {
  return variables.map(({ name, value, declaredIn }) => {
    const brand = value === primary ? 'primary' : value === secondary ? 'secondary' : null
    return { name, value, side: 'base', declaredIn: declaredIn ?? null, ...(brand ? { brand } : {}) }
  })
}

/**
 * @param {{styles: Array<{css: string, from?: string}>, pages?: Array<{html: string}>, seen?: {opensOn?: object, inlineIcons?: object[], pictures?: object[]}, variables?: Array<{name: string, value: string, declaredIn?: string}>}} o
 *   `variables`: the colour variables the CMS adapter read from the template's own source (adapter.colourVariables)
 * @returns {{brandColours: object, errors: object[]}}
 */
export function buildBrandColours({ styles, pages = [], seen = {}, variables = [] }) {
  const errors = []
  const missing = (field, reason) =>
    errors.push({ kind: 'missing', field: `site.brandColours.${field}`, reason })
  const m = measureBrandColours(styles, { variables })
  if (!styles.length) missing('primary', 'no stylesheet of the site could be read')
  else if (!m.primary)
    missing('primary', 'no framework role rule or primary variable resolves to a strong colour')
  const baseGround = m.sides.get('base')?.grounds[0]
  const sides = [...m.sides].map(([marker, s]) => ({
    marker,
    ground: s.groundMeasured ? s.grounds[0] : null,
    groundSide: s.groundMeasured ? sideOfGround(s.grounds[0]) : null,
    // `own` when this side paints another ground than the page as it opens (by its rules or its variables).
    groundFrom: marker === 'base' || s.grounds[0] !== baseGround ? 'own' : 'base',
    panels: s.panels
  }))
  for (const s of sides)
    if (!s.ground) missing(`sides[${s.marker}].ground`, 'no rule paints the page ground on this side')
  if (styles.length && ![...m.sides.values()].some((s) => s.own.size) && !variables.length)
    missing('tokens', 'the stylesheets declare no colour variable and the template source gave none')
  const { scopes, overlays } = pictureScopesOf(m.rules, pages)
  const brand = [m.primary, m.secondary].filter(Boolean)
  const inlineIcons = (seen.inlineIcons ?? []).filter((i) => i.paints?.some((p) => brand.includes(p)))
  const pictures = (seen.pictures ?? []).filter((p) => p.colour && brand.includes(p.colour))
  if (!seen.inlineIcons) missing('inlineIcons', 'the pages were not read in a browser')
  if (!seen.pictures) missing('pictures', 'the pictures were not measured in a browser')
  return {
    brandColours: {
      primary: m.primary ? { value: m.primary, roles: m.primaryRoles, wordsOn: m.on } : null,
      secondary: m.secondary ? { value: m.secondary, roles: m.secondaryRoles } : null,
      // Only the coloured ones: status rules also declare the neutral words and grounds they sit on.
      statusColours: m.status.filter((h) => strong(rgbOf(h))),
      opensOn: seen.opensOn ?? null,
      sides,
      tokens: [
        ...colourTokensOf(m.sides, m.primary, m.secondary),
        ...declaredTokensOf(variables, m.primary, m.secondary)
      ],
      onPictureScopes: { selectors: scopeNames(scopes), judgedOn: pictureGround(overlays) },
      dataUriIcons: dataUriIconsOf(m.rules, brand),
      inlineIcons,
      pictures
    },
    errors
  }
}
