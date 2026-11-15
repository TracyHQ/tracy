// Fixed sentences the CMS prints from its language files (a footer's licence line, a copyright line): rendered block
// text that is no content slot but matches a language string, with its placeholders (`%s`, `%1$s`, `%date%`,
// `{name}`) taken as wildcards. A string whose placeholders include the site name prints the site name (a name
// slot); every other match is fixed text of its block. Pure.

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™'
}
const PLACEHOLDER = /%[a-z_]+%|%\d+\$[sd]|%[sd]|\{[a-z_]+\}/gi
const NAME_PLACEHOLDER = /%sitename%|\{sitename\}|\{site_?name\}/i
/** The shortest string worth matching: shorter ones ("Read more") are too common to name a source. */
export const MIN_FIXED_CHARS = 24

const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Text of an HTML snippet as a browser would show it: tags dropped, entities decoded, spaces collapsed. */
export function shownText(html) {
  // Strip tags until the text is stable, so "<<b>script>" cannot rebuild a tag after one pass.
  let stripped = String(html ?? '')
  for (let before = ''; before !== stripped; ) {
    before = stripped
    stripped = stripped.replace(/<[^>]*>/g, '')
  }
  return stripped
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** `KEY="value"` lines of a Joomla-style language file: `[{constant, value}]` (comments and sections skipped). */
export function parseIni(text) {
  const out = []
  for (const line of String(text ?? '').split('\n')) {
    const m = /^\s*([A-Z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(line)
    if (m) out.push({ constant: m[1], value: m[2].replace(/\\"/g, '"').replace(/"_QQ_"/g, '"') })
  }
  return out
}

/** The pattern a language value prints as, or null when it is too short to name a source. */
export function stringPattern(value) {
  const text = shownText(value)
  const fixed = text.replace(PLACEHOLDER, '')
  if (fixed.replace(/\s+/g, '').length < MIN_FIXED_CHARS - 8 || text.length < MIN_FIXED_CHARS) return null
  const parts = text.split(PLACEHOLDER).map((p) => norm(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${parts.join('.+?')}$`)
}

/**
 * The pattern a short language value (a form label, "Page %s of %s", "Previous article: %s") prints as, matched only
 * against a whole line: at least two letters outside the placeholders. Short values are common, so a hit names
 * every constant with that value (`source.constants`) and stays a guess (`source.short`) until the measurement
 * empties them all and sees the words leave.
 */
export function shortPattern(value) {
  const text = shownText(value)
  if ((text.replace(PLACEHOLDER, '').match(/\p{L}/gu) ?? []).length < 2) return null
  const parts = text.split(PLACEHOLDER).map((p) => norm(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${parts.join('.+?')}$`)
}

/** The one pattern proved by the matched language formats; competing or malformed identities stay unknown. */
export function cmsFormatPattern(source) {
  const formats = source?.formats
  if (
    !Array.isArray(formats) ||
    !formats.length ||
    !formats.some((f) => f?.file === source.file && f?.constant === source.constant)
  )
    return null
  const patterns = formats.map((f) =>
    typeof f?.file === 'string' && typeof f?.constant === 'string' && typeof f?.value === 'string'
      ? shortPattern(f.value)
      : null
  )
  return patterns.every((p) => p && p.source === patterns[0]?.source) ? patterns[0] : null
}

/**
 * @param {{lines: Array<{block: string, text: string, pageId?: string, path?: string, raw?: string}>, files: Array<{file: string, text: string}>, slotTexts?: string[], rankFile?: (file: string) => number}} o
 * @returns {{fixedTexts: object[], nameLines: object[]}} each `{block, text, pages, source: {file, constant}, placeholders}`
 */
export function matchCmsStrings({ lines, files, slotTexts = [], rankFile = () => 0 }) {
  const strings = []
  for (const f of files)
    for (const s of parseIni(f.text)) {
      const pattern = stringPattern(s.value)
      const short = pattern ? null : shortPattern(s.value)
      if (pattern || short) strings.push({ ...s, file: f.file, pattern: pattern ?? short, short: !pattern })
    }
  // When several constants share a value, the platform's rank of their files names the line (the template's or the
  // CMS's own before an add-on's); the order of the files breaks a tie.
  const rank = new Map(files.map((f) => [f.file, rankFile(f.file)]))
  strings.sort((a, b) => (rank.get(a.file) ?? 0) - (rank.get(b.file) ?? 0))
  const slots = new Set(slotTexts.map(norm))
  const by = new Map()
  for (const l of lines) {
    const text = norm(l.text)
    if (!text) continue
    // A line equal to a content sample is content when a long sentence matches. A short value ("Next") also equals
    // samples on other pages, so it stays a candidate: the measurement empties its constants and sees whether the
    // words leave (hide-cms-text.mjs).
    const long = slots.has(text) ? null : strings.find((s) => !s.short && s.pattern.test(text))
    const hits = long ? [long] : strings.filter((s) => s.short && s.pattern.test(text))
    const hit = hits[0]
    if (!hit) continue
    // A short value is keyed by its line too: a content line that only seems to fit it is measured
    // and ruled out on its own, never taking a real CMS line of that value in the block down with it.
    const holder = l.holder ? `|${JSON.stringify(l.holder.path)}` : ''
    const key = hit.short ? `${l.block}|${hit.constant}|${text}${holder}` : `${l.block}|${hit.constant}`
    const constants = [...new Set(hits.map((h) => h.constant))]
    const matching = strings.filter((s) => s.pattern.test(text))
    const formats = matching.some((s) => s.value.match(PLACEHOLDER))
      ? matching.map(({ file, constant, value }) => ({ file, constant, value }))
      : null
    const rec = by.get(key) ?? {
      block: l.block,
      text: String(l.text).replace(/\s+/g, ' ').trim(),
      source: {
        file: hit.file,
        constant: hit.constant,
        ...(hit.short ? { short: true, constants } : {}),
        ...(formats ? { formats } : {})
      },
      placeholders: [...new Set(hit.value.match(PLACEHOLDER) ?? [])],
      printsName: NAME_PLACEHOLDER.test(hit.value),
      at: l.path ? { path: l.path, raw: l.raw ?? l.block, ...(l.holder ? { holder: l.holder } : {}) } : null,
      pages: new Set()
    }
    if (l.pageId) rec.pages.add(l.pageId)
    by.set(key, rec)
  }
  const all = [...by.values()].map(({ printsName, ...r }) => ({ ...r, printsName, pages: r.pages.size }))
  return {
    fixedTexts: all.filter((r) => !r.printsName).map(({ printsName: _p, ...r }) => r),
    nameLines: all.filter((r) => r.printsName).map(({ printsName: _p, ...r }) => r)
  }
}

/** The language files a page may print from: the overrides, the site language's own folder and the template's. */
export function languageFilesOf({ listDir, tag, template }) {
  const pick = (dir) =>
    listDir(dir)
      .filter((f) => f.endsWith('.ini') && !f.endsWith('.sys.ini') && !f.includes('.override.'))
      .map((f) => `${dir}/${f}`)
  // The override file first: an overridden constant prints its override.
  return [
    `language/overrides/${tag}.override.ini`,
    ...pick(`language/${tag}`),
    ...(template ? pick(`templates/${template}/language/${tag}`) : [])
  ]
}

/**
 * The site's CMS-printed sentences from the pages read: `fixedTexts` (each still to be measured: `canHide` null) and
 * the name slots they explain (`nameSources`: printed name text -> the CMS setting it comes from).
 * @param {{reads: object[], idOf: Function, cms: {files: object[]}|null, slotTexts: string[], nameSetting: string|null}} o
 */
export function siteCmsTexts({ reads, idOf, cms, slotTexts, nameSetting }) {
  // `cms.none`: the platform prints no fixed sentence from a file a line can be matched against (the adapter's reason).
  if (!cms || cms.none)
    return {
      fixedTexts: [],
      nameLines: [],
      errors: [
        {
          kind: cms?.none ? 'not-on-platform' : 'missing',
          field: 'site.fixedTexts',
          reason: cms?.none ?? 'no web root to read the language files from (--webroot)'
        }
      ]
    }
  const lines = reads.flatMap((r) =>
    (r.textLines ?? [])
      .filter((l) => l.block)
      .map((l) => ({
        block: idOf(l.block, r),
        raw: l.block,
        path: r.path,
        text: l.text,
        pageId: r.pageId,
        holder: l.holder
      }))
  )
  const { fixedTexts, nameLines } = matchCmsStrings({
    lines,
    files: cms.files,
    slotTexts,
    rankFile: cms.rankFile
  })
  return {
    fixedTexts: fixedTexts.map((f) => ({ ...f, canHide: null, hiddenBy: null, evidence: null })),
    nameLines: nameLines.map((n) => ({ ...n, setting: nameSetting })),
    errors: []
  }
}

/** A printed name entry with the CMS setting and language string behind it, when one of `nameLines` explains it. */
export function withNameSource(entry, nameLines) {
  if (entry.kind !== 'printed' || entry.where !== 'text') return entry
  const hit = nameLines.find((n) => n.block === entry.block && norm(n.text).includes(norm(entry.sample)))
  return hit
    ? {
        ...entry,
        text: hit.text,
        source: { setting: hit.setting, through: hit.source, placeholders: hit.placeholders }
      }
    : entry
}
