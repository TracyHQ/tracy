import { Badge, Skeleton, Spinner } from '@tracy/ui'

import { CmsTag, SocialMark, SOCIAL_NAME } from '../brand-icons.tsx'
import { LOW_WEBSITE_SCORE, websiteSummary } from '../model.ts'
import type { PlaceRow, Translate } from '../types.ts'

function HostLink({ row, host }: { row: PlaceRow; host?: string }) {
  if (!host || !row.website) return null
  return (
    <a className="tracy-wo-host" href={row.website} target="_blank" rel="noreferrer">
      {host}
    </a>
  )
}

/** `28/100 · not mobile-friendly · © 2014 · [Blogger] Blogger`, `Checked · no speed score · [WordPress]`, No website, Facebook only, Site down, Checking…, Could not check. */
export function WebsiteCell({ t, row, now }: { t: Translate; row: PlaceRow; now?: Date }) {
  const s = websiteSummary(row, now)
  switch (s.kind) {
    case 'none':
      return <Badge variant="outline">{t('cell.website.none')}</Badge>
    case 'social': {
      const network = s.network ?? 'facebook'
      const href = row.socials?.[network] ?? undefined
      return (
        <a className="tracy-wo-line tracy-wo-link" href={href} target="_blank" rel="noreferrer">
          <SocialMark network={network} />
          {t('cell.website.socialOnly', { network: SOCIAL_NAME[network] })}
        </a>
      )
    }
    case 'down':
      return (
        <div className="tracy-wo-cell">
          <Badge variant="destructive">{t('cell.website.down')}</Badge>
          <HostLink row={row} host={s.host} />
        </div>
      )
    case 'blocked':
    case 'unknown':
      return (
        <div className="tracy-wo-cell">
          <span className="tracy-wo-muted">
            {t(s.kind === 'blocked' ? 'cell.website.blocked' : 'cell.website.unknown')}
          </span>
          <HostLink row={row} host={s.host} />
        </div>
      )
    case 'checking':
      return (
        <div className="tracy-wo-cell">
          <span className="tracy-wo-loading">
            <Spinner label={t('cell.website.checking')} className="size-3.5" />
            {t('cell.website.checking')}
          </span>
          <span className="tracy-wo-skel-stack" aria-hidden>
            <Skeleton className="tracy-wo-skel tracy-wo-skel-long" />
            <Skeleton className="tracy-wo-skel tracy-wo-skel-short" />
          </span>
        </div>
      )
    case 'score':
    case 'noScore': {
      const score = s.score ?? 0
      const parts = s.notes.map((n) => (
        <span key={n}>
          {' · '}
          {t(`cell.website.note.${n}`, { year: s.copyrightYear })}
        </span>
      ))
      return (
        <div className="tracy-wo-cell">
          <span>
            {s.kind === 'score' ? (
              <span className="tracy-wo-web-score" data-low={score < LOW_WEBSITE_SCORE}>
                {t('cell.website.score', { score })}
              </span>
            ) : (
              <span className="tracy-wo-muted">{t('cell.website.noScore')}</span>
            )}
            <span className="tracy-wo-muted">
              {parts}
              {s.cms ? (
                <>
                  {' · '}
                  <CmsTag name={s.cms} />
                </>
              ) : null}
            </span>
          </span>
          <HostLink row={row} host={s.host} />
        </div>
      )
    }
  }
}
