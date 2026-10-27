/**
 * The ask form drawn as cards (layout "E1" of the Customize your site sheet, Akemi 07/10/2026): one collapsible card per
 * question, numbered. A closed card shows only its number and title; an answered one wears a terracotta number and a
 * bright title. Several cards can be open at once; the first unanswered question starts open.
 *
 * The card owns the question's title, so the control inside is named by the title (`aria-labelledby` on the id
 * `labelIdOf` gives) and the hint sits on top of the control, its line breaks kept (`white-space: pre-line`).
 *
 * With `collapsible` off (the `sections` layout of `AskForm`, the Customize your site page, Akemi 14/10/2026) every
 * question is open for good: no number, no chevron, no button in the header, only the title over its hint and control.
 * The same item markup and classes, so a reader of the form (and its tests) finds a question the same way in both.
 *
 * CSS: the card rules are `ASK_CARDS_CSS` and the section rules `ASK_SECTIONS_CSS` (`ask-cards-css.ts`), which the
 * plugin that draws these layouts injects; the hover, press, open and focus states mix Tracy tokens and are written there
 * because utilities cannot say `:has()`.
 */
import { ChevronDown } from 'lucide-react'
import { type JSX, type ReactNode, useState } from 'react'

import type { AskDraft, AskItem } from './model'

type Entry = AskDraft[string]

/** Whether an entry holds an answer: a picked option or typed text that is not only spaces. */
export function entryAnswered(entry: Entry | undefined): boolean {
  if (!entry) return false
  return entry.selected.length > 0 || (entry.custom ?? '').trim() !== ''
}

export interface AskCardsProps {
  items: AskItem[]
  /** The id the item's title carries; the control names itself by it. */
  labelIdOf: (item: AskItem) => string
  /** The control of one item, without a label of its own. */
  renderControl: (item: AskItem) => ReactNode
  /** Whether an item counts as answered (`entryAnswered` of its entry, unless its kind's renderer says otherwise). */
  answered: (item: AskItem) => boolean
  /** The tag beside a title (Recommended), or null. */
  tagOf: (item: AskItem) => ReactNode
  /** False: every question open for good, its title a plain heading (the `sections` layout). Default true. */
  collapsible?: boolean
}

export function AskCards({
  items,
  labelIdOf,
  renderControl,
  answered,
  tagOf,
  collapsible = true
}: AskCardsProps): JSX.Element {
  // Which cards are open, by item id. Starts with the first unanswered question (or the first one) open; the sheet
  // mounts afresh each time it opens, so each opening starts from what is left to answer.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const first = items.find((item) => !answered(item)) ?? items[0]
    return new Set(first ? [first.id] : [])
  })
  const toggle = (id: string) =>
    setOpen((now) => {
      const next = new Set(now)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!collapsible)
    return (
      <div className="ask-cards" data-ask-cards="1">
        {items.map((item) => (
          <div
            key={item.id}
            className="ask-card"
            data-ask-item={item.id}
            data-ask-card="open"
            data-answered={answered(item) ? '1' : '0'}
          >
            <h4 className="ask-card-h">
              <span className="ask-card-t">
                <span id={labelIdOf(item)}>{item.label}</span>
                {tagOf(item)}
              </span>
            </h4>
            <div className="ask-card-p">
              {item.description ? <p className="ask-card-hint">{item.description}</p> : null}
              {renderControl(item)}
            </div>
          </div>
        ))}
      </div>
    )

  return (
    <div className="ask-cards" data-ask-cards="1">
      {items.map((item, index) => {
        const isOpen = open.has(item.id)
        const done = answered(item)
        const head = `${labelIdOf(item)}-head`
        const panel = `${labelIdOf(item)}-panel`
        return (
          <div
            key={item.id}
            className="ask-card"
            data-ask-item={item.id}
            data-ask-card={isOpen ? 'open' : 'closed'}
            data-answered={done ? '1' : '0'}
          >
            <h4 className="ask-card-h">
              <button
                type="button"
                id={head}
                className="ask-card-btn"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => toggle(item.id)}
              >
                <span className="ask-card-n" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="ask-card-t">
                  <span id={labelIdOf(item)}>{item.label}</span>
                  {tagOf(item)}
                </span>
                <ChevronDown size={16} strokeWidth={2} className="ask-card-chev" aria-hidden="true" />
              </button>
            </h4>
            {/* No region role: a landmark per card is noise, and the accordion pattern leaves it optional. */}
            <div id={panel} className="ask-card-p" hidden={!isOpen}>
              {isOpen ? (
                <>
                  {item.description ? <p className="ask-card-hint">{item.description}</p> : null}
                  {renderControl(item)}
                </>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
