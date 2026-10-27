/**
 * The other sites in the left column: one row per site the viewer holds, right below the open
 * site's workspace tree.
 *
 * Pressing a row shows that site in the side card, with no page load (15/09/2026): the row asks
 * (`tracy:show-site`) and Add site's workspace effect focuses or opens the site's browser tab. Its
 * conversations stay in its own workspace — each site is its own seat, which only its own page
 * holds (`sites.mjs`) — so entering it is the separate, explicit arrow on the row.
 */
import { useEffect, useState } from 'react'
import { ArrowUpRight, Folder } from 'lucide-react'
import { cn } from '@tracy/ui'
import { siteNameFor, type NamedSiteRow } from '@tracy/core/site-key'
import { currentSiteKey, otherSites, SITES_CHANGED, sharedSites, siteWorkspacePath } from './sites.mjs'

/** Heard by `tracy-add-site` (`index.tsx`): show this site in the side card. */
export const SHOW_SITE = 'tracy:show-site'

/** The pathname of the page's `<base href>`, where tracy-web anchors the creation workspace. */
export function basePathname(): string {
  try {
    return new URL(document.baseURI).pathname
  } catch {
    return '/'
  }
}

/** Ask the side card to show a site; no key means the page's own. */
export function showSite(siteKey?: string): void {
  window.dispatchEvent(new CustomEvent(SHOW_SITE, { detail: siteKey ? { siteKey } : undefined }))
}

export function OtherSites({ className, openLabel }: { className?: string; openLabel: string }) {
  const [sites, setSites] = useState<string[]>([])
  // The rows behind the keys: a row is shown by the site's current name, not its key.
  const [rows, setRows] = useState<readonly NamedSiteRow[]>([])
  // The row whose site the side card was last asked to show.
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const current = currentSiteKey({
      pathname: location.pathname,
      basePathname: basePathname(),
      cookie: document.cookie
    })
    const load = (refresh: boolean) =>
      void sharedSites({ refresh }).then((body) => {
        if (cancelled) return
        setSites(otherSites(body, current))
        const listed = (body as { sites?: unknown } | null)?.sites
        setRows(Array.isArray(listed) ? listed : [])
      })
    load(false)
    // Add site announces every site it starts: a new site is a new workspace, listed at once.
    const changed = () => load(true)
    window.addEventListener(SITES_CHANGED, changed)
    // Any other ask (the open workspace's own rows, a site that just came up) moves the mark.
    const asked = (event: Event) => {
      setShown((event as CustomEvent<{ siteKey?: string } | undefined>).detail?.siteKey ?? null)
    }
    window.addEventListener(SHOW_SITE, asked)
    return () => {
      cancelled = true
      window.removeEventListener(SITES_CHANGED, changed)
      window.removeEventListener(SHOW_SITE, asked)
    }
  }, [])
  if (sites.length === 0) return null
  return (
    <div className={cn('flex flex-col', className)} role="list">
      {sites.map((siteKey) => (
        <div
          key={siteKey}
          role="listitem"
          className={cn(
            'group flex h-[34px] w-full shrink-0 items-center rounded-md transition-colors hover:bg-accent',
            shown === siteKey && 'bg-accent'
          )}
        >
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left font-medium text-foreground text-sm"
            title={siteNameFor(rows, siteKey)}
            aria-pressed={shown === siteKey}
            onClick={() => showSite(siteKey)}
          >
            <Folder className="size-4 shrink-0 text-primary" />
            <span className="truncate">{siteNameFor(rows, siteKey)}</span>
          </button>
          <button
            type="button"
            className="me-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            title={openLabel}
            aria-label={`${openLabel}: ${siteNameFor(rows, siteKey)}`}
            onClick={() => window.location.assign(siteWorkspacePath(siteNameFor(rows, siteKey)))}
          >
            <ArrowUpRight className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
