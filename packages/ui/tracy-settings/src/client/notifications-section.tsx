/**
 * Settings › Notifications (spec #809 step 5, U11 = C): a table of five rows under two headings
 * (Team, Comments), each row with an Inbox and an Email switch.
 *
 * The rows, their order and which one is locked come from the server
 * (`GET /api/notifications/preferences`, `apps/tracy-web/src/notifications/preferences.js` is the
 * one place a kind maps to its group); this file only names them. A toggle saves at once
 * (`PUT`, one channel of one group), optimistic: the switch moves before the answer and moves back,
 * with a line saying so, when the save fails.
 *
 * The join-request row is locked on for everyone: drawn checked and disabled, with the sub-line
 * saying why. The server ignores an attempt to turn it off anyway. Its switches keep the full ON
 * colour (a dimmed one read as off in the dark theme) with a small lock beside them, and say
 * "Always on for Owners and Admins" as a tooltip and as their accessible description
 * (Akemi, 04/10/2026).
 *
 * In the desktop app (bridge protocol 2) one more row sits above the table: "Desktop", the system
 * notification shown when the agent finishes (turn-watch.ts). It is a setting of this computer,
 * read and saved through `window.tracyDesktop.app.notifications`, never through the server; on the
 * web it is not drawn at all.
 */
import { Fragment, useCallback, useEffect, useId, useMemo, useState, type JSX } from 'react'
import { Lock } from 'lucide-react'
import { Button, NativeSelect, NativeSelectOption, Switch } from '@tracy/ui'

export const NOTIFICATIONS_SECTION_ID = 'tracy-notifications'

const DOOR = '/api/notifications/preferences'

export type Channel = 'inbox' | 'email'

/** One row as the door answers it. */
export interface PreferenceGroup {
  readonly id: string
  readonly section: string
  readonly locked: boolean
  readonly inbox: boolean
  readonly email: boolean
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Groups whose label needs a line under it (`notifications.groupDesc.<id>`). */
const GROUPS_WITH_DESC = new Set(['site-changes'])

/** What the app answers about its system notifications (tasks/todo-desktop-onboard-agent.md). */
export interface NotifyStatus {
  readonly supported: boolean
  readonly enabled: boolean
  readonly permission: 'unknown'
  readonly lastShownAt: number | null
  /** `'system'` or a macOS alert sound name; absent from an app older than the Sound picker. */
  readonly sound?: string
}

/** The Sound picker's choices after System Default: macOS alert sounds, names never translated. */
export const MAC_SOUNDS: readonly string[] = [
  'Basso',
  'Blow',
  'Bottle',
  'Frog',
  'Funk',
  'Glass',
  'Hero',
  'Morse',
  'Ping',
  'Pop',
  'Purr',
  'Sosumi',
  'Submarine',
  'Tink'
]

/** The value of "System Default" in the Sound picker. */
export const SYSTEM_SOUND = 'system'

/** `window.tracyDesktop.app.notifications`, the part Settings uses. */
export interface DesktopNotifications {
  status(): Promise<NotifyStatus>
  setEnabled(on: boolean): Promise<NotifyStatus>
  test(): Promise<NotifyStatus>
  /** Absent from an app older than the Sound picker. */
  setSound?(name: string): Promise<NotifyStatus>
}

/** The app's notifications, when this page runs in an app at bridge protocol 2 or later. */
export function desktopNotifications(scope: unknown): DesktopNotifications | null {
  const app = (scope as { tracyDesktop?: { app?: unknown } } | null | undefined)?.tracyDesktop?.app as
    | { protocolVersion?: unknown; notifications?: Partial<DesktopNotifications> }
    | undefined
  if (app === undefined || app === null || typeof app !== 'object') return null
  if (typeof app.protocolVersion !== 'number' || app.protocolVersion < 2) return null
  const n = app.notifications
  if (typeof n?.status !== 'function' || typeof n.setEnabled !== 'function' || typeof n.test !== 'function')
    return null
  return n as DesktopNotifications
}

const isStatus = (value: unknown): value is NotifyStatus =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as NotifyStatus).supported === 'boolean' &&
  typeof (value as NotifyStatus).enabled === 'boolean'

/** The three things the row asks of the app; each answers the status the app now holds. */
export function desktopNotifyActions(bridge: DesktopNotifications): {
  load(): Promise<NotifyStatus | null>
  setEnabled(on: boolean): Promise<NotifyStatus | null>
  test(): Promise<NotifyStatus | null>
  setSound(name: string): Promise<NotifyStatus | null>
} {
  const settle = async (ask: () => Promise<unknown>): Promise<NotifyStatus | null> => {
    try {
      const answer = await ask()
      return isStatus(answer) ? answer : null
    } catch {
      return null
    }
  }
  return {
    load: () => settle(() => bridge.status()),
    setEnabled: (on) => settle(() => bridge.setEnabled(on)),
    test: () => settle(() => bridge.test()),
    setSound: (name) =>
      typeof bridge.setSound === 'function'
        ? settle(() => (bridge.setSound as (n: string) => Promise<NotifyStatus>)(name))
        : Promise.resolve(null)
  }
}

