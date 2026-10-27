/**
 * Compile-time cases for #797: a control of this library that shows or announces words takes
 * those words from its caller, and leaving them out is a TYPE ERROR. Nothing imports this file
 * and nothing renders it; `tsc --noEmit` (the package's `typecheck`) is what reads it.
 *
 * Each `@ts-expect-error` below is the test: if a label becomes optional again (a default written
 * back into the component), that line stops being an error and the typecheck fails with
 * "Unused '@ts-expect-error' directive".
 */
import { Breadcrumb, BreadcrumbEllipsis } from '../components/ui/breadcrumb'
import { CarouselNext, CarouselPrevious } from '../components/ui/carousel'
import { DialogContent, DialogFooter } from '../components/ui/dialog'
import {
  Pagination,
  PaginationEllipsis,
  PaginationNext,
  PaginationPrevious
} from '../components/ui/pagination'
import { SheetContent } from '../components/ui/sheet'
import { Sidebar, SidebarRail, SidebarTrigger } from '../components/ui/sidebar'
import { Spinner } from '../components/ui/spinner'
import { ToastClose, Toaster } from '../components/ui/toast'

export function MissingLabelsAreErrors() {
  return (
    <>
      {/* @ts-expect-error the X button needs its translated name */}
      <DialogContent />
      {/* @ts-expect-error a footer Close button needs its translated word */}
      <DialogFooter showCloseButton />
      {/* @ts-expect-error a label without the button it names is a mistake */}
      <DialogFooter closeLabel="x" />
      {/* @ts-expect-error the X button needs its translated name */}
      <SheetContent />
      {/* @ts-expect-error the drag handle needs its translated name */}
      <SheetContent closeLabel="x" resizable />
      {/* @ts-expect-error no handle, no handle name */}
      <SheetContent closeLabel="x" resizeLabel="y" />
      {/* @ts-expect-error no X button, no X name */}
      <SheetContent showCloseButton={false} closeLabel="x" />
      {/* @ts-expect-error the close button needs its translated name */}
      <ToastClose />
      {/* @ts-expect-error the toasts' close button needs its translated name */}
      <Toaster />
      {/* @ts-expect-error a spinner announces a translated word */}
      <Spinner />
      {/* @ts-expect-error the landmark needs its translated name */}
      <Pagination />
      {/* @ts-expect-error the accessible name is required */}
      <PaginationPrevious text="x" />
      {/* @ts-expect-error the visible word is required (it may be empty) */}
      <PaginationPrevious label="x" />
      {/* @ts-expect-error the accessible name is required */}
      <PaginationNext text="x" />
      {/* @ts-expect-error the visible word is required (it may be empty) */}
      <PaginationNext label="x" />
      {/* @ts-expect-error the gap needs its translated name */}
      <PaginationEllipsis />
      {/* @ts-expect-error the mobile sheet needs its translated title and description */}
      <Sidebar />
      {/* @ts-expect-error the description is required too */}
      <Sidebar mobileTitle="x" />
      {/* @ts-expect-error the button needs its translated name */}
      <SidebarTrigger />
      {/* @ts-expect-error the rail needs its translated name */}
      <SidebarRail />
      {/* @ts-expect-error the landmark needs its translated name */}
      <Breadcrumb />
      {/* @ts-expect-error the gap needs its translated name */}
      <BreadcrumbEllipsis />
      {/* @ts-expect-error the arrow needs its translated name */}
      <CarouselPrevious />
      {/* @ts-expect-error the arrow needs its translated name */}
      <CarouselNext />
    </>
  )
}

/** The same controls with their words: every one of these must compile. */
export function LabelsAreAccepted({ t }: { t: (key: string) => string }) {
  return (
    <>
      <DialogContent closeLabel={t('close')} />
      <DialogContent showCloseButton={false} />
      <DialogFooter />
      <DialogFooter showCloseButton closeLabel={t('close')} />
      <SheetContent closeLabel={t('close')} />
      <SheetContent showCloseButton={false} />
      <SheetContent closeLabel={t('close')} resizable resizeLabel={t('resizePanel')} />
      <ToastClose label={t('close')} />
      <Toaster closeLabel={t('close')} />
      <Spinner label={t('loading')} />
      <Pagination label={t('pages')} />
      <PaginationPrevious text="" label={t('previous')} />
      <PaginationNext text={t('next')} label={t('nextPage')} />
      <PaginationEllipsis label={t('more')} />
      <Sidebar mobileTitle={t('sidebar')} mobileDescription={t('sidebarHint')} />
      <SidebarTrigger label={t('toggle')} />
      <SidebarRail label={t('toggle')} />
      <Breadcrumb label={t('breadcrumb')} />
      <BreadcrumbEllipsis label={t('more')} />
      <CarouselPrevious label={t('previous')} />
      <CarouselNext label={t('next')} />
    </>
  )
}
