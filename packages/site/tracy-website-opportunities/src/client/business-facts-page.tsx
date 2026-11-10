/**
 * The Business facts sub-page (#537, design A): one full-width band per group, top to bottom: the business, Opening
 * hours, Services, About, Team, Brand, Key messages, What guests say, Social pages, Photos & video and Research
 * details. Every band has one header row (title, source chips, Check this, then the action cluster: [Add more] ·
 * On the site switch · Edit) and the same collapsed height; what does not fit scrolls sideways in one row, a missing
 * fact reads N/A. Edit turns a band into its fields in place, with Cancel and Save at its bottom right; nothing opens
 * elsewhere. Before research, and while it runs, the bands say Not collected yet and hold nothing partial. The
 * owner's own choices (bands off, team, social links, items kept off, #537 R14 to R16) go through `doors.owner`.
 */
import type { JSX, ReactNode } from 'react'

import { HoursBand, ResearchBand } from './business-facts-bands.tsx'
import { FactsMedia } from './business-facts-media.tsx'
import type { BusinessFactsView, CardId } from './business-facts-model.ts'
import { BusinessBand } from './business-facts-parts.tsx'
import type { LogoView, MediaRowView } from './detail-model.ts'
import type { BandSwitchView, EditDoor } from './facts-band-actions.tsx'
import { BusinessEdit, type ProfileField } from './facts-band-edit.tsx'
import { EditFooter } from './facts-band-actions.tsx'
import { BrandBand } from './facts-brand-body.tsx'
import { AboutBand } from './facts-about-band.tsx'
import { MessagesBand, ReviewsBand, ServicesBand } from './facts-list-bands.tsx'
import { SocialBand } from './facts-social-band.tsx'
import { TeamBand } from './facts-team-people.tsx'
import type { OwnerBand, OwnerDoors } from './owner-edits-model.ts'
import type { HoursChoice, HoursSaved } from './profile-hours-row.tsx'
import type { RatingChoice } from './profile-rating-row.tsx'
import type { ReadingPick } from './profile-reading-model.ts'
import type { Translate } from './strings.ts'

/** The calls the bands save through: each one the Business facts rows already had. */
export interface FactsDoors {
  /** "Name on the site" with its own choices, or null when research decided no name (the plain field then). */
  nameRow: JSX.Element | null
  saveName: (name: string) => Promise<boolean>
  /** A plain profile row (`phone`, `address`, `bio`) with its save, or null when no call edits it. */
  profileField: (field: string, value: string) => ProfileField | null
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
  saveRating: (choice: RatingChoice) => Promise<boolean>
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  /** The site's facts of some fields on or off together (`setFact`), or null when the brief states none of them. */
  factSwitch: (fields: readonly string[]) => BandSwitchView | null
  /** Reading rows of some groups, with Remove / Put back / Show / Leave off. */
  readingRows: (
    groups: ReadonlyArray<'services' | 'audience' | 'team' | 'serviceAreas'>
  ) => JSX.Element | null
  /** The key messages editor (labels, order, delete). */
  keyMessages: JSX.Element | null
  uploadMedia: (file: File) => Promise<string | null>
  retryLogo: { busy: boolean; failed: boolean; onPress: () => void }
  /** The owner's choices for the site: band switches, team, social links, photos and reviews kept off. */
  owner: OwnerDoors
}

const NOT_COLLECTED_LOGO = { state: 'notCollected' } as LogoView

export function BusinessFactsPage({
  t,
  locale,
  view,
  media,
  doors,
  food,
  websiteLink,
  researchDetails,
  running
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  media: MediaRowView
  doors: FactsDoors
  food: boolean
  websiteLink: (url: string) => JSX.Element
  /** Menu, Google Place, reviews, current website, social figures and place profile, read only under the bands; null when none. */
  researchDetails: ReactNode | null
  /** Research runs: the photos and videos wait for it to finish, only Add more stays (#537). */
  running: boolean
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
  const teamSwitch = switchOf(['team'])
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

  const aboutCard = cardOf('about')
  const shared = { t, locale, view }

  return (
    <div className="tracy-wo-facts">
      <BusinessBand
        t={t}
        locale={locale}
        view={view.business}
        logo={facts ? media.logo : NOT_COLLECTED_LOGO}
        websiteLink={websiteLink}
        onRating={doors.saveRating}
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
                />
              )
        }
        researched={facts}
      />
      <HoursBand t={t} locale={locale} view={view} saveHours={doors.saveHours} />
      <ServicesBand
        {...shared}
        onSite={switchOf(['services', 'audience', 'serviceAreas'])}
        edit={widgetEdit('services', () => doors.readingRows(['services', 'audience', 'serviceAreas']))}
      />
      <AboutBand
        t={t}
        locale={locale}
        card={aboutCard}
        about={view.about}
        field={about}
        onSite={switchOf(['story', 'bio'])}
      />
      <TeamBand
        t={t}
        locale={locale}
        view={view}
        onSite={teamSwitch}
        owner={owner}
        pickReading={doors.pickReading}
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
      />
      <SocialBand t={t} view={view} onSite={bandOf('socials')} owner={owner} />
      <FactsMedia
        t={t}
        media={media}
        show={!running}
        onUpload={doors.uploadMedia}
        onSite={bandOf('media')}
        setHidden={owner.setMediaHidden}
      />
      <ResearchBand t={t} view={view} />
      {facts && researchDetails !== null ? (
        <div className="tracy-wo-facts-more">{researchDetails}</div>
      ) : null}
    </div>
  )
}
