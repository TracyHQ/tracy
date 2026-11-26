// The write step on a WordPress site, end to end: the JA Diner WordPress release's own kit and content map, a small plan
// and copy (an invented business, Harbour Kitchen), and a Claude Cowork for WordPress stand-in behind the Apply door that
// answers `content.contract` inspect and apply as the plugin does, and `info` with no write step doors. What it holds: the
// words go in one apply as plain text keyed by content map slot (contract-mapping-wordpress.js), and what the plugin does
// not take yet (an emptied slot, a Joomla stage's call) is skipped in words, never sent and never read as a refusal.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openContentMap } from '../src/lib/content-map-source.js'
import { openKit } from '../src/lib/template-kit-source.js'
import { WORDPRESS_TAKES } from '../src/write-step/site-doors/wordpress.js'
import { runWriteStep } from '../src/write-step/write-step.js'

const CONTRACT = 'ja-diner/wp7/1.0.4'
const SITE = 'wp-diner.sites.example'
const sha = (c) => c.repeat(64)

function planOf(kit) {
  const keep = (block, extra = {}) => ({ block, seen: 'seen', decision: 'keep', why: 'fits', ...extra })
  const shared = new Set(kit.blocks.filter((b) => b.shared).map((b) => b.id))
  const blocksOf = (page) => [...new Set(Object.values(page.blocks ?? {}).flat())]
  const slot = (id, says) => ({ slot: id, says, basis: 'brief', factIds: ['f-name'] })
  return {
    version: 'site-plan/3',
    kit: `${kit.kit} ${CONTRACT}`,
    brief: 'opp-harbour-kitchen',
    site: {
      language: 'en',
      voice: { summary: 'warm', ownWords: [], avoid: [] },
      forbidden: [],
      legalPages: []
    },
    sharedBlocks: [...shared].map((block) => keep(block)),
    pages: kit.pages.map((page) => ({
      id: page.id,
      decision: 'keep',
      blocks: blocksOf(page)
        .filter((block) => !shared.has(block))
        .map((block) =>
          block === 'body-home'
            ? keep(block, {
                copy: [
                  slot('front-page.slideshow.title.1', 'the restaurant by the harbour'),
                  slot('front-page.slideshow.desc.1', 'what is cooked')
                ],
                hiddenSlots: [{ slot: 'front-page.slideshow.button1.2', why: 'no table booking online' }]
              })
            : keep(block)
        )
    }))
  }
}

const w = (slot, text) => ({ slot, owner: 'writer', text, factIds: ['f-name'] })
const copyOf = (kit) => ({
  version: 'site-copy/1',
  fingerprint: {
    kit: `${kit.kit} ${CONTRACT}`,
    planSha256: sha('a'),
    briefSha256: sha('b'),
    promptSha256: sha('c')
  },
  slots: [
    w('front-page.slideshow.title.1', 'Harbour Kitchen'),
    w('front-page.slideshow.desc.1', ['Fish from the morning boats.', 'Cooked over charcoal.'])
  ],
  alts: [],
  seo: [{ page: 'page-home', title: 'Harbour Kitchen', description: 'Fish from the morning boats.' }],
  pages: [],
  notebook: [],
  returns: []
})
const brief = {
  language: 'en',
  facts: [{ id: 'f-name', field: 'name', value: 'Harbour Kitchen', source: 'stated' }],
  reviews: [],
  missing: []
}

/** The Apply door on a WordPress site with the Claude Cowork for WordPress: its contract, and `info` with no stage doors. */
function wordpressDoor(contentMap) {
  const calls = []
  const held = new Map(contentMap.slots.map((s) => [s.key, s.sample]))
  return {
    calls,
    held,
    door: {
      async apply({ action, params }) {
        calls.push({ action, params: structuredClone(params) })
        if (action === 'info') return { ok: true, info: { platform: 'wordpress', version: '0.18.45' } }
        if (action !== 'content.contract')
          return { ok: false, error: 'bad_action', message: `unknown action ${action}` }
        // The plugin's own shape (dev 26/11/2026): `slots` keyed by slot with the current words, pictures apart.
        if (params.operation === 'inspect') {
          const pictures = contentMap.slots.filter((s) => s.type === 'image')
          return {
            ok: true,
            contract: CONTRACT,
            revision: `rev-${calls.length}`,
            bound: true,
            slots: Object.fromEntries(contentMap.slots.map((s) => [s.key, held.get(s.key)])),
            imageSlots: Object.fromEntries(
              pictures.map((s) => [s.key, `wp-content/uploads/2026/10/${s.sample}`])
            ),
            markupSlots: {}
          }
        }
        if (params.operation === 'apply') {
          for (const [key, value] of Object.entries(params.changes ?? {})) held.set(key, value)
          return { ok: true, afterRevision: 'rev-after' }
        }
        return { ok: false, error: 'unsupported', message: `operation ${params.operation}` }
      }
    }
  }
}

test('a WordPress Diner run writes its words as plain text in one apply, and skips in words what the plugin does not take', async () => {
  const kit = openKit(CONTRACT)
  const contentMap = openContentMap(CONTRACT).doc
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-wordpress-'))
  const files = {}
  for (const [name, value] of Object.entries({ plan: planOf(kit.doc), copy: copyOf(kit.doc), brief })) {
    files[name] = path.join(dir, `${name}.json`)
    writeFileSync(files[name], JSON.stringify(value))
  }
  const site = wordpressDoor(contentMap)
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit: { ref: kit.ref, platform: kit.platform, doc: kit.doc },
      contentMap,
      files,
      sleep: async () => {}
    })
    assert.notEqual(report.status, 'stopped', JSON.stringify(report.cause ?? null))
    const applies = site.calls.filter((c) => c.params?.operation === 'apply')
    assert.ok(applies.length >= 1)
    const sent = Object.assign({}, ...applies.map((a) => a.params.changes))
    assert.equal(sent['front-page.slideshow.title.1'], 'Harbour Kitchen')
    // Plain text: no contract markup, no line break.
    assert.doesNotMatch(String(sent['front-page.slideshow.desc.1']), /\(\(|\n/)
    assert.match(
      String(sent['front-page.slideshow.desc.1']),
      /Fish from the morning boats\. ?Cooked over charcoal\./
    )
    assert.ok(applies.every((a) => a.params.empty_slots === undefined && a.params.evidence === undefined))
    const line = (slot) => report.slots.find((s) => s.slot === slot)
    assert.equal(line('front-page.slideshow.title.1')?.status, 'written')
    // The plugin empties no slot yet: the hidden slot is skipped in words, and so is the page title stage.
    assert.equal(line('front-page.slideshow.button1.2')?.status, 'skipped')
    assert.match(line('front-page.slideshow.button1.2').reason, /^not on WordPress yet: /)
    assert.equal(line('page-home:title')?.status, 'skipped')
    assert.equal(
      report.slots.filter((l) => l.status === 'failed' && /not_on_wordpress|older than/.test(l.reason ?? ''))
        .length,
      0
    )
    // 🔒 Only what the Apply door takes on WordPress was sent.
    assert.deepEqual(
      site.calls.filter((c) => !WORDPRESS_TAKES.has(c.action)),
      []
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
