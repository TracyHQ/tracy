/**
 * The body of the Design system tab's preview popup, drawn the way the Design templates gallery's popup draws a live
 * demo (`PreviewDialog.tsx` + `TemplateBody.tsx`, Akemi 12/10/2026): a second row whose right end holds the Desktop |
 * Mobile switch, then the frame on the dialog's muted ground. Desktop: the page fills the room in a rounded frame and
 * scrolls inside itself. Mobile: a 390 px viewport in the gallery's phone bezel (`PhoneFrame`, shrunk whole when the
 * room is narrower). While the page loads, the frame holds the app's boot cover (the Tracy mark turning, the line under
 * it) and the page fades in over 150 ms on its `load`, as the gallery's demo does. Not available and failed are said
 * inside the same frame.
 *
 * The page is a `srcDoc` in a sandboxed iframe with no script and no form: nothing in it can run or reach the host. Its
 * same-site links point back at the preview door (tracy-web `design-system-preview-links.js`), so a click browses the
 * site inside the frame, every page wearing the system; `allow-same-origin` lets that click carry the seat cookie (an
 * opaque frame's click went out without it, 401, measured 12/10/2026), the popup tokens let a link to another host
 * open a new tab. The door's answers carry the same tokens in their own CSP.
 *
 * LIGHT | DARK (14/10/2026). A template whose contract wears both sides of its light/dark switch (`modes: true`) shows
 * the switch beside Desktop | Mobile: the page runs no script, so the site's own toggle cannot be pressed. The stage
 * sets `data-theme` on the framed page's root element (the hook every two-mode Tracy theme and the slot's sides use,
 * `tracy-ds-slot/src/sides.mjs`) through `contentDocument` (same origin, the sandbox allows it), again after every load
 * — a link followed, a device switch — so the side chosen stays. Preview only: nothing reaches the site.
 *
 * LIVE (17/10/2026, `src`): the running site's popup frames the site itself at its own address (tracy-web's
 * ticketed `?tracy_ds_preview=`, `sites/design-system-live-page.js`), with the page's scripts running, so a
 * carousel, a sticky header or a lazy picture comes out as it does after Try on. That page is another origin,
 * so it is reached by messages only: Tracy's small script in it says which page it is on (`tracy-ds-at`, kept
 * so a device switch reloads that page) and takes a Light | Dark press (`tracy-ds-theme`); the page's own
 * script opens the system's side, so a side is sent only once the visitor pressed one (`pushTheme`). Its
 * sandbox allows scripts, but no form and no top navigation.
 */
