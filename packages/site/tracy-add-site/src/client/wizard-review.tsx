import { Button } from '@tracy/ui'
import type { JSX, ReactNode } from 'react'

import { cleanAnswers, isPagesQuestion, type PopupQuestion } from './site-brief.mjs'
import type { SheetAnswers } from './questions-sheet'
import type { Translate } from './strings'

/** Summarize the served questions by their feeds, retaining support for older question ids. */
export function reviewBusiness({
  t,
  questions,
  answers,
  skipped,
  locale
}: {
  t: Translate
  questions: PopupQuestion[]
  answers: SheetAnswers
  skipped: boolean
  locale: string
}): { value: string; secondary?: string } {
  if (skipped) return { value: t('wizard_customize_skipped') }
  const cleaned = cleanAnswers(questions, answers)
  const name = questions.find((q) => q.feeds?.includes('site.name') || q.id === 'name')
  const language = questions.find((q) => q.kind === 'languages')
  const tone = questions.find((q) => q.feeds?.includes('copy.tone') || q.id === 'tone')
  const pages = questions.find(isPagesQuestion)
  const named = name && typeof cleaned[name.id] === 'string' ? String(cleaned[name.id]) : ''
  const secondary: string[] = []
  const languages = language ? cleaned[language.id] : null
  for (const code of Array.isArray(languages)
    ? languages
    : typeof languages === 'string'
      ? [languages]
      : []) {
    try {
      secondary.push(new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code)
    } catch {
      secondary.push(code)
    }
  }
  const toneValue = tone ? cleaned[tone.id] : null
  if (tone && typeof toneValue === 'string') secondary.push(tone.optionLabels?.[toneValue] ?? toneValue)
  if (pages && Array.isArray(pages.options) && pages.options.length) {
    const chosen = cleaned[pages.id]
    const kept = Array.isArray(chosen)
      ? pages.options.filter((page) => chosen.includes(page) || pages.locked?.includes(page)).length
      : pages.options.length
    secondary.push(t('wizard_review_pages', { kept, total: pages.options.length }))
  }
  return { value: named || t('wizard_review_not_set'), secondary: secondary.join(' · ') || undefined }
}

/** Review values exclude credentials; Change reopens the page that owns the choice. */
export function WizardReview({
  t,
  hero,
  rows,
  onEdit
}: {
  t: Translate
  hero: {
    address: string
    live?: boolean
    image?: string | null
    template?: string
    platform: string
    system?: { name: string; colors: string[] } | null
  }
  rows: { id: string; label: string; value: ReactNode; secondary?: ReactNode }[]
  onEdit: (id: string) => void
}): JSX.Element {
  return (
    <div className="tas-wizard-summary" data-wizard-review="1">
      <div className="tas-wizard-review-hero" data-thumbnail={hero.image ? '1' : '0'}>
        {hero.image ? (
          <div className="tas-wizard-review-thumb">
            <img src={hero.image} alt={hero.template ?? ''} />
          </div>
        ) : null}
        <div className="tas-wizard-review-identity">
          <div className="tas-wizard-review-url">{hero.address}</div>
          {hero.live !== false ? (
            <div className="tas-wizard-review-live">{t('wizard_review_live')}</div>
          ) : null}
          <div className="tas-wizard-review-chips">
            {hero.platform ? <span className="tas-wizard-review-chip">{hero.platform}</span> : null}
            {hero.template ? <span className="tas-wizard-review-chip">{hero.template}</span> : null}
            {hero.system ? (
              <span className="tas-wizard-review-chip">
                {hero.system.colors.map((color) => (
                  <i key={color} style={{ backgroundColor: color }} aria-hidden="true" />
                ))}
                {hero.system.name}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <dl className="tas-wizard-review">
        {rows.map((row) => (
          <div className="tas-wizard-review-row" data-wizard-review-row={row.id} key={row.id}>
            <dt>{row.label}</dt>
            <dd>
              {row.value}
              {row.secondary ? <span className="tas-wizard-review-secondary"> · {row.secondary}</span> : null}
            </dd>
            <Button
              type="button"
              variant="link"
              className="tas-wizard-review-change"
              size="sm"
              onClick={() => onEdit(row.id)}
              aria-label={t('wizard_edit_step', { step: row.label })}
            >
              {t('wizard_edit')}
            </Button>
          </div>
        ))}
      </dl>
    </div>
  )
}
