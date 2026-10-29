// Brief writes obey the plugin's occupancy rules across slot types and record kinds (#189).
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { checkSlotValue } from '../../../packages/tools/tracy-site-tools/src/host/contract-check.mjs'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { throughDoor } from './_apply-door.mjs'

for (const [trade, name] of [
  ['coaching', 'Fern Coaching'],
  ['bakery', 'Copperleaf Bakery']
]) {
  for (const cleanupFailure of ['none', 'refused', 'missing'])
    test(`${trade}: occupancy uses records when cleanup is ${cleanupFailure}`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'contract-occupancy-'))
      try {
        const slots = [
          {
            key: 'module-40.0',
            entity: 'module-40',
            column: 'params',
            jsonPath: ['description'],
            type: 'text',
            sample: 'Demo description'
          },
          {
            key: 'module-40.1',
            entity: 'module-40',
            column: 'params',
            jsonPath: ['label'],
            type: 'text',
            sample: 'Ask us'
          },
          {
            key: 'module-40.2',
            entity: 'module-40',
            column: 'params',
            jsonPath: ['second'],
            type: 'url',
            sample: ''
          },
          {
            key: 'userProfile-4400.0',
            entity: 'userProfile-4400',
            column: 'value',
            type: 'text',
            sample: 'Demo champion'
          },
          {
            key: 'menuItem-197.0',
            entity: 'menuItem-197',
            column: 'params',
            jsonPath: ['page_heading'],
            type: 'text',
            sample: 'Demo heading'
          },
          {
            key: 'module-40.3',
            entity: 'module-40',
            column: 'params',
            jsonPath: ['newText'],
            type: 'text',
            sample: ''
          },
          {
            key: 'module-40.4',
            entity: 'module-40',
            column: 'params',
            jsonPath: ['identity'],
            type: 'text',
            sample: 'Demo identity',
            siteIdentity: true
          }
        ].map((s) => ({ ...s, maxCharacters: 200 }))
        const contract = { id: `fictional-${trade}/j6/1.0.0`, dir }
        writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify({ slots, entities: [], pages: [] }))
        const rows = {
          module: [
            {
              id: 40,
              title: 'Content',
              language: '*',
              published: 1,
              params: JSON.stringify({
                description: 'Demo description',
                label: 'Ask us',
                second: '',
                newText: '',
                identity: 'Demo identity'
              })
            }
          ],
          userProfile: [{ id: 4400, field: 'aboutme', value: 'Demo champion' }],
          menuItem: [
            {
              id: 197,
              language: '*',
              published: 1,
              title: 'Info',
              path: 'info',
              params: JSON.stringify({ page_heading: 'Demo heading' })
            }
          ]
        }
        const attempts = [],
          refusals = [],
          records = [],
          notes = []
        let revision = 'r1'
        const apply = async ({ action, params }) => {
          if (action === 'content.list')
            return {
              ok: true,
              items: (rows[params.kind] ?? []).slice(
                params.offset ?? 0,
                (params.offset ?? 0) + (params.limit ?? 200)
              )
            }
          if (action === 'content.get' && cleanupFailure === 'missing' && params.kind === 'userProfile')
            return { ok: false, message: 'record is unavailable' }
          if (action === 'content.get')
            return { ok: true, item: rows[params.kind]?.find((r) => r.id === params.id) }
          if (action === 'content.batch' || action === 'content.update') {
            if (
              cleanupFailure === 'refused' &&
              (params.operations ?? [params]).some((step) => step.kind === 'userProfile')
            )
              return { ok: false, message: 'record write refused' }
            for (const step of params.operations ?? [params]) {
              records.push(step)
              const row = rows[step.kind]?.find((r) => r.id === step.id)
              if (row) Object.assign(row, step.fields)
            }
            return { ok: true }
          }
          if (action !== 'content.contract') return { ok: true }
          if (params.operation === 'inspect')
            return {
              ok: true,
              contract: contract.id,
              revision,
              slots: slots.map((s) => ({ ...s, current: s.sample })),
              pages: []
            }
          if (params.operation === 'apply') {
            attempts.push(params.changes)
            const failures = Object.entries(params.changes).flatMap(([key, value]) => {
              const failure = checkSlotValue(
                slots.find((s) => s.key === key),
                value,
                { evidence: params.evidence }
              )
              return failure ? [failure.message] : []
            })
            if (failures.length) {
              refusals.push(...failures)
              return { ok: false, message: failures.join('; ') }
            }
            revision += 'x'
            return { ok: true, afterRevision: revision }
          }
          return { ok: true, status: 'completed', titles: [] }
        }
        const ctx = {
          contract,
          siteKey: `fictional-${trade}`,
          email: 'owner@example.test',
          quickstart: `fictional-${trade}/j6`,
          brief: { about: `${name} provides ${trade} services.` },
          normalized: {
            name,
            nameFrom: 'answer',
            about: `${name} provides ${trade} services.`,
            languages: ['en']
          },
          signal: new AbortController().signal,
          note: (n) => notes.push(n),
          time() {},
          deadlineAt: Date.now() + 60000
        }
        const engine = createJoomlaEngine({
          models: async () => ({}),
          applyFor: () => throughDoor(apply),
          woContent: { sitePlanFor: async () => ({ honesty: {} }) }
        })
        const completion = engine.apply(ctx, {
          contractId: contract.id,
          changes: {
            'module-40.0': '',
            'module-40.1': 'Call us',
            'module-40.2': 'https://example.test/chat',
            'userProfile-4400.0': '',
            'menuItem-197.0': '',
            'module-40.3': 'New words',
            'module-40.4': ''
          },
          evidence: {},
          pending: [],
          left: 0,
          keep: [],
          pictures: [],
          groups: [],
          factModules: [],
          written: 'en-GB',
          described: true,
          rewrites: false,
          // Neither profile nor menu metadata went through the copy writer: fallback still has to reach them.
          demoAsked: ['module-40.0']
        })
        // 🔒 One slot no door can empty is a finding, never the end of the build (#189, round 10): the other records
        // are still emptied and the note names the slot left.
        await completion
        if (cleanupFailure !== 'none') {
          const left = 'userProfile-4400'
          assert.ok(
            notes.some((line) => line.includes(left)),
            `a note names ${left}: ${notes.join(' | ')}`
          )
          assert.equal(
            JSON.parse(rows.module[0].params).description,
            '',
            'the reachable records are still emptied'
          )
          assert.equal(JSON.parse(rows.menuItem[0].params).page_heading, '')
          assert.equal(
            rows.userProfile[0].value,
            'Demo champion',
            'the slot no door reached is left, and said'
          )
          return
        }
        assert.deepEqual(refusals, [], 'the plugin must never receive an illegal occupancy change')
        assert.ok(
          attempts.some((a) => a['module-40.1'] === 'Call us'),
          'valid words still reach the contract'
        )
        assert.equal(JSON.parse(rows.module[0].params).description, '')
        assert.equal(rows.userProfile[0].value, '')
        assert.equal(JSON.parse(rows.menuItem[0].params).page_heading, '')
        assert.equal(JSON.parse(rows.module[0].params).second, '', 'empty unplanned URL stays neutral')
        assert.equal(JSON.parse(rows.module[0].params).newText, '', 'empty text stays neutral')
        assert.ok(
          attempts.some((a) => a['module-40.4'] === ''),
          'the plugin allows identity slots to be emptied'
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
}

