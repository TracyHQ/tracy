// The probe catalogue of write safety (ticket #586) and how probes are packed into passes. A probe is a short piece of
// text a customer could type into a field: markup, a quote that ends an attribute, a JA ACM style marker, an escaped
// tag, letters of other scripts and a picture character. Each probe carries the code of the field it is written in
// (`marker-codec.mjs`), so a page that prints it as a live element names the field. A framework adapter adds its own
// (`adapters/joomla-probes.mjs`). Pure.
//
// A pass writes one probe in every place at once, a different one per place where it can, and the ledger keeps which
// probe reached which place in which pass and what became of it: a measurement is complete only when every probe that
// applies to a place reached that place.

/** The probe signature of a field: an attribute name only a live element of this probe can carry. */
export const signatureOf = (code, probe) => 'qx' + String(code).toLowerCase() + probe

/** An element of a parsed page that carries the attribute `name`. */
const carries = (doc, name) => Boolean(doc?.querySelector?.('[' + name + ']'))

/** A probe whose danger is a live element carrying its signature. */
const elementProbe = (id, mark, text, why, types = ['text']) => ({
  id,
  types,
  text: (code) => text(signatureOf(code, mark)),
  judge: ({ doc, code }) =>
    carries(doc, signatureOf(code, mark))
      ? { kind: 'markup_injected', element: signatureOf(code, mark) }
      : null,
  why
})

/** The probes of every framework, for text places. */
export const COMMON_PROBES = Object.freeze([
  elementProbe('tag', 't', (s) => '<i ' + s + '>', 'a tag typed as words'),
  elementProbe(
    'double-quote',
    'd',
    (s) => '" ' + s + '="',
    'a double quote ends the attribute it is printed in'
  ),
  elementProbe(
    'single-quote',
    's',
    (s) => "' " + s + "='",
    'a single quote ends the attribute it is printed in'
  ),
  elementProbe(
    'acm-marker',
    'a',
    (s) => '((i ' + s + '))',
    'a double parenthesis a template converter reads as a tag'
  ),
  elementProbe('escaped-tag', 'e', (s) => '&lt;i ' + s + '&gt;', 'an escaped tag decoded once too often'),
  {
    id: 'other-scripts',
    types: ['text'],
    // Hebrew letters, accented Latin letters and a four byte picture character: a store or a database that cannot
    // keep them answers an error or mangles them.
    // language-allow: probe data, letters of other scripts a customer may type
    text: () => 'שלום éñ \u{1F33C}',
    judge: () => null,
    why: 'letters of other scripts, a right to left word and a four byte character'
  },
  {
    id: 'code-address',
    types: ['link'],
    text: (code) => 'javascript:void(' + signatureOf(code, 'j') + ')',
    whole: true,
    judge: ({ doc, code }) => {
      for (const el of doc?.querySelectorAll?.('[href],[src]') ?? []) {
        const v = String(el.getAttribute('href') ?? el.getAttribute('src') ?? '')
        if (/^\s*javascript:/i.test(v) && v.includes(signatureOf(code, 'j')))
          return { kind: 'markup_injected', element: 'javascript address' }
      }
      return null
    },
    why: 'an address that runs code when followed'
  },
  elementProbe('link-quote', 'q', (s) => '" ' + s + '="', 'a double quote that ends the address attribute', [
    'link'
  ])
])

/** The type of probes a place takes: text, link, or none (pictures, email addresses and phone numbers). */
export function placeTypeOf({ kind, value }) {
  const k = String(kind ?? '')
  if (/(?:\.|_)(?:image|logo)$/.test(k) || /\.(?:png|jpe?g|webp|svg)$/i.test(String(value ?? ''))) return null
  if (k === 'contact.email' || k === 'contact.phone') return null
  if (k.endsWith('_url') || /^https?:\/\//.test(String(value ?? ''))) return 'link'
  return 'text'
}

/** The value of a place with a probe: the place's own marker, then the probe (an address probe replaces it). */
export function probedValue(base, probe, code) {
  const text = probe.text(code)
  if (probe.whole) return text
  return probe.types.includes('link') ? base + text : base + ' ' + text
}

/**
 * Whether a probe fits a place: its type, and its value within the place's limit (null: no limit known).
 * @param {{type: string | null, limit: number | null, base: string, code: string}} place
 */
export const applies = (place, probe) =>
  Boolean(place.type) &&
  probe.types.includes(place.type) &&
  (place.limit == null || [...probedValue(place.base, probe, place.code)].length <= place.limit)

/**
 * The probe of each place in a pass: the first probe the ledger does not have for it yet, rotated by the place's
 * position, so one pass spreads the probes over the places.
 * @param {Array<object>} places `{key, type, limit, base, code}`, in a fixed order
 * @param {Array<object>} probes
 * @param {ReturnType<typeof probeLedger>} ledger
 * @returns {Map<string, object>} place key to probe
 */
export function packPass(places, probes, ledger) {
  const out = new Map()
  places.forEach((place, i) => {
    const fit = probes.filter((p) => applies(place, p))
    for (let n = 0; n < fit.length; n++) {
      const probe = fit[(i + n) % fit.length]
      if (!ledger.has(place.key, probe.id)) {
        out.set(place.key, probe)
        break
      }
    }
  })
  return out
}

/** The ledger: what became of each probe at each place (`written`, a finding kind, `refused_by_build`, ...). */
export function probeLedger() {
  const rows = new Map()
  const key = (place, probe) => place + '\u0000' + probe
  return {
    has: (place, probe) => rows.has(key(place, probe)),
    set(place, probe, entry) {
      rows.set(key(place, probe), { place, probe, ...entry })
    },
    get: (place, probe) => rows.get(key(place, probe)) ?? null,
    rows: () => [...rows.values()],
    /** The (place, probe) pairs that apply and no pass reached. */
    missing(places, probes) {
      const out = []
      for (const place of places)
        for (const probe of probes)
          if (applies(place, probe) && !rows.has(key(place.key, probe.id)))
            out.push({ place: place.key, probe: probe.id })
      return out
    }
  }
}
