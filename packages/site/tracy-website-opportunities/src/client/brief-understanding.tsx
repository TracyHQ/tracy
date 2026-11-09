/**
 * The brief view (#520): "How Tracy understands {business}" cards read from the structured brief
 * (`brief-cards-model.ts`), only those the brief covers, then the raw brief behind a Full brief control that starts
 * closed. The Build card that closes the view is drawn by the page beside it (the Brief page and the brief side card).
 */
import { type JSX, useId } from 'react'

import { briefCards } from './brief-cards-model.ts'
import type { Translate } from './strings.ts'

export function BriefUnderstanding({
  t,
  brief,
  markdown
}: {
  t: Translate
  /** The revision's structured brief (`revision.brief`). */
  brief: unknown
  /** The same brief as Markdown (`?format=md`); null when it could not be read. */
  markdown: string | null
}): JSX.Element {
  const view = briefCards(brief, t)
  const idBase = useId()
  return (
    <div className="tracy-wo-stack tracy-wo-understands">
      <div className="tracy-wo-page-head">
        <h2 className="tracy-wo-page-title">
          {view.business !== null
            ? t('brief.cards.title', { business: view.business })
            : t('brief.cards.titleNoName')}
        </h2>
        <p className="tracy-wo-muted tracy-wo-small">{t('brief.cards.lead')}</p>
      </div>
      {view.cards.length === 0 ? (
        <p className="tracy-wo-muted">{t('brief.cards.none')}</p>
      ) : (
        <div className="tracy-wo-brief-cards">
          {view.cards.map((card) => (
            <section key={card.id} className="tracy-wo-brief-card" aria-labelledby={`${idBase}-${card.id}`}>
              <h3 id={`${idBase}-${card.id}`}>{t(`brief.card.${card.id}`)}</h3>
              <ul>
                {card.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <details className="tracy-wo-brief-full">
        <summary>{t('brief.full')}</summary>
        {markdown !== null ? (
          <pre className="tracy-wo-markdown">{markdown}</pre>
        ) : (
          <p className="tracy-wo-muted">{t('revision.failed')}</p>
        )}
      </details>
    </div>
  )
}
