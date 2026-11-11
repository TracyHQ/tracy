// Shared icon declarations and font-family resolution for the copy checker and the write step.
const each = (value) => (Array.isArray(value) ? value : [])

/** Every icon of the kit by slot id, with the classes of its list's rows by network name. */
export function iconsOf(kit) {
  const icons = new Map()
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists)) {
      const rowIcons = each(list?.rows).flatMap((row) => each(row?.slots).filter((s) => s?.type === 'icon'))
      const classes = new Map(
        rowIcons.filter((s) => s.network && s.fieldValue).map((s) => [s.network.toLowerCase(), s.fieldValue])
      )
      for (const icon of rowIcons) icons.set(icon.id, { field: icon.field ?? null, classes })
    }
  return icons
}

/** Network names that differ between icon sets and addresses; the kit names a network by its rows' own word. */
const ALIASES = {
  x: ['x', 'twitter'],
  'x-twitter': ['x', 'twitter'],
  'facebook-f': ['facebook'],
  'linkedin-in': ['linkedin']
}
// These brand glyphs exist in both Font Awesome 4 and 5. A demo list is a sample, not the font's catalogue.
// Infer only a family already evidenced by this list; unknown and mixed families stay refused.
const COMMON_GLYPHS = new Set(['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'pinterest'])
export function iconClassOf(classes, network) {
  const found = (ALIASES[network] ?? [network]).map((n) => classes.get(n)).find((v) => typeof v === 'string')
  if (found) return found
  const name = network === 'x' || network === 'x-twitter' ? 'twitter' : network
  if (!COMMON_GLYPHS.has(name)) return null
  const families = [...classes.values()].map((v) => /^(fa|fab|fa-brands) fa-[a-z-]+$/.exec(v)?.[1])
  return families.length && families[0] && families.every((f) => f === families[0])
    ? `${families[0]} fa-${name}`
    : null
}

/** The network an icon class draws (`fa-brands fa-instagram`, `fab fa-x-twitter`), or null. */
export function networkOfClass(value) {
  const found =
    /(?:^|\s)fa-(facebook-f|facebook|instagram|x-twitter|twitter|linkedin-in|linkedin|youtube|tiktok|pinterest|whatsapp|telegram|threads)(?=\s|$)/i.exec(
      String(value ?? '')
    )
  return found ? found[1].toLowerCase() : null
}

/** The declared classes and the common glyphs that the evidenced font family can draw. */
export function iconClassOptions(classes) {
  return new Set([
    ...classes.values(),
    ...[...COMMON_GLYPHS].map((network) => iconClassOf(classes, network)).filter(Boolean)
  ])
}
