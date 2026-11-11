/**
 * The Team row of the Business facts sub-page (#537): people side by side, each with the photo the owner gave or their
 * initials, their role, their chip and their own small switch, greyed while the Team band is off (R16). Edit lists
 * them as rows that save by themselves, with Add person at the end (`facts-team-edit.tsx`, R14).
 */
import type { JSX } from 'react'

import { mediaUrl } from './api.ts'
import { type BusinessFactsView, initialsOf, itemChipOf } from './business-facts-model.ts'
import { FactsBand } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import { BandSwitch, type BandSwitchView } from './facts-band-actions.tsx'
import { EditedChip, type SetFactOn } from './facts-generic-row.tsx'
import { mainChip } from './facts-section-model.ts'
import { TeamEdit } from './facts-team-edit.tsx'
import type { OwnerDoors } from './owner-edits-model.ts'
import type { ReadingItemView, ReadingPick } from './profile-reading-model.ts'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

/** A person is on the site unless removed, or named only in reviews and not shown; the saved profile's fact decides first. */
const onSiteOf = (p: ReadingItemView): boolean => p.factOn ?? (!p.removed && (!p.reviewsOnly || p.onSite))

/** The reading picks that put a person on the site, or take them off it. */
export function personPicks(p: ReadingItemView, on: boolean): ReadingPick[] {
  if (!on) return [p.reviewsOnly ? 'hide' : 'remove']
  return [
    ...(p.removed ? (['restore'] as const) : []),
    ...(p.reviewsOnly && !p.onSite ? (['show'] as const) : [])
  ]
}

/** A person's photo the owner gave, else their initials. */
export const Avatar = ({ person }: { person: Pick<ReadingItemView, 'label' | 'photoId'> }): JSX.Element => (
  <span className="tracy-wo-facts-avatar" aria-hidden="true">
    {person.photoId === null ? (
      initialsOf(person.label)
    ) : (
      <img src={mediaUrl(person.photoId)} alt="" loading="lazy" decoding="async" />
    )}
  </span>
)

/**
 * The team: one row per person (#537, layout B), each with its avatar, role, chip and own small switch. While the
 * Team band is off, no person can be put on the site: every switch is greyed, the reason on hover.
 */
export function TeamPeople({
  t,
  locale,
  view,
  pickReading,
  bandOn = true,
  setOn = null
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  /** The Team band's switch: off disables every person's switch. */
  bandOn?: boolean
  /** The facts door's switch: a person of the saved profile switches through it (#537 R18). */
  setOn?: SetFactOn | null
}): JSX.Element {
  const set =
    (person: ReadingItemView) =>
    async (on: boolean): Promise<boolean> => {
      if (person.factId !== undefined && setOn !== null) return setOn(person.factId, on)
      for (const pick of personPicks(person, on)) if (!(await pickReading(person.id, pick))) return false
      return true
    }
  return (
    <ul className="tracy-wo-facts-people">
      {view.team.map((person) => (
        <li key={person.id} data-off={onSiteOf(person) ? undefined : ''}>
          <Avatar person={person} />
          <span className="tracy-wo-facts-person">
            <span className="tracy-wo-facts-ln">
              <span className="tracy-wo-facts-ell" title={person.label}>
                {person.label}
              </span>
              <SourceChip t={t} chip={itemChipOf(view, person)} locale={locale} />
              <EditedChip
                t={t}
                locale={locale}
                fact={{
                  edited: person.edited === true,
                  researchValue: { name: person.researchLabel ?? '' },
                  group: 'people',
                  kind: 'text'
                }}
              />
            </span>
            {person.role === null ? null : (
              <small className="tracy-wo-facts-ell" title={person.role}>
                {person.role}
              </small>
            )}
          </span>
          <BandSwitch
            t={t}
            small
            label={person.label}
            view={
              bandOn
                ? { on: onSiteOf(person), set: set(person) }
                : { on: onSiteOf(person), set: null, why: t('facts.team.bandOff') }
            }
          />
        </li>
      ))}
    </ul>
  )
}

/** The Team band: the people in view, Edit turning them into rows; nothing to edit before research. */
export function TeamBand({
  t,
  locale,
  view,
  onSite,
  owner,
  pickReading,
  setOn = null
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  onSite: BandSwitchView
  owner: Pick<OwnerDoors, 'team' | 'uploadTeamPhoto'>
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  setOn?: SetFactOn | null
}): JSX.Element {
  const card = view.cards.find((c) => c.id === 'team')
  return (
    <FactsBand
      t={t}
      id="team"
      label={t('field.team')}
      title={t('field.team')}
      source={card?.state === 'filled' ? mainChip(view.team.map((p) => itemChipOf(view, p))) : null}
      count={card?.state === 'filled' ? view.team.length : null}
      onSite={onSite}
      edit={
        card === undefined || card.state === 'notCollected'
          ? { why: t('reason.not_collected') }
          : {
              form: (close) => (
                <TeamEdit t={t} team={view.team} owner={owner} pickReading={pickReading} close={close} />
              )
            }
      }
    >
      {card?.state === 'filled' ? (
        <TeamPeople
          t={t}
          locale={locale}
          view={view}
          pickReading={pickReading}
          bandOn={onSite.on}
          setOn={setOn}
        />
      ) : (
        <Missing t={t} card={card} />
      )}
    </FactsBand>
  )
}
