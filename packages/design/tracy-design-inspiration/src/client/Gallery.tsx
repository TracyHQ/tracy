/**
 * The library: 152 cards, one picture each — the inspiration's own fixture page wearing the site's
 * words (spec §4f), or the fixture alone before the site is read. One picker above the grid
 * (`Filter.tsx`) finds a brand or a category; hover a card for "Open preview". No notice when the
 * site has not been read (Lee, 06/09 09:20: "drop that block of text") — the cards say it by
 * wearing the fixture's own words.
 *
 * 🔒 LIVE IFRAMES ARE CAPPED (Lee, 05/09: "won't 152 be heavy?"). A card only mounts its iframes
 * while it is within a screen of the viewport; scrolled away, it unmounts them and keeps a static
 * placeholder painted from the tokens' colours. Bytes are small (2.7 MB for the whole library, all
 * from the image); live documents are what cost memory, and this keeps them around a dozen.
 *
 * 🔒 AND THE CARDS THEMSELVES ARE REVEALED IN PAGES of thirty. The observer above caps live
 * documents but not DOM nodes: with the community shelf bolted on (`?source=community`, ADR 0013)
 * the grid is 152 plus a shelf that has no ceiling, and every card carries an observer of its own.
 * So the grid renders `count` of them and grows when the sentinel below the last one comes within
 * a screen. What is cut is the RENDERING only — the filter's count, the `#<id>` deep link and the
 * dialog's arrows all keep working on the whole filtered list.
 */
import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Card, cn } from '@tracy/ui'
import { Sparkles } from 'lucide-react'
import type { TemplateRanking } from '@tracy/core/template-picker'

import { type Inspiration, fetchTokens, type SitePreview } from './api'
import { Filter, NOTHING, type Selection, select } from './Filter'
import { CARD_GRID, OpenPreviewPill, PictureDim } from './card-chrome'
import { readyFirst } from './ready-first.mjs'
import { recommendedHeadingKey, tradeGroups } from './trade-groups.mjs'
import { templateShelf } from './template-shelf.mjs'
import { categoryLabel } from './groups.mjs'
import { FixtureThumb } from './FixtureThumb'
import { PlatformLogo } from './PlatformLogo'
import { PLATFORMS, platformsOf } from './platforms.mjs'
import { TemplateThumb } from './TemplateThumb'
import { PreviewDialog, type PublicMode } from './PreviewDialog'
import type { Key, Translate } from './strings'
import { swatchesOf } from './swatches'

/** True while `ref` is within a screen of the scrollport, in either direction. */
function useNear(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setNear(e.isIntersecting)
      },
      { rootMargin: '100% 0px 100% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return near
}

/** How long the pointer rests on a template card before its live demo is mounted. */
const HOVER_INTENT_MS = 200

/**
 * True once a mouse has rested on the card for `HOVER_INTENT_MS`, false the moment it leaves — the
 * switch for a template card's live demo (`DemoThumb` says why it is not "while on screen"). A
 * pointer sweeping across the grid mounts nothing; touch and pen never hover, so there the card
 * stays its poster and a tap opens the preview dialog, which frames the demo in full.
 */
function useHoverIntent(): {
  active: boolean
  onPointerEnter: (e: React.PointerEvent) => void
  onPointerLeave: () => void
} {
  const [active, setActive] = useState(false)
  const timer = useRef<number | null>(null)
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  return {
    active,
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse') return
      clear()
      timer.current = window.setTimeout(() => setActive(true), HOVER_INTENT_MS)
    },
    onPointerLeave: () => {
      clear()
      setActive(false)
    }
  }
}

/** Cards added per reveal — and the first screenful. */
const REVEAL_STEP = 30

/** Which group of the trade ranking a card is in (`trade-groups.mjs`); null when the grid is not grouped. */
type CardMark = 'recommended' | 'generic' | null

