/**
 * The brief view (#520): "How Tracy understands {business}" cards read from the structured brief
 * (`brief-cards-model.ts`), only those the brief covers, then the raw brief behind a Full brief control that starts
 * closed. The Build card that closes the view is drawn by the page beside it (the Brief page and the brief side card).
 */
import { type JSX, useId } from 'react'

import { briefCards } from './brief-cards-model.ts'
import { briefEditTargets } from './brief-edit-model.ts'
import { EditableText } from './editable-text.tsx'
import type { Translate } from './strings.ts'

export function BriefUnderstanding({
  t,
  brief,
  markdown,
  onEditLine = null
}: {
  t: Translate
  /** The revision's structured brief (`revision.brief`). */
  brief: unknown
  /** The same brief as Markdown (`?format=md`); null when it could not be read. */
  markdown: string | null
  /** Saves one line's new words as a new brief (#524, `brief-edit-model.ts`); null draws the cards read only. */
  onEditLine?: ((path: string, value: string) => Promise<boolean>) | null
}): JSX.Element {
  const view = briefCards(brief, t)
  const targets = onEditLine === null ? null : briefEditTargets(brief)
  const edited = typeof brief === 'object' && brief !== null && Reflect.get(brief, 'edited') !== undefined
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
        {edited ? <p className="tracy-wo-muted tracy-wo-small">{t('brief.editedByYou')}</p> : null}
      </div>
      {view.cards.length === 0 ? (
        <p className="tracy-wo-muted">{t('brief.cards.none')}</p>
      ) : (
        <div className="tracy-wo-brief-cards">
          {view.cards.map((card) => (
            <section key={card.id} className="tracy-wo-brief-card" aria-labelledby={`${idBase}-${card.id}`}>
              <h3 id={`${idBase}-${card.id}`}>{t(`brief.card.${card.id}`)}</h3>
              <ul>
                {card.items.map((item) => {
                  const path = targets?.get(`${card.id}\n${item}`) ?? null
                  return (
                    <li key={item}>
                      {path !== null && onEditLine !== null ? (
                        <EditableText
                          t={t}
                          value={item}
                          label={t(`brief.card.${card.id}`)}
                          edited={false}
                          editedKey="brief.editedByYou"
                          multiline={item.length > 80}
                          maxLength={2000}
                          keys={{
                            edit: 'brief.edit',
                            save: 'brief.edit.save',
                            cancel: 'brief.edit.cancel',
                            failed: 'brief.edit.failed'
                          }}
                          onSave={(typed) =>
                            typed.trim() === item ? Promise.resolve(true) : onEditLine(path, typed)
                          }
                        />
                      ) : (
                        item
                      )}
                    </li>
                  )
                })}
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
