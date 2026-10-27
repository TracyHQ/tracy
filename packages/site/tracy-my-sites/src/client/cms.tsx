/**
 * The CMS column of the My Sites table (Akemi, 30/09): the site's platform as its own logo. The logo
 * alone, not logo and name (Akemi chose it, 30/09), so the column stays as narrow as its header; the
 * name is the hover tooltip and the accessible name.
 *
 * The value is the `platform` field `/api/sites` already sends (`site.platform` in the seat book),
 * never a guess from the hostname. A row without one shows nothing: an invented CMS is worse than
 * an empty cell, because people trust what the table says.
 *
 * The logos are the marks `@tracy/ui` ships, the same ones the Design inspiration filter draws
 * (`tracy-design-inspiration/src/client/PlatformLogo.tsx`), so the two tabs cannot draw two
 * different Joomlas. Labels are proper nouns and are never translated, as in that filter.
 */
import type { JSX } from 'react'
import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'

/** The CMSes Tracy builds on, by the id the seat book stores (migration 002: joomla | wordpress | emdash). */
const CMS = {
  joomla: { label: 'Joomla', Logo: JoomlaIcon },
  wordpress: { label: 'WordPress', Logo: WordpressIcon },
  emdash: { label: 'EmDash', Logo: EmdashIcon }
} as const

/** The name shown for a platform id: the proper noun for a known CMS, the id itself otherwise. */
export function cmsLabel(platform: string | null | undefined): string | null {
  if (!platform) return null
  return CMS[platform as keyof typeof CMS]?.label ?? platform
}

/**
 * One cell. The logo is the compound icon itself: its `dark:` twin follows dsh's
 * `[data-ds-dark-theme]`, because `my-sites.css` points the `dark` variant there (none of the three
 * draws differently in the dark today: EmDash has one drawing for both themes).
 *
 * A platform without a logo (none today) shows its id as text: hiding a value the book holds would
 * be as wrong as inventing one.
 */
export function CmsCell({ platform }: { platform: string | null | undefined }): JSX.Element | null {
  const label = cmsLabel(platform)
  if (label === null) return null
  const known = CMS[platform as keyof typeof CMS]
  if (!known) return <span className="whitespace-nowrap text-xs">{label}</span>
  return (
    <span className="tracy-mysites-cms inline-flex items-center" title={label}>
      <known.Logo className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}
