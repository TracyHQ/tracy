/**
 * Design inspirations — the side-card tab and its "Open preview" dialog, drawn from the PLUGIN'S OWN
 * CODE (`@tracy/dsh-design-inspiration`, client half), not a mockup. The old mockup was deleted when the
 * plugin was ported; this story is where the screen is reviewed from now on (spec §4b-bis).
 *
 * What is stubbed, and only that: the four doors of the plugin's host half — see
 * `design-inspirations.doors.ts`, shared with the filter mockup. `fetch` for
 * `/api/tracy-design-inspiration/…` answers from the same files the lane's image carries — the catalog
 * and each system's `tokens.css` / `DESIGN.md` / `components.html` under `vendor/tracy/od-design-system`,
 * loaded lazily — and `site` answers with the REAL `design-preview.json` an agent wrote for
 * lucaswp.tracy.ai on 05/09. Every string on screen is either a system's or the site's own.
 *
 * Note the plugin's own React-18 lesson still applies to the product, not here: the bench runs React
 * 19, which is exactly why the grey-card bug never reproduced on it (`five-things-a-plugin-must-get-right.md`).
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type JSX, useEffect, useState } from 'react'

import { Gallery } from '../../../../../design/tracy-design-inspiration/src/client/Gallery'
import { INSPIRATIONS, installDoors, SITE } from './design-inspirations.doors'
import type { SitePreview } from '../../../../../design/tracy-design-inspiration/src/client/api'
import { en as dsEn } from '../../../../../design/tracy-design-inspiration/src/client/strings'
import viDs from '../../../../../locale/tracy-locale-vi/vi/tracy-design-inspiration.json'
import airbnbCopy from '../../fixtures/design-copy.airbnb.json'

const meta: Meta = {
  title: 'Pages/In dsh/Design inspirations',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const en = lookup(dsEn as Record<string, string>)
const vi = lookup(viDs as Record<string, string>)

function Screen({
  site,
  t,
  open,
  copy = false
}: {
  site: SitePreview | null
  t: (key: string, params?: Record<string, string | number>) => string
  /** A inspiration id to open the dialog on, the way the `#<id>` deep link does on a lane. */
  open?: string
  /** Serve the copy fixture for Airbnb (spec §4h): versions on the Home and Form chips. */
  copy?: boolean
}): JSX.Element {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installDoors(site, copy ? { airbnb: airbnbCopy } : {})
    if (open) window.location.hash = `#${open}`
    else if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setReady(true)
  }, [site, open, copy])
  if (!ready) return <div />
  return (
    <div className="mx-auto h-dvh max-w-[1600px] overflow-y-auto border-border border-x bg-background">
      {/* `t` is typed on the plugin's own key union; the bench dictionary is a superset by construction. */}
      <Gallery inspirations={INSPIRATIONS} site={site} t={t as never} />
    </div>
  )
}

/** The tab as the customer sees it after the agent read the site: every card on lucaswp's content. */
export const Library: Story = { render: () => <Screen site={SITE} t={en} /> }

/** Before the agent has read the site: the inspiration alone on each card, and the notice above. */
export const LibraryNotRead: Story = { render: () => <Screen site={null} t={en} /> }

/** Open preview on Airbnb: the device frame at Desktop, kinds across, versions down, About folded below. */
export const OpenPreview: Story = { render: () => <Screen site={SITE} t={en} open="airbnb" /> }

/** The same, on a inspiration with a 88px display face — the case that broke before §4b-bis. */
export const OpenPreviewArtistic: Story = { render: () => <Screen site={SITE} t={en} open="artistic" /> }

/**
 * A TEMPLATE on the same grid (Lee, 15/09): Tracy Business, published by JoomlArt — the preview
 * frames the live demo, chips are the site's layouts, Create with lights only Joomla and EmDash,
 * and there is no "Use this inspiration": a finished site is installed, not worn.
 */
export const OpenPreviewTemplate: Story = {
  render: () => <Screen site={SITE} t={en} open="tracy-business" />
}

/** Vietnamese: the strings `@tracy/dsh-tracy-locale-vi` ships for this namespace. */
export const LibraryVi: Story = { render: () => <Screen site={SITE} t={vi} open="vercel" /> }

/** Airbnb with copy written (§4h): the strip shows Your words · Default · Rewritten on Home, "About Tracy" beside it, Contact on Form; More version answers after 1.5 s with a hand-written take. */
export const OpenPreviewVersions: Story = {
  render: () => <Screen site={SITE} t={en} open="airbnb" copy />
}

/** Airbnb before anything was written: Your words and Default only, and the More version tile with its pencil. */
export const OpenPreviewCut: Story = { render: () => <Screen site={SITE} t={en} open="airbnb" /> }

/** Before the agent read the site: the sample-product chips across, Default and More version down — never a bare frame (06/09). */
export const OpenPreviewNotRead: Story = { render: () => <Screen site={null} t={en} open="airbnb" /> }
