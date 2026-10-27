'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { cn } from '../../lib/utils'
import { Button } from './button'
import { XIcon } from 'lucide-react'

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs',
        className
      )}
      {...props}
    />
  )
}

/**
 * The X button's accessible name comes from the caller, already translated: a default here would be
 * English in every language (spec #730). The type makes `closeLabel` required whenever the button
 * shows, so a dialog cannot ship an untranslated name by omission.
 */
type DialogCloseProps =
  | { showCloseButton?: true; closeLabel: string }
  | { showCloseButton: false; closeLabel?: never }

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel,
  ...props
}: DialogPrimitive.Popup.Props & DialogCloseProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-4 text-popover-foreground text-sm outline-none duration-100 data-closed:animate-out data-open:animate-in sm:max-w-sm',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
}

/**
 * The footer's own Close button says what the caller hands it, for the same reason as the X of
 * `DialogContent`: asking for the button without its translated word is a type error (#797).
 */
type DialogFooterCloseProps =
  | { showCloseButton?: false; closeLabel?: never }
  | { showCloseButton: true; closeLabel: string }

function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel,
  children,
  ...props
}: React.ComponentProps<'div'> & DialogFooterCloseProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // `border-border`, not a bare `border-t`. A width with no colour falls back to
        // `currentColor`, and this library also ships into dsh's page, where the bundle carries no
        // preflight to set a default border colour (RULE #4). There the rule inherits the dialog's
        // own text colour and draws a bright white bar across the footer — measured 05/09 on the
        // My Sites delete dialog. In mode A it is the same grey it always was.
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-border border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>{closeLabel}</DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // `m-0` because this renders an `<h2>`: inside dsh's page there is no preflight, so the UA's
      // own heading margin survives and pushes the title away from the description that `gap-2` was
      // supposed to place. Same reason `Section` in `tracy-my-sites` re-wrote its own heading.
      className={cn('m-0 font-medium text-base leading-none', className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        // `m-0` for the same reason as the title: this is a `<p>`, and a UA margin of 1em under it
        // is what made the gap to the body of the dialog read as an accident.
        'm-0 text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
}
