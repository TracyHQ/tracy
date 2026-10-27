/**
 * A Joomla build keeps the tags and the categories of the content it keeps (TCH #1013, D3; spec STAB-3, moved to Tracy on
 * 09/10/2026). Measured 08/10/2026 on a JA Podcast j6 1.0.1 site: a brief build took `#__contentitem_tag_map` from 190 rows
 * to 0, because Joomla's Taggable behaviour reads an article store that names no tags as "every tag removed". Claude Cowork
 * for Joomla 0.24.1 fixed it in the plugin (a write silent about tags keeps them; its e2e `tests/e2e/tags-kept.sh` holds it
 * on a real Joomla). Two things on THIS side can still bring the loss back, and this file holds both:
 *
 * 1. a pin that installs a plugin older than 0.24.1 on a site (`quickstarts.json`);
 * 2. a write the Joomla engine sends that names an article's tags, deletes a tag or trashes a kept category. A whole Apply
 *    over the real JA Podcast 1.0.1 contract runs here against a site double that holds the release's own tag map (190
 *    rows: articles 1-5 and 8-40, each tagged 3-7, read from its `installation/sql/mysql/custom.sql`) and applies every
 *    write the way the plugin does, so the tag map is counted before and after.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { contract, model, podcastSite } from './_joomla-podcast-site.mjs'
import { throughDoor } from './_apply-door.mjs'

/** The first Claude Cowork for Joomla release whose writes keep an article's tags. */
const KEEPS_TAGS = [0, 24, 1]

const newer = (/** @type {string} */ version, /** @type {number[]} */ floor) => {
  const parts = String(version)
    .split(/[.-]/)
    .slice(0, 3)
    .map((n) => Number(n))
  for (let i = 0; i < 3; i++) if (parts[i] !== floor[i]) return parts[i] > floor[i]
  return true
}

test('every Joomla pin installs a Claude Cowork plugin that keeps tags (0.24.1 or later)', () => {
  const pins = JSON.parse(
    readFileSync(fileURLToPath(new URL('../src/quickstarts.json', import.meta.url)), 'utf8')
  )
  const joomla = Object.entries(pins).filter(([, entry]) => entry.platform === 'joomla' && entry.cowork)
  assert.ok(joomla.length >= 8, `the pins name the Joomla quickstarts (${joomla.length})`)
  const older = joomla
    .filter(([, entry]) => !newer(entry.cowork.version ?? '0.0.0', KEEPS_TAGS))
    .map(([tag, entry]) => `${tag}: ${entry.cowork.version ?? 'no version'}`)
  assert.deepEqual(older, [], 'a pin below 0.24.1 untags every article an Apply writes')
})

const count = (/** @type {Map<number, number[]>} */ map) =>
  [...map.values()].reduce((n, tags) => n + tags.length, 0)

test('a whole Apply over JA Podcast 1.0.1, Podcast and Pages unticked, keeps every article its five tags: 190 pairings before, 190 after', async () => {
  assert.ok(contract, 'the checkout seals JA Podcast j6 1.0.1')
  const site = podcastSite()
  const before = new Map([...site.tags].map(([id, tags]) => [id, [...tags]]))
  assert.equal(count(before), 190)
  const notes = []
  const ctx = {
    siteKey: 'jm-podcast',
    label: 'hanoi-roofing',
    platform: 'joomla',
    quickstart: 'quickstart/ja-podcast/j6',
    contract,
    email: 'owner@example.com',
    // Podcast and Pages unticked: the articles their lists show are unpublished, the road that writes articles outside the
    // contract. Pages holds "Category blog" (category 2), whose articles are tagged.
    brief: {
      about: 'Hanoi Roofing repairs roofs in Hanoi.',
      goal: 'contact',
      style: 'friendly',
      pages: {
        all: ['homepage', 'about', 'podcast', 'blog', 'contact', 'pages'].map((id) => ({
          id,
          label: id,
          ...(id === 'homepage' ? { home: true } : {})
        })),
        picked: ['homepage', 'about', 'blog', 'contact']
      }
    },
    normalized: {
      name: 'Hanoi Roofing',
      about: 'Hanoi Roofing repairs roofs in Hanoi.',
      tone: 'friendly',
      contact: '',
      languages: ['en']
    },
    signal: new AbortController().signal,
    time: () => {},
    note: (/** @type {string} */ n) => notes.push(n),
    deadlineAt: Date.now() + 60_000
  }
  const engine = createJoomlaEngine({ models: model.models, applyFor: () => throughDoor(site.apply) })
  const prepared = await engine.prepare(ctx)
  await engine.apply(ctx, prepared)
  assert.ok(site.writes > 0, `the Apply wrote to the site (${site.writes} writes)`)
  const tagged = [...site.articlesWritten].filter((id) => before.has(id))
  assert.ok(tagged.length >= 5, `the Apply wrote tagged articles (${tagged.join(', ')})`)
  const off = tagged.filter((id) => Number(site.stateOf(id)) === 0)
  assert.ok(off.length > 0, `among them tagged articles it unpublished (${off.join(', ')})`)
  assert.deepEqual(site.tagWrites, [], 'no write named tags, deleted a tag or took a category off')
  assert.equal(count(site.tags), 190, 'the tag map after the Apply')
  assert.deepEqual(
    Object.fromEntries(site.tags),
    Object.fromEntries(before),
    'every article keeps exactly its own tags'
  )
})
