/**
 * The preview's body for a quickstart — a finished site, framed live.
 *
 * A design system is previewed as a fixture wearing the customer's words: the look is the product,
 * and the words are borrowed. A quickstart is the opposite: the site IS the product, words and all,
 * so the preview shows the site itself — the live demo in a frame, pinned to the same version the
 * customer installs — and the customer clicks, scrolls, switches language on the thing they get.
 * The header (name, dark, device, arrows, Create with) is the dialog's; this is what sits under it.
 *
 * Three things the framed site must do, and a gate holds every template to them:
 *   allow Tracy to frame it (`Content-Security-Policy: frame-ancestors …`, set by the demo only),
 *   apply `?theme=dark|light` for that load without saving it (the preview cannot reach the site's
 *   own localStorage across origins), and post `tracy:frame-height` so the frame can be as tall as
 *   the page — capped at the room the dialog has, or a long home page would be a 6000 px frame.
 */
import { cn, TracyMark } from '@tracy/ui'
import { CirclePlay, ExternalLink, Image } from 'lucide-react'
import { type JSX, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { pictureUrl, type TemplateCard } from './api'
import type { Theme } from './fixture'
import { previewSrc } from './templates.mjs'

export type TemplateDevice = 'desktop' | 'mobile'

/** The phone's layout viewport: the width the framed page is laid out at, whatever the room. */
export const PHONE_WIDTH = 390
/** The bezel, drawn OUTSIDE the viewport so it never eats the page's own width. */
export const PHONE_BEZEL = 4
/** The whole phone, bezel included, before it is scaled to the room. */
export const PHONE_OUTER = PHONE_WIDTH + 2 * PHONE_BEZEL

/**
 * How much the whole phone shrinks to fit a room `roomWidth` px wide: never grown past 1, and
 * `null` for a room that has no width to fit (hidden, or not yet laid out) — the caller keeps the
 * scale it last had rather than drawing a zero-width or NaN-scaled phone.
 */
export function phoneScale(roomWidth: number): number | null {
  if (!Number.isFinite(roomWidth) || roomWidth <= 0) return null
  return Math.min(1, roomWidth / PHONE_OUTER)
}

/** A `tracy:frame-height` value worth using: a finite, positive number of CSS pixels. */
export function frameHeight(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function TemplateBody({
  template,
  name,
  device,
  theme,
  controls = null,
  t
}: {
  template: TemplateCard
  name: string
  device: TemplateDevice
  theme: Theme
  /** The dialog's light/dark and device switches, drawn at the head of this row's right end. */
  controls?: ReactNode
  t: (key: string, params?: Record<string, string | number>) => string
}): JSX.Element {
  const [key, setKey] = useState(template.layouts[0]?.key ?? '')
  const layout = template.layouts.find((l) => l.key === key) ?? template.layouts[0]
  const [framed, setFramed] = useState(true)
  const [pageHeight, setPageHeight] = useState<number | null>(null)
  // Which frame document has fired `load`, by the frame's key: a new key (layout, theme, device) is
  // a new document, so it is loading again until its own `load`.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  // Which frame's loader has finished fading out: it stays mounted through the fade, so the demo
  // cross-fades in under it instead of the loader vanishing a beat before the demo shows.
  const [loaderGoneKey, setLoaderGoneKey] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const origin = (() => {
    try {
      return new URL(template.demo.url).origin
    } catch {
      return null
    }
  })()

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // The origin AND the window: a template card in the grid frames the same demo, scaled, and
      // posts the same message from the same origin — its height is not this frame's.
      if (origin === null || e.origin !== origin) return
      if (frame.current === null || e.source !== frame.current.contentWindow) return
      const d = e.data as { type?: string; height?: unknown }
      const height = d?.type === 'tracy:frame-height' ? frameHeight(d.height) : null
      if (height !== null) setPageHeight(height)
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [origin])

  if (!layout) return <div className="p-5 text-muted-foreground text-sm">{t('template.noLayouts')}</div>
  // THE ADDRESS, NOT THE PATH, AND JOINED RATHER THAN GLUED. `path` names the page; `address` is
  // where it answers, and on every Joomla demo Tracy provisions (SEF on, rewriting off) they are
  // different strings — only one of which is served. Both halves were wrong here, and fixing one
  // only changed which "not found" a customer saw; `previewSrc` carries the reasoning and the test.
  const src = previewSrc(template.demo.url, layout, theme)
  const shotFile =
    device === 'mobile' ? (layout.shots?.mobile ?? layout.shots?.desktop) : layout.shots?.desktop
  const shot = pictureUrl(shotFile)
  // A card with no live demo on this server (`demo.url` is '') has nothing to frame: it opens on
  // its pictures instead of an empty white frame, and offers no switch it could not honour.
  // The pictures were taken on the side the demo opens on, so they can only stand for that side: on the
  // other one the Screenshot side is off and the live demo (which does switch) is shown.
  const shotMatches = theme === template.defaultTheme
  const live = (framed || !shotMatches) && src !== ''
  const frameKey = `${src}-${device}`
  // 🔒 WHILE THE DEMO LOADS, SAY SO — AND SHOW NOTHING OF IT (measured 30/09 on cowork.tracy.site).
  // Tracy mounts the frame at once and waits on nothing, but the demo itself takes 1.2-4.7 s on a
  // cold browser cache (a no-store PHP page, 0.5-1.9 s to first byte, then 2.5-14 MB of pictures)
  // and 0.4-1.3 s on every Light/Dark switch (a new `?theme=` is a new, never-cached page). That
  // time is the demo's own; what Tracy owns is what the frame shows meanwhile.
  // The first answer (PR #645) put the layout's card-sized picture under a TRANSPARENT frame and let
  // the demo paint over it. A CDP screencast showed three pictures in ~2 s — a blurry upscaled
  // poster, then the half-painted demo (flat background, no text or images), then the real page —
  // and that flicker was worse than the wait. Akemi chose option B (30/09): the frame keeps the
  // dialog's own ground with the Tracy mark turning in its centre, exactly the app's boot cover
  // (56 px, one turn per 9 s, still under prefers-reduced-motion), and "Loading the live demo…"
  // under it; the frame stays invisible and untouchable until its `load`, then fades in over
  // 150 ms while the loader fades out over it. One change of picture: loader, then the whole demo.
  // No poster, no skeleton.
  const loading = live && loadedKey !== frameKey
  const loaderShown = live && loaderGoneKey !== frameKey

  const body = live ? (
    <>
      <iframe
        ref={frame}
        key={frameKey}
        src={src}
        referrerPolicy="no-referrer"
        title={`${name} — ${layout.label}`}
        aria-hidden={loading || undefined}
        tabIndex={loading ? -1 : undefined}
        className={cn(
          'relative block min-h-0 border-0 bg-background transition-opacity duration-150 ease-out',
          loading ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
        style={
          device === 'mobile'
            ? { width: PHONE_WIDTH, height: pageHeight ?? 760, maxHeight: '100%' }
            : { width: '100%', height: '100%' }
        }
        onLoad={() => setLoadedKey(frameKey)}
        onError={() => setFramed(false)}
      />
      {loaderShown ? (
        <div
          role={loading ? 'status' : undefined}
          aria-hidden={loading ? undefined : true}
          data-frame-loading=""
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background transition-opacity duration-150 ease-out',
            loading ? 'opacity-100' : 'opacity-0'
          )}
          onTransitionEnd={(e) => {
            if (!loading && e.target === e.currentTarget) setLoaderGoneKey(frameKey)
          }}
        >
          {/* The boot cover's spin (packages/brand/tracy-brand/src/client/boot-cover.tsx), in this
              plugin's utilities: the same mark, size, centre and pace. */}
          <TracyMark
            size={56}
            className="origin-center animate-[spin_9s_linear_infinite] motion-reduce:animate-none"
          />
          <span className="text-[12px] text-muted-foreground">{t('template.loading')}</span>
        </div>
      ) : null}
    </>
  ) : shot ? (
    <img src={shot} alt={`${name} — ${layout.label}`} className="block w-full" />
  ) : (
    <div className="grid h-96 place-items-center text-muted-foreground text-sm">{t('template.demoDown')}</div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ACROSS: the template's layouts, where a design system shows its six artifact kinds. */}
      <div className="flex flex-wrap items-center gap-1.5 border-border border-b px-5 py-2 font-mono text-[11px]">
        {template.layouts.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={l.key === layout.key}
            data-chip={l.key}
            title={l.count ? t('template.oneOf', { count: l.count }) : undefined}
            onClick={() => setKey(l.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
              l.key === layout.key
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="font-sans">{l.label}</span>
            {l.count ? <span className="opacity-70">×{l.count}</span> : null}
          </button>
        ))}
        <span className="ms-auto flex items-center gap-3 font-sans text-muted-foreground">
          {controls}
          {template.languages.map((l) => (
            <span key={l} className="rounded-full border border-border px-2 py-0.5 font-mono uppercase">
              {l}
            </span>
          ))}
          {/* The switch between the two modes sits with the other page controls, not under the
              frame: in live mode the frame now takes the whole room, and a control below it would
              be the first thing a short window hides. */}
          {/* A two-way switch drawn as one (Akemi, 29/09, option A of three on the bench): the old
              underlined text named the action, not the state, so nobody could tell which view was
              on. The chosen side is filled, like the page chip in view (Akemi, 29/09 — no
              terracotta line on this screen). */}
          {shot && src !== '' ? (
            <span
              role="group"
              aria-label={t('template.view')}
              className="flex items-center gap-0.5 rounded-full border border-input p-0.5"
            >
              {(
                [
                  [true, CirclePlay, t('template.viewLive')],
                  [false, Image, t('template.viewShot')]
                ] as const
              ).map(([isLive, Icon, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={live === isLive}
                  disabled={!isLive && !shotMatches}
                  onClick={() => setFramed(isLive)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-0.5 disabled:pointer-events-none disabled:opacity-40',
                    live === isLive
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-transparent hover:bg-foreground/10 hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </span>
          ) : null}
          {/* The demo's own tab: shaped like the chips beside it, not dsh's purple link, and the
              arrow says it leaves the dialog. */}
          {src !== '' ? (
            <a
              href={template.demo.url}
              className="flex items-center gap-1 rounded-full border border-input px-2.5 py-1 text-foreground no-underline hover:bg-foreground/10"
              target="_blank"
              rel="noreferrer"
            >
              {t('template.openDemo')}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </span>
      </div>

      {/* 🔒 TWO MODES, TWO LAYOUTS (review, 21/09). LIVE: the demo alone, as large as the dialog —
          the site carries its own main menu, so a customer walks its pages there, and a rail of
          thumbnails beside it only took width from the one thing being judged (and could not show
          a whole page anyway). SCREENSHOT: the rail comes back, because pictures are all there is
          to step through. */}
      <div className={cn('flex min-h-0 flex-1 bg-muted/40', live ? 'p-2' : 'gap-4 px-4 py-3')}>
        {live ? null : (
          <div
            className="flex min-h-0 w-40 shrink-0 flex-col gap-2 overflow-y-auto pr-1"
            data-strip={layout.key}
          >
            {template.layouts.map((l) => {
              const thumbFile = device === 'mobile' ? (l.shots?.mobile ?? l.shots?.desktop) : l.shots?.desktop
              const thumb = pictureUrl(thumbFile)
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setKey(l.key)}
                  className={cn(
                    'shrink-0 overflow-hidden rounded-lg border bg-background text-left',
                    l.key === layout.key ? 'border-foreground' : 'border-border'
                  )}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className={cn(
                        'block w-full object-cover object-top',
                        device === 'mobile' ? 'h-56' : 'h-24'
                      )}
                    />
                  ) : (
                    <div className={cn('w-full bg-muted', device === 'mobile' ? 'h-56' : 'h-24')} />
                  )}
                  <span className="block px-2 py-1 text-[11px]">
                    {l.label}
                    {l.count ? <span className="text-muted-foreground"> · {l.count}</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* THE FRAME. Desktop fills the room and the site scrolls inside itself; mobile is a 390-px
            viewport in a bezel, as tall as the page says, never taller than the room, and shrunk
            whole when the room is narrower than the phone (`PhoneFrame`). */}
        {device === 'mobile' ? (
          <PhoneFrame scrolls={!live}>{body}</PhoneFrame>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className={cn(
                'relative mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm',
                !live && 'overflow-y-auto'
              )}
            >
              {body}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The phone around a mobile preview. 🔒 The bezel sits OUTSIDE the 390-px viewport (#630): the
 * frame used to be 390 px border-box with a 4-px bezel, so its content was 382 px while the page
 * inside was laid out at 390 — the page's right 8 px were cut off, and a page with 16-px side gaps
 * showed 16 on the left and 8 on the right.
 *
 * A room narrower than the phone shrinks the WHOLE phone with `transform: scale` (the page keeps its
 * 390-px layout viewport, the way `PreviewDialog`'s device frames fit theirs) instead of clipping
 * it. The transform does not change layout size, so the phone sits in a box already sized to its
 * scaled width, and its unscaled height is capped at the room's height divided by the scale, so the
 * scaled phone is exactly as tall as the room allows. The room is measured by a ResizeObserver; a
 * room with no width (hidden) keeps the last scale, and the observer goes with the element.
 */
export function PhoneFrame({ scrolls, children }: { scrolls: boolean; children: ReactNode }): JSX.Element {
  const roomRef = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ scale: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const el = roomRef.current
    if (!el) return
    const measure = (width: number, height: number): void => {
      const scale = phoneScale(width)
      if (scale === null) return
      setRoom((prev) => (prev && prev.scale === scale && prev.height === height ? prev : { scale, height }))
    }
    measure(el.clientWidth, el.clientHeight)
    // contentRect, not clientWidth: fractional, so a room of 389.5 px does not get a 390-px phone.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = room?.scale ?? 1
  const maxHeight = room && room.height > 0 ? room.height / scale : '100%'
  return (
    <div ref={roomRef} className="flex min-h-0 min-w-0 flex-1 flex-col" data-phone-room="">
      <div className="mx-auto min-h-0 flex-1" style={{ width: PHONE_OUTER * scale }} data-phone-scale={scale}>
        <div
          className={cn(
            'relative box-border flex origin-top-left flex-col overflow-hidden rounded-[28px] border-4 border-border bg-background shadow-sm',
            scrolls && 'overflow-y-auto'
          )}
          style={{
            width: PHONE_OUTER,
            maxHeight,
            transform: scale === 1 ? undefined : `scale(${scale})`
          }}
          data-phone-frame=""
        >
          {children}
        </div>
      </div>
    </div>
  )
}
