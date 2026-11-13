// One icon field's record in the icon selection (ticket #595): the chosen icon with its theme versions at the declared
// frame, or hidden with why. Pure.
//
// A field that declares `theme` (`icon-fields.mjs`) takes exactly that theme's version; a field without it takes a
// light and a dark version. Every version is painted in colour roles (ADR 0043 section 1a), never a colour value.

/** ADR 0043 section 1a with no demo icon to read: the glyph in the accent, the other theme keeps the accent. */
export const DEFAULT_ICON_LOOK = Object.freeze({
  weight: 'regular',
  light: Object.freeze({ glyph: 'accent', plate: null }),
  dark: Object.freeze({ glyph: 'accent', plate: null })
})

/** The themes a field's icon is written in: its declared one, else both. */
export const themesOf = (field) => (field.theme ? [field.theme] : ['light', 'dark'])

/**
 * @param {object} scope an icon scope (`iconScopesOfPlan`)
 * @param {object} field one of its fields
 * @param {{name?: string, reason: string, by?: string, network?: string | null, words?: string[],
 *   keywords?: string[]}} chosen what the selection decided for the scope
 * @param {{set: string, look: typeof DEFAULT_ICON_LOOK}} context
 */
export function entryOf(scope, field, chosen, { set, look }) {
  const base = {
    id: field.id,
    page: scope.page,
    block: scope.block,
    blockId: scope.blockId,
    field: field.field,
    kind: field.kind,
    storage: field.storage,
    frame: field.frame,
    case: scope.case === 'social' ? 'social' : 'content',
    ...(scope.item ? { item: scope.item } : {}),
    ...(scope.row ? { row: scope.row } : {}),
    ...(field.theme ? { theme: field.theme } : {}),
    ...(scope.social ? { network: chosen.network ?? null } : {}),
    ...(chosen.words ? { words: chosen.words } : {}),
    ...(chosen.keywords ? { keywords: chosen.keywords } : {})
  }
  if (!chosen.name) return { ...base, source: 'none', reason: chosen.reason }
  const paint = (theme) => look?.[theme] ?? {}
  const version = (theme) => ({
    theme,
    icon: chosen.name,
    set,
    weight: look.weight,
    width: field.frame?.width ?? null,
    height: field.frame?.height ?? null,
    // The whole paint of the look is carried, so a key it should not hold is refused by the check, never dropped.
    paint: { ...paint(theme), glyph: paint(theme).glyph, plate: paint(theme).plate ?? null }
  })
  return {
    ...base,
    source: 'library',
    icon: { name: chosen.name, set, weight: look.weight },
    variants: Object.fromEntries(themesOf(field).map((t) => [t, version(t)])),
    sizeFrom: field.frame
      ? 'the frame the block store declares'
      : 'no frame declared: the template sizes the icon',
    by: chosen.by,
    reason: chosen.reason
  }
}
