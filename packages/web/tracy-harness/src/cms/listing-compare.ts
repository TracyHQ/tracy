/**
 * Whether the listing being edited still equals the one saved on the release (Templates page and
 * the old Quickstarts sheet, Akemi 10/10/2026). The unsaved mark on Save / Update listing is this
 * answer, not a flag set by the first edit: a field flipped and flipped back is not a change.
 *
 * Only what Save sends and the server keeps is compared — the fields an administrator owns
 * (`TYPED` in apps/tracy-web/src/lib/design-inspiration.js). `schemaVersion` and `template` are
 * written by the server, so they never make the form unsaved. Arrays (languages, layouts) keep
 * their order: a reordered page list is a change.
 *
 * No React here, so `test/listing-compare.test.mjs` pins every rule without a screen.
 */

/** One page of a listing, as far as the comparison reads it (`Layout` in DesignInspiration.tsx). */
export interface ComparedLayout {
  key: string
  label: string
  path: string
  address?: string
  count?: number
  shots?: { desktop?: string; mobile?: string }
}

/** A listing, as far as the comparison reads it (`Card` in DesignInspiration.tsx). */
export interface ComparedListing {
  provider: string
  category: string
  blurb: string
  image: string
  nav?: string
  hero?: string
  dark?: boolean
  defaultTheme?: 'light' | 'dark'
  languages?: string[]
  layouts: ComparedLayout[]
}

/** An empty picture name is no picture (`picturesOf` on the server skips it). */
const picture = (name: string | undefined) => (name === undefined || name === '' ? null : name)

/**
 * The owned fields in a fixed order, so two listings that say the same thing serialise the same.
 * `dark` absent reads as off, as the form's switch draws it (`card.dark ?? false`).
 */
function ownedFields(listing: ComparedListing) {
  return [
    listing.provider,
    listing.category,
    listing.blurb,
    picture(listing.image),
    listing.nav ?? null,
    listing.hero ?? null,
    listing.dark === true,
    listing.dark === true && listing.defaultTheme === 'dark' ? 'dark' : 'light',
    listing.languages ?? null,
    listing.layouts.map((l) => [
      l.key,
      l.label,
      l.path,
      l.address ?? null,
      l.count ?? null,
      picture(l.shots?.desktop),
      picture(l.shots?.mobile)
    ])
  ]
}

/** True when saving `edited` would store the same listing as `saved`. */
export function sameListing(edited: ComparedListing, saved: ComparedListing): boolean {
  return JSON.stringify(ownedFields(edited)) === JSON.stringify(ownedFields(saved))
}
