/**
 * The Business facts sub-page (#537, design A): one full-width band per group, top to bottom: the business, Opening
 * hours, Services, About, Team, Brand, Key messages, What guests say, Social pages, Photos & video and Research
 * details. Every band has one header row (title, source chips, Check this, then the action cluster: [Add more] ·
 * On the site switch · Edit) and the same collapsed height; what does not fit scrolls sideways in one row, a missing
 * fact reads N/A. Edit turns a band into its fields in place, with Cancel and Save at its bottom right; nothing opens
 * elsewhere. Before research, and while it runs, the bands say Not collected yet and hold nothing partial.
 */
import type { JSX, ReactNode } from 'react'

import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import { HoursBand, Missing, ResearchBand, TeamPeople } from './business-facts-bands.tsx'
import { FactsMedia } from './business-facts-media.tsx'
import type { BusinessFactsView, CardId } from './business-facts-model.ts'
import { BusinessBand } from './business-facts-parts.tsx'
import type { LogoView, MediaRowView } from './detail-model.ts'
import type { BandSwitchView, EditDoor } from './facts-band-actions.tsx'
import { AboutEdit, BusinessEdit, type ProfileField } from './facts-band-edit.tsx'
import { EditFooter } from './facts-band-actions.tsx'
import { BrandBody } from './facts-brand-body.tsx'
import { MessagesBand, ReviewsBand, ServicesBand, SocialBand } from './facts-list-bands.tsx'
import type { HoursChoice, HoursSaved } from './profile-hours-row.tsx'
import type { RatingChoice } from './profile-rating-row.tsx'
import type { ReadingPick } from './profile-reading-model.ts'
import { SourceChip } from './source-chip.tsx'
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
  const filled = (id: CardId): boolean => cardOf(id)?.state === 'filled'
  const body = (id: CardId, draw: () => ReactNode): ReactNode =>
    filled(id) ? draw() : <Missing t={t} card={cardOf(id)} />
  const notStored: BandSwitchView = { on: true, set: null, why: t('facts.switch.notStored') }
  const switchOf = (fields: readonly string[]): BandSwitchView => doors.factSwitch(fields) ?? notStored
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
      <FactsBand
        t={t}
        id="about"
        label={t('field.bio')}
        title={t('field.bio')}
        chips={filled('about') ? <SourceChip t={t} chip={aboutCard?.chip ?? null} locale={locale} /> : null}
        onSite={switchOf(['story', 'bio'])}
        edit={
          aboutCard === undefined || aboutCard.state === 'notCollected' || about === null
            ? { why: t(about === null ? 'facts.edit.none' : 'reason.not_collected') }
            : { form: (close) => <AboutEdit t={t} close={close} about={about} /> }
        }
      >
        {body('about', () => (
          <p className="tracy-wo-facts-about tracy-wo-facts-clamp2" title={view.about ?? undefined}>
            {view.about}
          </p>
        ))}
      </FactsBand>
      <FactsBand
        t={t}
        id="team"
        label={t('field.team')}
        title={t('field.team')}
        onSite={switchOf(['team'])}
        edit={widgetEdit('team', () => doors.readingRows(['team']))}
      >
        {body('team', () => (
          <TeamPeople t={t} locale={locale} view={view} pickReading={doors.pickReading} />
        ))}
      </FactsBand>
      <FactsBand
        t={t}
        id="brand"
        label={t('media.brand')}
        title={t('media.brand')}
        onSite={notStored}
        edit={{ why: t('facts.edit.brand') }}
      >
        {cardOf('brand')?.state === 'notCollected' ? (
          <NotAvailable t={t} state="notCollected" />
        ) : (
          <BrandBody t={t} logo={media.logo} colors={media.colors} retry={doors.retryLogo} food={food} />
        )}
      </FactsBand>
      <MessagesBand {...shared} onSite={notStored} edit={widgetEdit('messages', () => doors.keyMessages)} />
      <ReviewsBand {...shared} onSite={notStored} edit={{ why: t('facts.edit.reviews') }} />
      <SocialBand
        {...shared}
        onSite={switchOf(['socials', 'socialFigures'])}
        edit={{ why: t('facts.edit.social') }}
      />
      <FactsMedia t={t} media={media} show={!running} onUpload={doors.uploadMedia} />
      <ResearchBand t={t} view={view} />
      {facts && researchDetails !== null ? (
        <div className="tracy-wo-facts-more">{researchDetails}</div>
      ) : null}
    </div>
  )
}
