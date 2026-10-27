'use client'

import * as React from 'react'
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button } from './button'

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs',
        className
      )}
      {...props}
    />
  )
}

/**
 * A dragged sheet's floor and ceiling, in pixels. The floor is where the two-column forms inside
 * stop fitting side by side; the ceiling leaves a strip of the page behind it visible, because a
 * sheet that covers everything is a page, and a sheet is not one.
 */
const MIN_WIDTH = 360
const EDGE_MARGIN = 80
/** One press of an arrow key on the handle. Coarse enough to be worth pressing, fine enough to aim. */
const KEY_STEP = 24

/** Where a dragged width is remembered, per sheet. */
const widthKey = (id: string) => `tracy.sheet.width.${id}`

/**
 * Reading and writing here is guarded because `localStorage` does not merely come back empty in a
 * private window or with site data blocked — the accessor itself throws, and a sheet that cannot
 * open is a worse outcome than a width that is not remembered.
 */
function readWidth(id: string): number | null {
  try {
    const raw = window.localStorage.getItem(widthKey(id))
    const px = raw === null ? Number.NaN : Number.parseInt(raw, 10)
    return Number.isFinite(px) ? px : null
  } catch {
    return null
  }
}

function writeWidth(id: string, px: number | null) {
  try {
    if (px === null) window.localStorage.removeItem(widthKey(id))
    else window.localStorage.setItem(widthKey(id), String(px))
  } catch {
    // A viewer who cannot store is a viewer who resizes for this visit only.
  }
}

/**
 * The accessible names of the sheet's two controls come from the caller, already translated: a
 * default here would be English in every language (#797, as `DialogContent` since #730). The
 * types make each name required exactly when its control is drawn.
 */
type SheetCloseProps =
  | { showCloseButton?: true; closeLabel: string }
  | { showCloseButton: false; closeLabel?: never }

