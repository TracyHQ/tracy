/**
 * The entrance in the conversation (spec §4): the agent has read the site and leads with THREE
 * inspirations, each a hero band on the customer's own content, each with its one-line reason.
 * "See all" opens the side card's tab. This row is the compensation for the side card's 35%
 * width — the customer meets three reasoned picks before they meet 152 cards.
 *
 * Rendered into `conversation.chat.turnTail` when `selectPicks` says the closing turn proposed
 * inspirations; the picks themselves come from the tool call, never from the prose.
 */
import { type JSX, useEffect, useState } from 'react'
import { Button, Card } from '@tracy/ui'
import { Eye, LayoutGrid } from 'lucide-react'

import { type Inspiration, fetchCatalog, fetchSite, type SitePreview } from './api'
import { FixtureThumb } from './FixtureThumb'
import type { Pick } from './picks'
import { PreviewDialog } from './PreviewDialog'
import type { Translate } from './strings'

let catalogOnce: Promise<Inspiration[]> | null = null
const catalog = (): Promise<Inspiration[]> => {
  catalogOnce ??= fetchCatalog().catch((error: unknown) => {
    catalogOnce = null
    throw error
  })
  return catalogOnce
}

function PickCard({
  d,
  why,
  site,
  onPreview,
  t
}: {
  d: Inspiration
  why: string
  site: SitePreview | null
  onPreview: () => void
  t: Translate
}): JSX.Element {
  return (
    <Card
      className="group relative cursor-pointer gap-0 overflow-hidden p-0 transition hover:border-ring hover:shadow-md"
      onClick={onPreview}
    >
      <div className="relative">
        <FixtureThumb id={d.id} title={d.name} site={site} height="h-44" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3.5 py-1.5 font-medium text-sm shadow-md backdrop-blur">
            <Eye size={15} className="text-primary" />
            {t('card.preview')}
          </span>
        </div>
      </div>
      <div className="p-2.5">
        <div className="font-semibold text-sm leading-none">{d.name}</div>
        {why ? <div className="mt-1 text-muted-foreground text-xs">{why}</div> : null}
      </div>
    </Card>
  )
}

export function PicksRow({
  picks,
  openLibrary,
  openBuild = null,
  t
}: {
  picks: readonly Pick[]
  /** Open the side card's tab; absent when no sidebar is on this profile. */
  openLibrary: (() => void) | null
  /** Open the Build tab for a platform (Create with …); absent where the sidebar cannot open tabs. */
  openBuild?: ((platform: string, inspiration: Inspiration, message: string) => void) | null
  t: Translate
}): JSX.Element | null {
  const [inspirations, setInspirations] = useState<Inspiration[] | null>(null)
  const [site, setSite] = useState<SitePreview | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([catalog(), fetchSite()])
      .then(([all, s]) => {
        if (!live) return
        const byId = new Map(all.map((d) => [d.id, d]))
        // A template card is never drawn in the chat, even when a refused call named one: the
        // catalog carries templates, and a refusal is not an error the turn data can see.
        setInspirations(
          picks
            .map((p) => byId.get(p.id))
            .filter((d): d is Inspiration => d !== undefined && d.template === undefined)
        )
        setSite(s)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [picks])

  if (inspirations === null || inspirations.length === 0) return null
  const reasons = new Map(picks.map((p) => [p.id, p.why]))
  return (
    <div className="tracy-design-inspiration my-3 flex flex-col gap-2 text-foreground text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">{t('picks.label')}</span>
        {openLibrary ? (
          <Button variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs" onClick={openLibrary}>
            <LayoutGrid size={13} />
            {t('picks.seeAll')}
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
        {inspirations.map((d, i) => (
          <PickCard
            key={d.id}
            d={d}
            why={reasons.get(d.id) ?? ''}
            site={site}
            t={t}
            onPreview={() => setOpen(i)}
          />
        ))}
      </div>
      {open !== null && inspirations[open] ? (
        <PreviewDialog
          list={inspirations}
          index={open}
          site={site}
          openBuild={openBuild}
          t={t}
          onClose={() => setOpen(null)}
          onStep={(dir) => setOpen((open + dir + inspirations.length) % inspirations.length)}
        />
      ) : null}
    </div>
  )
}