test('contract writes use sealed samples and PHP occupancy for all scalar types', async () => {
  const { writeContract } = await import('../src/sites/brief-engines/joomla.js')
  const { applyJoomlaContract } = await import(
    '../../../packages/cms/tracy-seeder/src/apply-joomla-contract.mjs'
  )
  const slots = [
    { key: 'module-1.0', type: 'url', sample: '', current: 'https://example.test/already-filled' },
    { key: 'module-1.1', type: 'image', sample: 'images/demo.jpg' },
    { key: 'module-1.2', type: 'text', sample: 'Demo', current: '' },
    { key: 'module-1.3', type: 'text', sample: '\u00a0' },
    { key: 'module-1.4', type: 'text', sample: '', siteIdentity: true }
  ]
  const changes = {
    'module-1.0': 'https://example.test/new',
    'module-1.1': '',
    'module-1.2': '',
    'module-1.3': 'Owner',
    'module-1.4': 'Owner identity'
  }
  const reading = { ok: true, contract: 'fictional', revision: 'r1', slots }
  const sent = []
  const apply = async ({ params }) => {
    if (params.operation === 'inspect') return reading
    sent.push(params)
    for (const [key, value] of Object.entries(params.changes))
      assert.equal(
        checkSlotValue(
          slots.find((s) => s.key === key),
          value
        ),
        null
      )
    return { ok: true, afterRevision: 'r2' }
  }
  const deferred = await writeContract({
    applyJoomlaContract,
    apply,
    siteKey: 'fictional',
    reading,
    changes,
    evidence: {},
    timed: (fn) => fn()
  })
  assert.deepEqual(deferred, ['module-1.0', 'module-1.1', 'module-1.2'])
  assert.deepEqual(sent[0].changes, { 'module-1.3': 'Owner', 'module-1.4': 'Owner identity' })
})

test('a plugin refusal is logged in full beyond its three-hundredth character', async (t) => {
  const { writeContract } = await import('../src/sites/brief-engines/joomla.js')
  const { applyJoomlaContract } = await import(
    '../../../packages/cms/tracy-seeder/src/apply-joomla-contract.mjs'
  )
  const message = `Content too long: module-1.0 ${'constraint detail '.repeat(50)}last constraint`
  const logs = []
  t.mock.method(console, 'warn', (line) => logs.push(line))
  const changes = { 'module-1.0': 'Owner' }
  const reading = {
    ok: true,
    contract: 'fictional',
    revision: 'r1',
    slots: [{ key: 'module-1.0', sample: 'Demo' }]
  }
  const deferred = await writeContract({
    applyJoomlaContract,
    apply: async () => ({ ok: false, message }),
    siteKey: 'fictional',
    reading,
    changes,
    evidence: {},
    timed: (fn) => fn()
  })
  assert.deepEqual(deferred, ['module-1.0'])
  assert.ok(
    logs.some((line) => line.endsWith(message)),
    'the final constraint must be readable'
  )
})