type SheetResizeProps =
  | {
      /** Opt in to a drag handle on the sheet's inner edge. Off by default: every sheet that has
       *  not asked for one keeps the width its classes give it. */
      resizable: true
      /** Accessible name of the drag handle. */
      resizeLabel: string
    }
  | { resizable?: false; resizeLabel?: never }

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  closeLabel,
  resizable = false,
  resizeLabel,
  resizeId,
  style,
  ...props
}: SheetPrimitive.Popup.Props &
  SheetCloseProps &
  SheetResizeProps & {
    side?: 'top' | 'right' | 'bottom' | 'left'
    /** Remember this sheet's dragged width under this id. Without one the width lasts the visit. */
    resizeId?: string
  }) {
  const [width, setWidth] = React.useState<number | null>(null)
  // A left or right sheet has a width to drag. Top and bottom would be a height, and no caller
  // has asked for one — so they stay exactly as they were rather than growing a handle that
  // moves the wrong axis.
  const canResize = resizable && (side === 'left' || side === 'right')
  // What the pointer grabbed, and the last width applied. Both are refs because a pointer move
  // fires faster than a render, and the handler must read the value it just wrote.
  const grab = React.useRef<{ x: number; width: number } | null>(null)
  const latest = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!canResize || resizeId === undefined) return
    const stored = readWidth(resizeId)
    latest.current = stored
    setWidth(stored)
  }, [canResize, resizeId])

  const apply = (px: number) => {
    const next = Math.round(Math.min(Math.max(px, MIN_WIDTH), window.innerWidth - EDGE_MARGIN))
    latest.current = next
    setWidth(next)
  }

  const remember = () => {
    if (resizeId !== undefined) writeWidth(resizeId, latest.current)
  }

  /** The popup is the handle's parent. Read it that way rather than through a ref: a ref onto a
   *  library popup is the thing that silently goes missing across React versions, and this
   *  measurement has to be right on the first pointer down or the sheet jumps. */
  const popupOf = (handle: HTMLElement) => handle.parentElement

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const popup = popupOf(e.currentTarget)
    if (popup === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = { x: e.clientX, width: popup.getBoundingClientRect().width }
    document.documentElement.style.userSelect = 'none'
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (grab.current === null) return
    const delta = e.clientX - grab.current.x
    // Dragging towards the middle of the page widens the sheet, whichever edge it is docked to.
    apply(grab.current.width + (side === 'right' ? -delta : delta))
  }

  const onPointerEnd = () => {
    if (grab.current === null) return
    grab.current = null
    document.documentElement.style.userSelect = ''
    remember()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const towards = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (towards === 0) return
    const popup = popupOf(e.currentTarget)
    if (popup === null) return
    e.preventDefault()
    apply(popup.getBoundingClientRect().width + towards * KEY_STEP * (side === 'right' ? -1 : 1))
    remember()
  }

  /** Back to the width the classes give it — the way out of a drag that went somewhere silly. */
  const onDoubleClick = () => {
    latest.current = null
    setWidth(null)
    remember()
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        // A dragged width has to outrank the `max-w-*` the caller set, or the class quietly caps
        // the drag and the handle stops moving half way across the screen.
        style={width === null ? style : { ...style, width, maxWidth: 'none' }}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-popover-foreground text-sm shadow-lg transition duration-200 ease-in-out data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=bottom]:inset-x-0 data-[side=top]:inset-x-0 data-[side=left]:inset-y-0 data-[side=right]:inset-y-0 data-[side=top]:top-0 data-[side=right]:right-0 data-[side=bottom]:bottom-0 data-[side=left]:left-0 data-[side=bottom]:h-auto data-[side=left]:h-full data-[side=right]:h-full data-[side=top]:h-auto data-[side=left]:w-3/4 data-[side=right]:w-3/4 data-[side=bottom]:border-t data-[side=left]:border-r data-[side=top]:border-b data-[side=right]:border-l data-ending-style:opacity-0 data-starting-style:opacity-0',
          // 🔒 THE DEFAULT WIDTH CAP IS PASSED AS ITS OWN ARGUMENT, NOT WRITTEN INTO THE STRING
          // ABOVE. It used to be `data-[side=right]:sm:max-w-sm` in there, and a caller's
          // `sm:max-w-2xl` then LOST IN SILENCE: the two spellings carry different variants, so
          // tailwind-merge keeps both, and the data-attribute selector wins on specificity.
          // Measured 16/09/2026 — every one of the six sheets in this repo asked for xl or 2xl
          // and every one of them rendered at 384px. Same variant shape means `cn` can see the
          // conflict and let the caller's class win, which is the whole point of passing it here.
          (side === 'left' || side === 'right') && 'sm:max-w-sm',
          className
        )}
        {...props}
      >
        {canResize && (
          <div
            data-slot="sheet-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={resizeLabel}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            // The net under the other two. A pointer released outside the window, or a capture
            // torn away, would otherwise leave the page stuck with `user-select: none` — a
            // document nobody can select text in any more, and nothing on screen saying why.
            // Ending twice is free: the handler returns on the first one that finds no grab.
            onLostPointerCapture={onPointerEnd}
            onKeyDown={onKeyDown}
            onDoubleClick={onDoubleClick}
            // What the pointer may grab is deliberately wider than what the eye sees: the target
            // is 12px, the hairline inside it 2px. A 6px target was tried first and measured —
            // a drag aimed at the edge missed it outright. It sits inside the sheet's own `p-4`,
            // so the width it takes is padding, never content.
            className={cn(
              'group absolute inset-y-0 z-10 flex w-3 cursor-col-resize touch-none justify-center focus-visible:outline-none',
              side === 'right' ? 'left-0' : 'right-0'
            )}
          >
            <span className="w-0.5 bg-transparent transition-colors group-hover:bg-border group-focus-visible:bg-ring" />
          </div>
        )}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-0.5 p-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('cn-font-heading font-medium text-base text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription
}
