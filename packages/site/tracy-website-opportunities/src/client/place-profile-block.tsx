/**
 * The Place profile block of Details: what the research found about the place, whatever the template, and what it
 * looked for. Wording and states: the approved draft `2026-10-23-wo-place-profile` (yellow = not collected, grey = looked
 * and not there). The seller sees everything here, including quotations the demo is not allowed to use.
 */
import type { JSX } from 'react'

import { interfaceLocale } from '@tracy/core/interface-languages'

import { Section } from './inspector.tsx'
import {
  type ClaimView,
  type CoverageRowView,
  type PlaceProfileView,
  placeProfileView
} from './place-profile-model.ts'
import type { Translate } from './strings.ts'

const day = (iso: string): string => {
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? iso
    : new Intl.DateTimeFormat(interfaceLocale(), { dateStyle: 'medium' }).format(at)
}

function Part({ title, children }: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <div className="tracy-wo-field">
      <dt className="tracy-wo-muted tracy-wo-small">{title}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Claims({ rows }: { rows: ClaimView[] }): JSX.Element {
  return (
    <ul className="tracy-wo-stack">
      {rows.map((row) => (
        <li key={row.id}>
          <span>{row.label}</span>
          {row.detail !== null ? (
            <span className="tracy-wo-muted tracy-wo-small">{` · ${row.detail}`}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function Coverage({ t, rows }: { t: Translate; rows: CoverageRowView[] }): JSX.Element {
  return (
    <ul className="tracy-wo-stack">
      {rows.map((row) => (
        <li key={row.target} className="tracy-wo-row tracy-wo-wrap" data-status={row.status}>
          <span>{t(`pp.target.${row.target}`)}</span>
          <span
            className={row.tone === 'warn' ? 'tracy-wo-warn tracy-wo-small' : 'tracy-wo-muted tracy-wo-small'}
          >
            {t(`pp.status.${row.status}`)}
          </span>
          {row.searchedAt !== null ? (
            <span className="tracy-wo-muted tracy-wo-small">
              {t('pp.looked', { date: day(row.searchedAt) })}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function PlaceProfileBlock({
  t,
  profile,
  failed
}: {
  t: Translate
  /** The `profile` of `GET …/place-profile`; null while it loads or after it failed. */
  profile: unknown
  failed: boolean
}): JSX.Element | null {
  const view: PlaceProfileView | null = placeProfileView(profile)
  if (view === null)
    return failed ? (
      <Section title={t('pp.title')}>
        <p className="tracy-wo-error" role="alert">
          {t('pp.failed')}
        </p>
      </Section>
    ) : null
  const hasClaims = view.statistics.length + view.recognitions.length + view.relationships.length > 0
  return (
    <Section title={t('pp.title')}>
      <p className="tracy-wo-muted tracy-wo-small">{t('pp.lead')}</p>
      <dl className="tracy-wo-fields">
        {view.offerings.length > 0 ? (
          <Part title={t('pp.offerings')}>
            <ul className="tracy-wo-stack">
              {view.offerings.map((o) => (
                <li key={o.id}>
                  <span>{o.name}</span>
                  {o.section !== null ? (
                    <span className="tracy-wo-muted tracy-wo-small">{` · ${o.section}`}</span>
                  ) : null}
                  {o.description !== null ? (
                    <span className="tracy-wo-muted tracy-wo-small">{` ${o.description}`}</span>
                  ) : null}
                  {o.variants.map((v, i) => {
                    const line = [v.size, v.duration, v.price].filter((x) => x !== null).join(' · ')
                    return line === '' ? null : (
                      <span key={i} className="tracy-wo-muted tracy-wo-small">{` · ${line}`}</span>
                    )
                  })}
                </li>
              ))}
            </ul>
          </Part>
        ) : null}
        {view.people.length > 0 ? (
          <Part title={t('pp.people')}>
            <ul className="tracy-wo-stack">
              {view.people.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  {p.role !== null ? (
                    <span className="tracy-wo-muted tracy-wo-small">{` · ${p.role}`}</span>
                  ) : null}
                  {p.bio !== null ? (
                    <span className="tracy-wo-muted tracy-wo-small">{` ${p.bio}`}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Part>
        ) : null}
        {hasClaims ? (
          <Part title={t('pp.claims')}>
            <div className="tracy-wo-stack">
              {view.statistics.length > 0 ? <Claims rows={view.statistics} /> : null}
              {view.recognitions.length > 0 ? <Claims rows={view.recognitions} /> : null}
              {view.relationships.length > 0 ? <Claims rows={view.relationships} /> : null}
            </div>
          </Part>
        ) : null}
        {view.faqs.length > 0 ? (
          <Part title={t('pp.faqs')}>
            <ul className="tracy-wo-stack">
              {view.faqs.map((f) => (
                <li key={f.id}>
                  <span>{f.question}</span>
                  <span className="tracy-wo-muted tracy-wo-small">{` ${f.answer}`}</span>
                </li>
              ))}
            </ul>
          </Part>
        ) : null}
        {view.quotes.length > 0 ? (
          <Part title={t('pp.quotes')}>
            <div className="tracy-wo-reviews">
              {view.quotes.map((q) => (
                <blockquote key={q.id} className="tracy-wo-review">
                  <span>{q.text}</span>
                  <span className="tracy-wo-muted tracy-wo-small tracy-wo-review-author">
                    {[t(`pp.quote.${q.kind}`), q.author].filter((x) => x !== null).join(' · ')}
                  </span>
                </blockquote>
              ))}
            </div>
          </Part>
        ) : null}
        {view.mediaLinks.length > 0 ? (
          <Part title={t('pp.photoLinks')}>
            <ul className="tracy-wo-stack">
              {view.mediaLinks.map((m) => (
                <li key={m.id}>
                  {m.relations
                    .map((r) =>
                      t('pp.relation.line', {
                        relation: t(`pp.relation.${r.relation}`),
                        target: r.target ?? t('pp.relation.business')
                      })
                    )
                    .join(' · ')}
                </li>
              ))}
            </ul>
          </Part>
        ) : null}
        {view.coverage.length > 0 ? (
          <Part title={t('pp.coverage')}>
            <Coverage t={t} rows={view.coverage} />
          </Part>
        ) : null}
      </dl>
    </Section>
  )
}
