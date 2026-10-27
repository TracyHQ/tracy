/**
 * "Phone" and "Other phones" on the Details Profile card: the main number with a `Main` chip when the business lists
 * other numbers, then each other number with who states it. The site shows the main number where it shows a phone,
 * and the others only in its Contact section.
 */
import type { JSX } from 'react'
import { Badge } from '@tracy/ui'

import type { PhonesView } from './profile-phones-model.ts'
import type { Translate } from './strings.ts'

/** Product names stay as they are written; the other sources are words of the interface. */
const PRODUCT_NAME: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp'
}

function sourceName(t: Translate, source: string): string | null {
  if (source === 'website') return t('name.source.website')
  if (source === 'listing') return t('name.source.listing')
  return PRODUCT_NAME[source] ?? null
}

export function ProfilePhonesRows({ t, view }: { t: Translate; view: PhonesView }): JSX.Element {
  const many = view.others.length > 0
  return (
    <>
      <div className="tracy-wo-field">
        <dt className="tracy-wo-muted tracy-wo-small">{t('field.phone')}</dt>
        <dd>
          <span className="tracy-wo-row tracy-wo-wrap">
            <span>{view.main}</span>
            {many ? (
              <Badge variant="outline" className="tracy-wo-name-chip">
                {t('phone.main')}
              </Badge>
            ) : null}
            {view.mainWhatsapp ? (
              <Badge variant="outline" className="tracy-wo-name-chip">
                {PRODUCT_NAME.whatsapp}
              </Badge>
            ) : null}
          </span>
        </dd>
      </div>
      {many ? (
        <div className="tracy-wo-field">
          <dt className="tracy-wo-muted tracy-wo-small">{t('field.otherPhones')}</dt>
          <dd>
            <span className="tracy-wo-phone-list">
              {view.others.map((o) => {
                const from = o.sources.map((s) => sourceName(t, s)).filter((s): s is string => s !== null)
                return (
                  <span key={o.phone} className="tracy-wo-row tracy-wo-wrap">
                    <span>{o.phone}</span>
                    {o.whatsapp ? (
                      <Badge variant="outline" className="tracy-wo-name-chip">
                        {PRODUCT_NAME.whatsapp}
                      </Badge>
                    ) : null}
                    {from.length > 0 ? (
                      <span className="tracy-wo-muted tracy-wo-small">{from.join(', ')}</span>
                    ) : null}
                  </span>
                )
              })}
            </span>
            <span className="tracy-wo-muted tracy-wo-small">{t('phone.othersNote')}</span>
          </dd>
        </div>
      ) : null}
    </>
  )
}
