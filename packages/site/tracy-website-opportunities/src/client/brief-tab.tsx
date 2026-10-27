/**
 * A site brief in the dsh side card (Lee 19/10, option a): its own tab, `Brief N · <place>`, with the
 * brief drawn by dsh's `MarkdownText`, as the side chat draws a message. It reads
 * `GET /revisions/:id?format=md` and writes nothing anywhere.
 */
import { type JSX, useEffect, useMemo, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, Spinner } from '@tracy/ui'

import type { Api } from './api.ts'
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

export function BriefTab({ t, api, meta }: { t: Translate; api: Api; meta: BriefTabMeta }): JSX.Element {
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [ask, setAsk] = useState(0)
  const revisionId = meta.revisionId ?? null
  useEffect(() => {
    if (revisionId === null) return
    let live = true
    setFailed(false)
    void api.revisionMarkdown(revisionId).then((answer) => {
      if (!live) return
      if (answer.ok) setText(answer.body)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [api, revisionId, ask])
  // A reference-stable object per locale: a new identity throws away MarkdownText's render cache.
  const labels = useMemo(
    () => ({ code: { copyLabel: t('briefTab.copy'), copiedLabel: t('briefTab.copied') }, footnotes: '' }),
    [t]
  )

  return (
    <div className="tracy-wo tracy-wo-tab">
      <div className="tracy-wo-body tracy-wo-brief-doc">
        {revisionId === null || failed ? (
          <div className="tracy-wo-stack">
            <p className="tracy-wo-error" role="alert">
              {t('revision.failed')}
            </p>
            {revisionId !== null ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setAsk((n) => n + 1)}>
                {t('action.retry')}
              </Button>
            ) : null}
          </div>
        ) : text === null ? (
          <p className="tracy-wo-note" role="status">
            <Spinner label={t('loading.label')} />
            {t('loading.label')}
          </p>
        ) : (
          <MarkdownText text={text} labels={labels} />
        )}
      </div>
    </div>
  )
}
