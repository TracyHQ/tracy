/**
 * The row of Social pages once research made the saved profile (#537 R18): every link of the links group (the owner's
 * among them), each with its own switch through the facts door and its counts (followers, posts) beside it as small
 * figures with their switches, then any count no link of the place matches. A link replaced by one the owner typed
 * stays, dimmed. A link of no address reads its plain parts: nothing research found is dropped.
 */
import type { JSX } from 'react'

import { OneLine } from './business-facts-band.tsx'
import type { BusinessFactsView } from './business-facts-model.ts'
import { sourceLabel } from './cms-label.ts'
import { EditedChip, FactFigure, type SetFactOn } from './facts-generic-row.tsx'
import { ItemSwitch } from './facts-item-switch.tsx'
import { plainWords, readableKey } from './facts-value-model.ts'
import { type SavedFact, isReviewStat } from './saved-profile-model.ts'
import { sourceLogoKey } from './source-logo.ts'
import { SourceGlyph } from './source-logo.tsx'
import type { Translate } from './strings.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const words = (v: unknown): string => (typeof v === 'string' ? v : '')

const pageKey = (url: string): string =>
  url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '')

/** The name of a link: the network the owner picks it under, else the source's own name, else its kind. */
function linkName(t: Translate, networks: readonly { id: string; label: string }[], f: SavedFact): string {
  const v = rec(f.value)
  const kind = words(v.kind)
  if (words(v.label) !== '') return words(v.label)
  const named = networks.find((n) => n.id === kind)?.label ?? sourceLabel(t, kind, null)
  return named === kind ? readableKey(kind) : named
}

/** Social pages of the saved profile: each link with its counts and its switch, then the counts of no link. */
export function SavedSocialRow({
  t,
  locale,
  view,
  setOn,
  networks
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  setOn: SetFactOn | null
  networks: readonly { id: string; label: string }[]
}): JSX.Element {
  const links = view.saved?.links ?? []
  const stats = (view.saved?.statistics ?? []).filter((s) => !isReviewStat(s))
  const statsOf = (l: SavedFact): SavedFact[] =>
    stats.filter((s) => pageKey(words(rec(s.value).scope)) === pageKey(words(rec(l.value).url)))
  const placed = new Set(links.flatMap((l) => statsOf(l).map((s) => s.id)))
  return (
    <ul className="tracy-wo-facts-chiprow tracy-wo-facts-row">
      {links.map((l) => {
        const url = words(rec(l.value).url)
        if (!/^https?:\/\//i.test(url))
          return (
            <li
              key={l.id}
              className="tracy-wo-facts-pill"
              data-fact={l.id}
              data-off={l.onSite ? undefined : ''}
            >
              <OneLine text={plainWords(l.value) || readableKey(l.key)} />
              <ItemSwitch
                t={t}
                bare
                label={l.id}
                on={l.onSite}
                set={setOn === null ? null : (on) => setOn(l.id, on)}
              />
            </li>
          )
        const name = linkName(t, networks, l)
        return (
          <li
            key={l.id}
            className="tracy-wo-facts-pill"
            data-fact={l.id}
            data-off={l.onSite && l.replacedBy === null ? undefined : ''}
          >
            <a href={url} target="_blank" rel="noreferrer" title={url}>
              <SourceGlyph logo={sourceLogoKey(words(rec(l.value).kind), url)} size={12} />
              <span className="tracy-wo-facts-ell">{name}</span>
            </a>
            <EditedChip t={t} fact={l} locale={locale} />
            <ItemSwitch
              t={t}
              bare
              label={name}
              on={l.onSite}
              set={setOn === null ? null : (on) => setOn(l.id, on)}
            />
            {statsOf(l).map((s) => (
              <FactFigure key={s.id} t={t} locale={locale} fact={s} setOn={setOn} />
            ))}
          </li>
        )
      })}
      {stats
        .filter((s) => !placed.has(s.id))
        .map((s) => (
          <li key={s.id} className="tracy-wo-facts-pill">
            <OneLine text={sourceLabel(t, s.sourceKind ?? '', words(rec(s.value).scope))} />
            <FactFigure t={t} locale={locale} fact={s} setOn={setOn} />
          </li>
        ))}
    </ul>
  )
}
