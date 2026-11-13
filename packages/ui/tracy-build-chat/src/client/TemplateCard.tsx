/**
 * The template choice card (TracyHQ/tracy#605): picture, name, one line reason and a choose action for each template
 * that has a released AI quickstart and fits the business (`templateChoiceOf`). Nothing fits: the owner is told so and
 * pointed to Add site. A pure function of the templates the build session weighed; saving the choice is the caller's
 * `onChoose` (`saveTemplateChoice` writes it to the build draft).
 */
import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { type TemplateOption, templateChoiceOf, templateOfChoice } from '@tracy/core/build-chat'
import { useState } from 'react'
import type { Translate } from './strings'

/** Add site, as tab-link opens it from the address of the page the chat is on. */
export const ADD_SITE_HREF = '?tab=tracy%3Aadd-site'

export interface TemplateCardProps {
  templates: TemplateOption[]
  t: Translate
  /** Saves the choice; a rejection keeps the card open and says it was not saved. */
  onChoose: (template: { slug: string; name: string; version: string }) => Promise<unknown> | unknown
  /** The slug already chosen: the card shows it and takes no other choice. */
  chosen?: string | null
  addSiteHref?: string
}

export function TemplateCard({
  templates,
  t,
  onChoose,
  chosen = null,
  addSiteHref = ADD_SITE_HREF
}: TemplateCardProps) {
  const choice = templateChoiceOf(templates)
  const [picked, setPicked] = useState<string | null>(chosen ?? choice.chosen)
  const [saved, setSaved] = useState<string | null>(chosen)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (choice.none) {
    return (
      <div className="tv-bc-card tv-bc-none" role="status">
        <p>{t('template.none')}</p>
        <p className="tv-bc-muted">{t('template.noneNext')}</p>
        <div className="tv-bc-tfoot">
          <a className="tv-bc-btn" href={addSiteHref}>
            {t('template.openAddSite')}
          </a>
        </div>
      </div>
    )
  }

  const locked = saved !== null
  const current = choice.options.find((o) => o.slug === (saved ?? picked)) ?? choice.options[0]

  const use = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await onChoose(templateOfChoice(current))
      setSaved(current.slug)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tv-bc-card">
      <div className="tv-bc-tgrid" role="group" aria-label={t('template.list')}>
        {choice.options.map((o) => (
          <button
            key={o.slug}
            type="button"
            className="tv-bc-tpl"
            aria-pressed={current.slug === o.slug}
            aria-disabled={locked || undefined}
            onClick={() => {
              if (!locked) setPicked(o.slug)
            }}
          >
            <img className="tv-bc-thumb" src={o.picture} alt="" loading="lazy" />
            <span className="tv-bc-nm">
              {o.name}
              {o.recommended === true && <span className="tv-bc-badge">{t('template.recommended')}</span>}
            </span>
            <span className="tv-bc-why">{o.reason}</span>
          </button>
        ))}
      </div>
      <div className="tv-bc-tfoot">
        {locked ? (
          <span className="tv-bc-chip">
            <IconCheckOutlineRegular aria-hidden />
            {t('template.chosen', { name: current.name })}
          </span>
        ) : (
          <>
            <span
              className={failed ? 'tv-bc-grow tv-bc-error' : 'tv-bc-grow tv-bc-muted tv-bc-small'}
              role="status"
            >
              {failed ? t('template.saveFailed') : t('template.later')}
            </span>
            <button type="button" className="tv-bc-btn" data-primary="" disabled={busy} onClick={use}>
              {t('template.use', { name: current.name })}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
