/**
 * The dsh Settings dialog, redrawn with shadcn-admin's `Dialog`.
 *
 * Measurements taken from the real surface (`127.0.0.1:51740`): dialog **800×690**, navigation column **241px**, seven
 * sections. Those seven are copied in the exact order dsh shows them — `Tracy UI` and `Password Gate` are Tracy's,
 * the other five are dsh's.
 *
 * ⚠ THIS IS A DIALOG, NOT A PAGE. Worth noting because Tracy went the wrong way once: the first
 * settings were built as a full-screen page, then on 01/09 went back to the exact shape dsh
 * uses. Drawing it as a page here invites someone to go round that loop again.
 *
 * The right side deliberately has only a few rows: what is under discussion is the FRAME — left column, width, where the close
 * button sits — not each setting.
 */
import { useState } from 'react'

import { cn } from '@tracy/ui'
import { Button } from '@tracy/ui'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@tracy/ui'
import { ScrollArea } from '@tracy/ui'
import { SECTIONS, SectionBody } from './settings-sections'

/** Group order, exactly as `tracy-settings` declares it. */
const GROUPS = ['User settings', 'Sitespace'] as const

export function SettingsDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [section, setSection] = useState('general')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        🔒 MUST BE `sm:max-w-none`, NOT JUST `max-w-none`.
        `DialogContent` clamps at `sm:max-w-lg` by default. tailwind-merge treats `max-w-none` (no
        breakpoint) and `sm:max-w-lg` as TWO different properties so it keeps both — and from 640px
        up `sm:` wins. Measured `maxWidth: 512px` while the code says 800: the measurement looks ignored,
        but it is actually overridden by another class.

        LARGER THAN THE REAL dsh (800×690) — on purpose, decided 01/09: a drawing for discussing the design
        needs to be readable, and the real measurements are recorded at the top of the file for comparison.

        🔒 `min(…, vw/vh)` IS A SAFETY CONSTRAINT, NOT DECORATION. A dialog wider than
        the viewport puts the close button off screen — the user is stuck inside, and on a small machine
        the bug only shows on that small machine.
        `p-0` because the dialog splits itself into two columns and uses no shared padding.
      */}
      <DialogContent
        showCloseButton={false}
        className="h-[min(860px,88vh)] w-[min(1200px,92vw)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="flex h-full min-h-0">
          {/* 241px in the real dsh; keeping the ratio as the dialog grows makes this column a little wider. */}
          <nav className="flex w-64 shrink-0 flex-col border-border border-e bg-sidebar p-3">
            <DialogHeader className="px-2 pt-1 pb-3 text-start">
              <DialogTitle className="text-base">Settings</DialogTitle>
              <DialogDescription className="sr-only">
                Sitespace and account settings for this session.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1">
              {GROUPS.map((group) => (
                <div key={group} className="pb-2">
                  <div className="px-2 py-1.5 text-muted-foreground text-xs">{group}</div>
                  <div className="flex flex-col gap-0.5">
                    {SECTIONS.filter((item) => item.group === group).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSection(item.id)}
                        className={cn(
                          'rounded-md px-2 py-1.5 text-start text-sm',
                          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          section === item.id &&
                            'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </ScrollArea>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-13 shrink-0 items-center justify-end border-border border-b px-4">
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                Close settings
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-1 px-6 py-5">
                <SectionBody id={section} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