import { cn, TracyMark } from '@tracy/ui'
import { Info, Monitor, Moon, Smartphone, Sun } from 'lucide-react'
import { type JSX, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { PHONE_WIDTH, PhoneFrame } from './TemplateBody'
import { SWITCH_GROUP, SwitchSide } from './view-switch'

/** The preview frame's sandbox: no script, no form; see the file comment. */
const PREVIEW_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'
/** The live frame's sandbox: the site's own scripts run on its own origin; no form, no top navigation. */
const LIVE_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

/** Send side `theme` to a live frame (its Tracy script sets it on the page's root). */
function postTheme(
  frame: HTMLIFrameElement | null,
  src: string | null,
  theme: StageTheme | null | undefined
): void {
  if (!frame || !src || !theme) return
  try {
    frame.contentWindow?.postMessage({ type: 'tracy-ds-theme', theme }, new URL(src).origin)
  } catch {
    /* a frame gone or an address that is no URL: nothing to tell */
  }
}

export type StageDevice = 'desktop' | 'mobile'
export type StageTheme = 'light' | 'dark'

/** Put side `theme` on the framed page (its root element's `data-theme`); a frame not readable is left as it is. */
function paintTheme(frame: HTMLIFrameElement | null, theme: StageTheme | null | undefined): void {
  if (!frame || !theme) return
  try {
    frame.contentDocument?.documentElement?.setAttribute('data-theme', theme)
  } catch {
    /* a page of another origin: its own look stays */
  }
}

/** The page height a phone shows before the room caps it: the gallery's default when a demo posts no height. */
const PHONE_PAGE_HEIGHT = 760

/**
 * The second row of the popup: the gallery's page-controls row (`TemplateBody`), holding the Light | Dark switch (only
 * for a two-mode template, `theme`) and the device switch, drawn with the gallery dialog's own switch
 * (`view-switch.tsx`, the Design templates popup's Light | Dark and Desktop | Mobile): the chosen side filled.
 */
export function DeviceRow({
  device,
  onDevice,
  labels,
  theme = null
}: {
  device: StageDevice
  onDevice: (next: StageDevice) => void
  labels: { group: string; desktop: string; mobile: string }
  /** The Light | Dark switch, for a template with two modes; null: none. */
  theme?: {
    value: StageTheme
    onTheme: (next: StageTheme) => void
    labels: { group: string; light: string; dark: string }
  } | null
}): JSX.Element {
  const choices: [StageDevice, typeof Monitor, string][] = [
    ['desktop', Monitor, labels.desktop],
    ['mobile', Smartphone, labels.mobile]
  ]
  const sides: [StageTheme, typeof Monitor][] = [
    ['light', Sun],
    ['dark', Moon]
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-border border-b px-5 py-2 font-mono text-[11px]">
      <span className="ms-auto flex items-center gap-3 font-sans text-muted-foreground">
        {theme ? (
          <span role="group" aria-label={theme.labels.group} className={SWITCH_GROUP} data-theme-switch="">
            {sides.map(([side, Icon]) => (
              <SwitchSide
                key={side}
                on={theme.value === side}
                Icon={Icon}
                label={theme.labels[side]}
                props={{ 'data-preview-theme': side, onClick: () => theme.onTheme(side) }}
              />
            ))}
          </span>
        ) : null}
        <span role="group" aria-label={labels.group} className={SWITCH_GROUP}>
          {choices.map(([d, Icon, label]) => (
            <SwitchSide
              key={d}
              on={device === d}
              Icon={Icon}
              label={label}
              props={{ 'data-device': d, onClick: () => onDevice(d) }}
            />
          ))}
        </span>
      </span>
    </div>
  )
}

export function PreviewStage({
  device,
  doc,
  src = null,
  pushTheme = false,
  title,
  loadingLabel,
  message,
  notice,
  frameAttrs,
  theme = null,
  onShown
}: {
  device: StageDevice
  /** The page, once it is here; null while it is asked for, or when `message` says why there is none. */
  doc: string | null
  /** The live frame's address (the site itself, see the file comment); when set, `doc` is not used. */
  src?: string | null
  /** Live frame: send the side to the page (the visitor pressed Light | Dark); else the page opens on its own. */
  pushTheme?: boolean
  title: string
  /** The line under the turning mark while the page is asked for and while it paints. */
  loadingLabel: string
  /** Said in the frame in place of the page (not available, failed with Try again); null when there is a page or it is coming. */
  message: ReactNode | null
  /**
   * One line said OVER the stage, centred, with an info icon on a muted panel (Akemi, 13/10/2026, D3): why Try on
   * is off (a viewer, a template that cannot wear a system). The page or the message stays under it. Null for none.
   */
  notice?: string | null
  /** Data attributes for the iframe (tests find the frame by them). */
  frameAttrs?: Record<string, string>
  /** The side the framed page is shown in (`data-theme` on its root), for a two-mode template; null: as it opens. */
  theme?: StageTheme | null
  /**
   * Live frame: the side the page really shows, as its script reports it on load and whenever it changes (its own
   * switch, a press), so the Light | Dark switch lights what is on screen, not what the system declares.
   */
  onShown?: (side: StageTheme) => void
}): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const shownRef = useRef(onShown)
  shownRef.current = onShown
  const live = typeof src === 'string' && src !== ''
  // A press on Light | Dark repaints the page in place; a new load (link, device) is painted in its onLoad.
  useEffect(() => {
    if (live) {
      if (pushTheme) postTheme(frameRef.current, src, theme)
    } else paintTheme(frameRef.current, theme)
  }, [theme, live, src, pushTheme])
  const frameKey = live
    ? `${device}-${src}`
    : doc === null
      ? null
      : `${device}-${doc.length}-${doc.slice(0, 64)}`
  /**
   * The page the frame is on when the visitor followed a link inside it (a same-origin preview door URL):
   * a device switch remounts the frame on that page, not on the home the popup opened with (13/10/2026:
   * "on About, pressing Mobile went back to Home"). Reset with the document.
   */
  const [at, setAt] = useState<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new document forgets where the last one was.
  useEffect(() => setAt(null), [doc, src])
  /**
   * Live frame: the page it is on now (reported by its script), kept in a ref so following a link does not
   * re-render the frame onto the address it already shows; read only when the frame is mounted again (a
   * device switch), so the new frame opens on that page. A new system (`src`) starts at its home again.
   */
  const here = useRef<{ src: string | null; href: string | null }>({ src: null, href: null })
  const liveStart = useMemo(
    () => (live && here.current.src === src && here.current.href ? here.current.href : src),
    [device, src, live]
  )
  // The live page says where it is (a link followed inside it) and when it is ready for a side.
  useEffect(() => {
    if (!live) return
    let origin: string
    try {
      origin = new URL(src as string).origin
    } catch {
      return
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frameRef.current?.contentWindow) return
      const data = e.data as { type?: unknown; href?: unknown; theme?: unknown } | null
      // The side the page shows: with where it is (`tracy-ds-at`), and again on every change (`tracy-ds-side`).
      const said = data?.type === 'tracy-ds-at' || data?.type === 'tracy-ds-side'
      if (said && (data.theme === 'light' || data.theme === 'dark')) shownRef.current?.(data.theme)
      if (data?.type !== 'tracy-ds-at' || typeof data.href !== 'string') return
      try {
        if (new URL(data.href).origin === origin) here.current = { src: src as string, href: data.href }
      } catch {
        return
      }
      if (pushTheme) postTheme(frameRef.current, src, theme)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [live, src, pushTheme, theme])
  // Which frame document has fired `load`, and whose loader has finished fading out (the gallery's `TemplateBody`).
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [loaderGoneKey, setLoaderGoneKey] = useState<string | null>(null)
  const loading = message === null && (frameKey === null || loadedKey !== frameKey)
  const loaderShown = message === null && (frameKey === null || loaderGoneKey !== frameKey)
  const size =
    device === 'mobile'
      ? { width: PHONE_WIDTH, height: PHONE_PAGE_HEIGHT, maxHeight: '100%' }
      : { width: '100%', height: '100%' }

  const body = (
    <>
      {message !== null ? (
        <div
          className="grid min-h-0 place-items-center p-6 text-center text-muted-foreground text-sm"
          style={size}
        >
          {message}
        </div>
      ) : live || doc !== null ? (
        <iframe
          key={frameKey}
          ref={frameRef}
          title={title}
          {...(live ? { src: liveStart as string } : at === null ? { srcDoc: doc as string } : { src: at })}
          sandbox={live ? LIVE_SANDBOX : PREVIEW_SANDBOX}
          aria-hidden={loading || undefined}
          tabIndex={loading ? -1 : undefined}
          className={cn(
            'relative block min-h-0 border-0 bg-background transition-opacity duration-150 ease-out',
            loading ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
          style={size}
          onLoad={(e) => {
            if (!live) paintTheme(e.currentTarget, theme)
            setLoadedKey(frameKey)
            // Same-origin (the sandbox allows it): where the frame is now; `about:srcdoc` for the first document.
            try {
              const href = e.currentTarget.contentWindow?.location.href ?? ''
              if (/^https?:/.test(href)) setAt(href)
            } catch {
              /* a cross-origin page: the home stays the place to come back to */
            }
          }}
          {...frameAttrs}
        />
      ) : (
        <div className="min-h-0" style={size} />
      )}
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
          <TracyMark
            size={56}
            className="origin-center animate-[spin_9s_linear_infinite] motion-reduce:animate-none"
          />
          <span className="text-[12px] text-muted-foreground">{loadingLabel}</span>
        </div>
      ) : null}
      {notice ? (
        // Over the frame and over the loader, in the frame's own stacking: a page under it still scrolls where the
        // panel is not (the layer takes no pointer events, the panel does).
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
          <p
            role="status"
            className="pointer-events-auto m-0 flex max-w-md items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-foreground text-sm shadow-md"
            data-stage-notice=""
          >
            <Info size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">{notice}</span>
          </p>
        </div>
      ) : null}
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 bg-muted/40 p-2" data-system-preview-body="">
      {device === 'mobile' ? (
        <PhoneFrame scrolls={false}>{body}</PhoneFrame>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            {body}
          </div>
        </div>
      )}
    </div>
  )
}
