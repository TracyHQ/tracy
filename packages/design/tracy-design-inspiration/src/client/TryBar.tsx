/**
 * The thin bar a try leaves on the page (Akemi, 13/10/2026, option A): after Try on your site both popups
 * close and the customer is taken to the Browser panel, so the sentence "<Name> is on your site now" and
 * its two answers, Undo and Keep, must meet them THERE, not stay behind in the Design system tab.
 *
 * It is drawn in the plugin's own root on the page (`try-bar-host.tsx`) over the try the plugin module
 * holds (`try-store.mjs`), NOT in the tab: on dsh's right column the Browser tab takes the pane and the
 * Design system tab unmounts (measured on dev 13/10/2026: a bar portaled from the tab went with it). It is
 * fixed at the bottom of the window, over whichever tab is open. Undo presses the undo door; Keep only
 * takes the bar down (the system stays). It leaves with the try: an undo at another door (the Browser
 * toolbar, a Site changes row) drops the try, and the bar with it.
 */
import { Button } from '@tracy/ui'
import { Check, Undo2 } from 'lucide-react'
import type { JSX } from 'react'

import type { Translate } from './strings'

export function TryBar({
  name,
  busy,
  canUndo,
  onUndo,
  onKeep,
  t
}: {
  /** The system on the site from the try. */
  name: string
  busy: 'apply' | 'undo' | null
  /** The try has an apply the undo door takes, and this seat may press it. */
  canUndo: boolean
  onUndo: () => void
  onKeep: () => void
  t: Translate
}): JSX.Element {
  return (
    // The plugin's root class comes along: the sheet's base rules and utilities are scoped to it.
    <div
      className="tracy-design-inspiration pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex justify-center px-4"
      data-try-bar=""
    >
      <div
        role="status"
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-popover py-1.5 pr-1.5 pl-4 text-popover-foreground text-sm shadow-md"
      >
        <span className="min-w-0 truncate font-medium">{t('ds.try.title', { name })}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null || !canUndo}
          onClick={onUndo}
          data-try-bar-undo=""
        >
          <Undo2 size={14} aria-hidden="true" />
          {busy === 'undo' ? t('ds.undoing') : t('ds.undo')}
        </Button>
        <Button size="sm" disabled={busy !== null} onClick={onKeep} data-try-bar-keep="">
          <Check size={14} aria-hidden="true" />
          {t('ds.keep')}
        </Button>
      </div>
    </div>
  )
}
