/**
 * One band of the Business facts sub-page (#537, layout C): a fixed-height row with its title, source chip and
 * controls on the left and its content laid sideways on the right. A band never grows: Show all (n) opens the whole
 * list, and Edit opens the band's fields, both in a side sheet over the page. Escape closes the sheet and the focus
 * goes back to the control that opened it. Missing facts read N/A.
 */
import { Fragment, type JSX, type ReactNode, type RefObject, useRef, useState } from 'react'
import { ExternalLink, Pencil } from 'lucide-react'
import { Button, Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@tracy/ui'

import type { BandId } from './business-facts-model.ts'
import type { Translate } from './strings.ts'

/** A missing fact: N/A, muted, the reason in its title. */
export function NotAvailable({
  t,
  state = 'none'
}: {
  t: Translate
  state?: 'none' | 'notCollected'
}): JSX.Element {
  return state === 'notCollected' ? (
    <span className="tracy-wo-facts-na">{t('reason.not_collected')}</span>
  ) : (
    <span className="tracy-wo-facts-na" title={t('reason.not_found')}>
      {t('facts.na')}
    </span>
  )
}

/** A long value on one line with an ellipsis; the full text shows on hover. Its chips follow it, never cut. */
export function OneLine({ text, children }: { text: string; children?: ReactNode }): JSX.Element {
  return (
    <span className="tracy-wo-facts-ln">
      <span className="tracy-wo-facts-ell" title={text}>
        {text}
      </span>
      {children}
    </span>
  )
}

/** The side sheet a band opens: its title, the content scrolling inside, and Done. */
export function FactsSheet({
  t,
  open,
  title,
  onClose,
  back,
  children
}: {
  t: Translate
  open: boolean
  title: ReactNode
  onClose: () => void
  /** The control that opened the sheet: the focus returns to it on close. */
  back: RefObject<HTMLButtonElement | null>
  children: ReactNode
}): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="right"
        className="tracy-wo tracy-wo-facts-sheet sm:max-w-lg"
        closeLabel={t('facts.close')}
        finalFocus={back}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="tracy-wo-facts-sheet-body">{open ? children : null}</div>
        <SheetFooter>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            {t('facts.done')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** A small text control in a band's title column (Edit, Show all, Open...). */
const Act = ({
  label,
  icon,
  onClick,
  refTo
}: {
  label: string
  icon?: ReactNode
  onClick: () => void
  refTo: RefObject<HTMLButtonElement | null>
}): JSX.Element => (
  <button ref={refTo} type="button" className="tracy-wo-facts-act" aria-haspopup="dialog" onClick={onClick}>
    {icon}
    {label}
  </button>
)

export function FactsBand({
  t,
  id,
  title,
  sheetTitle,
  aside,
  actions = [],
  edit,
  more,
  open,
  children
}: {
  t: Translate
  id: BandId
  title: ReactNode
  /** The words of the sheet title; the band title when absent. */
  sheetTitle?: ReactNode
  aside?: ReactNode
  /** The band's own choices (Show on the site...), before its sheet controls. */
  actions?: ReactNode[]
  /** The band's fields, drawn only in the sheet; null: the band has no Edit. */
  edit: (() => ReactNode) | null
  /** The whole list, drawn only in the sheet; null: everything fits. `count` null reads Show all with no number. */
  more?: { count: number | null; render: () => ReactNode } | null
  /** Research details: one Open control for the sheet. */
  open?: (() => ReactNode) | null
  children?: ReactNode
}): JSX.Element {
  const [sheet, setSheet] = useState<'edit' | 'all' | 'open' | null>(null)
  const editRef = useRef<HTMLButtonElement | null>(null)
  const allRef = useRef<HTMLButtonElement | null>(null)
  const openRef = useRef<HTMLButtonElement | null>(null)
  const controls: ReactNode[] = [
    ...actions,
    more == null ? null : (
      <Act
        key="all"
        refTo={allRef}
        label={more.count === null ? t('facts.showAll') : t('facts.showAll.count', { count: more.count })}
        onClick={() => setSheet('all')}
      />
    ),
    open == null ? null : (
      <Act
        key="open"
        refTo={openRef}
        icon={<ExternalLink aria-hidden="true" />}
        label={t('facts.open')}
        onClick={() => setSheet('open')}
      />
    ),
    edit === null ? null : (
      <Act
        key="edit"
        refTo={editRef}
        icon={<Pencil aria-hidden="true" />}
        label={t('profile.edit')}
        onClick={() => setSheet('edit')}
      />
    )
  ].filter((c) => c !== null)
  const content =
    sheet === 'edit' ? edit?.() : sheet === 'all' ? more?.render() : sheet === 'open' ? open?.() : null
  const back = sheet === 'edit' ? editRef : sheet === 'all' ? allRef : openRef
  return (
    <section className="tracy-wo-facts-band" data-card={id}>
      <div className="tracy-wo-facts-band-label">
        <h3>{title}</h3>
        {aside}
        {controls.length === 0 ? null : (
          <span className="tracy-wo-facts-acts">
            {controls.map((c, i) => (
              <Fragment key={i}>{c}</Fragment>
            ))}
          </span>
        )}
      </div>
      <div className="tracy-wo-facts-band-body">{children}</div>
      <FactsSheet
        t={t}
        open={sheet !== null}
        title={sheetTitle ?? title}
        onClose={() => setSheet(null)}
        back={back}
      >
        {sheet === 'edit' ? <div className="tracy-wo-facts-edit">{content}</div> : content}
      </FactsSheet>
    </section>
  )
}
