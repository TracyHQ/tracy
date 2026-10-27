/**
 * The pieces the invite wizard (layout D3) and the Approve dialog (V3) share, Akemi 04/10/2026.
 *
 * Both draw roles as compact rows in one bordered list, each with the Inbox's 28px round tile: a
 * pen for Editor, an eye for Viewer, a crown for Owner (ADR 0028; the Change role dialog is the
 * only place Owner is offered). The picked row gets the pale terracotta
 * tile and terracotta icon of the Inbox's "Needs your answer" card (option B), so the only strong
 * terracotta left on a step is its primary button and its tick.
 *
 * Every class here is styled by `site-tabs-rules.css` under `.tv-team-dialog` (mode B, DESIGN.md
 * §3.1): the dialog is portalled out of the plugin root, so the popup carries the scope itself.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { ChevronRight, Crown, Eye, Pencil } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@tracy/ui'

import { type InvitableRole, PERMISSIONS, roleAllows, type SeatRole } from './roster'
import type { Translate } from './translate'

const ROLE_ICON: Record<SeatRole, typeof Pencil> = { editor: Pencil, viewer: Eye, owner: Crown }
/** Editor first, the default and the commonest pick, then Viewer, then Owner (approved 08/10). */
const ROW_ORDER: readonly SeatRole[] = ['editor', 'viewer', 'owner']

/** A section heading in the Inbox's style: bold 13/18, an optional count chip and a right hint. */
export function SectionHeading({
  children,
  count,
  hint
}: {
  children: ReactNode
  count?: number
  hint?: ReactNode
}): JSX.Element {
  return (
    <p className="tv-team-sec">
      {children}
      {count !== undefined && <span className="tv-team-count">{count}</span>}
      {hint !== undefined && <span className="tv-team-sec-hint">{hint}</span>}
    </p>
  )
}

/**
 * The role picker: one row per role offered, the radio on the right. The radio keeps the id
 * `tracy-mysites-role-<role>` the wizard has always had, so a label or a test finds it by role.
 */
export function RoleRows<R extends SeatRole = InvitableRole>({
  roles,
  value,
  onChange,
  help,
  t
}: {
  roles: readonly R[]
  value: R | null
  onChange: (role: R) => void
  /** One quiet line under the list (the wizard says where Owners come from). */
  help?: string
  t: Translate
}): JSX.Element {
  return (
    <div>
      <SectionHeading>{t('wizard.role')}</SectionHeading>
      <RadioGroup
        value={value ?? ''}
        onValueChange={(v) => {
          const offered = roles.find((r) => r === v)
          if (offered !== undefined) onChange(offered)
        }}
        className="tv-team-list"
      >
        {ROW_ORDER.filter((role): role is R => (roles as readonly SeatRole[]).includes(role)).map((role) => {
          const Icon = ROLE_ICON[role as SeatRole]
          const id = `tracy-mysites-role-${role}`
          return (
            <label
              key={role}
              htmlFor={id}
              className="tv-team-row"
              data-selected={value === role ? '' : undefined}
            >
              <span className="tv-team-tile" aria-hidden="true">
                <Icon />
              </span>
              <span className="tv-team-row-text">
                <span className="tv-team-row-title">{t(`role.${role}`)}</span>
                <span className="tv-team-row-desc">{t(`role.${role}.summary`)}</span>
              </span>
              <RadioGroupItem id={id} value={role} />
            </label>
          )
        })}
      </RadioGroup>
      {help !== undefined && <p className="tv-team-help">{help}</p>}
    </div>
  )
}

/** What a role can do, folded behind "See what {role} can do" until the reader asks (V3). */
export function RolePermissions({ role, t }: { role: SeatRole; t: Translate }): JSX.Element {
  const [open, setOpen] = useState(false)
  const name = t(`role.${role}`)
  return (
    <div className="tv-team-perms">
      <button
        type="button"
        className="tv-team-disclose"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className="tv-team-chev" aria-hidden="true" />
        {t(open ? 'dialog.approve.hideRole' : 'dialog.approve.seeRole', { role: name })}
      </button>
      {open && (
        <>
          <ul className="tv-team-can">
            {PERMISSIONS.map((p) => {
              const ok = roleAllows(role, p.from)
              return (
                <li key={p.key} data-allowed={ok ? '' : undefined}>
                  <span className="tv-team-can-mark" aria-hidden="true">
                    {ok ? '✓' : '×'}
                  </span>
                  {t(p.key)}
                </li>
              )
            })}
          </ul>
          <p className="tv-team-help">{t('wizard.ownerNote')}</p>
        </>
      )}
    </div>
  )
}
