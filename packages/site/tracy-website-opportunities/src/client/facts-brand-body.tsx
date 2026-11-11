/**
 * The Brand body of the Business facts sub-page (#537): the logo and where it came from, the verdict on the logo and
 * the note on the colours, then the colours, as two rows (#537, layout B). The band's
 * switch leaves the whole brand off the site (`band_brand`, #537 R16).
 */
import type { JSX } from 'react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import { sourceLabel } from './cms-label.ts'
import type { ColorsView, LogoView, MediaRowView } from './detail-model.ts'
import type { BandSwitchView } from './facts-band-actions.tsx'
import { useFactsLocked } from './facts-lock.tsx'
import { LogoField } from './media-row.tsx'
import type { Translate } from './strings.ts'

/** The brand as two rows: the logo with where it came from, its size, the verdict and the colour note; the colours. */
export function BrandBody({
  t,
  logo,
  colors,
  retry,
  food
}: {
  t: Translate
  logo: LogoView
  colors: ColorsView
  retry: { busy: boolean; failed: boolean; onPress: () => void }
  food: boolean
}): JSX.Element {
  // Approved facts (#537 R23): no Try again for the logo, which would research the card again.
  const locked = useFactsLocked()
  const verdict =
    logo.state === 'found' && logo.recognised !== null ? t(`media.logo.recognised.${logo.recognised}`) : null
  const colorNote =
    colors.state === 'found' && colors.observedOnly
      ? t(colors.origin === 'website' ? 'detail.colorsObserved.website' : 'detail.colorsObserved.social')
      : null
  const size =
    logo.state === 'found' && logo.width !== null && logo.height !== null
      ? `${t(logo.small ? 'media.logo.smallNote' : 'media.logo.sizeNote', {
          width: logo.width,
          height: logo.height
        })}${logo.transparent ? ` ${t('media.logo.transparent')}` : ''}`
      : null
  const via =
    logo.state === 'found'
      ? t(logo.viaKey, { source: logo.source === null ? '' : sourceLabel(t, logo.source) })
      : null
  return (
    <div className="tracy-wo-facts-cells tracy-wo-facts-brand">
      <div className="tracy-wo-facts-cell">
        <span className="tracy-wo-facts-ck">{t('media.logo')}</span>
        <div className="tracy-wo-facts-brand-logo">
          {logo.state === 'found' ? (
            <>
              <span className="tracy-wo-logo">
                <img src={mediaUrl(logo.mediaId)} alt={t('media.logo')} decoding="async" />
              </span>
              <span className="tracy-wo-facts-brand-via">
                <Badge variant="outline" title={via ?? undefined}>
                  {via}
                </Badge>
                {[size, verdict, colorNote].map((line, i) =>
                  line === null ? null : (
                    <span key={i} className="tracy-wo-facts-dim tracy-wo-small" title={line}>
                      {line}
                    </span>
                  )
                )}
              </span>
            </>
          ) : locked ? (
            <NotAvailable t={t} />
          ) : (
            <LogoField t={t} logo={logo} retry={retry} food={food} />
          )}
        </div>
      </div>
      {colors.state === 'found' ? (
        <div className="tracy-wo-facts-cell">
          <span className="tracy-wo-facts-ck">{t('detail.colors')}</span>
          <ul className="tracy-wo-facts-swatches" title={colorNote ?? undefined}>
            {colors.colors.map((c, i) => (
              <li key={`${c.hex}-${i}`}>
                <span style={{ backgroundColor: c.hex }} aria-hidden="true" />
                {c.hex}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** The Brand band: nothing to edit here; Not collected yet before research. */
export function BrandBand({
  t,
  notCollected,
  media,
  retry,
  food,
  onSite
}: {
  t: Translate
  notCollected: boolean
  media: MediaRowView
  retry: { busy: boolean; failed: boolean; onPress: () => void }
  food: boolean
  onSite: BandSwitchView
}): JSX.Element {
  return (
    <FactsBand
      t={t}
      id="brand"
      label={t('media.brand')}
      title={t('media.brand')}
      source={
        !notCollected && media.logo.state === 'found' && media.logo.source !== null
          ? { word: 'profile', source: media.logo.source, ref: null, at: null }
          : null
      }
      count={
        notCollected
          ? null
          : (media.logo.state === 'found' ? 1 : 0) +
            (media.colors.state === 'found' ? media.colors.colors.length : 0)
      }
      onSite={onSite}
      edit={{ why: t('facts.edit.brand') }}
    >
      {notCollected ? (
        <NotAvailable t={t} state="notCollected" />
      ) : (
        <BrandBody t={t} logo={media.logo} colors={media.colors} retry={retry} food={food} />
      )}
    </FactsBand>
  )
}
