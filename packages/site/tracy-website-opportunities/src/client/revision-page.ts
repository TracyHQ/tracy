/**
 * What a page about one brief revision reads (the Brief page in the tab and the brief side card, #520): the revision with
 * its structured brief, its Markdown, its latest build, the day's build usage, the name a build would get now and the
 * Site name on Tracy saved on the opportunity (#519).
 */
import { useCallback, useEffect, useState } from 'react'

import type { Api } from './api.ts'
import { shownBuildId, suggestedLabelOf } from './detail-model.ts'
import type { DemoUsage } from './outreach-model.ts'

export interface RevisionPage {
  revision: Record<string, unknown> | null
  markdown: string | null
  lastBuildId: string | null
  usage: DemoUsage | null
  suggestedLabel: string
  siteLabel: string | null
  failed: boolean
  reload: () => Promise<void>
}

export function useRevisionPage(api: Api, revisionId: string | null): RevisionPage {
  const [state, setState] = useState<Omit<RevisionPage, 'reload'>>({
    revision: null,
    markdown: null,
    lastBuildId: null,
    usage: null,
    suggestedLabel: '',
    siteLabel: null,
    failed: false
  })
  const reload = useCallback(async () => {
    if (revisionId === null) {
      setState((now) => ({ ...now, failed: true }))
      return
    }
    const [meta, md] = await Promise.all([api.revision(revisionId), api.revisionMarkdown(revisionId)])
    const revision = meta.ok ? meta.body?.revision : null
    if (!meta.ok || typeof revision !== 'object' || revision === null) {
      setState((now) => ({ ...now, failed: true }))
      return
    }
    const builds = Array.isArray(meta.body.builds)
      ? (meta.body.builds as { id?: unknown; state?: unknown }[])
      : null
    setState({
      revision: revision as Record<string, unknown>,
      markdown: md.ok ? md.body : null,
      lastBuildId: shownBuildId(builds),
      usage: (meta.body.usage as DemoUsage) ?? null,
      suggestedLabel: suggestedLabelOf(meta.body),
      siteLabel:
        typeof meta.body.siteLabel === 'string' && meta.body.siteLabel !== '' ? meta.body.siteLabel : null,
      failed: false
    })
  }, [api, revisionId])
  useEffect(() => {
    void reload()
  }, [reload])
  return { ...state, reload }
}
