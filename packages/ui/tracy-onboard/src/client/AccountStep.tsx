/**
 * Step 2 — "Pick your AI account": the mock's `stepAI`, drawn with the cards and the connect panel
 * Settings › AI accounts uses (`@tracy/dsh-model-plan/account-cards`, one design before and after
 * onboarding — Lee, 11/10/2026, tasks/todo-ai-accounts-unify.md). The grid comes from `accountView`
 * (flow.ts), which decides its three states; the panel under it from `connectPanel`
 * (connect-panel.ts), the mock's states A–G plus T (Tracy AI). This file binds the words from this
 * namespace, maps each panel state to the shared panel, and keeps the panel's small local state
 * (the paste field, "Copied"). "Show N more" sits under the panel.
 *
 * The first section is the built-in Tracy AI card ("Included with your Tracy account"): Default
 * while no private account is connected, Included once one is. Picking it shows its own panel and
 * never completes the step (`stepsDone` wants a private account). No fallback block here: that is
 * Settings' job.
 *
 * No "Yolo mode" / permissions switch here, unlike Orca: Tracy never runs commands on the customer's
 * computer (the agent works in the site's own container), so there is nothing to grant. Do not add it.
 */
import { type JSX, type ReactNode, useEffect, useState } from 'react'
import {
  type CardBadge,
  type CardVendor,
  type CardsLabels,
  CardsGrid,
  ConnectPanel
} from '@tracy/dsh-model-plan/account-cards'
import { type PanelView, TRACY } from './connect-panel.ts'
import type { AccountView, Vendor } from './flow.ts'
import { External } from './icons.tsx'
import { Bold, type T } from './text.tsx'
import { VENDOR_MARKS } from './vendor-marks.tsx'

/** The built-in card's name: the product's, not a string to translate (like `PRODUCT` in Onboard.tsx). */
export const TRACY_AI = 'Tracy AI'

export interface AccountStepProps {
  readonly t: T
  readonly view: AccountView
  readonly picked: string | null
  /** The connect panel under the grid. */
  readonly panel: PanelView
  /** Vendors with an AI account already connected: their card says "Connected". */
  readonly connected: readonly string[]
  /** The signed-in email, for the Tracy AI panel; null while unknown. */
  readonly account: string | null
  readonly onPick: (id: string) => void
  readonly onToggleMore: () => void
  readonly onRefresh: () => void
  readonly onInstall: (vendor: Vendor) => void
  /** "Connect now" and "Try again": start the picked vendor's sign-in. */
  readonly onConnect: () => void
  readonly onCancel: () => void
  /** Open the sign-in page (or a device vendor's page) again. */
  readonly onReopen: () => void
  /** The callback URL the person pasted. */
  readonly onSubmit: (url: string) => void
  /** Copy a device code; resolves whether it went through. */
  readonly onCopy: (code: string) => Promise<boolean> | void
  /** An API-key vendor: hand over to Settings › AI accounts. */
  readonly onOpenAccounts: () => void
}

/** A vendor's logo for its card: the table's mark, else the first letter of its name. */
function markOf(id: string, name: string): ReactNode {
  if (id === TRACY) return <span className="tv-ob-mark-tracy">T</span>
  const Mark = Object.hasOwn(VENDOR_MARKS, id) ? VENDOR_MARKS[id] : undefined
  if (Mark) return <Mark size={id === 'claude' ? 16 : 18} />
  return <span className="tv-ob-letter">{name.charAt(0).toUpperCase()}</span>
}

