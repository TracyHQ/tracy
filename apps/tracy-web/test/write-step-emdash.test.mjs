// The write step on an EmDash site, end to end: the JA Diner EmDash release's own kit and content map, a small plan and copy
// (an invented business, Harbour Kitchen), and the site's Apply door as it answers on EmDash — the content contract over
// the site's MCP tools (src/sites/emdash-contract.js), `info`, `media.upload` — over the release's seed in memory
// (_emdash-mcp-site.mjs). What it holds: the words land in the entries the content map names, a hidden slot is emptied,
// and no call EmDash has no door for ever reaches the site (write-step/site-doors/emdash.js): each is a line that says so.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openKit } from '../src/lib/template-kit-source.js'
import { EMDASH_INFO, emdashContractCall } from '../src/sites/emdash-contract.js'
import { EMDASH_TAKES } from '../src/write-step/site-doors/emdash.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { DINER_CONTRACT, dinerContentMap, emdashMcpSite } from './_emdash-mcp-site.mjs'

const SITE = 'emd-diner.sites.example'
const KIT_ID = `tracy-template-kit/2 ${DINER_CONTRACT}`
const sha = (c) => c.repeat(64)

/** Every kit page kept with every block it shows, and a few words on the home page's first slide. */
function planOf(kit) {
  const blocksOf = (page) => [...new Set(Object.values(page.blocks ?? {}).flat())]
  const shared = new Set(kit.blocks.filter((b) => b.shared).map((b) => b.id))
  const keep = (block, extra = {}) => ({ block, seen: 'seen', decision: 'keep', why: 'fits', ...extra })
  const slide = (n, says) => ({
    slot: `slideshow.slideshow.items[0].${n}`,
    says,
    basis: 'brief',
    factIds: ['f-name']
  })
  return {
    version: 'site-plan/3',
    kit: KIT_ID,
    brief: 'opp-harbour-kitchen',
    site: {
      language: 'en',
      voice: { summary: 'warm', ownWords: [], avoid: [] },
      forbidden: [],
      legalPages: []
    },
    // The main menu keeps three pages: the others leave it.
    mainMenu: [
      { page: 'page-home', intent: 'home' },
      { page: 'page-about-us', intent: 'the story' },
      { page: 'page-contact-us', intent: 'how to reach us' }
    ],
    sharedBlocks: [...shared].map((block) => keep(block)),
    // The offers page is dropped: the business has no offers to show.
    pages: kit.pages.map((page) =>
      page.id === 'page-offers'
        ? { id: page.id, decision: 'drop', why: 'no offers in the brief' }
        : {
            id: page.id,
            decision: 'keep',
            blocks: blocksOf(page)
              .filter((block) => !shared.has(block))
              .map((block) =>
                block === 'block-home-slides'
                  ? keep(block, {
                      copy: [
                        slide('title', 'the restaurant by the harbour'),
                        slide('desc', 'what is cooked'),
                        slide('button1', 'book')
                      ],
                      hiddenSlots: [
                        { slot: 'slideshow.slideshow.items[0].button2', why: 'no full menu online' }
                      ]
                    })
                  : keep(block)
              )
          }
    )
  }
}

const w = (slot, text) => ({ slot, owner: 'writer', text, factIds: ['f-name'] })
const copy = {
  version: 'site-copy/1',
  fingerprint: { kit: KIT_ID, planSha256: sha('a'), briefSha256: sha('b'), promptSha256: sha('c') },
  slots: [
    w('slideshow.slideshow.items[0].title', 'Harbour Kitchen'),
    w('slideshow.slideshow.items[0].desc', 'Fish from the morning boats, cooked over charcoal.'),
    w('slideshow.slideshow.items[0].button1', 'Book a table'),
    w('menu.primary.1.label', 'Home'),
    w('menu.primary.2.label', 'Our story'),
    w('menu.primary.6.label', 'Find us')
  ],
  alts: [],
  seo: [],
  pages: [],
  notebook: [],
  returns: []
}
const brief = {
  language: 'en',
  facts: [{ id: 'f-name', field: 'name', value: 'Harbour Kitchen', source: 'stated' }],
  reviews: [],
  missing: []
}

/** The Apply door on an EmDash site, as route.js answers it; anything else would reach no Tracy component. */
function emdashApplyDoor(site) {
  const calls = []
  const contentMap = dinerContentMap()
  return {
    calls,
    door: {
      async apply({ action, params }) {
        calls.push({ action, params })
        if (action === 'info') return { ok: true, info: EMDASH_INFO }
        if (action === 'content.contract')
          return (
            await emdashContractCall({
              siteKey: SITE,
              params,
              contract: DINER_CONTRACT,
              contentMap,
              calls: site.calls
            })
          ).body
        return { ok: false, code: 'COMPONENT_NOT_REGISTERED', status: 409 }
      }
    }
  }
}

async function run() {
  const kit = openKit(DINER_CONTRACT)
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-emdash-'))
  const files = {}
  for (const [name, value] of Object.entries({ plan: planOf(kit.doc), copy, brief })) {
    files[name] = path.join(dir, `${name}.json`)
    writeFileSync(files[name], JSON.stringify(value))
  }
  const site = emdashMcpSite()
  const applyDoor = emdashApplyDoor(site)
  try {
    const report = await runWriteStep({
      door: applyDoor.door,
      siteKey: SITE,
      kit: { ref: kit.ref, platform: kit.platform, doc: kit.doc },
      contentMap: dinerContentMap(),
      files,
      sleep: async () => {}
    })
    return { report, site, calls: applyDoor.calls }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('an EmDash Diner run writes its words into the entries and empties the hidden slot, through the contract alone', async () => {
  const { report, site, calls } = await run()
  assert.notEqual(report.status, 'stopped', JSON.stringify(report.stop ?? report.cause ?? null))
  const slide = site.entry('slideshow', 'slideshow').data.items[0]
  assert.equal(slide.title, 'Harbour Kitchen')
  assert.equal(slide.desc, 'Fish from the morning boats, cooked over charcoal.')
  assert.equal(slide.button1, 'Book a table')
  assert.equal(slide.button2, '')
  const line = (slot) => report.slots.find((s) => s.slot === slot)
  assert.equal(line('slideshow.slideshow.items[0].title')?.status, 'written')
  assert.equal(line('slideshow.slideshow.items[0].button2')?.status, 'hidden')
  // The main menu: the kept items carry the writer's labels, the others left it.
  assert.deepEqual(
    site.menus.get('primary').items.map((i) => [i.label, i.customUrl]),
    [
      ['Home', '/'],
      ['Our story', '/about-us'],
      ['Find us', '/contact-us']
    ]
  )
  // The dropped page's entry is a draft: no visitor reaches it.
  assert.equal(site.entry('pages', 'offers').status, 'draft')
  assert.equal(site.entry('pages', 'about-us').status, 'published')
  assert.equal(line('page-offers')?.status, 'hidden')
  // 🔒 Only what the Apply door takes on EmDash was sent.
  assert.deepEqual(
    calls.filter((c) => !EMDASH_TAKES.has(c.action)),
    []
  )
})
