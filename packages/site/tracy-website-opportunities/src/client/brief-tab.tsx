/**
 * A site brief in the dsh side card (Lee 19/10, option a): its own tab, `Brief N · <place>`. It shows the brief as
 * "How Tracy understands {business}" cards with the raw brief behind Full brief (`brief-understanding.tsx`, #520), and
 * closes on the Build card the Brief page uses, with its template, time and price.
 */
import type { JSX } from 'react'
import { Button, Spinner } from '@tracy/ui'

import type { Api } from './api.ts'
import { BriefUnderstanding } from './brief-understanding.tsx'
import { Build } from './detail.tsx'
import { createRequestIds } from './request-ids.ts'
import { useRevisionPage } from './revision-page.ts'
import type { Translate } from './strings.ts'

/** The side-card tab type; no `tracy:` prefix, so tracy-tab-link does not mirror it into the address. */
export const BRIEF_TAB = 'tracy-wo-brief'

export interface BriefTabMeta {
  revisionId?: string
  opportunityId?: string
}

/** What a brief needs to open in the side card. */
export interface BriefTabSeed {
  revisionId: string
  opportunityId: string
  title: string
}

export function briefTabMeta(meta: unknown): BriefTabMeta {
  if (typeof meta !== 'object' || meta === null) return {}
  const revisionId = Reflect.get(meta, 'revisionId')
  const opportunityId = Reflect.get(meta, 'opportunityId')
  return {
    ...(typeof revisionId === 'string' && revisionId !== '' ? { revisionId } : {}),
    ...(typeof opportunityId === 'string' && opportunityId !== '' ? { opportunityId } : {})
  }
}

/** One request id per press for the side card's Build card, like the tab's own (`index.tsx`). */
const ids = createRequestIds(() =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
)

export function BriefTab({ t, api, meta }: { t: Translate; api: Api; meta: BriefTabMeta }): JSX.Element {
  const revisionId = meta.revisionId ?? null
  const page = useRevisionPage(api, revisionId)
  return (
    <div className="tracy-wo tracy-wo-tab">
      <div className="tracy-wo-body tracy-wo-brief-doc">
        {page.failed ? (
          <div className="tracy-wo-stack">
            <p className="tracy-wo-error" role="alert">
              {t('revision.failed')}
            </p>
            {revisionId !== null ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void page.reload()}>
                {t('action.retry')}
              </Button>
            ) : null}
          </div>
        ) : page.revision === null ? (
          <p className="tracy-wo-note" role="status">
            <Spinner label={t('loading.label')} />
            {t('loading.label')}
          </p>
        ) : (
          // The cards and the Build card side by side, like the Brief page of Details; one column on a narrow tab.
          <div className="tracy-wo-page-grid is-brief">
            <div className="tracy-wo-col">
              <BriefUnderstanding t={t} brief={page.revision.brief} markdown={page.markdown} />
            </div>
            {revisionId !== null && meta.opportunityId ? (
              <Build
                key={page.lastBuildId ?? 'new'}
                t={t}
                api={api}
                ids={ids}
                revisionId={revisionId}
                opportunityId={meta.opportunityId}
                onStarted={() => void page.reload()}
                cms=""
                suggestedLabel={page.suggestedLabel}
                siteLabel={page.siteLabel}
                usage={page.usage}
                initialBuildId={page.lastBuildId}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
