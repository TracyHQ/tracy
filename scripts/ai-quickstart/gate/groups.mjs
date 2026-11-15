// The finding groups of the marker test (ticket #585): the findings read once per (group, source, text), with every
// page, place, theme side and width each was seen on, and the fix each group most likely needs. The fix class is a
// proposal for the owner's review (`record-html.mjs`), never applied by the gate:
//   kit_declare_keep   an interface string of the core, the template or an extension that is valid on every site:
//                      declare it kept in `overrides.language` with a reason
//   kit_write          a value the kit should write from a fact (the favicon from the logo, the account the build
//                      writes as, a template setting)
//   build_gap          the build team's write step left demo content, wrote no marker, or left a picture empty in a
//                      place it writes
//   template_patch     the template itself prints it (a literal of a layout, a stylesheet picture, a picture file)
//   external_request   a request to another host
//   unclassified       no source was found: the owner reads it (`unknown`, with what was searched)
// Pure.

export const FIX_CLASSES = Object.freeze([
  'kit_declare_keep',
  'kit_write',
  'build_gap',
  'template_patch',
  'external_request',
  'unclassified'
])

const sourceKey = (s) =>
  !s
    ? 'none'
    : s.class === 'ambiguous'
      ? `ambiguous:${s.candidates.map(sourceKey).join('+')}`
      : [s.class, s.key ?? s.slot ?? s.entry ?? s.table ?? s.file ?? s.host ?? '', s.column ?? ''].join(':')

const isIcon = (f) => f.place?.element === 'link[icon]' || /(?:^|\/)favicon\.[a-z]+$/i.test(f.value)

/** The fix class a finding most likely needs, from its group and its source. */
export function fixClassOf(f, { written = new Set() } = {}) {
  // Words more than one source holds: the fix of the likely one (the first in the search order).
  const s = f.source?.class === 'ambiguous' ? f.source.likely : (f.source ?? null)
  if (f.group === 'outside_request') return 'external_request'
  if (f.group === 'raw_markup') return 'build_gap'
  if (f.group === 'kit_reason_false') return 'kit_declare_keep'
  if (f.group === 'empty_picture' || f.group === 'unmarked_embed')
    return f.place?.module && written.has(f.place.module) ? 'build_gap' : 'template_patch'
  if (f.group === 'unmarked_picture' && isIcon(f)) return 'kit_write'
  switch (s?.class) {
    case 'language':
      return 'kit_declare_keep'
    case 'write':
      return s.table === 'users' || s.entry ? 'kit_write' : 'build_gap'
    case 'setting':
      // A setting of the site's own records the kit can write; one in a file of the template is the template's.
      return s.table ? 'kit_write' : 'template_patch'
    case 'block_field':
    case 'data':
      return 'build_gap'
    case 'literal':
    case 'stylesheet':
    case 'picture_file':
      return 'template_patch'
    case 'outside':
      return f.group === 'unmarked_picture' ? 'template_patch' : 'external_request'
    default:
      return 'unclassified'
  }
}

/** What a group is, in plain words for the owner. */
function labelOf(g) {
  const what = {
    unmarked_text: g.visible ? 'Words on the page' : 'Hidden words in the page',
    unmarked_picture: 'A picture',
    unmarked_link: 'A link to another site',
    empty_picture: 'A picture with no address',
    unmarked_embed: 'An embedded map, video or frame',
    kit_reason_false: 'Words the kit keeps saying no page shows them, shown here',
    raw_markup: 'Code printed as words',
    outside_request: 'A request to another site'
  }[g.group]
  const from = (s) =>
    ({
      language: `a language string of ${s?.owner === 'core' ? 'Joomla' : `the ${s?.owner ?? 'site'}`} (${s?.key})`,
      literal: `a file of the ${s?.owner ?? 'site'} (${s?.file})`,
      stylesheet: `a stylesheet of the ${s?.owner ?? 'site'} (${s?.file})`,
      picture_file: `a picture file of the ${s?.owner ?? 'site'} (${s?.file})`,
      block_field:
        `the demo content of a block (${s?.block ?? 'undeclared'} ${s?.field ?? s?.slot ?? ''})`.trim(),
      data: `the site's demo data (${s?.table ?? 'unknown table'})`,
      setting: `a template setting (${s?.table ?? s?.file})`,
      write: s?.table ? `the site's ${s.table} (${s.column})` : `a value the build wrote (${s?.entry ?? ''})`,
      outside: `another site (${s?.host})`,
      ambiguous: `one of ${s?.candidates?.length} sources (${s?.candidates?.map((c) => from(c)).join('; ')})`
    })[s?.class]
  return `${what}, from ${from(g.source) ?? 'a source the gate could not find'}`
}

/**
 * @param {object[]} findings `classify` findings (each with `source`)
 * @param {{written?: Set<number>}} [options] `written`: the module ids the write made
 * @returns {object[]} groups, most occurrences first: `{id, group, fixClass, label, value, source, visible,
 *   occurrences: [{page, path, place, where}], count, crop}`
 */
export function groupsOf(findings, { written = new Set() } = {}) {
  const by = new Map()
  for (const f of findings) {
    const text = f.group === 'outside_request' ? hostOf(f.value) : (f.rest ?? f.value)
    // A language string is one group whatever words its placeholders take ("Hits: 3", "Hits: 4").
    const key = `${f.group}|${sourceKey(f.source)}|${f.source?.class === 'language' ? '' : text}`
    let g = by.get(key)
    if (!g) {
      g = {
        group: f.group,
        value: text,
        source: f.source ?? null,
        fixClass: fixClassOf(f, { written }),
        visible: false,
        values: [],
        occurrences: [],
        crop: null
      }
      by.set(key, g)
    }
    g.visible ||= f.visible
    if (!g.values.includes(text) && g.values.length < 8) g.values.push(text)
    g.occurrences.push({ page: f.page, path: f.path, place: f.place, where: f.where })
    if (!g.crop && f.crop) g.crop = f.crop
  }
  const groups = [...by.values()]
    .map((g) => ({ ...g, count: g.occurrences.reduce((n, o) => n + o.where.length, 0), label: labelOf(g) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  groups.forEach((g, i) => {
    g.id = `g${String(i + 1).padStart(3, '0')}`
  })
  return groups
}

/** Counts of groups by fix class and by source class. */
export function groupCounts(groups) {
  const byFix = Object.fromEntries(FIX_CLASSES.map((c) => [c, 0]))
  const bySource = {}
  for (const g of groups) {
    byFix[g.fixClass] += 1
    const c = g.source?.class ?? 'none'
    bySource[c] = (bySource[c] ?? 0) + 1
  }
  return { byFix, bySource, unknown: bySource.unknown ?? 0 }
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return String(url)
  }
}