export function InspirationCard({
  d,
  site,
  onPreview,
  mark = null,
  t
}: {
  d: Inspiration
  site: SitePreview | null
  onPreview: () => void
  mark?: CardMark
  t: Translate
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const near = useNear(ref)
  const hover = useHoverIntent()
  const [tokens, setTokens] = useState<string | null>(null)
  useEffect(() => {
    // A finished site draws no swatches (Akemi, 29/09): its card already shows the site itself, and
    // only the two templates also carried into the design-system library had any, so the row was
    // dots on 2 cards of 28 and a request that came back empty for the other 26.
    if (!near || tokens !== null || d.template !== undefined) return
    let live = true
    fetchTokens(d.id)
      .then((css) => {
        if (live) setTokens(css)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [near, tokens, d.id, d.template])
  const swatches = useMemo(() => (tokens ? swatchesOf(tokens) : []), [tokens])
  /**
   * Whether a site can be made from this card today.
   *
   * The card's own answer, from the door: a row names the CMSes it has a build for, and an empty
   * list means none. Today that is every design system — a look is turned into a site by the
   * agent's dressing run, which is not a way in any more — while a quickstart names the CMSes its
   * release exists for (`host/gallery.mjs` says why, at length).
   *
   * `undefined` is NOT "none": a surface that sends no list at all is one that does not know, and
   * the card stays open rather than being marked shut on a missing field.
   */
  const comingSoon = Array.isArray(d.platforms) && d.platforms.length === 0
  // The CMSes this card runs on, in the filter's order, so a glance says what the chips above say.
  const onCms = platformsOf(d)

  return (
    <Card
      id={`inspiration-${d.id}`}
      data-inspiration={d.id}
      data-trade-mark={mark ?? undefined}
      className={cn(
        'group relative cursor-pointer gap-0 overflow-hidden p-0 transition hover:border-ring hover:shadow-md',
        // Made for the business's trade: a stronger border in the app's primary, the same in both themes.
        mark === 'recommended' && 'border-2 border-primary hover:border-primary'
      )}
      onClick={onPreview}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
    >
      {/* The observed element is a plain div, not `Card`: dsh's page runs React 18, where a `ref`
          handed to a function component without forwardRef is dropped silently. Measured 05/09 on
          lucaswp — `near` never became true, no fixture was ever fetched, every card stayed grey. */}
      <div ref={ref} className={cn('relative', comingSoon && 'opacity-45 saturate-50')}>
        {/* One picture: the inspiration's own layout wearing the site's words (spec §4f) — or, for a
            quickstart, the site itself, as released: a finished site is not redrawn in anyone's words. */}
        {d.template === undefined ? (
          <FixtureThumb id={d.id} title={d.name} site={site} near={near} />
        ) : (
          // A finished site: the home page's desktop shot as poster (#523), and the demo itself,
          // live and scaled, only while the pointer rests on the card — the poster alone when there
          // is no live demo, or the demo will not be framed, or there is no picture (then the block
          // stays the fixture's grey).
          <TemplateThumb template={d.template} title={d.name} active={near && hover.active} />
        )}
        {/* Hover: a dim of the picture (Akemi, 30/09, option B of the card hover bench). The dim is a
            scrim, not a theme colour: a translucent black darkens any picture in either theme, which
            no token does, so the literal `bg-black/45` is deliberate. It covers the picture only (the
            footer is outside this block) and takes no pointer events, so the live demo under it still
            starts on hover. Drawn BEFORE the Coming soon badge so it stays on top of it, undimmed. The Open preview pill is NOT here: it is centred on the whole card, below. Shared with the Design system tab (`card-chrome.tsx`). */}
        <PictureDim />
        {/* Coming soon: a look Tracy is preparing, shown rather than hidden (Akemi, 24/09/2026).
            Top right. Preview still opens — what cannot happen yet is making a site from it,
            and the dialog's Create with buttons are what say so there. */}
        {comingSoon ? (
          <span className="pointer-events-none absolute top-2 right-2 rounded-full border border-border bg-background/90 px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide shadow-sm backdrop-blur">
            {t('card.comingSoon')}
          </span>
        ) : null}
        {/* The trade ranking's mark, top left (`trade-groups.mjs`): Recommended in the primary for a card made for the
            business's trade, a quieter tag for a card that fits any business. Drawn after the dim so it stays clear. */}
        {mark === 'recommended' ? (
          <Badge className="pointer-events-none absolute top-2 left-2 shadow-sm">
            {t('card.recommended')}
          </Badge>
        ) : mark === 'generic' ? (
          <Badge
            variant="outline"
            className="pointer-events-none absolute top-2 left-2 bg-background/90 shadow-sm backdrop-blur"
          >
            {t('trade.generic')}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sm leading-none">{d.name}</div>
          {/* The category only: the publisher is not repeated under every name (Akemi, 29/09 — it
              read "JoomlArt" on Tracy's own templates, whose cards name no provider and fall back to
              it). It stays a filter, under Categories → Provider. */}
          <div className="mt-1 truncate text-muted-foreground text-xs">{categoryLabel(t, d.category)}</div>
        </div>
        {onCms.length > 0 ? (
          <div
            className="flex shrink-0 items-center gap-1"
            title={onCms.map((id) => PLATFORMS.find((p) => p.id === id)?.label ?? id).join(', ')}
          >
            {onCms.map((id) => (
              <PlatformLogo key={id} id={id} className="size-3.5" />
            ))}
          </div>
        ) : null}
        <div className="flex shrink-0 gap-1">
          {swatches.slice(0, 4).map((hex) => (
            <span
              key={hex}
              className="size-3 rounded-full border border-border"
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>
      {/* The Open preview pill, centred on the WHOLE card — picture and name row together (Akemi,
          30/09: the middle of the card, not of the picture). A layer over the card, fading with the
          dim, and taking no pointer events so the card's own click and the live demo's hover work. */}
      <OpenPreviewPill label={t('card.preview')} />
    </Card>
  )
}

/** The heading of one trade group (`trade-groups.mjs`). */
function groupHeadingKey(key: 'recommended' | 'generic' | 'rest', trade: string | undefined): Key {
  if (key === 'recommended') return recommendedHeadingKey(trade) as Key
  return key === 'generic' ? 'trade.generic' : 'trade.rest'
}

/** The id a `#<id>` deep link names, if it is one of ours — a catalog id, or `brand:<host>`. */
function hashId(): string | null {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''))
  return /^(?:brand:)?[a-z0-9][a-z0-9.-]*$/.test(h) ? h : null
}

export function Gallery({
  inspirations: incoming,
  site,
  openBuild = null,
  publicMode = null,
  community = null,
  selection: outerSelection = null,
  onSelection = null,
  openId = null,
  onOpenId = null,
  ranking = null,
  t
}: {
  inspirations: Inspiration[]
  site: SitePreview | null
  openBuild?: ((platform: string, inspiration: Inspiration, message: string) => void) | null
  /** The public page (ADR 0011): passed to the dialog, which hides its write buttons. */
  publicMode?: PublicMode | null
  /** The public page's "From Community" shortcut; see `Filter`. The tab in dsh passes none. */
  community?: { busy: boolean } | null
  /**
   * The chosen filter, when something outside owns it — the public page keeps it in the address so
   * a filtered view is a link. Left out (the tab in dsh), the grid keeps its own.
   */
  selection?: Selection | null
  onSelection?: ((next: Selection) => void) | null
  /**
   * The inspiration whose preview is open, again when something outside owns it. By ID, not by
   * position: the position moves whenever the filter does, and an address can only carry a name.
   */
  openId?: string | null
  onOpenId?: ((id: string | null) => void) | null
  /**
   * The server's ranking for the business a template is picked for (the template picker only): its trade's cards
   * first, then those for any business, then the rest, each group under its heading. Null: the grid as it is.
   */
  ranking?: TemplateRanking | null
  t: Translate
}): JSX.Element {
  // Only what a site can be made from reaches the grid; a measured brand never does (`template-shelf.mjs`).
  const inspirations = useMemo(() => templateShelf(incoming), [incoming])
  const [ownSelection, setOwnSelection] = useState<Selection>(NOTHING)
  const selection = outerSelection ?? ownSelection
  const setSelection = (next: Selection): void => {
    if (onSelection) onSelection(next)
    else setOwnSelection(next)
  }
  // The typed name lives here, not in the address: a half-typed word is not a view worth a link.
  const [query, setQuery] = useState('')
  const [ownOpenId, setOwnOpenId] = useState<string | null>(null)
  const openedId = onOpenId ? openId : ownOpenId
  const setOpenId = (id: string | null): void => {
    if (onOpenId) onOpenId(id)
    else setOwnOpenId(id)
  }
  // Once the customer's brand exists every row carries a fit score (§4f slice 3). The chip sorts by
  // it; OFF by default (Lee, 06/09 18:30) so the library opens in its own order and the customer sees
  // the range before narrowing to what resembles their brand.
  const hasFit = useMemo(() => inspirations.some((d) => typeof d.fit === 'number'), [inspirations])
  const [byFit, setByFit] = useState(false)

  const { visible, groups } = useMemo(() => {
    const list = select(inspirations, selection, query)
    // The fit sort runs first and `readyFirst` is stable, so a customer sorting by closeness still
    // sees the closest BUILDABLE design at the top rather than the closest one they cannot build.
    const sorted = hasFit && byFit ? [...list].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)) : list
    const ready = readyFirst(sorted)
    // Grouped by the trade ranking on what the filter let through, so each CMS chip and each search keeps its
    // groups; the dialog's arrows and the reveal then walk the cards in the grouped order.
    const grouped = tradeGroups(ready, ranking)
    return { visible: grouped ? grouped.flatMap((g) => g.rows) : ready, groups: grouped }
  }, [inspirations, selection, query, hasFit, byFit, ranking])
  /** Where the open inspiration sits in what is on screen, or -1 when it is not among it. */
  const open = openedId === null ? -1 : visible.findIndex((d) => d.id === openedId)

  const [count, setCount] = useState(REVEAL_STEP)
  const endRef = useRef<HTMLDivElement>(null)
  // The sentinel is observed AFRESH on every `count`: when thirty more cards still leave it within a
  // screen — a wide window, few rows — the new observer fires straight away and the grid keeps
  // growing until it is pushed out of view. Observe it once and the reveal stalls with the sentinel
  // sitting on screen and nothing left to trigger it.
  useEffect(() => {
    const el = endRef.current
    if (!el || count >= visible.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + REVEAL_STEP, visible.length))
      },
      { rootMargin: '100% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [count, visible.length])

  // Deep link: `#airbnb` opens that inspiration and scrolls its card into view — on mount, and again
  // whenever the hash changes while the tab is open. A `#brand:<host>` (the Brand tab's link) finds
  // no card, since brands are off the shelf, and opens nothing.
  useEffect(() => {
    const follow = (): void => {
      const id = hashId()
      if (id === null) return
      const i = inspirations.findIndex((d) => d.id === id)
      if (i < 0) return
      setSelection(NOTHING)
      setOpenId(id)
      // The card has to exist before anything can scroll to it. Resetting the reveal lives in the
      // two handlers below, NOT in an effect on `selection` — an effect would fire on this very
      // `setSelection(NOTHING)` and undo the line beneath it.
      setCount((c) => Math.max(c, i + REVEAL_STEP))
      window.setTimeout(
        () => document.getElementById(`inspiration-${id}`)?.scrollIntoView({ block: 'center' }),
        50
      )
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [inspirations])

  return (
    // The sidebar's pane clips (`overflow: hidden`, measured on lucaswp 06/09): this root is the
    // scrollport, or the library ends at the first screen of cards.
    <div className="tracy-design-inspiration flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 text-foreground text-sm">
      {/* The filter stays put while the cards scroll under it (Akemi, 30/09): this root's top padding
          scrolled away with the content, so a card ran flush into dsh's tab strip and read as the tab
          row being cut. The band covers that padding (negative margin, same padding back) and paints
          the pane's own ground: --tsb-surface is the column colour tracy-sidebar sets on the dockkit
          surface, while --background resolves at :root to a darker fallback here (measured 0.145 vs
          0.178 on cowork.tracy.site), which would show as a stripe. */}
      <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex flex-col gap-3 bg-[var(--tsb-surface,var(--background))] p-3">
        <Filter
          inspirations={inspirations}
          value={selection}
          onChange={(next) => {
            setSelection(next)
            // Eight cards should not carry the count from a scroll through all 152.
            setCount(REVEAL_STEP)
          }}
          query={query}
          onQuery={(next) => {
            setQuery(next)
            setCount(REVEAL_STEP)
          }}
          shown={visible.length}
          community={community}
          t={t}
          trailing={
            hasFit ? (
              <Badge
                variant={byFit ? 'default' : 'outline'}
                className="cursor-pointer select-none"
                role="button"
                aria-pressed={byFit}
                onClick={() => {
                  setByFit(!byFit)
                  setCount(REVEAL_STEP)
                }}
              >
                <Sparkles size={11} className="mr-1" />
                {t('sort.fit')}
              </Badge>
            ) : null
          }
        />
      </div>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-xs">{t('filter.empty')}</p>
      ) : groups ? (
        groups.map((group, i) => {
          // The reveal counts across the groups: a group shows the cards that fall within the first `count`.
          const before = groups.slice(0, i).reduce((n, g) => n + g.rows.length, 0)
          const shown = group.rows.slice(0, Math.max(0, count - before))
          if (shown.length === 0) return null
          const mark: CardMark = group.key === 'rest' ? null : group.key
          return (
            <section key={group.key} className="grid gap-2" data-trade-group={group.key}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="m-0 font-semibold text-sm">{t(groupHeadingKey(group.key, ranking?.trade))}</h3>
                {group.key === 'rest' ? null : (
                  <span className="text-muted-foreground text-xs">
                    {t(group.key === 'recommended' ? 'trade.recommendedHint' : 'trade.genericHint')}
                  </span>
                )}
              </div>
              <div className={CARD_GRID}>
                {shown.map((d) => (
                  <InspirationCard
                    key={d.id}
                    d={d}
                    site={site}
                    t={t}
                    mark={mark}
                    onPreview={() => setOpenId(d.id)}
                  />
                ))}
              </div>
            </section>
          )
        })
      ) : (
        <div className={CARD_GRID}>
          {visible.slice(0, count).map((d) => (
            <InspirationCard key={d.id} d={d} site={site} t={t} onPreview={() => setOpenId(d.id)} />
          ))}
        </div>
      )}
      {/* A hairline below the last card revealed, gone once every card is out. */}
      {count < visible.length ? <div ref={endRef} aria-hidden className="h-px shrink-0" /> : null}
      {open >= 0 && visible[open] ? (
        <PreviewDialog
          list={visible}
          index={open}
          site={site}
          openBuild={openBuild}
          publicMode={publicMode}
          t={t}
          onClose={() => setOpenId(null)}
          onStep={(dir) => setOpenId(visible[(open + dir + visible.length) % visible.length]?.id ?? null)}
        />
      ) : null}
    </div>
  )
}
