/**
 * Runtime CMS overview. Editing CMS options stays in the CMS admin.
 *
 * Layout D (Akemi 04/10/2026): the site header (`SiteScreen`: the CMS logo, the site's title, CMS
 * and version, the state chip, "Open site" / "Open admin"), then the CMS's facts as compact rows,
 * label left and value right, each with the admin page that edits it behind an open-in icon shown
 * on hover.
 *
 * The site's address, Publish / Back to draft and its own domain are not here: they are the site's
 * Publish tab (`PublishView`, 07/10/2026).
 */
import type { JSX } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Translate } from '../team/translate'
import type { PickableSite } from './pieces'
import { cmsNames, settingRows } from './settings-rows'
import { SiteScreen, type SiteScreenParts } from './SiteScreen'

/** The CMS's facts, under the site head. */
function CmsFacts({ snapshot, retry, t }: SiteScreenParts): JSX.Element {
  const name = cmsNames[snapshot.platform ?? '']
  const facts = settingRows(snapshot, t)
  return (
    <section aria-label={name ? t('settings.cms', { cms: name }) : t('tab.settings')}>
      <h2 className="tv-site-sec">
        {name ? t('settings.cms', { cms: name }) : t('tab.settings')}
        <span className="tv-count-pill">{facts.length}</span>
      </h2>
      {snapshot.state !== 'ready' && (
        <div className="tv-site-settings-error">
          {t('settings.readFailed')} {retry}
        </div>
      )}
      <ul className="tv-site-rows">
        {facts.map((row) => (
          <li key={row.key} className="tv-site-row" data-setting={row.key}>
            <span className="tv-site-row-label">{row.label}</span>
            <span className="tv-site-row-value" title={row.value}>
              {row.value}
            </span>
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noreferrer"
                aria-label={t('settings.open', { label: row.label })}
                title={row.href}
                className="tv-site-row-link"
              >
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            ) : (
              <span className="tv-site-row-link" aria-hidden="true" />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SettingsView(props: {
  siteKey: string
  role: string | null
  sites: PickableSite[]
  onPick: (key: string) => void
  /** How often a running publish is asked about; a test shortens it. */
  pollMs?: number
  t: Translate
}): JSX.Element {
  return (
    <SiteScreen screen="settings" {...props}>
      {(parts) => <CmsFacts {...parts} />}
    </SiteScreen>
  )
}
