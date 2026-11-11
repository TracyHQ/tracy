/**
 * The Your site card of a built demo (#537, option A chosen by the owner, mock your-site-options.html): a 160 by 100
 * picture of the home page on the left; on the right the address as a link with the QA pill beside it, the failing
 * checks under it when QA asks for a look, what the build took, when it expires, then Open site, Copy link, Send to the
 * business and the menu (Rebuild). With no picture the box shows the site's name on its brand colour, never an empty
 * box. Its look is `workspace-css.ts` (`tracy-wo-site-card*`).
 */
import { Copy, Ellipsis, ExternalLink, Send } from 'lucide-react'
import { type CSSProperties, type JSX, useEffect, useState } from 'react'
import { Button } from '@tracy/ui'
import { Popover, PopoverItem } from '@tracy/core/site-tabs/popover'

import type { SiteCardView } from './demo-block-model.ts'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * The fallback box's colours from the brand colour the brief found (data, never a typed literal): the colour itself as
 * the ground and the words a deep or a pale shade of it, whichever reads; the theme's primary when there is none.
 */
export function fallbackStyle(brand: string | null | undefined): CSSProperties | undefined {
  if (!brand || !HEX.test(brand)) return undefined
  const h = brand.length === 4 ? brand.replace(/[0-9a-f]/gi, (c) => c + c) : brand
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return {
    background: brand,
    color: `color-mix(in oklab, ${brand} 18%, ${luminance > 0.4 ? 'black' : 'white'})`
  }
}

export function SiteCard({
  t,
  view,
  siteName,
  brand,
  busy,
  limitReached = false,
  onOpen,
  onSend,
  onRebuild
}: {
  t: Translate
  view: SiteCardView
  /** The site's name for the fallback box and the picture's description. */
  siteName: string
  /** The first brand colour of the saved profile, or null. */
  brand?: string | null
  busy: boolean
  limitReached?: boolean
  onOpen: () => void
  onSend: () => void
  onRebuild: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [view.preview])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = async (): Promise<void> => {
    if (!view.href) return
    try {
      await navigator.clipboard.writeText(new URL(view.href, window.location.href).href)
      setCopied(true)
    } catch {
      // Clipboard refused: the address stays on screen to copy by hand.
    }
  }
  const picture = view.preview !== null && !broken
  return (
    <div className="tracy-wo-site-card">
      <div
        className="tracy-wo-site-thumb"
        data-fallback={picture ? undefined : ''}
        style={picture ? undefined : fallbackStyle(brand)}
      >
        {picture ? (
          <img
            src={view.preview ?? undefined}
            alt={t('siteCard.preview', { site: siteName })}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="tracy-wo-site-thumb-name">{siteName}</span>
        )}
      </div>
      <div className="tracy-wo-site-info">
        <div className="tracy-wo-site-l1">
          {view.host && view.href ? (
            <a className="tracy-wo-site-addr" href={view.href} target="_blank" rel="noopener noreferrer">
              <span>{view.host}</span>
              <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {view.qa === 'passed' ? (
            <StatusPill state="done" label={t('siteCard.qaPassed')} />
          ) : view.qa === 'review' ? (
            <StatusPill state="attention" label={t('siteCard.qaReview')} />
          ) : (
            <StatusPill state="done" label={t('siteCard.ready')} />
          )}
        </div>
        {/* QA needs review keeps the build facts and the expiry on one line, with the findings below (mock A). */}
        {view.qa === 'review' ? (
          [view.builtLine, view.expiryLine].some(Boolean) ? (
            <p className="tracy-wo-site-meta">
              {[view.builtLine, view.expiryLine].filter(Boolean).join(' · ')}
            </p>
          ) : null
        ) : (
          <>
            {view.builtLine ? <p className="tracy-wo-site-meta">{view.builtLine}</p> : null}
            {view.expiryLine ? <p className="tracy-wo-site-meta">{view.expiryLine}</p> : null}
          </>
        )}
        {view.findings.length > 0 ? (
          <div className="tracy-wo-site-finds">
            <b>
              {t(view.findings.length === 1 ? 'siteCard.findings.one' : 'siteCard.findings.other', {
                count: view.findings.length
              })}
            </b>
            <ul>
              {view.findings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="tracy-wo-site-acts">
          <Button type="button" size="sm" disabled={busy || !view.href} onClick={onOpen}>
            {t('siteCard.open')}
            <ExternalLink aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!view.href} onClick={() => void copy()}>
            {copied ? t('siteCard.copied') : t('siteCard.copy')}
            <Copy aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSend}>
            {t('siteCard.send')}
            <Send aria-hidden="true" />
          </Button>
          <Popover
            align="end"
            // Portalled out of the plugin root, so it carries the root class to keep the scoped reset.
            scopeClass="tracy-wo"
            trigger={(props) => (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={busy}
                aria-label={t('demoBlock.more')}
                {...props}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            )}
          >
            <PopoverItem itemId="rebuild" disabled={limitReached} onClick={onRebuild}>
              {t('demo.menu.rebuild')}
            </PopoverItem>
          </Popover>
        </div>
      </div>
    </div>
  )
}
