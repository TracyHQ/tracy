/**
 * The bands of the Business facts sub-page that draw one group of the saved profile as research left it (#537 R18):
 * Offerings, every offering as a chip, titled Menu for a food place and Services otherwise, as the brief names it.
 * About (`facts-about-band.tsx`) and the row of Social pages (`facts-social-row.tsx`) draw theirs the same way. Each
 * item has its own switch through the facts door, an item kept off stays, dimmed, and Edit edits every value through
 * the facts door by kind. No band knows a trade.
 */
import type { JSX, ReactNode } from 'react'

import { FactsBand } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import type { BusinessFactsView } from './business-facts-model.ts'
import type { BandSwitchView, EditDoor } from './facts-band-actions.tsx'
import { EditedChip, type SetFactOn, factsSwitch } from './facts-generic-row.tsx'
import { ItemSwitch } from './facts-item-switch.tsx'
import { useFactsLocked } from './facts-lock.tsx'
import { mainChip } from './facts-section-model.ts'
import { FactsEdit, type SaveFactValue } from './facts-value-edit.tsx'
import { plainWords } from './facts-value-model.ts'
import { type SavedFact, factChipOf } from './saved-profile-model.ts'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const words = (v: unknown): string => (typeof v === 'string' ? v : '')

interface GroupProps {
  t: Translate
  locale: string
  view: BusinessFactsView
  setOn: SetFactOn | null
  saveValue: SaveFactValue | null
}

/** A band's switch over its facts, or the plain On the site when none can be switched. */
const switchOf = (t: Translate, facts: readonly SavedFact[], setOn: SetFactOn | null): BandSwitchView =>
  factsSwitch(facts, setOn) ?? { on: true, set: null, why: t('facts.switch.nothing') }

/** Edit of a band of facts: their editors through the facts door, or why there is none. */
export function factsEditDoor(
  t: Translate,
  facts: readonly SavedFact[],
  save: SaveFactValue | null,
  before?: (close: () => void) => ReactNode
): EditDoor {
  if (save === null || facts.every((f) => f.kind === null)) return { why: t('facts.edit.none') }
  return {
    form: (close) => <FactsEdit t={t} close={close} facts={facts} save={save} before={before?.(close)} />
  }
}

/** One price of an offering, as the source wrote it. */
const priceOf = (f: SavedFact): string => {
  const variants = rec(f.value).variants
  const first = Array.isArray(variants) ? rec(rec(variants[0]).price) : {}
  return words(first.raw)
}

export function OfferingsBand({
  t,
  locale,
  view,
  setOn,
  saveValue,
  food
}: GroupProps & { food: boolean }): JSX.Element {
  const facts = view.saved?.offerings ?? []
  const card = view.cards.find((c) => c.id === 'services')
  const title = t(food ? 'menu.title' : 'field.services')
  const locked = useFactsLocked()
  return (
    <FactsBand
      t={t}
      id="services"
      label={title}
      title={title}
      source={mainChip(facts.map((f) => factChipOf(f, view.sources)))}
      count={facts.length}
      onSite={switchOf(t, facts, setOn)}
      edit={factsEditDoor(t, facts, saveValue)}
    >
      {facts.length === 0 ? (
        <Missing t={t} card={card} />
      ) : (
        <div className="tracy-wo-facts-cells">
          <div className="tracy-wo-facts-cell">
            <span className="tracy-wo-facts-ck">{title}</span>
            {/* Each chip is its own switch: pressing it keeps that one off the site (#537, layout B). */}
            <ul className="tracy-wo-facts-chiprow tracy-wo-facts-toggles">
              {facts.map((f) => {
                // An offering of no kind this page knows reads its plain parts: nothing research found is dropped.
                const name = words(rec(f.value).name) || plainWords(f.value)
                const price = priceOf(f)
                const shown = price === '' ? name : `${name} · ${price}`
                return (
                  <li
                    key={f.id}
                    className="tracy-wo-facts-pill"
                    data-fact={f.id}
                    data-off={f.onSite ? undefined : ''}
                  >
                    <ItemSwitch
                      t={t}
                      bare
                      label={name}
                      on={f.onSite}
                      set={setOn === null ? null : (on) => setOn(f.id, on)}
                    />
                    <span className="tracy-wo-facts-ell" title={shown}>
                      {shown}
                    </span>
                    <SourceChip t={t} chip={factChipOf(f, view.sources)} locale={locale} />
                    <EditedChip t={t} fact={f} locale={locale} />
                  </li>
                )
              })}
            </ul>
            {setOn === null || locked ? null : (
              <span className="tracy-wo-facts-dim tracy-wo-small">{t('facts.services.tap')}</span>
            )}
          </div>
        </div>
      )}
    </FactsBand>
  )
}
