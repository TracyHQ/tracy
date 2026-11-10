/**
 * The Brand body of the Business facts sub-page (#537): the logo and where it came from, the verdict on the logo and
 * the note on the colours (one line each, the whole sentence on hover), and the colours, in one row.
 */
import type { JSX } from 'react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import type { ColorsView, LogoView } from './detail-model.ts'
import { LogoField } from './media-row.tsx'
import type { Translate } from './strings.ts'

/**
 * The brand in three cells side by side, no layer over another: the logo with where it came from and its size, the
 * verdict on the logo and the note on the colours (one line each, the whole sentence on hover), and the colours.
 * Under 560px the verdict and the note go to a second row.
 */
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
    <div className="tracy-wo-facts-brand">
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
              {size === null ? null : (
                <span className="tracy-wo-facts-ell tracy-wo-facts-dim tracy-wo-small" title={size}>
                  {size}
                </span>
              )}
            </span>
          </>
        ) : (
          <LogoField t={t} logo={logo} retry={retry} food={food} />
        )}
      </div>
      {verdict === null && colorNote === null ? null : (
        <div className="tracy-wo-facts-brand-notes">
          {verdict === null ? null : (
            <span className="tracy-wo-facts-ell" title={verdict}>
              {verdict}
            </span>
          )}
          {colorNote === null ? null : (
            <span className="tracy-wo-facts-ell tracy-wo-facts-dim tracy-wo-small" title={colorNote}>
              {colorNote}
            </span>
          )}
        </div>
      )}
      {colors.state === 'found' ? (
        <ul className="tracy-wo-facts-swatches" title={colorNote ?? undefined}>
          {colors.colors.map((c, i) => (
            <li key={`${c.hex}-${i}`}>
              <span style={{ backgroundColor: c.hex }} aria-hidden="true" />
              {c.hex}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
