import { useTranslation } from '@tracy/i18n'
import { ChevronLeft, ExternalLink, FileDiff, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { SiteDrawer } from './SiteDrawer'

/**
 * The cowork: the site's agent on the left, the live site on the right.
 *
 * Engine-agnostic ON PURPOSE. It embeds the agent through an iframe URL and does
 * not care where the agent runs — the web shell points `agentUrl` at the fleet
 * sidecar, the desktop shell points it at a local dsh on 127.0.0.1. Same UI, same
 * behaviour; only the URL differs. That is what keeps web and desktop from drifting.
 */

export interface CoworkProps {
  /** Where the dsh agent is reachable. Web → fleet hostname; desktop → localhost. */
  agentUrl: string
  /** The live site to edit, in the right pane. */
  siteUrl: string
  /** Optional label shown in the bar (e.g. the siteKey). */
  siteLabel?: string
  /** When set, shows a back button leading out of the cowork (web shells only). */
  onHome?: () => void
  /** The Site this cowork is editing — enables the Changes/History drawer (cloud shells). */
  siteKey?: string
}

interface BridgePayload {
  kind: 'measure' | 'outline' | 'error'
  url?: string
  viewport?: { w: number; h: number }
  element?: Record<string, unknown>
  items?: Array<{ selector: string; overflowPx: number; w: number; parentW: number }>
  message?: string
}

/** The exact prose handed to the agent; numbers over adjectives. */
function renderPayload(p: BridgePayload, t: (key: string) => string): string {
  const lines: string[] = []
  if (p.url) lines.push(`Page: ${p.url}`)
  if (p.viewport) lines.push(`Viewport: ${p.viewport.w}x${p.viewport.h}`, '')
  if (p.kind === 'outline') {
    if (!p.items?.length) lines.push(t('site.context.nothingOverflows'))
    else {
      lines.push(t('site.context.overflowList'))
      p.items.forEach((it, i) =>
        lines.push(
          `  ${i + 1}. ${it.selector} — ${it.overflowPx}px out (${it.w}px in a ${it.parentW}px container)`
        )
      )
    }
  } else if (p.kind === 'measure' && p.element) {
    lines.push(t('site.context.pointedAt'))
    lines.push(JSON.stringify(p.element, null, 1))
  } else if (p.message) {
    lines.push(p.message)
  }
  return lines.join('\n')
}

export function Cowork({ agentUrl, siteUrl, siteLabel, onHome, siteKey }: CoworkProps) {
  const { t } = useTranslation()
  const [site, setSite] = useState(siteUrl)
  const [addr, setAddr] = useState(siteUrl)
  const [leftWidth, setLeftWidth] = useState(430)
  const [bridgeReady, setBridgeReady] = useState(false)
  const [ctx, setCtx] = useState<{ title: string; body: string } | null>(null)
  const [paneKey, setPaneKey] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const dragging = useRef(false)
  const dragRaf = useRef(0)
  const sitePane = useRef<HTMLIFrameElement>(null)

  const open = useCallback((raw: string) => {
    const u = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    setBridgeReady(false)
    setSite(u)
    setAddr(u)
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only the site pane's own window speaks for the bridge; `source` in the data is whatever the
      // sender chose to write, so any other frame or opener could otherwise post a fake context.
      if (!sitePane.current || e.source !== sitePane.current.contentWindow) return
      const m = e.data
      if (!m || m.source !== 'tracy-bridge') return
      if (m.id === 'ready') return setBridgeReady(true)
      const p = m.payload as BridgePayload
      setCtx({
        title: t(p.kind === 'outline' ? 'site.context.overflow' : 'site.context.picked'),
        body: renderPayload(p, t)
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [t])

  // Drag via pointer capture: mousemove on window is swallowed by an iframe when the pointer passes over
  // it (both panes are full-screen iframes) — capture keeps every pointer event on the divider, and
  // rAF batches one update per frame instead of re-rendering two iframes on every mouse event.
  const clampWidth = (clientX: number) => Math.min(Math.max(clientX, 320), window.innerWidth - 360)

  function onDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    document.body.style.userSelect = 'none'
  }

  function onDividerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const next = clampWidth(e.clientX)
    cancelAnimationFrame(dragRaf.current)
    dragRaf.current = requestAnimationFrame(() => setLeftWidth(next))
  }

  function onDividerPointerEnd() {
    if (!dragging.current) return
    dragging.current = false
    cancelAnimationFrame(dragRaf.current)
    document.body.style.userSelect = ''
  }

  const btn =
    'rounded-[7px] border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[13px] ' +
    'text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-40'

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--background)] font-sans text-[13px] text-[var(--foreground)]">
      <header className="flex h-11 flex-none items-center gap-2.5 border-[var(--border)] border-b bg-[var(--card)] px-3">
        {onHome ? (
          <button
            type="button"
            className={btn}
            title={t('site.back')}
            aria-label={t('site.back')}
            onClick={onHome}
          >
            <ChevronLeft size={13} />
          </button>
        ) : null}
        <div className="whitespace-nowrap font-semibold tracking-tight">
          Tracy
          {siteLabel ? (
            <span className="ml-1 font-normal text-[var(--muted-foreground)]">{siteLabel}</span>
          ) : null}
        </div>
        <span
          title={t(bridgeReady ? 'site.bridge.on' : 'site.bridge.off')}
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: bridgeReady ? 'var(--success)' : 'var(--border)' }}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--background)] px-2.5 py-1">
          <span className="text-[var(--muted-foreground)]">{t('site.editing')}</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-[var(--foreground)] outline-none"
            spellCheck={false}
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && open(addr)}
          />
          <a
            href={site}
            target="_blank"
            rel="noreferrer"
            title={t('site.openInNewTab')}
            aria-label={t('site.openInNewTab')}
          >
            <ExternalLink
              size={14}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            />
          </a>
        </div>
        <button type="button" className={btn} onClick={() => open(addr)}>
          {t('common.open')}
        </button>
        <button
          type="button"
          className={btn}
          title={t('site.reload')}
          aria-label={t('site.reload')}
          onClick={() => {
            setBridgeReady(false)
            setPaneKey((k) => k + 1)
          }}
        >
          <RotateCw size={13} />
        </button>
        {siteKey ? (
          <button
            type="button"
            className={`${btn} ${drawerOpen ? 'border-[var(--primary)] text-[var(--primary)]' : ''}`}
            title={t('site.changesAndHistory')}
            aria-label={t('site.changesAndHistory')}
            aria-pressed={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <FileDiff size={13} />
          </button>
        ) : null}
      </header>

      <main className="flex min-h-0 flex-1">
        <div
          className="relative flex min-w-0 flex-none flex-col bg-[var(--card)]"
          style={{ width: leftWidth }}
        >
          <span className="pointer-events-none absolute top-2 left-2.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white uppercase tracking-wider">
            {t('site.agentPane')}
          </span>
          <iframe title={t('site.agent')} src={agentUrl} className="min-h-0 w-full flex-1 border-0" />
          {ctx ? (
            <div className="flex max-h-[44%] flex-none flex-col border-[var(--border)] border-t bg-[var(--background)]">
              <div className="flex flex-none items-center gap-2 border-[var(--border)] border-b px-2.5 py-1.5">
                <b className="font-semibold text-[11px] text-[var(--muted-foreground)] uppercase tracking-wide">
                  {ctx.title}
                </b>
                <span className="flex-1" />
                <button type="button" className={btn} onClick={() => navigator.clipboard.writeText(ctx.body)}>
                  {t('site.context.copy')}
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => setCtx(null)}
                  title={t('site.context.dismiss')}
                  aria-label={t('site.context.dismiss')}
                >
                  <X size={13} />
                </button>
              </div>
              <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11.5px] leading-normal">
                {ctx.body}
              </pre>
            </div>
          ) : null}
        </div>

        <div
          className="w-[5px] flex-none cursor-col-resize touch-none bg-[var(--border)] hover:bg-[var(--primary)]"
          onPointerDown={onDividerPointerDown}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerEnd}
          onPointerCancel={onDividerPointerEnd}
        />

        <div className="relative min-w-0 flex-1 bg-white">
          <span className="pointer-events-none absolute top-2 left-2.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white uppercase tracking-wider">
            {t('site.sitePane')}
          </span>
          <iframe
            ref={sitePane}
            key={paneKey}
            title={t('site.sitePane')}
            src={site}
            className="h-full w-full border-0"
          />
        </div>
      </main>

      {siteKey && drawerOpen ? <SiteDrawer siteKey={siteKey} onClose={() => setDrawerOpen(false)} /> : null}
    </div>
  )
}
