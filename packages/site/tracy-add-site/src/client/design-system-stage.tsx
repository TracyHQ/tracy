/**
 * The body of the Design system sheet's preview popup (`design-system-preview.tsx`), drawn the way the Design templates
 * gallery's popup draws a live demo (Akemi, 12/10/2026). A faithful port of `tracy-design-inspiration`
 * `preview-stage.tsx` and of `TemplateBody.tsx`'s `PhoneFrame`, same structure and classes, not an import: a plugin
 * never imports another plugin's internals.
 *
 * - `DeviceRow`: the second row of the popup, holding the gallery dialog's Desktop | Mobile switch at its right end.
 * - `PreviewStage`: the frame on the dialog's muted ground. Desktop: the page fills the room in a rounded frame and
 *   scrolls inside itself. Mobile: a 390 px viewport in the gallery's phone bezel, shrunk whole when the room is
 *   narrower. While the page loads, the frame holds the app's boot cover (the Tracy mark turning, a line under it) and
 *   the page fades in over 150 ms on its `load`. Not available and failed are said inside the same frame.
 *
 * The page is a `srcDoc` in a sandboxed iframe with no script and no form: nothing in it can run or reach the host. Its
 * same-site links point back at the preview door (tracy-web `design-system-preview-links.js`), so a click browses the
 * site inside the frame, every page wearing the system; `allow-same-origin` lets that click carry the seat cookie (an
 * opaque frame's click went out without it, 401, measured 12/10/2026), the popup tokens let a link to another host
 * open a new tab. The door's answers carry the same tokens in their own CSP.
 *
 * LIGHT | DARK (14/10/2026, port of the gallery's): a template whose contract wears both sides of its light/dark switch
 * (the door's `modes`) shows the switch beside Desktop | Mobile, since the framed page runs no script and its own
 * toggle cannot be pressed. The stage sets `data-theme` on the framed page's root element through `contentDocument`
 * (same origin, the sandbox allows it), again after every load, so the side chosen stays. Preview only.
 *
 * LIVE (18/10/2026, `src`, port of the Design system tab's, 17/10/2026): the door now answers the template's demo itself
 * at its own address with a signed ticket (tracy-web `?tracy_ds_preview=`, `sites/design-system-live-page.js`), and the
 * frame loads it with the page's scripts running, so a carousel, a sticky header or a lazy picture comes out as it does
 * after Try on. That page is another origin, reached by messages only: Tracy's small script in it says which page it is
 * on (`tracy-ds-at`, kept so a device switch reloads that page) and takes a Light | Dark press (`tracy-ds-theme`); the
 * page's own script opens the system's side, so a side is sent only once the visitor pressed one (`pushTheme`). Its
 * sandbox allows scripts, but no form and no top navigation.
 */
import { cn, TracyMark } from '@tracy/ui'
import { Monitor, Moon, Smartphone, Sun } from 'lucide-react'
import { type JSX, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/** The preview frame's sandbox: no script, no form; see the file comment. */
export const PREVIEW_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'
/** The live frame's sandbox: the demo's own scripts run on its own origin; no form, no top navigation. */
export const LIVE_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

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

/** The rounded group around a switch's sides. */
const SWITCH_GROUP =
  'flex shrink-0 items-center gap-0.5 rounded-full border border-input p-0.5 font-sans text-xs'

/** One side of a switch: filled when chosen, the others muted. */
function SwitchSide({
  on,
  Icon,
  label,
  props
}: {
  on: boolean
  Icon: typeof Monitor
  label: string
  props: Record<string, unknown>
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'flex h-6 items-center gap-1 rounded-full border px-2.5',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-transparent text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
      )}
      {...props}
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  )
}

/** The phone's layout viewport: the width the framed page is laid out at, whatever the room. */
const PHONE_WIDTH = 390
/** The whole phone, its 4 px bezel drawn outside the viewport included, before it is scaled to the room. */
const PHONE_OUTER = PHONE_WIDTH + 2 * 4
/** The page height a phone shows before the room caps it: the gallery's default when a demo posts no height. */
const PHONE_PAGE_HEIGHT = 760

/** How much the whole phone shrinks to fit a room `roomWidth` px wide; null for a room with no width yet. */
function phoneScale(roomWidth: number): number | null {
  if (!Number.isFinite(roomWidth) || roomWidth <= 0) return null
  return Math.min(1, roomWidth / PHONE_OUTER)
}

/** The phone around a mobile preview: the bezel outside the 390 px viewport, the whole phone scaled into a narrow room. */
function PhoneFrame({ children }: { children: ReactNode }): JSX.Element {
  // A plain div holds the ref: the dsh page runs React 18, which drops `ref` on a @tracy/ui component.
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
          className="relative box-border flex origin-top-left flex-col overflow-hidden rounded-[28px] border-4 border-border bg-background shadow-sm"
          style={{ width: PHONE_OUTER, maxHeight, transform: scale === 1 ? undefined : `scale(${scale})` }}
          data-phone-frame=""
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The popup's second row: the Light | Dark switch (only for a two-mode template, `theme`) and the device switch, the
 * chosen side filled and the other muted.
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
  image = null,
  onFrameError,
  pushTheme = false,
  title,
  loadingLabel,
  message,
  frameAttrs,
  theme = null,
  onShown
}: {
  device: StageDevice
  /** The page, once it is here; null while it is asked for, or when `message` says why there is none. */
  doc: string | null
  /** The live frame's address (the demo itself, see the file comment); when set, `doc` is not used. */
  src?: string | null
  /** Full-page screenshot fallback, shown in a scrollable version of the same device frame. */
  image?: string | null
  onFrameError?: () => void
  /** Live frame: send the side to the page (the visitor pressed Light | Dark); else the page opens on its own. */
  pushTheme?: boolean
  title: string
  /** The line under the turning mark while the page is asked for and while it paints. */
  loadingLabel: string
  /** Said in the frame in place of the page (not available, failed with Try again); null when there is a page or it is coming. */
  message: ReactNode | null
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
  // A press on Light | Dark repaints the page in place; a new load (link, device) is painted in its onLoad.
  const live = typeof src === 'string' && src !== ''
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
  // Which frame document has fired `load`, and whose loader has finished fading out.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [loaderGoneKey, setLoaderGoneKey] = useState<string | null>(null)
  const loading = message === null && image === null && (frameKey === null || loadedKey !== frameKey)
  const loaderShown = message === null && image === null && (frameKey === null || loaderGoneKey !== frameKey)
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
      ) : image !== null ? (
        <div className="min-h-0 overflow-y-auto" style={size} data-preview-shot="1">
          <img src={image} alt={title} decoding="async" className="block h-auto w-full shrink-0" />
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
          onError={onFrameError}
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
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 bg-muted/40 p-2" data-design-system-preview-body="1">
      {device === 'mobile' ? (
        <PhoneFrame>{body}</PhoneFrame>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative mx-auto box-border flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            {body}
          </div>
        </div>
      )}
    </div>
  )
}
