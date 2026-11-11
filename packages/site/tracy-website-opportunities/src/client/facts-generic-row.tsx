/**
 * Any fact of the saved profile drawn the same way in whatever band holds it (#537 R18): a generic cell (its label,
 * its value by kind, its source chip, an Edited chip when the owner changed it, its own small switch through the
 * facts door), a count as a small figure with its switch (followers beside their link, Google's rating in the reviews
 * band), and the switch of a whole band of facts. A fact off the site stays, dimmed.
 */
import type { JSX } from 'react'

import { OneLine } from './business-facts-band.tsx'
import type { BandSwitchView } from './facts-band-actions.tsx'
import { ItemSwitch } from './facts-item-switch.tsx'
import { displayText, factDisplay, factLabel, readableKey } from './facts-value-model.ts'
import { type SavedFact, factChipOf } from './saved-profile-model.ts'
import type { ChipSourceRow } from './source-chip-model.ts'
import { SourceChip } from './source-chip.tsx'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

/** Puts one fact on the site or keeps it off (`PUT …/:id/facts {factId, onSite}`); answers whether it went through. */
export type SetFactOn = (factId: string, onSite: boolean) => Promise<boolean>

/** The owner's value: a small Edited chip, what research read on hover. */
export function EditedChip({
  t,
  fact,
  locale = 'en'
}: {
  t: Translate
  fact: Pick<SavedFact, 'edited' | 'researchValue' | 'group' | 'kind'>
  locale?: string
}): JSX.Element | null {
  if (!fact.edited) return null
  const was = displayText(
    factDisplay(t, { group: fact.group, kind: fact.kind, value: fact.researchValue }, locale)
  )
  return (
    <StatusPill
      state="info"
      label={t('facts.edited')}
      title={was === '' ? undefined : t('facts.edited.research', { value: was })}
    />
  )
}

/** A fact's value on one line: words, chips, lines joined, or a link. */
export function FactValue({
  t,
  fact,
  locale
}: {
  t: Translate
  fact: SavedFact
  locale: string
}): JSX.Element {
  const d = factDisplay(t, fact, locale)
  if (d.kind === 'link')
    return (
      <span className="tracy-wo-facts-ln">
        <a className="tracy-wo-facts-ell" href={d.url} target="_blank" rel="noreferrer" title={d.url}>
          {d.url.replace(/^https?:\/\/(www\.)?/i, '')}
        </a>
      </span>
    )
  if (d.kind === 'chips')
    return (
      <span className="tracy-wo-facts-ln tracy-wo-facts-minis" title={d.items.join(', ')}>
        {d.items.map((item, i) => (
          <span key={`${item}-${i}`} className="tracy-wo-facts-mini">
            {item}
          </span>
        ))}
      </span>
    )
  return <OneLine text={d.kind === 'none' ? t('facts.na') : displayText(d).replace(/\s*\n\s*/g, ' · ')} />
}

/** One fact as a cell: label, value, then its chip, Edited and switch. */
export function GenericCell({
  t,
  locale,
  fact,
  rows,
  setOn
}: {
  t: Translate
  locale: string
  fact: SavedFact
  rows: readonly ChipSourceRow[]
  setOn: SetFactOn | null
}): JSX.Element {
  const label = factLabel(t, fact)
  return (
    <div className="tracy-wo-facts-cell" data-fact={fact.id} data-off={fact.onSite ? undefined : ''}>
      <span className="tracy-wo-facts-ck" title={label}>
        {label}
      </span>
      <FactValue t={t} fact={fact} locale={locale} />
      <span className="tracy-wo-facts-ln tracy-wo-facts-meta">
        <SourceChip t={t} chip={factChipOf(fact, rows)} locale={locale} />
        <EditedChip t={t} fact={fact} locale={locale} />
        <ItemSwitch
          t={t}
          bare
          label={label}
          on={fact.onSite}
          set={setOn === null ? null : (on) => setOn(fact.id, on)}
        />
      </span>
    </div>
  )
}

/** The words of a count: Followers, Posts, Rating, Reviews, or the label made readable. */
const STAT_WORDS: Record<string, string> = {
  followers: 'pp.stat.followers',
  following: 'pp.stat.following',
  posts: 'pp.stat.posts',
  rating: 'pp.stat.rating',
  reviewCount: 'pp.stat.reviewCount'
}

/** A count as a small figure ("1,819 Followers", "★ 5 Rating") with its own switch. */
export function FactFigure({
  t,
  locale,
  fact,
  setOn
}: {
  t: Translate
  locale: string
  fact: SavedFact
  setOn: SetFactOn | null
}): JSX.Element {
  const v = (fact.value ?? {}) as Record<string, unknown>
  const label = String(v.label ?? '')
  const word = STAT_WORDS[label] === undefined ? readableKey(label) : t(STAT_WORDS[label] as string)
  const amount = typeof v.amount === 'number' ? new Intl.NumberFormat(locale).format(v.amount) : ''
  const shown = `${label === 'rating' ? '★ ' : ''}${amount} ${word}`
  return (
    <span
      className="tracy-wo-facts-fig"
      data-fact={fact.id}
      data-off={fact.onSite ? undefined : ''}
      title={shown}
    >
      <span className="tracy-wo-facts-ell">{shown}</span>
      <EditedChip t={t} fact={fact} locale={locale} />
      <ItemSwitch
        t={t}
        bare
        label={shown}
        on={fact.onSite}
        set={setOn === null ? null : (on) => setOn(fact.id, on)}
      />
    </span>
  )
}

/** A band's switch over its facts: on while one is on; pressing it puts every one on or off. */
export function factsSwitch(facts: readonly SavedFact[], setOn: SetFactOn | null): BandSwitchView | null {
  if (facts.length === 0 || setOn === null) return null
  return {
    on: facts.some((f) => f.onSite),
    set: async (on) => {
      for (const f of facts) if (f.onSite !== on && !(await setOn(f.id, on))) return false
      return true
    }
  }
}
