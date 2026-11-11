/**
 * The Business facts sub-page (#537, design A): one full-width band per group, top to bottom: the business, Hours and
 * amenities, Services (Menu for a food place), About, Team, Brand, Key messages, What guests say, Social pages, Photos
 * & video. Once research made the saved profile (#537 R18) the bands read its groups: the owner's
 * values with an Edited chip, what is kept off dimmed, and a fact of no special drawing as a generic cell with its own
 * switch and Edit through the facts door. Every band has one header row (title, source chips, Check this, then [Add
 * more] · On the site · Edit) and the same collapsed height; what does not fit scrolls sideways, a missing fact reads
 * N/A, and Edit turns a band into its fields in place. Before research the bands say Not collected yet. The owner's own
 * choices (bands off, team, social links, items kept off, #537 R14 to R16) go through `doors.owner`. Approved facts
 * are final (#537 R23): with `locked` the page reads only, under one notice offering Add this business again.
 */
import type { JSX, ReactNode } from 'react'

import { FactsMedia } from './business-facts-media.tsx'
import type { BusinessFactsView, CardId } from './business-facts-model.ts'
import { BusinessBand, moreBusinessFacts } from './business-facts-parts.tsx'
import type { LogoView, MediaRowView } from './detail-model.ts'
import { type BandSwitchView, type EditDoor, EditFooter } from './facts-band-actions.tsx'
import { BusinessEdit } from './facts-band-edit.tsx'
import { BrandBand } from './facts-brand-body.tsx'
import { AboutBand } from './facts-about-band.tsx'
import { OfferingsBand } from './facts-group-band.tsx'
import { HoursAmenitiesBand } from './facts-hours-band.tsx'
import { MessagesBand, ReviewsBand, ServicesBand } from './facts-list-bands.tsx'
import { SocialBand } from './facts-social-band.tsx'
import { TeamBand } from './facts-team-people.tsx'
import type { FactsDoors } from './facts-doors.ts'
import { FactsLocked, FactsLockedNotice, type FactsLockView } from './facts-lock.tsx'
import type { OwnerBand } from './owner-edits-model.ts'
import type { Translate } from './strings.ts'

export type { FactsDoors }

const NOT_COLLECTED_LOGO = { state: 'notCollected' } as LogoView

export function BusinessFactsPage({
  t,
  locale,
  view,
  media,
  doors,
  food,
  websiteLink,
  running,
  locked = null
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  media: MediaRowView
  doors: FactsDoors
  food: boolean
  websiteLink: (url: string) => JSX.Element
  /** Research runs: the photos and videos wait for it to finish, only Add more stays (#537). */
  running: boolean
  /** The facts are approved: the notice with Add this business again, and no control that writes. */
  locked?: FactsLockView | null
}): JSX.Element {
  const cardOf = (id: CardId) => view.cards.find((c) => c.id === id)
  const facts = view.researched
  const owner = doors.owner
  const switchOf = (fields: readonly string[]): BandSwitchView =>
    doors.factSwitch(fields) ?? { on: true, set: null, why: t('facts.switch.nothing') }
  // The bands the owner switches as a whole (`band_<band>`), stored through the facts door.
  const bandOf = (band: OwnerBand): BandSwitchView => ({
    on: owner.bands[band],
    set: (on) => owner.setBand(band, on)
  })
  // A band that research has not filled yet has nothing to edit; its fields save themselves (Done only).
  const widgetEdit = (id: CardId, widget: () => ReactNode, why = t('facts.edit.none')): EditDoor =>
    cardOf(id) === undefined || cardOf(id)?.state === 'notCollected'
      ? { why: t('reason.not_collected') }
      : widget() === null
        ? { why }
        : {
            form: (close) => (
              <>
                {widget()}
                <EditFooter t={t} onCancel={close} />
              </>
            )
          }
  const others = view.business.phones?.others ?? []
  const phone = doors.profileField('phone', view.business.phones?.main ?? '')
  const address = doors.profileField('address', view.business.address ?? '')
  const about = doors.profileField('bio', view.about ?? '')

  const shared = { t, locale, view }
  const setOn = doors.setFactOn ?? null
  const saveValue = doors.saveFactValue ?? null
  const more = moreBusinessFacts(t, view.saved?.business ?? [])

  return (
    <FactsLocked.Provider value={locked !== null}>
      <div className="tracy-wo-facts">
        {locked === null ? null : <FactsLockedNotice t={t} view={locked} />}
        <BusinessBand
          t={t}
          locale={locale}
          view={view.business}
          logo={facts ? media.logo : NOT_COLLECTED_LOGO}
          websiteLink={websiteLink}
          more={more}
          rows={view.sources}
          setOn={setOn}
          edit={
            !facts
              ? null
              : (close) => (
                  <BusinessEdit
                    t={t}
                    close={close}
                    name={view.business.name}
                    nameRow={doors.nameRow}
                    saveName={doors.saveName}
                    phone={phone}
                    address={address}
                    others={
                      others.length === 0
                        ? null
                        : `${t('facts.phone.others', { list: others.map((o) => o.phone).join(', ') })} ${t('phone.othersNote')}`
                    }
                    more={{ facts: more, save: saveValue }}
                  />
                )
          }
          researched={facts}
        />
        <HoursAmenitiesBand {...shared} saveHours={doors.saveHours} setOn={setOn} saveValue={saveValue} />
        {view.saved === null ? (
          <ServicesBand
            {...shared}
            onSite={switchOf(['services', 'audience', 'serviceAreas'])}
            edit={widgetEdit('services', () => doors.readingRows(['services', 'audience', 'serviceAreas']))}
          />
        ) : (
          <OfferingsBand {...shared} setOn={setOn} saveValue={saveValue} food={food} />
        )}
        <AboutBand
          {...shared}
          field={about}
          onSite={switchOf(['story', 'bio'])}
          setOn={setOn}
          saveValue={saveValue}
        />
        <TeamBand
          {...shared}
          onSite={switchOf(['team'])}
          owner={owner}
          pickReading={doors.pickReading}
          setOn={setOn}
        />
        <BrandBand
          t={t}
          notCollected={cardOf('brand')?.state === 'notCollected'}
          media={media}
          retry={doors.retryLogo}
          food={food}
          onSite={bandOf('brand')}
        />
        <MessagesBand
          {...shared}
          onSite={bandOf('keyMessages')}
          edit={widgetEdit('messages', () => doors.keyMessages)}
        />
        <ReviewsBand
          {...shared}
          onSite={bandOf('reviews')}
          edit={{ why: t('facts.edit.reviews') }}
          setHidden={owner.setReviewHidden}
          setOn={setOn}
        />
        <SocialBand {...shared} onSite={bandOf('socials')} owner={owner} setOn={setOn} />
        <FactsMedia
          t={t}
          media={media}
          show={!running}
          onUpload={doors.uploadMedia}
          onSite={bandOf('media')}
          setHidden={owner.setMediaHidden}
        />
      </div>
    </FactsLocked.Provider>
  )
}
