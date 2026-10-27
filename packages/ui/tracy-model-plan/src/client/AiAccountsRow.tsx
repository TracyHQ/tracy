/**
 * The AI accounts row of the account menu (list slot `settings.menu.item`, declared by
 * `@tracy/dsh-settings`): the section's name, then the marks of the vendors the person has connected
 * (none: every allowed vendor greyed, and "Not connected"). Clicking it opens Settings › AI accounts.
 *
 * Two halves, like the chip: `AiAccountsRowView` draws from a `Stack` alone (rendered in tests);
 * `AiAccountsRow` is the slot entry, reading the page's one copy of the account status, which the
 * section itself keeps current after a Connect or a Disconnect.
 */
import { type JSX, useEffect, useSyncExternalStore } from 'react'
import { type MenuItemProps, PopoverItem } from '@tracy/core/site-tabs'
import { uiSwitches } from '@tracy/core/ui-switches'
import { accountStatus, type Stack, stackOf } from './account-status.ts'
import type { Translate } from './strings.ts'
import { VendorStack } from './vendor-marks.tsx'

/** The row's 16px mark: lucide `layers` (ISC), inline so the plugin needs no icon library. */
function LayersIcon(): JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </svg>
  )
}

/** The row, drawn from data alone; `stack` undefined (loading, or unreadable) → the name alone. */
export function AiAccountsRowView({
  t,
  stack,
  onOpen
}: {
  t: Translate
  stack: Stack | undefined
  onOpen: () => void
}): JSX.Element {
  let end: JSX.Element | undefined
  if (stack !== undefined && stack.vendors.length > 0) {
    const marks = <VendorStack vendors={stack.vendors} greyed={!stack.connected} />
    end = stack.connected ? (
      marks
    ) : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className="text-muted-foreground text-xs">{t('status.notConnected')}</span>
        {marks}
      </span>
    )
  }
  return (
    <PopoverItem itemId="ai-accounts" icon={<LayersIcon />} end={end} onClick={onOpen}>
      {t('nav')}
    </PopoverItem>
  )
}

/** Props of a `settings.menu.item` row: the menu's contract plus the slot's `t`. */
type RowProps = MenuItemProps & { readonly t: Translate }

/**
 * @param sectionId - the Settings section this row opens; its switch also hides the row.
 */
export function aiAccountsRow(sectionId: string) {
  return function AiAccountsRow({ t, openSettings }: RowProps): JSX.Element | null {
    const ui = uiSwitches()
    const shown = useSyncExternalStore(ui.subscribe, () => ui.isShown(sectionId))
    const status = useSyncExternalStore(accountStatus.subscribe, accountStatus.current)
    // Every opening of the menu reads again: an account connected on another device shows too.
    useEffect(() => {
      void accountStatus.refresh()
    }, [])
    if (!shown) return null
    return <AiAccountsRowView t={t} stack={stackOf(status)} onOpen={() => openSettings(sectionId)} />
  }
}
