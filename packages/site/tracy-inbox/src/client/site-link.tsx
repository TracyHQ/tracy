/**
 * The site a row is about, inside its sentence (layout "option F", Akemi 04/10): "Mentioned you on
 * javoyara.tracy.test". It reads as part of the phrase and only shows it is a link on hover.
 *
 * With the site's live address (`site-links.ts`) it is a real link that opens the site in a new
 * tab. The press stays on the link: it neither runs the row's own action nor marks it read.
 * Without an address it is plain text, never a link to a guess.
 */
import type { JSX } from 'react'

import type { Translate } from './strings'

export function SiteLink({
  site,
  href,
  t
}: {
  site: string
  href: string | null
  t: Translate
}): JSX.Element {
  if (href === null) return <span className="tracy-inbox-site">{site}</span>
  return (
    <a
      className="tracy-inbox-site is-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('action.openSite', { site })}
      title={t('action.openSite', { site })}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {site}
    </a>
  )
}
