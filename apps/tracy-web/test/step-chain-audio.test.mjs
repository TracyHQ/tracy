// Actual step-chain writer and signed host transport, with in-memory DB/HTTP edges only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import { brief } from './_site-copy-check.mjs'
import { copy, fakeSite, frozenFiles, KIT, plan, SITE } from './_write-step-run.mjs'

test('audio postwrite step chain reaches its existing host reader before site check without a database', async () => {
  const kit = KIT()
  kit.doc.pages = [{ id: 'page-home', path: '/', blocks: { 1440: ['block-2'] } }]
  const slot = {
    key: 'article-7.9',
    entity: 'article-7',
    type: 'url',
    role: 'business.audio',
    column: 'attribs',
    jsonPath: ['ctm_audio', 'audio-src', '2'],
    group: { id: 'article-7.audio.2', item: 2, kind: 'business' },
    sample: 'images/Old.mp3',
    current: 'images/Old.mp3',
    canHide: true
  }
  const link = {
    id: slot.key,
    sourceSlot: slot.key,
    action: 'media-source',
    mediaKind: 'audio',
    target: slot.sample,
    sourceBinding: { entity: slot.entity, column: slot.column, jsonPath: slot.jsonPath, group: slot.group }
  }
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.source = { entity: slot.entity }
  block.links = [link]
  const value = 'https://media.example/New.mp3?sig=A%2FB'
  const p = plan()
  p.pages[0].blocks[0].links = [{ link: slot.key, leadsTo: value }]
  const b = brief()
  b.facts.push({ id: 'audio-1', field: 'audio', source: 'stated', value })
  const frozen = frozenFiles({ plan: p, copy: copy() })
  const site = fakeSite({
    extraKeys: [slot.key],
    overSlot: (s) => (s.key === slot.key ? { ...slot, current: site.held[slot.key] ?? slot.current } : {})
  })
  const apply = site.door.apply
  site.door.apply = async (call) => {
    const answer = await apply(call)
    return call.action === 'content.contract' && call.params.operation === 'inspect'
      ? { ...answer, ids: { 'article-7': 7 } }
      : answer
  }
  const calls = []
  const pool = {
    query: async (sql) => {
      if (sql.startsWith('select brief from wo_revision')) return { rows: [{ brief: b }] }
      if (sql.startsWith('select * from site where site_key'))
        return {
          rows: [{ label: 'audio-test', platform: 'joomla', host: 'test', address: 'https://site.example/' }]
        }
      assert.fail(sql)
    }
  }
  const steps = createStepChainSteps({
    pool,
    secret: 'synthetic-test-secret',
    config: {
      siteDomain: 'example.test',
      defaultHost: 'test',
      hosts: new Map([['test', { origin: 'https://host.example', hostSecret: 'synthetic-test-secret' }]])
    },
    fetchImpl: async (url, init) => {
      if (url === 'https://host.example/_host/demo-qa') {
        calls.push(JSON.parse(init.body))
        return { ok: true, status: 200, json: async () => ({ pageMeasures: [] }) }
      }
      // The chain write first reads the site's full backup through the owner door (write-step/site-recovery.js).
      if (String(url).endsWith(`/api/sites/${encodeURIComponent(SITE)}/backups`)) {
        const body = {
          may: { restoreEverything: true },
          rows: [
            {
              kind: 'backup',
              version: 1,
              sha: 'a'.repeat(40),
              database: { state: 'full', sha256: 'b'.repeat(64) }
            }
          ]
        }
        return { ok: true, status: 200, text: async () => JSON.stringify(body) }
      }
      // Existing printed-page reads use the same injected HTTP edge, never the network.
      return { ok: true, status: 200, text: async () => '<html><body></body></html>' }
    },
    sleep: async () => {},
    log: { warn() {} }
  })
  const ctx = {
    runId: 'audio-test',
    siteKey: SITE,
    email: 'owner@example.test',
    brief: { researchRevisionId: 'r1' }
  }
  try {
    const result = await steps.write(
      ctx,
      { kit, plan: { file: frozen.files.plan }, copy: { file: frozen.files.copy } },
      { door: site.door }
    )
    assert.equal(result.value.report.cause.code, 'AUDIO_PLAYER_READBACK_FAILED')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].label, 'audio-test')
    assert.deepEqual(calls[0].pages, ['/'])
    assert.equal(calls[0].measurePages, true)
    assert.equal(calls[0].incremental, false)
  } finally {
    await steps.dispose(ctx)
    frozen.done()
  }
})