/**
 * The Desktop row, drawn from data alone. `status` null = not read yet: the switch waits, off.
 * The test button stays usable when the switch is off: the app shows a test whatever the switch.
 * Under the switch, the Sound picker and the test button side by side; the picker only when the
 * app reports a sound (an older app does not).
 */
export function DesktopNotifyView({
  t,
  status,
  onToggle,
  onTest,
  onSound
}: {
  t: Translate
  status: NotifyStatus | null
  onToggle: (on: boolean) => void
  onTest: () => void
  onSound: (name: string) => void
}): JSX.Element {
  const unsupported = status?.supported === false
  const soundId = useId()
  const sound = status?.sound
  // A name this list does not know (set by a newer app) is still shown as chosen, not replaced.
  const sounds =
    sound === undefined || sound === SYSTEM_SOUND || MAC_SOUNDS.includes(sound)
      ? MAC_SOUNDS
      : [...MAC_SOUNDS, sound]
  return (
    <div className="ts-row ts-ndesktop" data-row="desktop">
      <span className="ts-row-text">
        <span className="ts-row-title">{t('notifications.desktop.title')}</span>
        <span className="ts-row-desc">{t('notifications.desktop.desc')}</span>
        {unsupported && <span className="ts-row-desc">{t('notifications.desktop.unsupported')}</span>}
      </span>
      <span className="ts-ndesktop-controls">
        <Switch
          checked={status?.enabled === true}
          disabled={status === null || unsupported}
          aria-label={t('notifications.desktop.switch')}
          onCheckedChange={(value: boolean) => {
            onToggle(value)
          }}
        />
        <span className="ts-ndesktop-sound">
          {sound !== undefined && (
            <>
              <label className="ts-row-desc" htmlFor={soundId}>
                {t('notifications.desktop.sound')}
              </label>
              <NativeSelect
                id={soundId}
                size="sm"
                value={sound}
                disabled={unsupported}
                onChange={(event) => {
                  onSound(event.target.value)
                }}
              >
                <NativeSelectOption value={SYSTEM_SOUND}>
                  {t('notifications.desktop.soundSystem')}
                </NativeSelectOption>
                {sounds.map((name) => (
                  <NativeSelectOption key={name} value={name}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={status === null || unsupported}
            onClick={onTest}
          >
            {t('notifications.desktop.test')}
          </Button>
        </span>
      </span>
    </div>
  )
}

/** The Desktop row with its state: read once, saved at each press, the switch put back on a refusal. */
function DesktopNotifyRow({ t, bridge }: { t: Translate; bridge: DesktopNotifications }): JSX.Element {
  const [status, setStatus] = useState<NotifyStatus | null>(null)
  const actions = useMemo(() => desktopNotifyActions(bridge), [bridge])
  useEffect(() => {
    let live = true
    void actions.load().then((next) => {
      if (live && next !== null) setStatus(next)
    })
    return () => {
      live = false
    }
  }, [actions])
  const toggle = useCallback(
    (on: boolean) => {
      const before = status
      setStatus((current) => (current ? { ...current, enabled: on } : current))
      void actions.setEnabled(on).then((next) => setStatus(next ?? before))
    },
    [actions, status]
  )
  const test = useCallback(() => {
    void actions.test().then((next) => {
      if (next !== null) setStatus(next)
    })
  }, [actions])
  const chooseSound = useCallback(
    (name: string) => {
      const before = status
      setStatus((current) => (current ? { ...current, sound: name } : current))
      void actions.setSound(name).then((next) => setStatus(next ?? before))
    },
    [actions, status]
  )
  return <DesktopNotifyView t={t} status={status} onToggle={toggle} onTest={test} onSound={chooseSound} />
}

/** The groups with one channel of one group set to `value` (locked groups never change). */
export function applyToggle(
  groups: readonly PreferenceGroup[],
  id: string,
  channel: Channel,
  value: boolean
): PreferenceGroup[] {
  return groups.map((g) => (g.id === id && !g.locked ? { ...g, [channel]: value } : g))
}

/**
 * The table, drawn from data alone (rendered in tests without a network).
 * Each switch is named by its row and its column header (`aria-labelledby`), so a screen reader
 * hears "Mentions and replies, Email" rather than an unnamed switch.
 */
export function NotificationsTable({
  t,
  groups,
  onToggle
}: {
  t: Translate
  groups: readonly PreferenceGroup[]
  onToggle: (id: string, channel: Channel, value: boolean) => void
}): JSX.Element {
  const base = useId()
  const inboxHead = `${base}-inbox`
  const emailHead = `${base}-email`
  const sections: string[] = []
  for (const g of groups) if (!sections.includes(g.section)) sections.push(g.section)
  return (
    <div className="ts-ntable" role="table">
      <div className="ts-nrow ts-nhead" role="row">
        <span role="columnheader" />
        <span role="columnheader" id={inboxHead}>
          {t('notifications.column.inbox')}
        </span>
        <span role="columnheader" id={emailHead}>
          {t('notifications.column.email')}
        </span>
      </div>
      {sections.map((section) => (
        <Fragment key={section}>
          <div className="ts-nrow ts-nsection" role="row">
            <span role="rowheader">{t(`notifications.section.${section}`)}</span>
          </div>
          {groups
            .filter((g) => g.section === section)
            .map((g) => {
              const labelId = `${base}-${g.id}`
              const hintId = `${base}-${g.id}-hint`
              return (
                <div key={g.id} className="ts-nrow ts-ndata" role="row" data-group={g.id}>
                  <span className="ts-row-text" role="rowheader">
                    <span className="ts-row-title" id={labelId}>
                      {t(`notifications.group.${g.id}`)}
                    </span>
                    {GROUPS_WITH_DESC.has(g.id) && (
                      <span className="ts-row-desc">{t(`notifications.groupDesc.${g.id}`)}</span>
                    )}
                    {g.locked && <span className="ts-row-desc">{t('notifications.locked')}</span>}
                    {g.locked && (
                      <span className="ts-sr" id={hintId}>
                        {t('notifications.lockedHint')}
                      </span>
                    )}
                  </span>
                  {(['inbox', 'email'] as const).map((channel) => (
                    <span
                      key={channel}
                      className={g.locked ? 'ts-ncell is-locked' : 'ts-ncell'}
                      role="cell"
                      title={g.locked ? t('notifications.lockedHint') : undefined}
                    >
                      <Switch
                        checked={g.locked ? true : g[channel]}
                        disabled={g.locked}
                        aria-labelledby={`${labelId} ${channel === 'inbox' ? inboxHead : emailHead}`}
                        aria-describedby={g.locked ? hintId : undefined}
                        onCheckedChange={(value: boolean) => {
                          onToggle(g.id, channel, value)
                        }}
                      />
                      {g.locked && <Lock className="ts-nlock" aria-hidden="true" />}
                    </span>
                  ))}
                </div>
              )
            })}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * The section's body: the Desktop row in the app, then the table — loads the groups, saves each
 * toggle, rolls back a failed save.
 * @param desktop - the app's notifications; omitted = read from this page's window (null on the web).
 */
export function NotificationsSection({
  t,
  desktop
}: {
  t: Translate
  desktop?: DesktopNotifications | null
}): JSX.Element {
  const bridge =
    desktop === undefined ? desktopNotifications(typeof window === 'undefined' ? null : window) : desktop
  return (
    <>
      {bridge !== null && <DesktopNotifyRow t={t} bridge={bridge} />}
      <ServerNotifications t={t} />
    </>
  )
}

/** The table of the person's Inbox and Email switches, read from and saved to the server. */
function ServerNotifications({ t }: { t: Translate }): JSX.Element {
  const [groups, setGroups] = useState<PreferenceGroup[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await fetch(DOOR, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        if (!res.ok) throw new Error(`preferences answered ${res.status}`)
        const body = (await res.json()) as { groups?: PreferenceGroup[] }
        if (!Array.isArray(body.groups)) throw new Error('preferences answered no groups')
        if (live) setGroups(body.groups)
      } catch {
        if (live) setLoadFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const toggle = useCallback((id: string, channel: Channel, value: boolean) => {
    setSaveFailed(false)
    setGroups((current) => (current ? applyToggle(current, id, channel, value) : current))
    void (async () => {
      let ok = false
      try {
        const res = await fetch(DOOR, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ groups: { [id]: { [channel]: value } } })
        })
        ok = res.ok
      } catch {
        ok = false
      }
      if (!ok) {
        // Only this switch goes back: another toggle made meanwhile keeps its own outcome.
        setGroups((current) => (current ? applyToggle(current, id, channel, !value) : current))
        setSaveFailed(true)
      }
    })()
  }, [])

  if (loadFailed) return <p className="ts-row-desc ts-nnote">{t('notifications.loadFailed')}</p>
  if (groups === null) return <div className="ts-nloading" aria-busy="true" />
  return (
    <div className="ts-notifications">
      <NotificationsTable t={t} groups={groups} onToggle={toggle} />
      {saveFailed && (
        <p className="ts-row-desc ts-nnote" role="alert">
          {t('notifications.saveFailed')}
        </p>
      )}
    </div>
  )
}