function StepPanel({
  t,
  panel,
  account,
  onConnect,
  onCancel,
  onReopen,
  onSubmit,
  onCopy,
  onOpenAccounts
}: Pick<
  AccountStepProps,
  't' | 'panel' | 'account' | 'onConnect' | 'onCancel' | 'onReopen' | 'onSubmit' | 'onCopy' | 'onOpenAccounts'
>): JSX.Element | null {
  // B2: the field for the callback URL, opened by its link; gone with the attempt.
  const [pasting, setPasting] = useState(false)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const pending = panel.kind === 'pending'
  useEffect(() => {
    if (pending) return
    setPasting(false)
    setUrl('')
  }, [pending])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  if (panel.kind === 'none') return null
  if (panel.kind === 'off') return <ConnectPanel state="off" title="" line={t('account.connectOff')} />
  if (panel.kind === 'tracy')
    return (
      <ConnectPanel
        state="tracy"
        title={TRACY_AI}
        line={account !== null ? t('account.tracyLine', { account }) : t('account.included')}
      />
    )
  const vendor = panel.vendor.name
  switch (panel.kind) {
    case 'idle':
      return (
        <ConnectPanel
          state="idle"
          title={t('connect.idle.title', { vendor })}
          line={t('connect.idle.line', { vendor })}
          actions={
            <button
              type="button"
              className="tv-ob-btn tv-ob-btn-primary"
              data-action="connect"
              onClick={onConnect}
            >
              {t('connect.now')}
            </button>
          }
        />
      )
    case 'key':
      return (
        <ConnectPanel
          state="key"
          title={t('connect.key.title', { vendor })}
          line={t('connect.key.line')}
          actions={
            <button
              type="button"
              className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
              data-action="open-accounts"
              onClick={onOpenAccounts}
            >
              {t('connect.key.open')} <External />
            </button>
          }
        />
      )
    case 'connected':
      return (
        <ConnectPanel
          state="connected"
          title={t('connect.connected.title', { vendor })}
          line={
            panel.account !== null
              ? t('connect.connected.line', { account: panel.account })
              : t('connect.connected.plain')
          }
        />
      )
    case 'error':
      return (
        <ConnectPanel
          state="error"
          alert
          title={t('connect.error.title', { vendor })}
          line={t('connect.error.line')}
          actions={
            <button
              type="button"
              className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
              data-action="retry"
              onClick={onConnect}
            >
              {t('connect.retry')}
            </button>
          }
        />
      )
    case 'pending': {
      const device = panel.device
      return (
        <ConnectPanel
          state={device ? 'device' : 'pending'}
          title={t('connect.pending.title', { vendor })}
          line={device ? t('connect.device.line', { vendor }) : t('connect.pending.line', { vendor })}
          actions={
            <button
              type="button"
              className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
              data-action="cancel"
              onClick={onCancel}
            >
              {t('connect.cancel')}
            </button>
          }
        >
          {device ? (
            <div className="tv-ob-device">
              <code className="tv-ob-code">{device.code}</code>
              <button
                type="button"
                className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
                data-action="copy"
                onClick={() => {
                  void Promise.resolve(onCopy(device.code)).then((ok) => ok && setCopied(true))
                }}
              >
                {copied ? t('connect.copied') : t('connect.copy')}
              </button>
              {panel.authorizeUrl !== null && (
                <button
                  type="button"
                  className="tv-ob-btn tv-ob-btn-primary tv-ob-btn-xs"
                  data-action="reopen"
                  onClick={onReopen}
                >
                  {t('connect.device.open', { vendor })} <External />
                </button>
              )}
            </div>
          ) : (
            <>
              {panel.authorizeUrl !== null && (
                <div className="tv-ob-connect-help">
                  <button type="button" className="tv-ob-link" data-action="reopen" onClick={onReopen}>
                    {t('connect.reopen')}
                  </button>
                  {!pasting && (
                    <span>
                      {t('connect.noReturn')}{' '}
                      <button
                        type="button"
                        className="tv-ob-link"
                        data-action="paste"
                        onClick={() => setPasting(true)}
                      >
                        {t('connect.paste')}
                      </button>
                    </span>
                  )}
                </div>
              )}
              {pasting && (
                <form
                  className="tv-ob-paste"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (url.trim() !== '') onSubmit(url.trim())
                  }}
                >
                  <input
                    className="tv-ob-input"
                    value={url}
                    placeholder={t('connect.paste')}
                    aria-label={t('connect.paste')}
                    autoComplete="off"
                    data-action="callback-url"
                    onChange={(event) => setUrl(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
                    data-action="submit"
                    disabled={panel.busy || url.trim() === ''}
                  >
                    {t('connect.submit')}
                  </button>
                </form>
              )}
            </>
          )}
        </ConnectPanel>
      )
    }
  }
}

export function AccountStep({
  t,
  view,
  picked,
  panel,
  connected,
  account,
  onPick,
  onToggleMore,
  onRefresh,
  onInstall,
  ...actions
}: AccountStepProps): JSX.Element {
  const looking = view.mode === 'looking'
  const labels: CardsLabels = {
    included: t('account.included'),
    // The scanning section's head follows the scan: looking, found, or "Popular" when a complete
    // scan found nothing (the shared grid counts the cards found; that count reads 0 then).
    found: looking ? t('account.looking') : view.mode === 'found' ? t('account.found') : t('account.popular'),
    popular: t('account.popular'),
    refresh: t('account.refresh'),
    showMore: (n) => t('account.showMore', { n }),
    showLess: t('account.showLess'),
    badge: {
      default: t('account.badge.default'),
      connected: t('account.connected'),
      included: t('account.badge.included')
    },
    picked: t('account.picked')
  }
  const card = (vendor: Vendor): CardVendor => ({
    id: vendor.id,
    name: vendor.name,
    found: view.found.has(vendor.id)
  })
  const tracy: CardVendor = { id: TRACY, name: TRACY_AI, builtin: true }
  // Tracy AI is the default while no private account is connected; a connected vendor says so.
  const badgeOf = (id: string): CardBadge =>
    id === TRACY
      ? connected.length === 0
        ? 'default'
        : 'included'
      : connected.includes(id)
        ? 'connected'
        : null
  return (
    <div className="tv-ob-stack" data-step="account" data-mode={view.mode}>
      {view.note && <div className="tv-ob-note">{t('account.noneFound')}</div>}
      <CardsGrid
        labels={labels}
        tracy={tracy}
        found={view.primary.map(card)}
        more={view.more.map(card)}
        scanning={view.scans}
        count={view.mode === 'found' ? view.count : null}
        looking={looking}
        expanded={view.expanded}
        onToggleMore={onToggleMore}
        picked={picked}
        onPick={onPick}
        badgeOf={badgeOf}
        mark={(id) =>
          markOf(
            id,
            id === TRACY ? TRACY_AI : ([...view.primary, ...view.more].find((v) => v.id === id)?.name ?? id)
          )
        }
        onRefresh={view.scans ? onRefresh : undefined}
      >
        <StepPanel t={t} panel={panel} account={account} {...actions} />
      </CardsGrid>
      {view.warn && (
        <div className="tv-ob-warn" data-warn={view.warn.id}>
          <span>
            <Bold t={t} k="account.notInstalled" param="vendor" value={view.warn.name} />
          </span>
          {view.warn.homepage !== null && (
            <button
              type="button"
              className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
              data-action="install"
              onClick={() => onInstall(view.warn as Vendor)}
            >
              {t('account.install')} <External />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
