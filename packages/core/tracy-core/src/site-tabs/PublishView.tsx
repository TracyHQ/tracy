/**
 * The site's Publish tab (07/10/2026; a stepped wizard since 23/10/2026): the tab header, then
 * `PublishWizard` on the Add site shell. An Owner chooses to put the site online with Tracy or to
 * download it as a ZIP; an Editor publishes on the Tracy address; a Viewer is told who can. Opened
 * from "Publish" in a My Sites row's menu, and from its "Export site as ZIP" and "Sync from live"
 * (`arrival`). The Settings tab (`SettingsView`) keeps the site header and the CMS's facts.
 */
import type { JSX } from 'react'
import type { Translate } from '../team/translate'
import type { PickableSite } from './pieces'
import { type PublishArrival, PublishWizard } from './publish/PublishWizard'
import { siteSummary } from './settings-rows'
import { SiteScreen } from './SiteScreen'

export type { PublishArrival } from './publish/PublishWizard'

export function PublishView(props: {
  siteKey: string
  role: string | null
  sites: PickableSite[]
  onPick: (key: string) => void
  /** The "…" menu sent the person to the ZIP flow, at its start or its Sync step. */
  arrival?: PublishArrival | null
  /**
   * Whether `sites` is the list's answer: the plan (Sync or not) waits for it. Absent: a list that
   * holds rows is taken as the answer.
   */
  sitesState?: 'loading' | 'ready' | 'failed'
  /** Ask the sites list again after it could not be read. */
  onRetrySites?: () => void
  /** How often a running publish is asked about; a test shortens it. */
  pollMs?: number
  t: Translate
}): JSX.Element {
  const { arrival, sitesState, onRetrySites, ...screen } = props
  const listed = sitesState ?? (props.sites.length > 0 ? 'ready' : 'loading')
  const imported =
    listed === 'ready'
      ? props.sites.find((site) => site.siteKey === props.siteKey)?.imported === true
      : listed
  return (
    <SiteScreen screen="publish" {...screen}>
      {({ siteKey, snapshot, control, reload, t }) => (
        <PublishWizard
          key={siteKey}
          siteKey={siteKey}
          siteName={siteSummary(snapshot, siteKey).name}
          snapshot={snapshot}
          control={control}
          refresh={reload}
          role={props.role}
          imported={imported}
          onRetrySites={onRetrySites}
          arrival={arrival}
          t={t}
        />
      )}
    </SiteScreen>
  )
}
