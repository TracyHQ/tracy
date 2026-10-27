/**
 * What the site's Settings tab and its Publish tab share: the header — CMS logo, the site's title,
 * CMS and version, the one chip that writes the site's state, "Open site" / "Open admin" — and the
 * reading of the site's snapshot behind it. Settings draws the CMS's facts under the header; the
 * Publish tab draws its wizard (`PublishWizard`) in place of the header.
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Button, useTabLoading } from '@tracy/ui'
import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'
import type { Translate } from '../team/translate'
import { TabHeader, Note, type PickableSite } from './pieces'
import {
  type Publishing,
  readPublishing,
  SITE_PUBLISH_EVENT,
  siteStatus,
  siteSummary,
  type Snapshot,
  snapshotIsOf
} from './settings-rows'
import { PUBLISH_POLL_MS, type PublishingControl, StatusChip, usePublishing } from './SiteDomains'

/** The marks My Sites and the invite wizard draw, by the platform id the snapshot carries. */
const CMS_LOGO = { joomla: JoomlaIcon, wordpress: WordpressIcon, emdash: EmdashIcon } as const

/** Who the site is and the two places people go from here. */
function SiteHead({
  siteKey,
  snapshot,
  publishing,
  t
}: {
  siteKey: string
  snapshot: Snapshot
  /** The site's publishing as last read; null when the server gave none (no chip is drawn then). */
  publishing: Publishing | null
  t: Translate
}): JSX.Element {
  const { name, sub } = siteSummary(snapshot, siteKey)
  const Logo = CMS_LOGO[snapshot.platform as keyof typeof CMS_LOGO]
  return (
    <div className="tv-site-head">
      <span className="tv-site-head-tile" aria-hidden="true">
        {Logo && <Logo className="tv-site-head-logo" aria-hidden />}
      </span>
      <div className="tv-site-head-text">
        <div className="tv-site-head-line">
          <div className="tv-site-head-name">{name}</div>
          {publishing && (
            <span className="tv-site-head-status" role="status" data-site-status={siteStatus(publishing)}>
              <StatusChip status={siteStatus(publishing)} t={t} />
            </span>
          )}
        </div>
        <div className="tv-site-head-sub">{sub}</div>
      </div>
      <div className="tv-site-head-actions">
        {snapshot.siteUrl && (
          <Button size="sm" render={<a href={snapshot.siteUrl} target="_blank" rel="noreferrer" />}>
            {t('settings.openSite')}
          </Button>
        )}
        {snapshot.adminUrl && (
          <Button
            size="sm"
            variant="outline"
            className="tv-site-head-outline"
            render={<a href={snapshot.adminUrl} target="_blank" rel="noreferrer" />}
          >
            {t('settings.openAdmin')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** What a tab's body is handed once the site's snapshot is read. */
export interface SiteScreenParts {
  siteKey: string
  snapshot: Snapshot
  /** The site's publishing state: the one the header's chip is drawn from. */
  control: PublishingControl
  /** A "Try again" button that reads the snapshot again. */
  retry: JSX.Element
  /** Read the snapshot again from nothing. */
  reload: () => void
  t: Translate
}

/** Which of the two tabs is drawn; written on the root as `data-site-screen`. */
type Screen = 'settings' | 'publish'

/** The tab once the snapshot is read: the publishing state lives here, shared by the chip and the body. */
function SiteScreenBody({
  screen,
  siteKey,
  snapshot,
  pollMs,
  retry,
  reload,
  refresh,
  children,
  t
}: {
  screen: Screen
  siteKey: string
  snapshot: Snapshot
  pollMs: number
  retry: JSX.Element
  reload: () => void
  /** Read the snapshot again keeping what is on screen until the answer is in. */
  refresh: () => void
  children: (parts: SiteScreenParts) => JSX.Element
  t: Translate
}): JSX.Element {
  const control = usePublishing(siteKey, readPublishing(snapshot.publishing), pollMs)
  // An operation the server ran has ended: the address, the admin link and the address state beside
  // the new publishing state are read again, as one snapshot. A press that was refused ran nothing.
  const running = control.publishing?.operation?.state === 'running'
  const ran = useRef(running)
  useEffect(() => {
    if (ran.current && !running) refresh()
    ran.current = running
  }, [running, refresh])
  // Settings has no publishing action of its own: its chip follows what the Publish tab of the same
  // site read. The Publish tab is the one that says it, so it does not listen to itself.
  const { read } = control
  useEffect(() => {
    if (screen !== 'settings') return
    const moved = (event: Event): void => {
      const told = (event as CustomEvent<{ siteKey?: unknown }>).detail?.siteKey
      if (told === siteKey) read()
    }
    window.addEventListener(SITE_PUBLISH_EVENT, moved)
    return () => window.removeEventListener(SITE_PUBLISH_EVENT, moved)
  }, [screen, siteKey, read])
  // The Publish tab is a stepped wizard on the Add site shell: no site head above it, its state
  // chip sits in the address step's card.
  if (screen === 'publish') return children({ siteKey, snapshot, control, retry, reload, t })
  return (
    <div className="tv-site-settings" data-site-screen={screen}>
      <div className="tas-wizard-head tv-site-settings-title">
        <h2 className="tas-wizard-title">{t('tab.settings')}</h2>
        <p className="tas-wizard-desc">{t('settings.lead')}</p>
      </div>
      <SiteHead siteKey={siteKey} snapshot={snapshot} publishing={control.publishing} t={t} />
      {children({ siteKey, snapshot, control, retry, reload, t })}
    </div>
  )
}

/** One of the site's two tabs: the tab header, the reading of the snapshot, the site head, then `children`. */
export function SiteScreen(props: {
  screen: Screen
  siteKey: string
  role: string | null
  sites: PickableSite[]
  onPick: (key: string) => void
  /** How often a running publish is asked about; a test shortens it. */
  pollMs?: number
  children: (parts: SiteScreenParts) => JSX.Element
  t: Translate
}): JSX.Element {
  const { siteKey, pollMs = PUBLISH_POLL_MS, t } = props
  // 🔒 A SNAPSHOT IS KEPT WITH THE SITE IT WAS ASKED FOR, AND DRAWN ONLY FOR THAT SITE. The site can
  // change (the picker, another tab opened on this one) while an answer is on its way or a quiet
  // re-read is pending; what is on screen then still belongs to the site before. It is never handed
  // to the body of the new site — not for one frame: the body would start its publishing state, its
  // buttons and its presses from another site's answer.
  const [loaded, setLoaded] = useState<{ site: string; snapshot: Snapshot } | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // A quiet read keeps what is on screen until its answer is in, and keeps it if none comes — for
  // the site it was asked for, and no other.
  const quiet = useRef<string | null>(null)
  const refresh = useCallback((): void => {
    quiet.current = siteKey
    setAttempt((v) => v + 1)
  }, [siteKey])
  const reload = useCallback((): void => {
    quiet.current = null
    setAttempt((v) => v + 1)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const keep = quiet.current === siteKey
    quiet.current = null
    if (!keep) {
      setLoaded(null)
      setFailedFor(null)
    }
    void fetch(`/api/sites/${encodeURIComponent(siteKey)}/settings`, {
      credentials: 'same-origin',
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable')
        const value = (await response.json()) as Snapshot
        // An answer that names another site is not this site's snapshot, whatever else it carries.
        if (value === null || typeof value !== 'object' || !snapshotIsOf(value, siteKey))
          throw new Error('unavailable')
        return value
      })
      .then((value) => {
        if (!controller.signal.aborted) setLoaded({ site: siteKey, snapshot: value })
      })
      .catch(() => {
        if (!controller.signal.aborted && !keep) setFailedFor(siteKey)
      })
    return () => controller.abort()
  }, [siteKey, attempt])
  const snapshot = loaded !== null && loaded.site === siteKey ? loaded.snapshot : null
  const failed = failedFor === siteKey
  // The tab's shared loading bar runs while the snapshot is read; the body waits empty (Akemi, 30/09).
  useTabLoading(snapshot === null && !failed)
  const retry = (
    <Button variant="outline" size="sm" onClick={reload}>
      {t('action.retry')}
    </Button>
  )
  return (
    <>
      <TabHeader siteKey={siteKey} role={props.role} sites={props.sites} onPick={props.onPick} t={t} />
      {!snapshot ? (
        failed && (
          <Note>
            {t('state.failed')}
            {retry}
          </Note>
        )
      ) : (
        <SiteScreenBody
          key={siteKey}
          screen={props.screen}
          siteKey={siteKey}
          snapshot={snapshot}
          pollMs={pollMs}
          retry={retry}
          reload={reload}
          refresh={refresh}
          t={t}
        >
          {props.children}
        </SiteScreenBody>
      )}
    </>
  )
}
