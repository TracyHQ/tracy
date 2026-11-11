/**
 * The About band of the Business facts sub-page (#537, design A): once research made the saved profile (#537 R18),
 * every text research quoted that is no guest review (the bio, the posts, the summaries) and the claims in words, each
 * with its own switch; before it, the bio alone in two lines with its source chip in the header. Edit opens the bio
 * in place (its own door) and every other text through the facts door (`AboutEdit`).
 */
import type { JSX } from 'react'

import { FactsBand } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import type { BusinessFactsView } from './business-facts-model.ts'
import type { BandSwitchView } from './facts-band-actions.tsx'
import { AboutEdit, type ProfileField } from './facts-band-edit.tsx'
import { EditedChip, GenericCell, type SetFactOn, factsSwitch } from './facts-generic-row.tsx'
import { ItemSwitch } from './facts-item-switch.tsx'
import { plainWords, readableKey } from './facts-value-model.ts'
import { type SavedFact, factChipOf } from './saved-profile-model.ts'
import type { SaveFactValue } from './facts-value-edit.tsx'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const words = (v: unknown): string => (typeof v === 'string' ? v : '')

interface AboutProps {
  t: Translate
  locale: string
  view: BusinessFactsView
  setOn: SetFactOn | null
}

/** A quote of the About band: its kind of text, the text in two lines, its chip, Edited and switch. */
export function QuoteCell({ t, locale, view, fact, setOn }: AboutProps & { fact: SavedFact }): JSX.Element {
  const v = rec(fact.value)
  const text = words(v.text) || plainWords(fact.value)
  const kind = words(v.kind)
  const label = kind === '' ? readableKey(fact.key) : t(`pp.quote.${kind}`)
  return (
    <div
      className="tracy-wo-facts-cell tracy-wo-facts-quote"
      data-fact={fact.id}
      data-off={fact.onSite ? undefined : ''}
    >
      <span className="tracy-wo-facts-ln">
        <span className="tracy-wo-facts-ck">{label}</span>
        <SourceChip t={t} chip={factChipOf(fact, view.sources)} locale={locale} />
        <EditedChip t={t} fact={fact} locale={locale} />
        <ItemSwitch
          t={t}
          bare
          label={label}
          on={fact.onSite}
          set={setOn === null ? null : (on) => setOn(fact.id, on)}
        />
      </span>
      <p className="tracy-wo-facts-clamp2 tracy-wo-facts-qt" title={text}>
        {text}
      </p>
    </div>
  )
}

/** The About body of the saved profile: every quote that is no guest review, then the claims in words. */
export function AboutCells({ t, locale, view, setOn }: AboutProps): JSX.Element {
  const facts = view.saved?.about ?? []
  return (
    <div className="tracy-wo-facts-cells tracy-wo-facts-row tracy-wo-facts-quotes">
      {facts.map((f) =>
        f.group === 'quotes' ? (
          <QuoteCell key={f.id} t={t} locale={locale} view={view} fact={f} setOn={setOn} />
        ) : (
          <GenericCell key={f.id} t={t} locale={locale} fact={f} rows={view.sources} setOn={setOn} />
        )
      )}
    </div>
  )
}

const quoteText = (v: unknown): string =>
  v !== null && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string'
    ? ((v as { text: string }).text ?? '').trim()
    : ''

/** About: the texts research quoted; Edit opens them in place. */
export function AboutBand({
  t,
  locale,
  view,
  field,
  onSite,
  setOn,
  saveValue
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  /** The bio row and its save, or null when no call edits it. */
  field: ProfileField | null
  /** The switch of the bio before the saved profile. */
  onSite: BandSwitchView
  setOn: SetFactOn | null
  saveValue: SaveFactValue | null
}): JSX.Element {
  const card = view.cards.find((c) => c.id === 'about')
  const about = view.about
  const filled = card?.state === 'filled'
  const facts = view.saved?.about ?? null
  // The bio edits through its own door; every other text through the facts door.
  const others = (facts ?? []).filter(
    (f) => field === null || f.group !== 'quotes' || quoteText(f.value) !== (about ?? '').trim()
  )
  const editable = field !== null || (saveValue !== null && others.some((f) => f.kind !== null))
  return (
    <FactsBand
      t={t}
      id="about"
      label={t('field.bio')}
      title={t('field.bio')}
      chips={filled && facts === null ? <SourceChip t={t} chip={card?.chip ?? null} locale={locale} /> : null}
      onSite={(facts === null ? null : factsSwitch(facts, setOn)) ?? onSite}
      edit={
        card === undefined || card.state === 'notCollected' || !editable
          ? { why: t(editable ? 'reason.not_collected' : 'facts.edit.none') }
          : {
              form: (close) => (
                <AboutEdit t={t} close={close} about={field} more={{ facts: others, save: saveValue }} />
              )
            }
      }
    >
      {!filled ? (
        <Missing t={t} card={card} />
      ) : facts !== null ? (
        <AboutCells t={t} locale={locale} view={view} setOn={setOn} />
      ) : (
        <p className="tracy-wo-facts-about tracy-wo-facts-clamp2" title={about ?? undefined}>
          {about}
        </p>
      )}
    </FactsBand>
  )
}
