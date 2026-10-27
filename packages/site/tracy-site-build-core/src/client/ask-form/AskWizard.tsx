import type { JSX, ReactNode } from 'react'

import type { AskFormTranslate } from './AskForm'
import type { AskItem } from './model'

/** Known questionnaire roles stay together; new server questions always get a visible fallback. */
export function wizardGroup(item: AskItem): string {
  if (item.kind === 'logo' || item.kind === 'favicon') return 'Brand'
  if (item.kind === 'languages' || item.id === 'tone') return 'LanguageTone'
  if (item.id === 'pages') return 'Pages'
  if (item.id === 'name' || item.id === 'about') return 'Business'
  return 'More'
}

export function AskWizard({
  items,
  renderItem,
  headingOf,
  answered,
  t
}: {
  items: AskItem[]
  renderItem: (item: AskItem) => ReactNode
  headingOf: (item: AskItem) => ReactNode
  answered: (item: AskItem) => boolean
  t: AskFormTranslate
}): JSX.Element {
  return (
    <div data-ask-body="1" data-ask-layout="wizard" className="tas-customize-groups">
      {['Business', 'LanguageTone', 'Brand', 'Pages', 'More'].map((group) => {
        const members = items.filter((item) => wizardGroup(item) === group)
        if (members.length === 0) return null
        return (
          <section key={group} className="tas-customize-group" data-ask-group={group}>
            <div className="tas-customize-heading">
              <h2>{t(`ask.group${group}`)}</h2>
              {group === 'Business' || group === 'Brand' ? <span>{t(`ask.group${group}Note`)}</span> : null}
              {members.map((item) => headingOf(item))}
            </div>
            <div className="tas-customize-box" data-group-layout={group}>
              {members.map((item) => (
                <div
                  key={item.id}
                  className="tas-customize-field"
                  data-ask-item={item.id}
                  data-ask-card="open"
                  data-answered={answered(item) ? '1' : '0'}
                >
                  {renderItem(item)}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
