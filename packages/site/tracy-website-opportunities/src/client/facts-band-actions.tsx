/**
 * The action cluster at the right of every Business facts band header (#537, design A): [Add more] (Photos & video
 * only), the band's switch with its state word (On the site / Off the site), and Edit. The cluster sits in fixed-width
 * slots and right-aligns the same way on every band, so the switches and the Edit controls line up down the page.
 * A locked band shows its switch disabled with a lock and the reason on hover; a band with no Edit shows Edit disabled
 * with the reason on hover. Edit saves through the band's own form, whose footer (Cancel, Save) sits at the band's
 * bottom right.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Lock, Pencil } from 'lucide-react'
import { Button, Switch } from '@tracy/ui'

import type { Translate } from './strings.ts'

/** A band's place on the site: on or off, and the call that changes it (null: the switch cannot be pressed). */
export interface BandSwitchView {
  on: boolean
  set: ((on: boolean) => Promise<boolean>) | null
  /** Why the switch cannot be pressed, on hover. */
  why?: string | null
  /** Locked by Tracy (the business always shows, research details never do): a lock follows the state word. */
  lock?: boolean
}

/** Edit of a band: its form drawn in place of the body, or the reason it has none. */
export type EditDoor = { form: (close: () => void) => ReactNode } | { why: string }

export function BandSwitch({
  t,
  view,
  small = false,
  label
}: {
  t: Translate
  view: BandSwitchView
  small?: boolean
  /** The accessible name: what the switch puts on the site. */
  label: string
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const set = view.set
  const flip = async (on: boolean): Promise<void> => {
    if (set === null || busy) return
    setBusy(true)
    setFailed(false)
    setFailed(!(await set(on)))
    setBusy(false)
  }
  const word = t(view.on ? 'facts.on' : 'facts.off')
  return (
    <span
      className="tracy-wo-facts-sw"
      data-on={view.on ? '' : undefined}
      data-lock={set === null ? '' : undefined}
      data-failed={failed ? '' : undefined}
      title={failed ? t('facts.failed') : (view.why ?? undefined)}
    >
      <Switch
        size="sm"
        checked={view.on}
        disabled={set === null || busy}
        aria-label={`${label}: ${word}`}
        onCheckedChange={(on) => void flip(on)}
      />
      <span className={small ? 'tracy-wo-facts-sw-word tracy-wo-small' : 'tracy-wo-facts-sw-word'}>
        {word}
      </span>
      {view.lock ? <Lock aria-hidden="true" className="tracy-wo-facts-lock" /> : null}
      {/* Read out at once; on screen the word turns red and the sentence shows on hover. */}
      {failed ? (
        <span className="tracy-wo-facts-sw-failed" role="alert">
          {t('facts.failed')}
        </span>
      ) : null}
    </span>
  )
}

/** The cluster: the Add more slot (Photos & video), the switch slot and the Edit slot, always in this order. */
export function BandCluster({
  t,
  label,
  add,
  onSite,
  edit,
  editing,
  onEdit
}: {
  t: Translate
  label: string
  add?: ReactNode
  onSite: BandSwitchView
  edit: EditDoor
  editing: boolean
  onEdit: () => void
}): JSX.Element {
  const why = 'why' in edit ? edit.why : undefined
  return (
    <span className="tracy-wo-facts-cl">
      {add === undefined ? null : <span className="tracy-wo-facts-slot-add">{add}</span>}
      <span className="tracy-wo-facts-slot-sw">
        <BandSwitch t={t} view={onSite} label={label} />
      </span>
      <span className="tracy-wo-facts-slot-edit">
        <button
          type="button"
          className="tracy-wo-facts-act"
          disabled={why !== undefined || editing}
          title={why}
          aria-expanded={why === undefined ? editing : undefined}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
          {t('profile.edit')}
        </button>
      </span>
    </span>
  )
}

/** The footer of a band in Edit: a note on the left, Cancel and Save (or Done alone) at the bottom right. */
export function EditFooter({
  t,
  onCancel,
  onSave,
  note
}: {
  t: Translate
  onCancel: () => void
  /** Saves the band; answers whether it went through. Absent: the fields save themselves, only Done shows. */
  onSave?: () => Promise<boolean>
  note?: ReactNode
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (): Promise<void> => {
    if (onSave === undefined || busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onSave()
    setBusy(false)
    if (ok) onCancel()
    else setFailed(true)
  }
  return (
    <div className="tracy-wo-facts-bf">
      <span className="tracy-wo-facts-bf-note">
        {failed ? (
          <span className="tracy-wo-error" role="alert">
            {t('profile.edit.failed')}
          </span>
        ) : (
          note
        )}
      </span>
      {onSave === undefined ? (
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t('facts.done')}
        </Button>
      ) : (
        <>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            {t('profile.edit.cancel')}
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
            {t('profile.edit.save')}
          </Button>
        </>
      )}
    </div>
  )
}
