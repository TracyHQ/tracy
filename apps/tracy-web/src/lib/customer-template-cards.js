/**
 * The template cards a customer on this server is offered: exactly what `GET /api/templates` answers.
 *
 * 🔒 ONE FUNCTION FOR EVERY READER. The public door (`ops/quickstarts.js`), the operations screen's
 * "Shown to customers" list and the public Templates pages (`public/templates-page.js`) all build
 * from THIS output, never from a second reading of the releases, so none of them can list a card the
 * others leave out (`tasks/todo-ops-design-inspiration.md` P1; issue #1762: a template an admin
 * publishes appears on every surface at once, with no deploy).
 */
import { briefSupported } from './brief-support.js'
import { defaultContracts } from './contracts.js'
import { liveDemosByTag } from './demo-sites.js'
import { localReviewCards } from './local-review.js'
import { readReleases, shownDesign, templateCards } from './quickstart-releases.js'
import { blurbHash, blurbTranslations } from './template-blurb-translations.js'
import { shotFilesFor, withPictureUrls } from './template-shots.js'

/**
 * The live demos as a template card shows them: address and version only. The row's platform is for the
 * preview door and DEMO-1 (`lib/preview-demo.js`), not part of the public card.
 * @param {Map<string, { url: string, version: string, platform?: string | null }>} live
 */
export const cardDemosOf = (live) =>
  new Map([...live].map(([tag, { url, version }]) => [tag, { url, version }]))

/**
 * The customer cards built from releases already read.
 * @param {import('pg').Pool} pool
 * @param {{origin: string, localReview?: boolean}} config
 * @param {any[]} releases from `readReleases`
 */
export async function customerTemplateCards(pool, config, releases) {
  const contracts = defaultContracts()
  // Local review mode shows the local packs only (`lib/local-review.js`); off it, every card.
  const templates = localReviewCards(
    templateCards(releases, cardDemosOf(await liveDemosByTag(pool)), contracts),
    config?.localReview === true
  )
  const held = await shotFilesFor(
    pool,
    templates.map((t) => t.id)
  )
  // The blurb's stored translations (`lib/template-blurb-translations.js`), one query for the whole list:
  // `card.blurbs` is `{ lang: text }`, only the languages translated so far; a page shows English otherwise.
  const translated = await blurbTranslations(
    pool,
    templates.map((t) => t.card?.blurb)
  )
  const withBlurbs = (card) =>
    card && typeof card.blurb === 'string' && card.blurb.trim()
      ? { ...card, blurbs: translated.get(blurbHash(card.blurb)) ?? {} }
      : card
  return templates.map((t) =>
    withPictureUrls(
      {
        ...t,
        card: withBlurbs(t.card),
        design: shownDesign(t.design),
        // Whether the Add site popup's Apply can write this build (`lib/brief-support.js`); the wizard offers the popup only then.
        platforms: t.platforms.map((p) => ({ ...p, apply: briefSupported(p, contracts) }))
      },
      {
        origin: config.origin,
        has: (id, file) => held.get(id)?.has(file) === true,
        version: (id, file) => held.get(id)?.get(file)
      }
    )
  )
}

/**
 * Read the releases and answer the customer cards with when they were read; an empty list where this
 * process has no database (nothing is published there).
 * @param {import('pg').Pool | null} pool
 * @param {{origin: string, localReview?: boolean}} config
 * @returns {Promise<{readAt: string | null, templates: any[]}>}
 */
export async function publishedTemplates(pool, config) {
  if (!pool) return { readAt: null, templates: [] }
  const releases = await readReleases(pool)
  return {
    readAt: releases[0]?.fetchedAt ?? null,
    templates: await customerTemplateCards(pool, config, releases)
  }
}
