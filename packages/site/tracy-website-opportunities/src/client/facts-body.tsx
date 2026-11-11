/**
 * The Business facts body of the Workspace card (#537, option F): two small groups of facts (Business, Contact) with
 * an About line under them, and a 3 by 2 photo mosaic beside them (`facts-body-mosaic.tsx`). Read only, one fixed
 * height (`facts-body-css.ts`). Any tile opens the Business facts sub-page; there is no separate Open control here.
 */
import type { JSX } from 'react'

import type { Fact, FactsBodyView } from './facts-body-model.ts'
import { FactsMosaic } from './facts-body-mosaic.tsx'
import type { Translate } from './strings.ts'

export { countsText } from './facts-body-mosaic.tsx'

function FactSlot({ t, fact, running }: { t: Translate; fact: Fact; running: boolean }): JSX.Element {
  if (fact.labelKey === null) return <></>
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
    <div className="tracy-wo-fb-fact" data-fact={fact.id} data-off={fact.off ? '' : undefined}>
      <span className="tracy-wo-fb-k">{t(fact.labelKey)}</span>
      {value}
    </div>
  )
}

function Group({
  t,
  title,
  facts,
  running
}: {
  t: Translate
  title: string
  facts: Fact[]
  running: boolean
}): JSX.Element {
  return (
    <div className="tracy-wo-fb-group">
      <h4 className="tracy-wo-fb-gt">{title}</h4>
      {facts.map((fact) => (
        <FactSlot key={fact.id} t={t} fact={fact} running={running} />
      ))}
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
  return (
    <div className="tracy-wo-fb" aria-label={t('facts.body.label')} role="group">
      <div className="tracy-wo-fb-facts">
        <div className="tracy-wo-fb-groups">
          <Group t={t} title={t('facts.body.groupBusiness')} facts={view.business} running={view.running} />
          <Group t={t} title={t('facts.body.groupContact')} facts={view.contact} running={view.running} />
        </div>
        <div className="tracy-wo-fb-foot">
          <FactSlot t={t} fact={view.about} running={view.running} />
          {view.followers?.value?.kind === 'text' ? (
            <span
              className="tracy-wo-fb-aside"
              data-off={view.followers.off ? '' : undefined}
              data-fact="followers"
            >
              <b>{view.followers.value.text}</b> {t('pp.stat.followers')}
            </span>
          ) : null}
        </div>
      </div>
      <FactsMosaic t={t} view={view} onOpen={onOpen} />
    </div>
  )
}
