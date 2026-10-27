// Relative, not a new workspace dependency: this checkout is shared by several agent sessions and
// `pnpm-lock.yaml` already carries another one's in-progress package. Same shape `tracy-my-sites`
// already uses for `hasPageToShow`. Swap it for `@tracy/core/preview` when the tree is quiet.
import { canFrameCopy } from '../../../../core/tracy-core/src/preview/index.mjs'
import { addressOfSite } from './site-platform.mjs'
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react'
import { previewOf } from '../target-url.mjs'
import type { BuildApi, Job } from './api'
import type { Translate } from './strings'

/** Opaque host props travel to better-sidebar's browser, including its sandbox. */
export interface BrowserProps {
  tab: { id: string; type: string; title: string; path?: string; meta?: unknown }
  // `cwd` is part of better-sidebar's own `SessionScope` (`api.ts`: "the session's working directory
  // from the client list summary"); it was simply never declared here. It is what names the site.
  scope: { sessionId: string; cwd?: string }
  visible: boolean
  [key: string]: unknown
}

/**
 * What to show when no build has run: the site's own address from the seat book, or nothing.
 * `revision` is empty because there is no build to key a reload on — the frame loads once.
 * @param {{cwd?: string}} scope
 * @param {string} siteKey
 */
function fallbackPreview(scope: { cwd?: string }, siteKey: string): { url: string; revision: string } | null {
  const url = addressOfSite(scope?.cwd)
  return url === null || siteKey === '' ? null : { url, revision: '' }
}

export function LiveSiteTab({
  api,
  browser,
  browserProps,
  siteKey,
  platform,
  t
}: {
  api: BuildApi
  browser?: (props: BrowserProps) => ReactNode
  browserProps: BrowserProps
  siteKey: string
  /** The site's CMS. Decides whether its copy can be framed at all — `@tracy/core/preview`. */
  platform?: string | null
  t: Translate
}) {
  const [job, setJob] = useState<Job | null>(null)
  const [automatic, setAutomatic] = useState(true)
  const [revision, setRevision] = useState('')
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Cross-origin navigation is private to the frame. Pause when the customer enters it,
    // so a build refresh cannot discard their navigation or a partly filled form.
    const browsing = () => {
      const focused = document.activeElement
      if (focused?.tagName === 'IFRAME' && surface.current?.contains(focused)) setAutomatic(false)
    }
    window.addEventListener('blur', browsing)
    return () => window.removeEventListener('blur', browsing)
  }, [])
  useEffect(() => {
    let active = true
    const poll = async () => {
      const next = await api.fetchJob(siteKey)
      if (active && next && (!siteKey || next.targetSiteKey === siteKey)) setJob(next)
    }
    void poll()
    const timer = window.setInterval(() => {
      if (browserProps.visible) void poll()
    }, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [api, siteKey, browserProps.visible])
  // 🔒 A SITE WITH NO BUILD JOB IS STILL A SITE. `previewOf` answers only for a build, so until
  // somebody pressed Build this tab said "Creating your site…" — about a site that finished being
  // created minutes earlier, and would keep saying it for ever. Measured 19/09/2026 on
  // `demoemdash1.tracy.test`: provisioning done in 94 seconds, the site answering 200 at both addresses, the
  // tab still said it was creating. Every site created through Add site starts in exactly that state.
  //
  // The seat book knows the address — `copyUrl`, computed for this deployment, port included — so
  // the tab shows the site itself and simply has nothing to auto-refresh against.
  const preview = previewOf(job) ?? fallbackPreview(browserProps.scope, siteKey)
  useEffect(() => {
    if (automatic && preview) setRevision(preview.revision)
  }, [automatic, preview?.revision])
  // 🔒 A PLATFORM THAT REFUSES FRAMING GETS A LINK, NOT AN EMPTY FRAME. An EmDash copy serves
  // `X-Frame-Options: SAMEORIGIN` and no `frame-ancestors`, so the iframe renders Chromium's error
  // page — which looks exactly like a site that failed to build. Measured 19/09/2026 on
  // `demoemdasbh.tracy.test`: the site answered 200 the whole time the panel was empty. `@tracy/dsh-my-sites` and
  // `@tracy/dsh-add-site` already asked `canFrameCopy`; this path never had.
  const framed = canFrameCopy(platform)
  const Browser = framed ? (browser as ComponentType<BrowserProps> | undefined) : undefined
  const originalMeta = (browserProps.tab.meta ?? {}) as Record<string, unknown>
  if (!preview) return <div className="tracy-site-build p-4 text-muted-foreground">{t('form.creating')}</div>
  return (
    <div ref={surface} className="tracy-site-build flex h-full flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(event) => setAutomatic(event.target.checked)}
          />
          {t('preview.autoRefresh')}
        </label>
        <a href={preview.url} target="_blank" rel="noreferrer">
          {t('built.open')}
        </a>
      </div>
      <div className="min-h-0 flex-1">
        {Browser ? (
          <Browser
            {...browserProps}
            // `meta.url`, not only `path`: the side card's preview reads the address from `meta.url`
            // first (`browserAddressOf`, better-sidebar 0.21.1-tracy.1), and the Build tab's own meta
            // picks one up whenever the person navigates inside the frame — which would then pin the
            // preview to that old page when the site or its address changes.
            tab={{
              ...browserProps.tab,
              path: preview.url,
              meta: {
                ...originalMeta,
                url: preview.url,
                reloadNonce: `${revision}:${String(originalMeta.reloadNonce ?? '')}`
              }
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-start justify-center gap-2 p-4">
            {framed ? null : <p className="text-muted-foreground text-sm">{t('preview.external')}</p>}
            <a href={preview.url} target="_blank" rel="noreferrer">
              {t('built.open')}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
