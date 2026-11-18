/**
 * The lower review parts of the plan card (#575, the card the owner reviewed; C4 of the review): what is not on the
 * site in groups by why (what the owner removed first, each with its Bring back button; then each other reason in a
 * fold with its count, the picture spots of people counted apart), what came from each kind of source and what of it
 * reached the site, and what the owner can send later, each with a trash button.
 */
import { Fold, listOf, onceEach, plural, Section, Trash } from './plan-card-parts'
import { leftOutReasonsOf, leftOutWhatOf, sectionLabelOf } from './plan-codes'
import type { ReviewContext } from './plan-review-top'
import { factLabelOf, sentenceOf, sourceNameOf, wordOf } from './plan-words'
import type { StringKey, Translate } from './strings'

const groupKey = (group: string) => `plan.notOnSite.group.${group}` as StringKey

/**
 * A removed line's name in the card's words, by the code it carries, as the card names the same part while it is on
 * the plan: a section by its code, a "send later" entry by its code, a fact by its kind. Site content stays.
 */
function removedWhatOf(t: Translate, line: ReviewContext['card']['notOnSite']['removed'][number]): string {
  if (line.section) return sectionLabelOf(t, line.section, line.what)
  if (line.later) return wordOf(t, `plan.later.what.${line.later}`, line.what)
  if (line.factKind) return factLabelOf(t, line.factKind, line.what)
  return line.dataKind ? wordOf(t, `plan.fact.${line.dataKind}`, line.what) : line.what
}

/** The removed lines, each with Bring back while the draft can still restore it. */
function Removed({ r }: { r: ReviewContext }) {
  const { t, card, busy, operate } = r
  const removed = card.notOnSite.removed
  if (removed.length === 0) return null
  return (
    <Fold
      summary={t('plan.notOnSite.group.removed')}
      count={plural(t, 'plan.notOnSite.lines', removed.length)}
      open
      group="removed"
    >
      <ul className="tv-bc-dropped">
        {removed.map((line) => {
          const what = removedWhatOf(t, line)
          return (
            <li key={line.removal} data-removal={line.removal}>
              <span>
                <span className="tv-bc-what">{sentenceOf(what)}</span>{' '}
                {line.details > 0 && (
                  <span className="tv-bc-muted">{plural(t, 'plan.notOnSite.details', line.details)}</span>
                )}
                {!line.restorable && (
                  <span className="tv-bc-muted"> {t('plan.notOnSite.cannotRestore')}</span>
                )}
              </span>
              {line.restorable && (
                <button
                  type="button"
                  className="tv-bc-btn"
                  data-ghost=""
                  aria-label={t('plan.notOnSite.restoreLabel', { what })}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) operate({ op: 'restore', removal: line.removal })
                  }}
                >
                  {t('plan.notOnSite.restore')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Fold>
  )
}

/** Every group of what is not on the site, each in a fold with its count; nothing hidden behind a "show all". */
export function NotOnSite({ r }: { r: ReviewContext }) {
  const { t, card } = r
  const { groups, peopleSpots, removed } = card.notOnSite
  if (groups.length === 0 && peopleSpots === 0 && removed.length === 0) return null
  return (
    <Section title={t('plan.notOnSite')}>
      <Removed r={r} />
      {groups.map((g) => (
        <Fold
          key={g.group}
          group={g.group}
          summary={t(groupKey(g.group))}
          count={plural(t, 'plan.notOnSite.lines', g.lines.length)}
        >
          <ul className="tv-bc-dropped">
            {g.lines.map((i) => {
              const l = card.leftOut[i]
              if (!l) return null
              return (
                <li key={`${l.what}\n${l.reason}`} data-count={l.count}>
                  <span>
                    <span className="tv-bc-what">
                      {sentenceOf(leftOutWhatOf(t, l, (kind, label) => factLabelOf(t, kind, label)))}
                    </span>{' '}
                    <span className="tv-bc-muted">{leftOutReasonsOf(t, l)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Fold>
      ))}
      {peopleSpots > 0 && (
        <Fold
          group="people_spots"
          summary={t('plan.notOnSite.group.people_spots')}
          count={plural(t, 'plan.notOnSite.peopleSpots', peopleSpots)}
        >
          <p className="tv-bc-muted">{t('plan.notOnSite.peopleSpots.reason')}</p>
        </Fold>
      )}
    </Section>
  )
}

const COUNTED = new Set(['service', 'person', 'quote', 'gallery'])

/** What came from each kind of source, and what of it is on the site. */
export function Sources({ r }: { r: ReviewContext }) {
  const { t, card } = r
  if (card.sources.length === 0) return null
  const counted = (kind: string, n: number) => plural(t, `plan.count.${COUNTED.has(kind) ? kind : 'item'}`, n)
  return (
    <Section title={t('plan.sources')}>
      <table className="tv-bc-table">
        <thead>
          <tr>
            <th scope="col">{t('plan.sources.source')}</th>
            <th scope="col">{t('plan.sources.got')}</th>
            <th scope="col">{t('plan.sources.shown')}</th>
          </tr>
        </thead>
        <tbody>
          {card.sources.map((row) => {
            const got = [
              ...row.facts.map((f) => factLabelOf(t, f.kind, f.label)),
              ...row.items.map((i) => counted(i.kind, i.got))
            ]
            const shown = [
              ...row.shownFacts.map((f) => factLabelOf(t, f.kind, f.label)),
              ...row.items
                .filter((i) => i.shown > 0)
                .map((i) =>
                  i.shown === i.got
                    ? counted(i.kind, i.got)
                    : t('plan.sources.shownOf', { shown: i.shown, what: counted(i.kind, i.got) })
                )
            ]
            return (
              <tr key={row.kind}>
                <th scope="row">{sourceNameOf(t, row.kind, null)}</th>
                <td>{listOf(t, onceEach(got))}</td>
                <td>{shown.length ? listOf(t, onceEach(shown)) : t('plan.sources.none')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}

/** What the owner can send later, each said by its code in the card's words, with a trash button. */
export function Later({ r }: { r: ReviewContext }) {
  const { t, card, busy, operate } = r
  if (card.later.length === 0) return null
  return (
    <Section title={t('plan.later')}>
      <ul className="tv-bc-later">
        {card.later.map((e) => {
          const what = wordOf(t, `plan.later.what.${e.code}`, e.what)
          return (
            <li key={e.code} data-later={e.code}>
              <span>
                <span className="tv-bc-what">{what}</span>{' '}
                <span className="tv-bc-muted">{wordOf(t, `plan.later.reason.${e.code}`, e.reason)}</span>
              </span>
              <Trash
                t={t}
                what={what}
                busy={busy}
                onRemove={() => operate({ op: 'remove-later', later: e.code })}
              />
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
