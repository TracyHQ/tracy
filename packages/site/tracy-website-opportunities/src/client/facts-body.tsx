/**
 * The Business facts body of the Workspace card (#537, option B): two columns of facts on the left, one hero photo
 * with its count badge on the right. Read only, and the same fixed height whatever is found (`facts-body-css.ts`).
 * The hero opens the Business facts sub-page; there is no separate Open control here (the row's pill opens it too).
 */
import type { JSX } from 'react'
import { ImageIcon, Images } from 'lucide-react'

import { mediaUrl } from './api.ts'
import type { Fact, FactsBodyView } from './facts-body-model.ts'
import type { Translate } from './strings.ts'

const plural = (t: Translate, n: number, one: string, many: string): string =>
  n === 1 ? t(one) : t(many, { count: n })

/** "25 photos · 10 videos" */
export function countsText(t: Translate, counts: FactsBodyView['counts']): string {
  return t('facts.body.counts', {
    photos: plural(t, counts.photos, 'facts.body.photosOne', 'facts.body.photosMany'),
    videos: plural(t, counts.videos, 'facts.body.videosOne', 'facts.body.videosMany')
  })
}

function FactSlot({ t, fact, running }: { t: Translate; fact: Fact; running: boolean }): JSX.Element {
  // The reserved slot keeps the grid's rows aligned and the body's height fixed.
  if (fact.labelKey === null)
    return <div className="tracy-wo-fb-fact" data-fact={fact.id} aria-hidden="true" />
  const v = fact.value
  const value =
    v === null ? (
      <span className="tracy-wo-fb-v" data-na="">
        {t(running ? 'profile.collecting' : 'facts.body.na')}
      </span>
    ) : v.kind === 'link' ? (
      <a className="tracy-wo-fb-v" href={v.url} target="_blank" rel="noopener noreferrer" title={v.url}>
        {v.host}
      </a>
    ) : v.kind === 'say' ? (
      <span className="tracy-wo-fb-v" title={v.title ?? undefined}>
        {t(v.key, v.params)}
      </span>
    ) : (
      <span className="tracy-wo-fb-v" title={v.title}>
        {v.text}
      </span>
    )
  return (
    <div className="tracy-wo-fb-fact" data-fact={fact.id}>
      <span className="tracy-wo-fb-k">{t(fact.labelKey)}</span>
      {value}
    </div>
  )
}

export function FactsBody({
  t,
  view,
  onOpen
}: {
  t: Translate
  view: FactsBodyView
  /** Opens the Business facts sub-page, as the row's pill does. */
  onOpen: () => void
}): JSX.Element {
  const counts = countsText(t, view.counts)
  return (
    <div className="tracy-wo-fb" aria-label={t('facts.body.label')} role="group">
      <div className="tracy-wo-fb-facts">
        {[view.left, view.right].map((column, i) => (
          <div className="tracy-wo-fb-col" key={i === 0 ? 'left' : 'right'}>
            {column.map((fact) => (
              <FactSlot key={fact.id} t={t} fact={fact} running={view.running} />
            ))}
          </div>
        ))}
      </div>
      {view.hero !== null ? (
        <button
          type="button"
          className="tracy-wo-fb-hero"
          aria-label={t('facts.body.openPhotos')}
          title={t('facts.body.openPhotos')}
          onClick={onOpen}
        >
          <img src={mediaUrl(view.hero.id)} alt="" loading="lazy" decoding="async" />
          <span className="tracy-wo-fb-badge">
            <Images aria-hidden="true" />
            {counts}
          </span>
        </button>
      ) : (
        <div className="tracy-wo-fb-nophoto">
          <ImageIcon aria-hidden="true" />
          {view.running ? (
            <b>{t('profile.collecting')}</b>
          ) : (
            <>
              <b>{t('facts.body.noPhotos')}</b>
              <span>{t('facts.body.noPhotosNote')}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
