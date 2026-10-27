import assert from 'node:assert/strict'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyQuickstartEditorial,
  editQuickstart,
  expandQuickstartEditorial,
  quickstartEditorialInventory,
  quickstartTextRanges,
  validateQuickstartEditorial
} from '../src/sites/brief-engines/quickstart-editorial.js'
import {
  responsivePictures,
  replaceResponsivePicture
} from '../src/sites/brief-engines/quickstart-pictures.js'
import {
  nativeCopyBindings,
  openNativeQuickstart,
  nativeStructure
} from '../src/sites/brief-engines/quickstart-native.js'
import {
  createQuickstartFirstEngine,
  quickstartFactCopy,
  quickstartCopyHash,
  quickstartResumeRecords
} from '../src/sites/brief-engines/quickstart-first.js'

const sources = [
  { id: 'business.name', type: 'name', branch: 'unspecified', text: 'Mizuren' },
  {
    id: 'business.hours',
    type: 'opening-hours',
    branch: 'unspecified',
    text: 'Open from 12 PM to 12 AM daily'
  }
]
const records = [
  {
    key: 'home',
    copy: {
      body: '<section class="cards"><h2>Our history</h2><div class="card"><strong>1998</strong><p>Founded in Russia</p><picture><source srcset="demo-small.jpg 390w, demo.jpg 1440w"><img src="demo.jpg" class="cover"></picture></div></section><!-- wp:group {"className":"keep"} -->'
    }
  }
]

test('native copy inventory includes numeric-only claims without touching CSS/configuration', () => {
  const result = nativeCopyBindings(
    { title: 'Story', phone: '+971 58 555 0179', params: { moduleclass_sfx: 'mod-foo', layout: 'default' } },
    ['title', 'phone']
  )
  assert.equal(result.copy['["phone"]'], '+971 58 555 0179')
  assert.ok(!Object.keys(result.copy).some((k) => k.includes('params')))
  assert.ok(quickstartTextRanges('<strong>98%</strong>').some((r) => r.sample === '98%'))
})

test('editorial changes text occurrences and retains cards, picture/srcset and Gutenberg markup', () => {
  const { slots } = quickstartEditorialInventory(records)
  const changes = slots.map((s, n) => ({ key: s.key, value: ['Dining at Mizuren', '12', 'Open daily'][n] }))
  const next = applyQuickstartEditorial(records, slots, changes)[0].copy.body
  assert.match(next, /<h2>Dining at Mizuren<\/h2>/)
  assert.match(next, /<strong>12<\/strong>/)
  assert.match(next, /<source srcset="demo-small.jpg 390w, demo.jpg 1440w">/)
  assert.match(next, /<!-- wp:group {"className":"keep"} -->/)
  assert.equal((next.match(/class="card"/g) ?? []).length, 1)
})

test('empty/missing/extra editorial fields cannot remove content or expand the write scope', () => {
  const slots = [{ key: 'heading', sample: 'History', maxWords: 4 }]
  for (const fields of [
    [],
    [{ key: 'heading', value: '', sourceIds: [], claimRefs: [] }],
    [{ key: 'unknown', value: 'Mizuren', sourceIds: ['business.name'], claimRefs: [] }]
  ])
    assert.throws(() =>
      validateQuickstartEditorial({ inputHash: 'a', fields }, { inputHash: 'a', slots, sources })
    )
})

test('a phone/name source cannot justify an award, founding date or percentage', () => {
  const slots = [{ key: 'heading', sample: 'History', maxWords: 10 }]
  for (const value of ['Award winning restaurant', 'Founded in 1998', '12% discount'])
    assert.throws(() =>
      validateQuickstartEditorial(
        { inputHash: 'a', fields: [{ key: 'heading', value, sourceIds: ['business.name'], claimRefs: [] }] },
        { inputHash: 'a', slots, sources }
      )
    )
})

test('typed numeric claim must preserve predicate, branch and exact source value', () => {
  const slots = [{ key: 'counter', sample: '1998', numeric: true, maxWords: 4 }]
  const fact = { id: 'business.hours', type: 'opening-hours', branch: 'unspecified', value: sources[1].text }
  const answer = {
    inputHash: 'a',
    fields: [{ key: 'counter', value: '12', sourceIds: ['business.hours'], claimRefs: [fact] }]
  }
  assert.equal(validateQuickstartEditorial(answer, { inputHash: 'a', slots, sources }).length, 1)
  answer.fields[0].claimRefs[0].type = 'promotion'
  assert.throws(
    () => validateQuickstartEditorial(answer, { inputHash: 'a', slots, sources }),
    /QUICKSTART_EDITORIAL_CLAIM/
  )
})

test('only a failed batch is repaired and the input includes the requested locale', async () => {
  let calls = 0
  const result = await editQuickstart({
    records: [{ key: 'home', copy: { title: 'History' } }],
    sources,
    locale: 'vi',
    generate: async ({ input }) => {
      calls++
      assert.equal(input.locale, 'vi')
      return {
        inputHash: input.inputHash,
        fields: input.fields.map((f) => ({
          key: f.key,
          value: calls === 1 ? '' : 'Mizuren',
          sourceIds: [0],
          claimRefs: []
        }))
      }
    }
  })
  assert.equal(calls, 2)
  assert.equal(result.records[0].copy.title, 'Mizuren')
})

test('facts and real review excerpts are pinned by code rather than rewritten by a model', () => {
  const record = {
    key: 'testimonials',
    copy: { quote: 'Lovely food and service', author: 'Sample Person', phone: '0123456789' },
    bindings: [
      { key: 'quote', path: ['reviews', 0, 'quote'] },
      { key: 'author', path: ['reviews', 0, 'author'] },
      { key: 'phone', path: ['phone'] }
    ]
  }
  const pins = quickstartFactCopy(record, { phone: '+971 58 555 0179' }, [
    { text: 'The food was fresh and the service was warm.', author: 'Real Guest', provider: 'Google Reviews' }
  ])
  assert.equal(pins.phone, '+971 58 555 0179')
  assert.equal(pins.author, 'Real Guest')
  assert.match(pins.quote, /Real Guest · Google Reviews/)
  assert.ok(pins.quote.startsWith('The food was fresh and the service was warm.'))
})

for (const platform of ['joomla', 'wordpress', 'emdash'])
  test(`${platform}: a historical build uses the old engine, never the new model/writer`, async () => {
    let called = 0
    const engine = createQuickstartFirstEngine({
      legacy: {
        prepare: async () => {
          called++
          return {}
        },
        apply: async () => ({ wrote: 1 })
      },
      woContent: { quickstartFor: async () => null },
      generateFor: () => {
        throw Error('wrong workflow')
      }
    })
    const prepared = await engine.prepare({ platform })
    await engine.apply({ platform }, prepared)
    assert.equal(called, 1)
  })

for (const [platform, retry] of [
  ['joomla', false],
  ['wordpress', false],
  ['emdash', false],
  ['emdash', 'hash'],
  ['emdash', 'seed'],
  ['emdash', 'unfilled-plan'],
  ['emdash', 'photos-complete'],
  ['emdash', 'photos-stale'],
  ['emdash', 'photos-copy-drift'],
  ['emdash', 'photos-missing-record']
])
  test(`${platform} ${retry || 'fresh'}: new workflow preserves records and never enters the pruning engine`, async () => {
    let old = 0,
      writes = 0
    const source = {
      id: 'build',
      revision_id: 'revision',
      brief: {
        quickstartWorkflow: 'quickstart-first/1',
        reviewMode: 'manual',
        business: { name: 'Mizuren', phone: '+971 58 555 0179', website: 'https://actual.example/' }
      },
      profile_effective: {},
      content: { writes: {} }
    }
    const data = {
        title: 'History',
        config: { mail: 'mailto:private@demo.test', link: 'https://private.example/' }
      },
      picked = nativeCopyBindings(data, ['title'])
    const record = { key: 'home', identity: { id: 'home' }, data, ...picked }
    const adapter = {
      ...identityReads('Mizuren'),
      records: [record],
      get: (d, p) => p.reduce((v, k) => v[k], d),
      patchData: (_r, c) => ({ ...record.data, title: c['["title"]'] }),
      write: async (r, d, save) => {
        writes++
        r.data = d
        await save({ state: 'verified' })
      }
    }
    if (retry) {
      source.content.writes['quickstart:inventory'] = {
        state: 'read',
        demoIdentity: 'Mizuren',
        structure: JSON.parse(JSON.stringify(nativeStructure(adapter.records)), (_key, value) =>
          value && !Array.isArray(value) && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).reverse())
            : value
        ),
        ...(retry === 'hash' ? { copyHash: quickstartCopyHash(adapter.records) } : {})
      }
      adapter.seedCopyUnchanged = retry !== 'hash'
      if (String(retry).startsWith('photos-')) {
        source.content.writes['quickstart:inventory'].copyHash = quickstartCopyHash(adapter.records)
        record.revision = 'verified-revision'
        source.content.writes['quickstart:pictures'] = { state: 'verified', report: { placed: 1, gaps: [] } }
        source.content.writes['quickstart:photo:home'] = {
          state: 'verified',
          after: {
            _rev: retry === 'photos-stale' ? 'changed-revision' : record.revision,
            item: { id: record.identity.id, data: structuredClone(record.data) }
          }
        }
      }
      if (retry === 'unfilled-plan')
        source.content.writes['quickstart:picture-plan'] = {
          state: 'planned',
          plan: { unfilled: [{ groupId: 'unfilled' }] }
        }
    }
    if (retry === 'photos-copy-drift') {
      delete source.content.writes['quickstart:photo:home']
      record.data.title = 'A human changed this'
    }
    if (retry === 'photos-missing-record') adapter.records = []
    const engine = createQuickstartFirstEngine({
      legacy: {
        prepare: async () => {
          old++
        },
        apply: async () => {
          old++
        }
      },
      woContent: {
        quickstartFor: async () => source,
        recordWrite: async (_id, key, value) => {
          source.content.writes[key] = value
        }
      },
      applyFor: () => async () => ({}),
      siteReader: async () => ({}),
      openNative: async () => adapter,
      realPictures: { forSite: async () => ({ pictures: [{ id: 'source' }] }) },
      placePictures: async () => ({ placed: 1, gaps: [] }),
      verifySite: async () => ({ state: 'passed', baseline: {} }),
      generateFor:
        async () =>
        async ({ input }) => ({
          inputHash: input.inputHash,
          fields: input.fields.map((f) => ({
            key: f.key,
            value: 'Mizuren',
            sourceIds: [0],
            claimRefs: []
          }))
        })
    })
    const ctx = {
      siteKey: 'allowed',
      email: 'owner',
      platform,
      normalized: { languages: ['en'] },
      time: () => {}
    }
    const prepared = await engine.prepare(ctx)
    if (['photos-stale', 'photos-copy-drift', 'photos-missing-record'].includes(retry)) {
      await assert.rejects(engine.apply(ctx, prepared), /QUICKSTART_RESUME_CONTENT_CHANGED/)
      assert.equal(writes, 0)
      return
    }
    const report = await engine.apply(ctx, prepared)
    assert.equal(old, 0)
    assert.equal(writes, 1)
    assert.equal(report.records, 1)
    assert.equal(record.data.title, 'Mizuren')
    assert.equal(record.data.config.mail, 'mailto:private@demo.test')
    assert.equal(record.data.config.link, 'https://private.example/')
    assert.equal(source.content.writes['quickstart:editorial-baseline'].records[0].data.title, 'History')
    assert.ok(source.content.writes['quickstart:editorial-baseline'].recordsHash)
  })

test('retry with prior inventory fails closed instead of adopting editor changes as a fresh baseline', async () => {
  const source = {
    id: 'build',
    brief: { business: { name: 'Mizuren' } },
    profile_effective: {},
    content: { writes: { 'quickstart:inventory': { state: 'read' } } }
  }
  const engine = createQuickstartFirstEngine({
    woContent: { quickstartFor: async () => source },
    legacy: {},
    generateFor: () => {
      throw Error('must not call model')
    }
  })
  const ctx = { normalized: { languages: ['en'] } }
  const prepared = await engine.prepare(ctx)
  await assert.rejects(engine.apply(ctx, prepared), /QUICKSTART_RESUME_REQUIRES_RECONCILIATION/)
})

test('one photo replacement updates picture sources and srcset while retaining card layout', () => {
  const html =
    '<div class="card"><picture><source type="image/webp" srcset="old.webp 390w, old-wide.webp 1440w"><img class="cover" src="old.jpg" srcset="old.jpg 390w, old-wide.jpg 1440w" alt="Dining room"></picture></div>'
  assert.equal(responsivePictures(html).length, 1)
  const next = replaceResponsivePicture(html, 'old.jpg', '/real.jpg', 900)
  assert.match(next, /class="card"/)
  assert.match(next, /class="cover"/)
  assert.match(next, /image\/jpeg/)
  assert.doesNotMatch(next, /old(?:-wide)?\.(?:webp|jpg)/)
  assert.match(next, /real.jpg 900w/)
})

test('native inventory preserves a refused content door code before reading or writing records', async () => {
  for (const platform of ['wordpress', 'joomla']) {
    let calls = 0
    await assert.rejects(
      openNativeQuickstart({
        ctx: { platform },
        apply: async () => {
          calls++
          return { ok: false, code: 'COMPONENT_NOT_REGISTERED' }
        }
      }),
      { code: 'COMPONENT_NOT_REGISTERED' }
    )
    assert.equal(calls, 1)
  }
})

test('WordPress inventory reads published items from the native status field', async () => {
  const item = {
    id: 42,
    post_type: 'page',
    post_status: 'publish',
    post_title: 'Home',
    post_content: '<h2>Welcome</h2>',
    post_excerpt: ''
  }
  const adapter = await openNativeQuickstart({
    ctx: { platform: 'wordpress' },
    apply: async ({ action, params }) => {
      if (action === 'content.list')
        return { items: params.post_type === 'page' ? [{ id: 42, type: 'page', status: 'publish' }] : [] }
      if (action === 'content.get') return { item }
      throw Error('unexpected mutation')
    }
  })
  assert.equal(adapter.records.length, 1)
  assert.equal(adapter.records[0].copy['["post_title"]'], 'Home')
})

test('Joomla reads exact contract text paths and keeps module classes outside copy scope', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qs-contract-test-'))
  try {
    writeFileSync(
      join(dir, 'content-map.json'),
      JSON.stringify({
        entities: [{ key: 'module-7', kind: 'module', sourceId: 7 }],
        slots: [
          { entity: 'module-7', column: 'params', type: 'text', jsonPath: ['title'], maxCharacters: 30 }
        ]
      })
    )
    const adapter = await openNativeQuickstart({
      ctx: { platform: 'joomla', contract: { dir } },
      apply: async ({ action, params }) => {
        if (action === 'content.list')
          return { items: params.kind === 'module' ? [{ id: 7, published: 1 }] : [] }
        return {
          item: {
            id: 7,
            title: 'Welcome',
            client_id: 0,
            params: JSON.stringify({ title: 'Sample heading', moduleclass_sfx: 'container grid' })
          }
        }
      }
    })
    const record = adapter.records[0]
    assert.equal(record.copy['["params","title"]'], 'Sample heading')
    assert.equal(
      Object.keys(record.copy).some((k) => k.includes('moduleclass_sfx')),
      false
    )
    const next = adapter.patchData(record, { ...record.copy, '["params","title"]': 'Mizuren' })
    assert.equal(next.params.moduleclass_sfx, 'container grid')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('manual review skips the browser but still checks identity and native structure', async () => {
  const { nativeStructure } = await import('../src/sites/brief-engines/quickstart-native.js')
  const { createHash } = await import('node:crypto')
  const { quickstartCopyHash } = await import('../src/sites/brief-engines/quickstart-first.js')
  const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
  const data = { title: 'Mizuren' },
    record = { key: 'home', data, ...nativeCopyBindings(data, ['title']) }
  const source = {
    id: 'build',
    brief: { reviewMode: 'manual', business: { name: 'Mizuren' } },
    content: { writes: {} }
  }
  let reads = 0
  const engine = createQuickstartFirstEngine({
    legacy: {},
    siteReader: async () => ({}),
    applyFor: () => async () => ({}),
    woContent: {
      recordWrite: async (_, key, value) => {
        source.content.writes[key] = value
      }
    },
    verifySite: () => {
      throw Error('Browser must not run')
    },
    openNative: async () => {
      reads++
      return { records: [record], ...identityReads('Mizuren') }
    }
  })
  const report = {
    workflow: 'quickstart-first/1',
    copyHash: quickstartCopyHash([record]),
    structureHash: hash(nativeStructure([record])),
    photos: { gaps: [] }
  }
  await engine.verify({ platform: 'wordpress' }, { source, checkAllowed: async () => {} }, report)
  assert.equal(reads, 1)
  assert.equal(source.content.writes['quickstart:qa'].state, 'needs-review')
  assert.equal(source.content.writes['quickstart:qa'].machineChecks.identity.actual, 'Mizuren')
  record.data.title = '<div>Changed layout</div>'
  await assert.rejects(
    engine.verify({ platform: 'wordpress' }, { source, checkAllowed: async () => {} }, report),
    /COPY_CHANGED|STRUCTURE_CHANGED/
  )
})

test('a receipt write failure is terminal and cannot trigger a second model call', async () => {
  let calls = 0
  await assert.rejects(
    editQuickstart({
      records: [{ key: 'home', copy: { title: 'History' } }],
      sources,
      generate: async ({ input }) => {
        calls++
        return {
          inputHash: input.inputHash,
          fields: input.fields.map((f) => ({ key: f.key, value: 'Mizuren', sourceIds: [0], claimRefs: [] }))
        }
      },
      recordBatch: async () => {
        throw Error('receipt store unavailable')
      }
    }),
    /receipt store unavailable/
  )
  assert.equal(calls, 1)
})

test('terminal batch failure waits for an in-flight sibling without starting another batch', async () => {
  const rows = [0, 1, 2].map((i) => ({ key: `row-${i}`, copy: { title: 'History' } }))
  let calls = 0,
    settled = false,
    stopped = 0
  const generate = async ({ input }) => {
    calls++
    if (calls === 1) throw Error('known provider failure')
    await new Promise((r) => setTimeout(r, 10))
    settled = true
    return {
      inputHash: input.inputHash,
      fields: input.fields.map((f) => ({ key: f.key, value: 'Mizuren', sourceIds: [0], claimRefs: [] }))
    }
  }
  generate.stopDispatch = () => {
    stopped++
  }
  await assert.rejects(
    editQuickstart({ records: rows, sources, generate, batchSize: 1 }),
    /known provider failure/
  )
  assert.equal(calls, 2)
  assert.equal(settled, true)
  assert.ok(stopped >= 1)
})

test('successive native writes never restore CMS-maintained modification fields', async () => {
  let item = {
    ID: 42,
    post_type: 'page',
    post_status: 'publish',
    post_title: 'Home',
    post_content: 'Welcome',
    post_excerpt: '',
    post_modified: 'a'
  }
  const writes = []
  const adapter = await openNativeQuickstart({
    ctx: { platform: 'wordpress', runId: 'test' },
    apply: async ({ action, params }) => {
      if (action === 'content.list')
        return { items: params.post_type === 'page' ? [{ id: 42, status: 'publish' }] : [] }
      if (action === 'content.get') return { item: structuredClone(item) }
      if (action === 'content.update') {
        writes.push(params.fields)
        item = { ...item, ...params.fields, post_modified: 'b' }
        return { ok: true }
      }
      throw Error('unexpected action')
    }
  })
  const record = adapter.records[0]
  await adapter.write(record, { ...record.data, post_title: 'Mizuren' })
  assert.equal(record.data.post_modified, 'b')
  assert.deepEqual(record.data, record.raw)
  await adapter.write(record, { ...record.data, post_title: 'Visit Mizuren' })
  assert.equal(writes.length, 2)
  assert.equal(
    writes.some((fields) => Object.hasOwn(fields, 'post_modified')),
    false
  )
})

test('editorial fact guard accepts sourced phone and website and rejects an unrelated contact', () => {
  for (const [type, text, bad] of [
    ['phone', '+971 58 555 0179', '+971 58 111 1111'],
    ['website', 'https://mizurendubai.example/', 'https://unrelated-business.test/']
  ]) {
    const source = { id: `business.${type}`, type, branch: 'unspecified', text }
    const slot = { key: 'contact', sample: 'Contact the demo', maxWords: 8 }
    const field = {
      key: slot.key,
      value: text,
      sourceIds: [source.id],
      claimRefs: [
        {
          id: source.id,
          type,
          branch: source.branch,
          value: text
        }
      ]
    }
    const options = { inputHash: 'contact', slots: [slot], sources: [source] }
    assert.doesNotThrow(() => validateQuickstartEditorial({ inputHash: 'contact', fields: [field] }, options))
    assert.throws(
      () =>
        validateQuickstartEditorial({ inputHash: 'contact', fields: [{ ...field, value: bad }] }, options),
      { code: 'QUICKSTART_EDITORIAL_CLAIM' }
    )
  }
})

test('repair sends only invalid keys with original indices and retains valid siblings', async () => {
  let calls = 0
  const result = await editQuickstart({
    records: [{ key: 'home', copy: { title: 'History', body: 'The demo company' } }],
    sources,
    generate: async ({ input }) => {
      calls++
      if (calls === 2) {
        assert.deepEqual(
          input.fields.map((f) => f.key),
          [1]
        )
        assert.equal(input.acceptedContext[0].value, 'Mizuren')
      }
      return {
        inputHash: input.inputHash,
        fields: input.fields.map((f) => ({
          key: f.key,
          value: calls === 1 && f.key === 1 ? '' : 'Mizuren',
          sourceIds: [0],
          claimRefs: []
        }))
      }
    }
  })
  assert.equal(calls, 2)
  assert.equal(result.records[0].copy.title, 'Mizuren')
  assert.equal(result.records[0].copy.body, 'Mizuren')
})

test('numeric decoding preserves a finite numeric value without granting factual support', () => {
  const slots = [{ key: 'stat', numeric: true, sample: '1998', maxWords: 4 }]
  const parsed = expandQuickstartEditorial(
    { inputHash: 'n', fields: [{ key: 0, value: 12, sourceIds: [1], claimRefs: [1] }] },
    { slots, sources }
  )
  assert.equal(parsed.fields[0].value, '12')
  assert.doesNotThrow(() => validateQuickstartEditorial(parsed, { inputHash: 'n', slots, sources }))
  parsed.fields[0].value = '1998'
  assert.throws(() => validateQuickstartEditorial(parsed, { inputHash: 'n', slots, sources }))
})

test('verified native list ordinals stay exact without treating statistics as structure', async () => {
  const record = {
    key: 'home',
    data: { process: [{ number: '01' }, { number: '02' }], stats: [{ number: '1240' }] },
    copy: { a: '01', b: '02', c: '1240' },
    bindings: [
      { key: 'a', path: ['process', 0, 'number'], role: 'ordinal' },
      { key: 'b', path: ['process', 1, 'number'], role: 'ordinal' },
      { key: 'c', path: ['stats', 0, 'number'] }
    ]
  }
  const inventory = quickstartEditorialInventory([record])
  assert.deepEqual(
    inventory.slots.map((s) => s.structural),
    [true, true, false]
  )
  const result = await editQuickstart({
    records: [record],
    sources,
    generate: async ({ input }) => {
      assert.equal(input.fields.length, 1)
      assert.equal(input.fields[0].sample, '1240')
      return { inputHash: input.inputHash, fields: [{ key: 0, value: '12', sourceIds: [1], claimRefs: [1] }] }
    }
  })
  assert.deepEqual(result.records[0].copy, { a: '01', b: '02', c: '12' })
  const slot = inventory.slots[0]
  assert.throws(() =>
    validateQuickstartEditorial(
      { inputHash: 's', fields: [{ key: slot.key, value: '99' }] },
      { inputHash: 's', slots: [slot], sources }
    )
  )
})

test('contact destinations use real facts and keep internal navigation and element layout', async () => {
  const { quickstartContactFacts } = await import('../src/sites/brief-engines/quickstart-facts.js')
  const original =
    '<section class="grid"><a class="phone" href="tel:800123456">Call</a><a href="mailto:demo@example.org"><svg></svg>Email us</a><a href="/services">Services</a><iframe width="400" src="https://yandex.ru/map-widget/v1/?old=1"></iframe></section>'
  const bound = quickstartContactFacts(
    { html: original },
    { phone: '+971 58 555 0179', website: 'https://mizurendubai.example/', address: 'Umm Hurair 1, Dubai' }
  ).html
  assert.match(bound, /href="tel:\+971585550179"/)
  assert.match(bound, /href="https:\/\/mizurendubai.example\/"/)
  assert.match(bound, /<svg><\/svg>https:\/\/mizurendubai.example\//)
  assert.match(bound, /href="\/services">Services/)
  assert.match(bound, /src="https:\/\/maps.google.com\/maps\?q=Umm%20Hurair%201%2C%20Dubai&amp;output=embed"/)
  assert.match(bound, /<section class="grid">/)
  assert.match(bound, /iframe width="400"/)
})

test('derived counts use declared semantic roles and structured facts across languages', async () => {
  const { quickstartDerivedCount } = await import('../src/sites/brief-engines/quickstart-derived-facts.js')
  const hours = {
    id: 'business.hours',
    type: 'opening-hours',
    value: JSON.stringify({
      periods: [
        { open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } },
        { open: { day: 2, hour: 9 }, close: { day: 2, hour: 17 } }
      ]
    })
  }
  assert.equal(quickstartDerivedCount(hours, { semanticRole: 'open-days' }).number, 2)
  assert.equal(quickstartDerivedCount(hours, { semanticRole: 'years' }), null)
  assert.equal(
    quickstartDerivedCount({ ...hours, value: '["Lundi: 09:00–18:00"]' }, { semanticRole: 'open-days' }),
    null
  )
  const social = {
    id: 'business.socials',
    value: JSON.stringify({
      website: 'https://mastodon.example/@business',
      instagram: 'https://instagram.com/business'
    })
  }
  assert.equal(quickstartDerivedCount(social, { semanticRole: 'social-profiles' }).number, 2)
  assert.equal(quickstartDerivedCount(social, { semanticRole: 'restaurant-locations' }), null)
})

test('explicit typed claim citations are normalized without inventing an uncited source', () => {
  const slots = [{ key: 'n', sample: '1998', numeric: true, maxWords: 4 }]
  const result = expandQuickstartEditorial(
    { inputHash: 'n', fields: [{ key: 0, value: '12', sourceIds: [0], claimRefs: [1] }] },
    { slots, sources }
  )
  assert.deepEqual(result.fields[0].sourceIds, ['business.name', 'business.hours'])
  assert.equal(result.fields[0].citationNormalization, 'explicit-claim-source-union/1')
  assert.doesNotThrow(() => validateQuickstartEditorial(result, { inputHash: 'n', slots, sources }))
})

test('settled editorial output is reused without a new call and cannot grant a third schema repair', async () => {
  const paid = []
  const localRecords = [{ key: 'home', copy: { title: 'History' } }]
  await editQuickstart({
    records: localRecords,
    sources,
    generate: async ({ input }) => {
      const result = {
        inputHash: input.inputHash,
        fields: [{ key: 0, value: 'Mizuren', sourceIds: [0], claimRefs: [] }]
      }
      paid.push({ attemptId: 'paid', input, result })
      return result
    }
  })
  const cached = async () => {
    throw Error('must not dispatch again')
  }
  cached.lookupEditorial = async () => paid
  const result = await editQuickstart({ records: localRecords, sources, generate: cached })
  assert.equal(result.records[0].copy.title, 'Mizuren')
  cached.lookupEditorial = async () =>
    [paid[0], { ...paid[0], attemptId: 'repair' }].map((p) => ({
      ...p,
      result: { ...p.result, fields: [{ ...p.result.fields[0], value: '' }] }
    }))
  await assert.rejects(
    editQuickstart({ records: localRecords, sources, generate: cached }),
    /QUICKSTART_EDITORIAL_SCHEMA/
  )
})

test('manual resume requires the exact full snapshot and never places photos again', async () => {
  const { createHash } = await import('node:crypto')
  for (const changed of [false, true]) {
    const data = { title: 'History' },
      picked = nativeCopyBindings(data, ['title'])
    const record = { key: 'home', identity: { id: 'home' }, data, ...picked }
    const baseline = structuredClone([record])
    const source = {
      id: 'build',
      revision_id: 'revision',
      brief: { reviewMode: 'manual', business: { name: 'Mizuren' } },
      profile_effective: {},
      content: {
        writes: {
          'quickstart:inventory': { state: 'read' },
          'quickstart:pictures': { state: 'verified', report: { placed: 1, gaps: [], receipts: [] } },
          'quickstart:editorial-baseline': {
            records: baseline,
            recordsHash: createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),
            recordsSemanticHash: qualityHash(
              JSON.parse(JSON.stringify(baseline), (_key, value) =>
                value && !Array.isArray(value) && typeof value === 'object'
                  ? Object.fromEntries(Object.entries(value).reverse())
                  : value
              )
            )
          }
        }
      }
    }
    if (changed) record.data.title = 'Someone edited this'
    let calls = 0
    const engine = createQuickstartFirstEngine({
      legacy: {},
      woContent: {
        quickstartFor: async () => source,
        recordWrite: async (_id, key, value) => {
          source.content.writes[key] = value
        }
      },
      applyFor: () => async () => ({}),
      siteReader: async () => ({}),
      openNative: async () => ({
        ...identityReads('Mizuren'),
        records: [record],
        get: (d, p) => p.reduce((v, k) => v[k], d),
        patchData: (_r, copy) => ({ title: copy['["title"]'] }),
        write: async (r, d, save) => {
          r.data = d
          await save({ state: 'verified' })
        }
      }),
      realPictures: {
        forSite: () => {
          throw Error('must not relabel photos')
        }
      },
      placePictures: () => {
        throw Error('must not place photos twice')
      },
      generateFor:
        async () =>
        async ({ input }) => {
          calls++
          return {
            inputHash: input.inputHash,
            fields: input.fields.map((f) => ({ key: f.key, value: 'Mizuren', sourceIds: [0], claimRefs: [] }))
          }
        }
    })
    const ctx = {
      platform: 'wordpress',
      siteKey: 'allowed',
      email: 'owner',
      normalized: { languages: ['en'] },
      time: () => {}
    }
    const prepared = await engine.prepare(ctx)
    if (changed) {
      await assert.rejects(engine.apply(ctx, prepared), /QUICKSTART_RESUME_CONTENT_CHANGED/)
      assert.equal(calls, 0)
    } else {
      await engine.apply(ctx, prepared)
      assert.equal(calls, 1)
      assert.equal(record.data.title, 'Mizuren')
    }
  }
})

test('a typed Joomla recipient never becomes an invented email or a website encoded as an email', async () => {
  const { quickstartContactFacts } = await import('../src/sites/brief-engines/quickstart-facts.js')
  const data = {
    email_to: 'https://mizurendubai.example/',
    webpage: 'https://demo.invalid/',
    misc: 'Visit our restaurant'
  }
  assert.deepEqual(quickstartContactFacts(data, { website: 'https://mizurendubai.example/' }), {
    email_to: '',
    webpage: 'https://mizurendubai.example/',
    misc: 'Visit our restaurant'
  })
})

test('a paid paragraph gets no exception for matching one demo-specific sentence', () => {
  const review = {
    id: 'profile.reviews.0',
    type: 'story',
    branch: 'unspecified',
    text: 'A guest enjoyed unlimited sushi.'
  }
  const value =
    'Offers mentioned in guest reviews, such as unlimited sushi, are not guaranteed by the restaurant. Contact the restaurant directly for current menu and promotions.'
  assert.throws(
    () =>
      validateQuickstartEditorial(
        { inputHash: 'x', fields: [{ key: 'x', value, sourceIds: [review.id], claimRefs: [] }] },
        { inputHash: 'x', slots: [{ key: 'x', sample: 'Terms', maxWords: 48 }], sources: [review] }
      ),
    /CLAIM/
  )
})

function identityReads(name) {
  return {
    call: async () => ({ item: { value: name }, fields: { sitename: name } }),
    api: async () => ({ title: name })
  }
}

test('all CMS identities are written and read back without a logo or theme-specific identity', async () => {
  const { quickstartIdentity } = await import('../src/sites/brief-engines/quickstart-identity.js')
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    let name = 'Demo brand',
      writes = 0
    const call = async (action, params) => {
      if (action === 'content.update') {
        name = params.fields.value
        writes++
      }
      if (action === 'site.identity' && params.operation === 'set') {
        name = params.fields.sitename
        writes++
      }
      return { item: { value: name }, fields: { sitename: name } }
    }
    const api = async (method, _path, body) => {
      if (method === 'POST') {
        name = body.title
        writes++
      }
      return { title: name }
    }
    const receipt = await quickstartIdentity({
      adapter: { call, api },
      ctx: { platform, runId: 'test' },
      name: 'Actual Business',
      write: true
    })
    assert.equal(name, 'Actual Business')
    assert.equal(writes, 1)
    assert.equal(receipt.actual, 'Actual Business')
    await assert.rejects(
      quickstartIdentity({ adapter: { call, api }, ctx: { platform }, name: 'Different Business' }),
      /READBACK_FAILED/
    )
  }
})

test('numeric storage is inventoried and restored as a number; undeclared numeric renderers stay constrained', () => {
  const data = { stats: [{ label: 'Years', value: 1998 }] },
    picked = nativeCopyBindings(data, ['stats'])
  assert.equal(picked.copy['["stats",0,"value"]'], 1998)
  const record = { key: 'home', data, ...picked }
  const inventory = quickstartEditorialInventory([record])
  const valueSlot = inventory.slots.find((slot) => slot.field.includes('value'))
  assert.equal(valueSlot.numeric, true)
  const changed = applyQuickstartEditorial(
    [record],
    inventory.slots,
    inventory.slots.map((slot) => ({ key: slot.key, value: slot === valueSlot ? '12' : 'Open' }))
  )
  assert.equal(typeof changed[0].copy['["stats",0,"value"]'], 'number')
  assert.equal(changed[0].copy['["stats",0,"value"]'], 12)
  const stringRecord = {
    key: 'other',
    copy: { year: '2024' },
    bindings: [{ key: 'year', path: ['year'], renderer: 'text' }]
  }
  assert.equal(quickstartEditorialInventory([stringRecord]).slots[0].numeric, false)
  delete stringRecord.bindings[0].renderer
  assert.equal(quickstartEditorialInventory([stringRecord]).slots[0].numeric, true)
})

test('lazy images, source-only pictures and CSS URLs are replaced without editing other CSS', () => {
  const html =
    '<section class="cards" style="background-image:url(\'demo-bg.jpg\');padding:12px"><picture><source data-srcset="demo.webp 800w"><img src="placeholder.gif" data-src="demo.jpg" data-srcset="demo.jpg 800w"></picture><picture><source srcset="source-only.webp 800w"></picture><style>.hero{background:url("sheet-bg.jpg");color:red}</style></section>'
  const groups = responsivePictures(html)
  assert.deepEqual(
    groups.map((g) => g.file).sort(),
    ['demo-bg.jpg', 'demo.jpg', 'sheet-bg.jpg', 'source-only.webp'].sort()
  )
  let next = html
  for (const group of groups) next = replaceResponsivePicture(next, group.file, '/real.jpg', 900)
  assert.doesNotMatch(next, /demo-bg|demo\.jpg|demo\.webp|source-only|sheet-bg|placeholder/)
  assert.match(next, /padding:12px/)
  assert.match(next, /color:red/)
  assert.match(next, /class="cards"/)
  assert.match(next, /data-srcset="\/real.jpg 900w"/)
  const brand =
    '<div class="wp-block-site-logo"><img src="brand.jpg"></div><img alt="Logo shaped cake" src="cake.jpg">'
  assert.equal(responsivePictures(brand)[0].role, 'brand')
  assert.equal(responsivePictures(brand)[1].role, 'content')
})

test('review excerpts retain their provider, original language and source metadata', async () => {
  const { quickstartReviews } = await import('../src/lib/quickstart-reviews.js')
  const reviews = quickstartReviews({
    googlePlace: {
      reviews: [
        {
          text: 'Très bon.',
          author: 'Marie',
          language: 'fr',
          googleMapsUri: 'https://maps.google.com/review/1'
        }
      ]
    },
    reviews: [
      {
        text: 'Rất ngon.',
        author: 'Lan',
        provider: 'Tripadvisor',
        url: 'https://tripadvisor.com/review/2',
        language: 'vi'
      }
    ]
  })
  assert.equal(reviews.length, 2)
  assert.equal(reviews[1].provenance.provider, 'Tripadvisor')
  assert.equal(reviews[1].provenance.language, 'vi')
  const record = {
    key: 'testimonials',
    copy: { quote: 'Demo review' },
    bindings: [{ key: 'quote', path: ['items', 1, 'quote'], role: 'review-text' }]
  }
  const pins = quickstartFactCopy(record, {}, reviews)
  assert.match(pins.quote, /Rất ngon\. — Lan · Tripadvisor/)
  assert.doesNotMatch(pins.quote, /Google/)
  assert.equal(quickstartReviews({ reviews: [{ text: 'No source', author: 'Unknown' }] }).length, 0)
})

test('external business links require a known source or explicit role and leave navigation intact', async () => {
  const { quickstartLinks } = await import('../src/sites/brief-engines/quickstart-links.js')
  const business = {
    website: 'https://actual.example/',
    socials: { instagram: 'https://instagram.com/actual' }
  }
  const linked = quickstartLinks(
    {
      html: '<a href="/about">About</a><a data-tracy-role="website" href="https://demo.example/">Site</a><a rel="me" href="https://instagram.com/demo">Instagram</a><form action="https://unknown.example/submit"></form>'
    },
    business,
    { base: 'https://site.example/' }
  )
  assert.match(linked.data.html, /href="\/about"/)
  assert.match(linked.data.html, /href="https:\/\/actual.example\/"/)
  assert.match(linked.data.html, /href="https:\/\/instagram.com\/actual"/)
  assert.equal(linked.unresolved.length, 1)
  assert.equal(linked.receipts.length, 2)
})

test('WordPress discovers custom types, theme files and settings while preserving option configuration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qs-native-generic-'))
  try {
    writeFileSync(
      join(dir, 'content-map.json'),
      JSON.stringify({
        entities: [],
        slots: [{ type: 'text', target: { option: 'theme_custom', jsonPath: ['footer', 'copy'] } }]
      })
    )
    const options = {
      blogname: 'Demo',
      blogdescription: 'Demo tagline',
      sidebars_widgets: { sidebar: ['text-2'], wp_inactive_widgets: ['text-3'] },
      widget_text: {
        2: { title: 'About us', text: 'Demo copy', filter: true },
        3: { title: 'Inactive' },
        _multiwidget: 1
      },
      theme_custom: { footer: { copy: 'Demo footer' }, layout: 'grid', secret: 'do-not-send' }
    }
    const item = {
      id: 9,
      post_type: 'portfolio',
      post_status: 'publish',
      post_title: 'Demo project',
      post_content: '<p>Demo project copy</p>'
    }
    const calls = []
    const adapter = await openNativeQuickstart({
      ctx: { platform: 'wordpress', contract: { dir } },
      reader: {
        text: async () =>
          JSON.stringify({ portfolio: { rest_base: 'portfolio' }, attachment: { rest_base: 'media' } })
      },
      apply: async ({ action, params }) => {
        calls.push({ action, params })
        if (action === 'content.list')
          return {
            items:
              params.kind === 'templatePart'
                ? [{ key: 'header', stored: false }]
                : params.kind === 'template'
                  ? [{ key: 'front-page', stored: false }]
                  : params.post_type === 'portfolio'
                    ? [{ id: 9, status: 'publish' }]
                    : []
          }
        if (params.kind === 'option') return { item: { value: structuredClone(options[params.key]) } }
        if (params.kind === 'templatePart' || params.kind === 'template')
          return { stored: false, item: { content: '<h2>Demo theme title</h2>' } }
        return { item }
      }
    })
    assert.ok(adapter.records.some((r) => r.key === 'post/9'))
    assert.ok(adapter.records.some((r) => r.key === 'templatePart/header'))
    assert.ok(adapter.records.some((r) => r.key === 'template/front-page'))
    assert.equal(adapter.records.find((r) => r.key === 'option/blogname').bindings[0].role, 'name')
    const custom = adapter.records.find((r) => r.key === 'option/theme_custom')
    assert.deepEqual(Object.keys(custom.copy), ['["value","footer","copy"]'])
    assert.ok(!JSON.stringify(custom.copy).includes('do-not-send'))
    const widget = adapter.records.find((r) => r.key === 'option/widget_text')
    assert.ok(!Object.keys(widget.copy).some((key) => key.includes('filter')))
    assert.equal(widget.data.value[2].filter, true)
    assert.ok(!adapter.coverage.some((entry) => entry.state === 'required-unresolved'))
    assert.ok(calls.some((call) => call.params.post_type === 'portfolio'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('visible HTML attributes and contact text are covered without changing attribute names or links', async () => {
  const record = {
    key: 'contact',
    copy: {
      body: '<a class="phone" href="tel:800123456" title="Demo Company">800123456</a><input placeholder="Demo Company">'
    }
  }
  const result = await editQuickstart({
    records: [record],
    sources: [
      ...sources,
      { id: 'business.phone', type: 'phone', branch: 'unspecified', text: '+971 58 555 0179' }
    ],
    generate: async ({ input }) => ({
      inputHash: input.inputHash,
      fields: input.fields.map((field) => ({
        key: field.key,
        value: 'Mizuren',
        sourceIds: [0],
        claimRefs: []
      }))
    })
  })
  assert.match(result.records[0].copy.body, /title="Mizuren"/)
  assert.match(result.records[0].copy.body, /placeholder="Mizuren"/)
  assert.match(result.records[0].copy.body, />\+971 58 555 0179<\/a>/)
  assert.match(result.records[0].copy.body, /class="phone"/)
  assert.match(result.records[0].copy.body, /href="tel:800123456"/)
})

test('demo identity residue includes visible attributes but ignores technical theme paths', async () => {
  const { quickstartDemoResidue } = await import('../src/sites/brief-engines/quickstart-coverage.js')
  const found = quickstartDemoResidue(
    [
      {
        key: 'home',
        copy: { body: '<img src="ja-essence/logo.jpg" alt="JA Essence"><h1>Actual Business</h1>' }
      }
    ],
    'JA Essence',
    'Actual Business'
  )
  assert.equal(found.length, 1)
  assert.equal(
    quickstartDemoResidue(
      [{ key: 'home', copy: { body: '<img src="ja-essence/logo.jpg" alt="Actual Business">' } }],
      'JA Essence',
      'Actual Business'
    ).length,
    0
  )
})

test('a demo logo requires a proved contract fallback and verifies the cleared CMS option', async () => {
  const { quickstartBrandFallback } = await import('../src/sites/brief-engines/quickstart-brand-fallback.js')
  const options = { site_logo: 42, tracy_logo_dark: 43 }
  const adapter = {
    call: async (action, params) => {
      if (action === 'content.update') options[params.key] = params.fields.value
      return { item: { value: options[params.key] } }
    }
  }
  const photos = { excluded: [{ reason: 'brand', writerTarget: 'wordpress:site_logo' }] }
  const ctx = {
    platform: 'wordpress',
    runId: 'test',
    contract: {
      dir: new URL(
        '../../../packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.19',
        import.meta.url
      ).pathname
    }
  }
  await quickstartBrandFallback({ adapter, ctx, photos })
  assert.equal(options.site_logo, 0)
  assert.equal(options.tracy_logo_dark, 0)
  await quickstartBrandFallback({ adapter, ctx, photos, verify: true })
  await assert.rejects(
    quickstartBrandFallback({ adapter: { call: async () => ({ ok: false }) }, ctx, photos }),
    /READBACK_FAILED/
  )
  await assert.rejects(
    quickstartBrandFallback({
      adapter,
      ctx: { ...ctx, brief: { brand: { logo: { main: 'valid-upload-id' } } } },
      photos: { excluded: [{ reason: 'logo' }] }
    }),
    /WRITER_UNPROVEN/
  )
  await assert.rejects(
    quickstartBrandFallback({ adapter, ctx: { platform: 'emdash' }, photos }),
    /FALLBACK_UNPROVEN/
  )
})

test('cache-only recovery blocks text and vision before any ledger claim or provider dispatch', async () => {
  const { createQuickstartModel } = await import('../src/opportunities-build/quickstart-model.js')
  const { qualityExecutionProfile, qualityExecutionModel } = await import(
    '../src/opportunities-build/quality-execution-profile.js'
  )
  const { qualityHash } = await import('../src/opportunities-build/quality-dossier.js')
  const profile = qualityExecutionProfile('quickstart-first-v1')
  const source = {
    account_id: 'account',
    revision_id: 'revision',
    profile_effective: {},
    brief: { executionProfile: profile }
  }
  const config = (role) => ({ role, model: 'synthetic', hash: 'configured', capabilities: { vision: true } })
  const models = Object.fromEntries(
    ['plan', 'observations'].map((role) => [role, qualityExecutionModel(config(role), profile)])
  )
  const root = {
    id: 'run',
    input: {
      siteKey: 'allowed',
      sourceHash: qualityHash({
        revisionId: source.revision_id,
        profile: source.profile_effective,
        brief: source.brief
      }),
      models
    }
  }
  const queries = []
  const make = createQuickstartModel({
    pool: {
      query: async (sql) => {
        queries.push(sql)
        if (sql.startsWith('select * from wo_quality_run')) return { rows: [root] }
        throw Error('Unexpected database mutation')
      }
    },
    secret: 'synthetic',
    ledger: {
      reserve: () => {
        throw Error('Must not reserve')
      }
    },
    runtime: async () => ({ settings: { researchDailyCapCents: 10000, researchJobCapCents: 200 } }),
    modelFor: async ({ role }) => ({
      config: config(role),
      credential: { baseUrl: 'https://synthetic.example' }
    }),
    providerCall: () => {
      throw Error('Must not dispatch')
    },
    allowProviderCalls: false
  })
  const generate = await make({ ctx: { siteKey: 'allowed' }, source, checkAllowed: async () => {} })
  await assert.rejects(generate({ system: 'test', input: {}, maxTokens: 100 }), /REPLAY_CACHE_MISS/)
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  await assert.rejects(generate.vision.label({ pictures: [{ id: 'photo', bytes }] }), /REPLAY_CACHE_MISS/)
  assert.equal(queries.length, 1)
})

test('serialized option configuration only exposes declared JSON paths and records uncovered targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qs-option-scope-'))
  try {
    writeFileSync(
      join(dir, 'content-map.json'),
      JSON.stringify({
        entities: [],
        slots: [
          {
            key: 'footer',
            type: 'text',
            role: 'rating',
            renderer: 'text',
            maxCharacters: 50,
            target: { option: 'settings_json', jsonPath: ['footer', 'text'] }
          },
          { key: 'unsupported-image', type: 'image', target: { option: 'image_option' } }
        ]
      })
    )
    const raw = JSON.stringify({
      footer: { text: 'Demo footer' },
      secret: 'mailto:private@demo.test',
      layout: 'grid'
    })
    const item = {
      id: 1,
      post_type: 'post',
      post_status: 'publish',
      post_title: 'Demo',
      post_content: 'Demo'
    }
    const adapter = await openNativeQuickstart({
      ctx: { platform: 'wordpress', contract: { dir } },
      reader: { text: async () => JSON.stringify({ post: { rest_base: 'posts' } }) },
      apply: async ({ action, params }) => {
        if (action === 'content.list')
          return { items: params.post_type === 'post' ? [{ id: 1, status: 'publish' }] : [] }
        if (params.kind === 'option')
          return {
            item: {
              value: params.key === 'settings_json' ? raw : params.key === 'sidebars_widgets' ? {} : undefined
            }
          }
        return { item }
      }
    })
    const record = adapter.records.find((record) => record.key === 'option/settings_json')
    assert.deepEqual(Object.values(record.copy), ['Demo footer'])
    assert.equal(record.bindings[0].role, 'rating')
    assert.equal(record.bindings[0].renderer, 'text')
    assert.equal(record.bindings[0].maxCharacters, 50)
    assert.equal(record.data.value.secret, 'mailto:private@demo.test')
    assert.equal(record.raw.value, raw)
    assert.deepEqual(record.jsonFields, ['value'])
    assert.ok(
      adapter.coverage.some(
        (entry) => entry.surface === 'unsupported-image' && entry.state === 'required-unresolved'
      )
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a numeric role needs matching typed evidence even when another source contains that digit', () => {
  const hours = { id: 'business.hours', type: 'opening-hours', branch: 'unspecified', text: 'Open at 5 PM' }
  for (const semanticRole of ['rating', 'price', 'promotion'])
    assert.throws(
      () =>
        validateQuickstartEditorial(
          {
            inputHash: 'x',
            fields: [
              {
                key: 'x',
                value: '5',
                sourceIds: [hours.id],
                claimRefs: [{ id: hours.id, type: hours.type, branch: hours.branch, value: hours.text }]
              }
            ]
          },
          {
            inputHash: 'x',
            slots: [{ key: 'x', sample: '5', numeric: true, maxWords: 4, semanticRole }],
            sources: [hours]
          }
        ),
      /CLAIM/
    )
})

test('protocol-relative links and Gutenberg navigation JSON cannot bypass link coverage', async () => {
  const { quickstartLinks } = await import('../src/sites/brief-engines/quickstart-links.js')
  const business = { website: 'https://actual.example/' }
  const html =
    '<a href="//old.example/">Old</a><!-- wp:navigation-link {"label":"Old","url":"https://old.example/"} /-->'
  const result = quickstartLinks({ html }, business, { base: 'https://site.example/' })
  assert.equal(result.unresolved.length, 2)
  const named =
    '<!-- wp:navigation-link {"metadata":{"name":"company"},"label":"Company","url":"//old.example/"} /-->'
  const replaced = quickstartLinks({ html: named }, business, {
    base: 'https://site.example/',
    bindings: [{ path: ['html'], block: 'company', role: 'website' }]
  })
  assert.equal(replaced.unresolved.length, 0)
  assert.doesNotMatch(replaced.data.html, /old.example/)
  assert.match(replaced.data.html, /actual.example/)
  const nested = '<!-- wp:group {"matrix":[[1,2],[3,[4]]]} /-->'
  assert.equal(
    quickstartLinks({ html: nested }, business, { base: 'https://site.example/' }).data.html,
    nested
  )
})

test('image roles stay scoped to their block and a shared URL does not expand a replacement', async () => {
  const { nativePictureSlots } = await import('../src/sites/brief-engines/quickstart-pictures.js')
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#888' } })
    .jpeg()
    .toBuffer()
  const html =
    '<!-- wp:image {"metadata":{"name":"logo"}} --><img src="same.jpg"><!-- /wp:image --><!-- wp:image {"metadata":{"name":"photo"}} --><img src="same.jpg"><!-- /wp:image -->'
  const data = { body: html },
    record = {
      key: 'home',
      data,
      picturePaths: [['body']],
      mediaBindings: [{ path: ['body'], block: 'logo', role: 'logo' }]
    }
  const result = await nativePictureSlots({
    adapter: { records: [record], get: (data, path) => path.reduce((v, k) => v[k], data) },
    ctx: { platform: 'joomla' },
    reader: { base: 'http://site.test/', bytes: async () => bytes }
  })
  assert.equal(result.excluded.length, 1)
  assert.equal(result.groups.length, 1)
  const slot = [...result.bindings.values()][0]
  assert.equal(slot.occurrence, 1)
  const next = replaceResponsivePicture(html, 'same.jpg', '/real.jpg', 300, null, slot.occurrence)
  assert.equal((next.match(/same.jpg/g) ?? []).length, 1)
  assert.equal((next.match(/real.jpg/g) ?? []).length, 1)
})

test('unreadable logo upload IDs are reported as skipped rather than proof that brand was applied', async () => {
  const { createSiteBrand } = await import('../src/sites/brief-engines/brand.js')
  const brand = createSiteBrand({
    applyFor: () => async () => ({ ok: true }),
    readFile: async () => null,
    versionOf: async () => null
  })
  const result = await brand(
    {
      siteKey: 'allowed',
      platform: 'wordpress',
      quickstart: null,
      email: 'owner',
      brief: { brand: { logo: { light: 'missing-upload' } } },
      normalized: {},
      note: () => {}
    },
    { applyId: 'test' }
  )
  assert.ok(result.skipped.some((skip) => skip.where === 'logo'))
})

test('manual mode does not issue proof when a placed image no longer has its recorded bytes', async () => {
  const { quickstartCopyHash } = await import('../src/sites/brief-engines/quickstart-first.js')
  const source = { id: 'build', brief: { reviewMode: 'manual', business: { name: 'Business' } } }
  const engine = createQuickstartFirstEngine({
    legacy: {},
    siteReader: async () => ({ bytes: async () => null }),
    openNative: async () => ({ records: [] }),
    woContent: {
      recordWrite: () => {
        throw Error('Must not issue QA proof')
      }
    }
  })
  await assert.rejects(
    engine.verify(
      { platform: 'wordpress' },
      { source, checkAllowed: async () => {} },
      {
        workflow: 'quickstart-first/1',
        copyHash: quickstartCopyHash([]),
        photos: { gaps: [], receipts: [{ readbackPath: '/missing.jpg', derivativeHash: 'missing' }] }
      }
    ),
    /PICTURE_READBACK/
  )
})

test('image replacement keeps Gutenberg media attributes and attachment classes in sync', () => {
  const html =
    '<!-- wp:image {"id":42,"url":"demo.jpg","matrix":[[1,2]]} --><img class="wp-image-42" src="demo.jpg"><!-- /wp:image -->'
  const next = replaceResponsivePicture(html, 'demo.jpg', '/real.jpg', 600, 73, 0)
  assert.doesNotMatch(next, /demo.jpg|wp-image-42/)
  assert.match(next, /"id":73/)
  assert.match(next, /"url":"\/real.jpg"/)
  assert.match(next, /wp-image-73/)
  assert.match(next, /"matrix":\[\[1,2\]\]/)
})

test('one original image shared by two records uploads once and updates both aliases', async () => {
  const { placeNativePictures } = await import('../src/sites/brief-engines/quickstart-pictures.js')
  const { createHash } = await import('node:crypto')
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#9a6532' } })
    .jpeg()
    .toBuffer()
  const records = ['first', 'second'].map((key) => ({
    key,
    data: { body: '<img src="/shared.jpg">' },
    picturePaths: [['body']],
    routes: [`/${key}`]
  }))
  let uploads = 0,
    writes = 0,
    uploadedBytes
  const adapter = {
    records,
    get: (data, path) => path.reduce((value, key) => value[key], data),
    set: (data, path, value) => {
      data[path[0]] = value
    },
    call: async (_action, params) => {
      uploads++
      uploadedBytes = Buffer.from(params.content_b64, 'base64')
      return { ok: true, path: params.path, attachment: 73 }
    },
    write: async (record, data, save) => {
      writes++
      record.data = data
      await save({ state: 'verified' })
    }
  }
  const checkpoints = []
  const report = await placeNativePictures({
    adapter,
    ctx: { platform: 'joomla' },
    reader: {
      base: 'http://site.test/',
      bytes: async (path) => (path === '/shared.jpg' ? bytes : uploadedBytes)
    },
    real: {
      pictures: [
        {
          id: 'source',
          caption: 'fresh udon noodles food',
          width: 800,
          height: 600,
          sha256: createHash('sha256').update(bytes).digest('hex')
        }
      ],
      bytes: async () => bytes
    },
    checkpoint: async (key, receipt) => checkpoints.push({ key, ...receipt })
  })
  assert.equal(uploads, 1)
  assert.equal(writes, 2)
  assert.equal(report.receipts.length, 2)
  assert.equal(report.receipts[0].derivativeHash, report.receipts[1].derivativeHash)
  for (const record of records) assert.doesNotMatch(record.data.body, /shared.jpg/)
  assert.equal(checkpoints.filter((r) => r.key.startsWith('upload:') && r.state === 'sending').length, 1)
})

test('unknown render routes conflict with known pages and foreign paths never become same-site image aliases', async () => {
  const { nativePictureSlots } = await import('../src/sites/brief-engines/quickstart-pictures.js')
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#777' } })
    .jpeg()
    .toBuffer()
  const records = [
    { key: 'known', data: { image: '/shared.jpg' }, picturePaths: [['image']], routes: ['/menu#gallery'] },
    { key: 'unknown', data: { image: '/other.jpg' }, picturePaths: [['image']] },
    { key: 'foreign', data: { image: 'https://foreign.test/shared.jpg' }, picturePaths: [['image']] }
  ]
  const slots = await nativePictureSlots({
    adapter: { records, get: (data, path) => data[path[0]] },
    ctx: { platform: 'joomla' },
    reader: { base: 'http://site.test/', bytes: async () => bytes }
  })
  assert.equal(slots.groups.length, 2)
  assert.equal(slots.unresolved[0].reason, 'external-image-reference')
  const unknown = slots.groups.find((g) => g.file === '/other.jpg')
  assert.ok(unknown.routes.includes('/menu'))
  assert.ok(unknown.routes.includes('?unknown-route'))
})

test('EmDash render dependency maps match the shipped template QA contracts', async () => {
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const map = JSON.parse(
    readFileSync(new URL('../src/lib/quickstart-render-map.json', import.meta.url), 'utf8')
  )
  for (const [template, entry] of Object.entries(map)) {
    const bytes = readFileSync(
      new URL(
        `../../../packages/cms/tracy-emdash-theme-${template.slice(6)}/qa.contract.json`,
        import.meta.url
      )
    )
    assert.equal(entry.sourceSha256, createHash('sha256').update(bytes).digest('hex'))
    const qa = JSON.parse(bytes),
      collections = {}
    for (const page of qa.pages)
      for (const collection of page.render?.collections ?? []) {
        const key = `${page.locale ?? qa.defaultLocale}:${collection}`
        const routes = (collections[key] ??= [])
        if (!routes.includes(page.path)) routes.push(page.path)
      }
    assert.deepEqual(entry.collections, collections)
  }
})

test('a media object and a string reference keep their CMS storage types in separate groups', async () => {
  const { nativePictureSlots } = await import('../src/sites/brief-engines/quickstart-pictures.js')
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#777' } })
    .jpeg()
    .toBuffer()
  const records = [
    {
      key: 'object',
      data: { image: { id: 'demo', provider: 'local', src: '/shared.jpg' } },
      picturePaths: [['image']],
      routes: ['/menu']
    },
    { key: 'string', data: { image: '/shared.jpg' }, picturePaths: [['image']], routes: ['/menu'] }
  ]
  const slots = await nativePictureSlots({
    adapter: { records, get: (data, path) => data[path[0]] },
    ctx: { platform: 'emdash' },
    reader: { base: 'http://site.test/', bytes: async () => bytes }
  })
  assert.equal(slots.groups.length, 2)
  assert.ok([...slots.bindings.values()].every((binding) => binding.aliases.length === 1))
})

for (const [platform, canvas] of ['wordpress', 'joomla', 'emdash'].flatMap((platform) => [
  [platform, false],
  [platform, true]
]))
  test(`${platform}: source shortage automatically creates ${canvas ? 'canvas' : 'crop'} derivatives with provenance`, async () => {
    const { placeNativePictures } = await import('../src/sites/brief-engines/quickstart-pictures.js')
    const { createHash } = await import('node:crypto')
    const sharp = (await import('sharp')).default
    const demo = await sharp({
      create: { width: canvas ? 1920 : 400, height: canvas ? 350 : 300, channels: 3, background: '#777' }
    })
      .jpeg()
      .toBuffer()
    const sourceBytes = await sharp({
      create: { width: canvas ? 1860 : 800, height: canvas ? 1060 : 600, channels: 3, background: '#916932' }
    })
      .jpeg()
      .toBuffer()
    const source = {
      id: 'original',
      width: canvas ? 1860 : 800,
      height: canvas ? 1060 : 600,
      ...(canvas ? { vision: { subject: 'interior', quality: 'good', textPresence: 'absent' } } : {}),
      caption: 'fresh udon noodles food',
      sha256: createHash('sha256').update(sourceBytes).digest('hex')
    }
    const records = [1, 2, 3].map((n) => ({
      key: `record-${canvas ? 'about-' : ''}${n}`,
      routes: [`/page-${n}`],
      picturePaths: [['image']],
      data: {
        style: 'filter: brightness(0.65); border-radius: 12px',
        image:
          platform === 'emdash'
            ? { id: `demo-${n}`, provider: 'local', src: `/demo-${n}.jpg` }
            : `/demo-${n}.jpg`
      }
    }))
    const outputs = new Map(),
      uploaded = [],
      checkpoints = []
    const adapter = {
      records,
      get: (data, path) => data[path[0]],
      set: (data, path, value) => {
        data[path[0]] = value
      },
      call: async (action, params) => {
        assert.equal(action, 'media.upload')
        const bytes = Buffer.from(params.content_b64, 'base64'),
          id = uploaded.length + 1
        uploaded.push(bytes)
        outputs.set(params.path, bytes)
        return { ok: true, id, attachment: id, path: params.path }
      },
      api: async (_method, route) => {
        const id = Number(route.split('/').pop())
        return {
          item: {
            storageKey: `real-${id}.jpg`,
            contentHash: `sha1:${createHash('sha1')
              .update(uploaded[id - 1])
              .digest('hex')}`
          }
        }
      },
      write: async (record, data, save) => {
        record.data = data
        await save({ state: 'verified' })
      }
    }
    const report = await placeNativePictures({
      adapter,
      ctx: { platform },
      reader: {
        base: 'http://site.test/',
        bytes: async (path) => (path.startsWith('/demo-') ? demo : outputs.get(path.replace(/^\//, '')))
      },
      real: { pictures: [source], bytes: async () => sourceBytes },
      checkpoint: async (key, value) => checkpoints.push({ key, ...value })
    })
    const plan = checkpoints.find((r) => r.key === 'picture-plan').plan
    assert.equal(plan.unfilled.length, 0)
    assert.equal(plan.placements.length, 3)
    assert.equal(report.variantPolicy, 'quickstart-source-variants/1')
    assert.equal(report.requiresReview, true)
    assert.equal(uploaded.length, 1, 'identical byte derivatives upload once')
    for (const receipt of report.receipts) {
      assert.equal(receipt.sourceId, 'original')
      assert.equal(receipt.sourceHash, source.sha256)
      assert.equal(receipt.sourceUses, 3)
      assert.equal(receipt.recipe.version, canvas ? 'sharp-source-canvas/1' : 'sharp-source-variant/1')
      if (canvas) assert.equal(receipt.recipe.generatedScene, false)
      else assert.equal(receipt.recipe.effects, 'preserve-source')
    }
    const result = await sharp(uploaded[0]).metadata()
    assert.equal(result.width, canvas ? 1920 : 400)
    assert.equal(result.height, canvas ? 350 : 300)
    assert.equal(report.generation, 'real-only')
    const pixels = await sharp(uploaded[0]).stats(),
      originalPixels = await sharp(sourceBytes).stats()
    pixels.channels
      .slice(0, 3)
      .forEach((channel, n) => assert.ok(Math.abs(channel.mean - originalPixels.channels[n].mean) < 5))
    assert.equal(report.sourceCount, 1)
    assert.equal(report.derivatives, 1)
    for (const record of records)
      assert.equal(record.data.style, 'filter: brightness(0.65); border-radius: 12px')
  })

/** A native site whose slots are each a demo JPEG of the given size, with an in-memory upload store. */
async function placeholderWorld({
  platform = 'wordpress',
  demos,
  sourceSize = [800, 600],
  available = true
}) {
  const { createHash } = await import('node:crypto')
  const sharp = (await import('sharp')).default
  const jpeg = ([width, height], background) =>
    sharp({ create: { width, height, channels: 3, background } })
      .jpeg()
      .toBuffer()
  const demoBytes = await Promise.all(demos.map((size) => jpeg(size, '#777')))
  const sourceBytes = await jpeg(sourceSize, '#916932')
  const source = {
    id: 'original',
    width: sourceSize[0],
    height: sourceSize[1],
    caption: 'fresh udon noodles food',
    sha256: createHash('sha256').update(sourceBytes).digest('hex')
  }
  const records = demos.map((_, n) => ({
    key: `record-${n}`,
    routes: [`/page-${n}`],
    picturePaths: [['image']],
    data: {
      image:
        platform === 'emdash'
          ? { id: `demo-${n}`, provider: 'local', src: `/demo-${n}.jpg` }
          : `/demo-${n}.jpg`
    }
  }))
  const outputs = new Map(),
    uploaded = [],
    checkpoints = []
  const adapter = {
    records,
    get: (data, path) => data[path[0]],
    set: (data, path, value) => {
      data[path[0]] = value
    },
    call: async (action, params) => {
      assert.equal(action, 'media.upload')
      const bytes = Buffer.from(params.content_b64, 'base64'),
        id = uploaded.length + 1
      uploaded.push(bytes)
      outputs.set(params.path, bytes)
      return { ok: true, id, attachment: id, path: params.path }
    },
    api: async (_method, route) => {
      const id = Number(route.split('/').pop())
      return {
        item: {
          storageKey: `real-${id}.jpg`,
          contentHash: `sha1:${createHash('sha1')
            .update(uploaded[id - 1])
            .digest('hex')}`
        }
      }
    },
    write: async (record, data, save) => {
      record.data = data
      await save({ state: 'verified' })
    }
  }
  const run = async (extra = {}) => {
    const { placeNativePictures } = await import('../src/sites/brief-engines/quickstart-pictures.js')
    return placeNativePictures({
      adapter,
      ctx: { platform },
      reader: {
        base: 'http://site.test/',
        bytes: async (path) => {
          const demo = /^\/demo-(\d+)\.jpg$/.exec(path)
          return demo ? demoBytes[Number(demo[1])] : outputs.get(path.replace(/^\//, ''))
        }
      },
      real: {
        pictures: [source],
        colours: ['#123456', '#abcdef'],
        bytes: async () => (available ? sourceBytes : null)
      },
      checkpoint: async (key, value) => checkpoints.push({ key, ...value }),
      ...extra
    })
  }
  return { run, records, uploaded, checkpoints, source }
}

for (const platform of ['wordpress', 'joomla', 'emdash'])
  test(`${platform}: a slot no photo fits keeps its place with a neutral placeholder and goes to review`, async () => {
    const sharp = (await import('sharp')).default
    const { createHash } = await import('node:crypto')
    const world = await placeholderWorld({
      platform,
      demos: [
        [400, 300],
        [200, 1200]
      ]
    })
    const report = await world.run()
    const plan = world.checkpoints.find((r) => r.key === 'picture-plan').plan
    assert.equal(plan.unfilled.length, 1, 'no crop of a landscape source fits the tall slot')
    assert.deepEqual(
      report.gaps.map((gap) => gap.groupId),
      plan.unfilled.map((gap) => gap.groupId)
    )
    assert.equal(report.placed, 1)
    assert.equal(report.placeholders, 1)
    assert.equal(report.requiresReview, true)
    assert.equal(report.placeholderPolicy, 'quickstart-picture-placeholders/1')
    assert.equal(report.sourceCount, 1)
    const placeholder = report.receipts.find((receipt) => receipt.kind === 'placeholder')
    assert.equal(placeholder.sourceId, null)
    assert.equal(placeholder.recordKey, 'record-1')
    assert.equal(placeholder.key, plan.unfilled[0].groupId)
    assert.ok(placeholder.readbackPath && placeholder.derivativeHash)
    const bytes = world.uploaded.find(
      (item) => createHash('sha256').update(item).digest('hex') === placeholder.derivativeHash
    )
    const meta = await sharp(bytes).metadata()
    assert.deepEqual([meta.width, meta.height], [200, 1200], "sized from the slot's demo picture")
    // Every slot keeps its place: both records now point at uploaded pictures, not the demo files.
    for (const record of world.records) assert.doesNotMatch(JSON.stringify(record.data.image), /demo-/)
  })

test('every picture missing fills every slot with placeholders instead of failing', async () => {
  const world = await placeholderWorld({
    demos: [
      [400, 300],
      [600, 400]
    ],
    available: false
  })
  const report = await world.run()
  assert.deepEqual(report.unavailable, ['original'])
  assert.equal(report.placed, 0)
  assert.equal(report.placeholders, 2)
  assert.equal(report.gaps.length, 2)
  assert.equal(report.sourceCount, 0)
  assert.equal(report.requiresReview, true)
  assert.equal(world.uploaded.length, 2)
  for (const record of world.records) assert.doesNotMatch(record.data.image, /demo-/)
})

test('an unresolved slot still stops the native picture fill before any upload', async () => {
  const world = await placeholderWorld({ demos: [[400, 300]] })
  world.records[0].data.image = 'https://elsewhere.example/demo.jpg'
  await assert.rejects(world.run(), /QUICKSTART_PICTURE_COVERAGE_INCOMPLETE/)
  assert.equal(world.uploaded.length, 0)
})

test('a resumed picture fill reuses verified uploads, placeholders included', async () => {
  const world = await placeholderWorld({
    demos: [
      [400, 300],
      [200, 1200]
    ]
  })
  const first = await world.run()
  assert.equal(first.placeholders, 1)
  const uploads = world.uploaded.length
  const priorUploads = world.checkpoints.filter(
    (item) => item.key.startsWith('upload:') && item.state === 'verified'
  )
  assert.ok(priorUploads.some((item) => item.kind === 'placeholder'))
  for (const [n, record] of world.records.entries()) record.data.image = `/demo-${n}.jpg`
  const second = await world.run({ priorUploads })
  assert.equal(world.uploaded.length, uploads, 'no second upload after a crash')
  assert.deepEqual(
    second.receipts.map((receipt) => receipt.derivativeHash),
    first.receipts.map((receipt) => receipt.derivativeHash)
  )
})

test('placeholder gaps end the quickstart QA as needs-review, never passed and never failed', async () => {
  const { nativeStructure } = await import('../src/sites/brief-engines/quickstart-native.js')
  const { createHash } = await import('node:crypto')
  const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
  const data = { title: 'Mizuren' },
    record = { key: 'home', data, ...nativeCopyBindings(data, ['title']) }
  const bytes = Buffer.from('placeholder')
  const derivativeHash = createHash('sha256').update(bytes).digest('hex')
  const source = {
    id: 'build',
    brief: { reviewMode: 'automatic', business: { name: 'Mizuren' } },
    content: { writes: {} }
  }
  const engine = createQuickstartFirstEngine({
    legacy: {},
    siteReader: async () => ({ bytes: async (path) => (path === '/gap.jpg' ? bytes : null) }),
    applyFor: () => async () => ({}),
    woContent: {
      recordWrite: async (_, key, value) => {
        source.content.writes[key] = value
      }
    },
    verifySite: async () => ({ state: 'passed' }),
    openNative: async () => ({ records: [record], ...identityReads('Mizuren') })
  })
  const photos = {
    gaps: [{ groupId: 'gap' }],
    requiresReview: true,
    variantPolicy: 'quickstart-source-variants/1',
    placeholderPolicy: 'quickstart-picture-placeholders/1',
    placeholders: 1,
    receipts: [{ key: 'gap', kind: 'placeholder', readbackPath: '/gap.jpg', derivativeHash }]
  }
  const report = {
    workflow: 'quickstart-first/1',
    copyHash: quickstartCopyHash([record]),
    structureHash: hash(nativeStructure([record])),
    photos
  }
  const prepared = { source, checkAllowed: async () => {}, sources: [], checkpoint: async () => {} }
  await engine.verify({ platform: 'wordpress' }, prepared, report)
  const qa = source.content.writes['quickstart:qa']
  assert.equal(qa.state, 'needs-review')
  assert.equal(qa.humanAccepted, false)
  assert.equal(qa.reviewReason, 'quickstart-picture-placeholders/1')
  // A report that forgot `requiresReview` still cannot pass with a placeholder on the page.
  await engine.verify({ platform: 'wordpress' }, prepared, {
    ...report,
    photos: { ...photos, requiresReview: false, placeholderPolicy: null }
  })
  assert.equal(source.content.writes['quickstart:qa'].state, 'needs-review')
  assert.equal(source.content.writes['quickstart:qa'].reviewReason, 'quickstart-picture-placeholders/1')
  await assert.rejects(
    engine.verify({ platform: 'wordpress' }, prepared, {
      ...report,
      photos: { ...photos, receipts: [] }
    }),
    /QUICKSTART_PICTURE_COVERAGE_INCOMPLETE/
  )
})

test('source variants keep dHash clustering, prioritize diversity and never turn an unsuitable source into a fit', async () => {
  const { planQuickstartVariants } = await import('../src/sites/brief-engines/quickstart-picture-plan.js')
  const { websiteOpportunitiesDomain } = await import('website-opportunities/src/domain-loader.js')
  const domain = await websiteOpportunitiesDomain()
  const groups = Array.from({ length: 8 }, (_, n) => ({
    id: `g-${n}`,
    role: 'article',
    routes: ['/menu'],
    home: false,
    topic: [],
    words: [],
    demo: { width: 400, height: 300 }
  }))
  const labels = ['a', 'b'].map((id) =>
    domain.labelPicture({ id, width: 800, height: 600, caption: 'udon noodles food' })
  )
  const clusterOf = new Map([
    ['a', 0],
    ['b', 1]
  ])
  const plan = planQuickstartVariants(domain, { groups, labels, clusterOf })
  assert.equal(plan.unfilled.length, 0)
  assert.ok(plan.placements.every((p) => p.totalUses === 4))
  assert.deepEqual(plan, planQuickstartVariants(domain, { groups, labels: [...labels].reverse(), clusterOf }))
  const impossible = planQuickstartVariants(domain, {
    groups,
    labels: [
      domain.labelPicture({ id: 'poster', width: 50, height: 50, caption: 'menu board poster with text' })
    ],
    clusterOf: new Map()
  })
  assert.equal(impossible.placements.length, 0)
  assert.equal(impossible.unfilled.length, 8)
})

test('wide decorative canvas fills only a verified photographic source while preserving strict placement', async () => {
  const { planQuickstartVariants } = await import('../src/sites/brief-engines/quickstart-picture-plan.js')
  const { websiteOpportunitiesDomain } = await import('website-opportunities/src/domain-loader.js')
  const domain = await websiteOpportunitiesDomain()
  const group = {
    id: 'wide',
    role: 'section-main',
    routes: ['/about'],
    home: false,
    topic: [],
    words: [],
    demo: { width: 1920, height: 350 }
  }
  const source = {
    id: 'space',
    width: 1860,
    height: 1060,
    vision: { subject: 'interior', quality: 'good', textPresence: 'absent', hasTextOverlay: false }
  }
  const label = { ...domain.labelPicture(source), visionTextPresence: 'absent' }
  const plan = planQuickstartVariants(domain, { groups: [group], labels: [label] })
  assert.equal(plan.unfilled.length, 0)
  assert.equal(plan.requiresReview, true)
  const placement = plan.placements[0]
  assert.ok(placement.canvas.foreground.width >= placement.canvas.output.width / 2)
  assert.ok(placement.crop.source.width * placement.crop.source.height >= (source.width * source.height) / 2)
  assert.ok(placement.crop.output.width <= placement.crop.source.width)
  assert.ok(placement.crop.output.height <= placement.crop.source.height)
  assert.ok(placement.crop.source.width * placement.crop.source.height > source.width * source.height * 0.6)
  const smaller = planQuickstartVariants(domain, {
    groups: [{ ...group, demo: { width: 800, height: 146 } }],
    labels: [label]
  })
  assert.equal(smaller.unfilled.length, 0)
  const labels = [label, { ...label, id: 'second' }]
  assert.deepEqual(
    planQuickstartVariants(domain, { groups: [group], labels }),
    planQuickstartVariants(domain, { groups: [group], labels: labels.toReversed() })
  )
  for (const patch of [
    { quality: 'poor' },
    { subject: 'logo' },
    { subject: 'poster' },
    { subject: 'menu-board' },
    { subject: 'unknown' },
    { textPresence: 'present' },
    { visionTextPresence: null },
    { graphic: true },
    { collage: true },
    { subjectFrom: 'words' },
    { width: 50, height: 30, aspect: 5 / 3 },
    { width: 1800, height: 3600, aspect: 0.5 }
  ]) {
    assert.equal(
      planQuickstartVariants(domain, { groups: [group], labels: [{ ...label, ...patch }] }).placements.length,
      0,
      JSON.stringify(patch)
    )
  }
  const regular = { ...group, demo: { width: 800, height: 500 } }
  assert.equal(
    planQuickstartVariants(domain, { groups: [regular], labels: [label] }).placements[0].canvas,
    undefined
  )
  for (const role of ['dish', 'gallery', 'article'])
    assert.equal(
      planQuickstartVariants(domain, { groups: [{ ...group, role }], labels: [label] }).unfilled.length,
      1
    )
})

test('EmDash Cowork preflight rejects vanilla CMS before any mutation or upload', async () => {
  const { assertQuickstartEmdashCowork } = await import('../src/sites/brief-engines/quickstart-native.js')
  let calls = 0
  await assert.rejects(
    assertQuickstartEmdashCowork(async (method, path) => {
      calls++
      assert.equal(method, 'GET')
      assert.equal(path, '/_emdash/api/write-capabilities')
      return {}
    }),
    /QUICKSTART_COWORK_REQUIRED/
  )
  assert.equal(calls, 1)
  const capability = {
    schemaVersion: 'emdash-conditional-writes/1',
    backend: 'node-sqlite',
    conditionalContentWrite: true,
    conditionalPublish: true,
    conditionalDiscardDraft: true,
    mutationRevisionReceipts: true
  }
  assert.deepEqual(await assertQuickstartEmdashCowork(async () => capability), capability)
})

test('EmDash clears only its declared optional logo field for the template text fallback', async () => {
  const { quickstartBrandFallback } = await import('../src/sites/brief-engines/quickstart-brand-fallback.js')
  const record = {
    key: 'chrome',
    data: { logo_dark: { id: 'demo' }, title: 'Place' },
    schema: { fields: [{ slug: 'logo_dark', required: false }] },
    mediaBindings: [{ role: 'logo', path: ['logo_dark'] }]
  }
  let writes = 0
  const adapter = {
    records: [record],
    get: (data, path) => data[path[0]],
    set: (data, path, value) => {
      data[path[0]] = value
    },
    write: async (r, data) => {
      writes++
      r.data = data
    }
  }
  const photos = { excluded: [{ record: 'chrome', path: ['logo_dark'], reason: 'logo' }] },
    ctx = { platform: 'emdash' }
  assert.equal((await quickstartBrandFallback({ adapter, ctx, photos })).mode, 'native-text-name')
  assert.equal(record.data.logo_dark, null)
  assert.equal(record.data.title, 'Place')
  assert.equal(writes, 1)
  await quickstartBrandFallback({ adapter, ctx, photos, verify: true })
  assert.equal(writes, 1)
  record.mediaBindings = []
  await assert.rejects(quickstartBrandFallback({ adapter, ctx, photos }), /FALLBACK_UNPROVEN/)
})

test('technical order and portable-text list levels stay immutable without merchant number citations', () => {
  for (const field of ['["sort"]', '["content",3,"level"]']) {
    const path = JSON.parse(field)
    const data = { sort: 2, content: [null, null, null, { _type: 'block', listItem: 'bullet', level: 2 }] }
    const record = {
      key: 'entry',
      data,
      schema: { fields: [{ slug: 'sort', type: 'integer', label: 'Sort order' }] },
      copy: { [field]: 2 },
      bindings: [{ key: field, path }]
    }
    const slot = quickstartEditorialInventory([record]).slots[0]
    const answer = {
      inputHash: 'input',
      fields: [{ key: slot.key, value: '2', sourceIds: [], claimRefs: [] }]
    }
    assert.equal(
      validateQuickstartEditorial(answer, { inputHash: 'input', slots: [slot], sources }).length,
      1
    )
    answer.fields[0].value = '3'
    assert.throws(
      () => validateQuickstartEditorial(answer, { inputHash: 'input', slots: [slot], sources }),
      /EDITORIAL_STRUCTURE/
    )
  }
  const slot = { key: 'rating', field: '["rating"]', numeric: true, sample: '2', maxWords: 4 }
  assert.throws(
    () =>
      validateQuickstartEditorial(
        { inputHash: 'input', fields: [{ key: 'rating', value: '2', sourceIds: [], claimRefs: [] }] },
        { inputHash: 'input', slots: [slot], sources }
      ),
    /EDITORIAL_CLAIM/
  )
})
test('image alt length normalization preserves a truthful prefix within its layout budget', () => {
  const slot = { key: 'alt', field: '["image_alt"]', maxWords: 4 }
  const result = expandQuickstartEditorial(
    {
      inputHash: 'input',
      fields: [{ key: 0, value: 'Bowl of ramen with egg greens and nori', sourceIds: [0], claimRefs: [] }]
    },
    { slots: [slot], sources }
  )
  assert.equal(result.fields[0].value, 'Bowl of ramen with')
})

test('business level numbers and factual roles cannot borrow technical-number provenance', () => {
  const field = '["content","stats","level"]'
  const record = {
    key: 'stats',
    data: { content: { stats: { level: 2 } } },
    copy: { [field]: 2 },
    bindings: [{ key: field, path: ['content', 'stats', 'level'] }]
  }
  const slot = quickstartEditorialInventory([record]).slots[0]
  const answer = { inputHash: 'input', fields: [{ key: slot.key, value: '2', sourceIds: [], claimRefs: [] }] }
  assert.throws(
    () => validateQuickstartEditorial(answer, { inputHash: 'input', slots: [slot], sources }),
    /EDITORIAL_CLAIM/
  )
  const technical = {
    key: 'sort',
    data: { sort: 2 },
    schema: { fields: [{ slug: 'sort', type: 'integer', label: 'Sort order' }] },
    copy: { '["sort"]': 2 },
    bindings: [{ key: '["sort"]', path: ['sort'] }]
  }
  const factual = quickstartEditorialInventory([technical]).slots[0]
  factual.semanticRole = 'rating'
  assert.throws(
    () =>
      validateQuickstartEditorial(
        { inputHash: 'input', fields: [{ key: factual.key, value: '2', sourceIds: [], claimRefs: [] }] },
        { inputHash: 'input', slots: [factual], sources }
      ),
    /EDITORIAL_CLAIM/
  )
})

test('metric repurposing pins both a verified weekly count and its caption by code', async () => {
  const value = '["stats",0,"value"]',
    caption = '["stats",0,"caption"]'
  const record = {
    key: 'metrics',
    data: { stats: [{ value: '152', caption: 'Projects delivered' }] },
    schema: { fields: [{ slug: 'stats', type: 'repeater', label: 'Statistics' }] },
    copy: { [value]: '152', [caption]: 'Projects delivered' },
    bindings: [
      { key: value, path: ['stats', 0, 'value'] },
      { key: caption, path: ['stats', 0, 'caption'] }
    ]
  }
  const hours = {
    id: 'business.hours',
    type: 'opening-hours',
    branch: 'restaurant',
    text: JSON.stringify({
      periods: [
        { open: { day: 0, hour: 9 }, close: { day: 0, hour: 17 } },
        { open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }
      ]
    })
  }
  const answer = await editQuickstart({
    records: [record],
    sources: [hours],
    generate: async ({ input }) => ({
      inputHash: input.inputHash,
      fields: input.fields.map((f) => ({ key: f.key, value: '999', sourceIds: [], claimRefs: [] }))
    })
  })
  assert.equal(answer.records[0].copy[value], '2')
  assert.equal(answer.records[0].copy[caption], 'Days open each week')
  assert.equal(
    answer.changes.find((f) => f.key.includes(value)).derivationEvidence.rule,
    'weekly-open-days/3'
  )
})

test('weekly opening coverage handles continuous hours, overnight spans and complete weekday text', async () => {
  const { quickstartDerivedCount } = await import('../src/sites/brief-engines/quickstart-derived-facts.js')
  const count = (value) =>
    quickstartDerivedCount(
      { id: 'hours', type: 'opening-hours', value: JSON.stringify(value) },
      { semanticRole: 'open-days' }
    )?.number
  assert.equal(count({ periods: [{ open: { day: 0, hour: 0 } }] }), 7)
  assert.equal(count({ periods: [{ open: { day: 0, hour: 22 }, close: { day: 1, hour: 2 } }] }), 2)
  assert.equal(count({ periods: [{ open: { day: 0, hour: 22 }, close: { day: 1, hour: 0 } }] }), 1)
  assert.equal(count({ periods: [{ open: { day: 1, hour: 9 } }] }), undefined)
  assert.equal(
    count(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
        (day) => day + ': 11:30 AM – 11:00 PM'
      )
    ),
    7
  )
  assert.equal(count(['Monday: 09:00–18:00']), undefined)
})

test('string metric cards use verified dining services without changing their storage type', async () => {
  const data = {
      stats: Array.from({ length: 4 }, (_, i) => ({ value: String(150 + i), caption: 'Demo metric' }))
    },
    copy = {},
    bindings = []
  for (let i = 0; i < 4; i++)
    for (const key of ['value', 'caption']) {
      const field = JSON.stringify(['stats', i, key])
      copy[field] = data.stats[i][key]
      bindings.push({ key: field, path: ['stats', i, key] })
    }
  const record = {
    key: 'metrics',
    data,
    schema: { fields: [{ slug: 'stats', type: 'repeater', label: 'Statistics' }] },
    copy,
    bindings
  }
  const hours = {
    id: 'business.hours',
    type: 'opening-hours',
    branch: 'restaurant',
    text: JSON.stringify(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
        (day) => day + ': 11:30 AM – 11:00 PM'
      )
    )
  }
  const amenities = {
    id: 'profile.amenities',
    type: 'story',
    branch: 'restaurant',
    text: JSON.stringify({ dineIn: true, takeout: true, delivery: true })
  }
  const result = await editQuickstart({
    records: [record],
    sources: [hours, amenities],
    generate: async ({ input }) => ({
      inputHash: input.inputHash,
      fields: input.fields.map((f) => ({ key: f.key, value: '999', sourceIds: [], claimRefs: [] }))
    })
  })
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => result.records[0].copy[JSON.stringify(['stats', i, 'value'])]),
    ['7', 'Dine-in', 'Takeout', 'Delivery']
  )
})

test('a numeric-looking text field can become sourced prose while numeric renderers remain numeric', () => {
  const slot = { key: 'field', numeric: true, storageType: 'string', sample: '152', maxWords: 4 }
  const answer = {
    inputHash: 'input',
    fields: [{ key: 'field', value: 'Mizuren', sourceIds: ['business.name'], claimRefs: [] }]
  }
  assert.equal(validateQuickstartEditorial(answer, { inputHash: 'input', slots: [slot], sources }).length, 1)
  slot.numericStorage = true
  assert.throws(
    () => validateQuickstartEditorial(answer, { inputHash: 'input', slots: [slot], sources }),
    /EDITORIAL_NUMBER/
  )
})

test('filled retry verifies saved copy and exact structure without rerunning editorial or pictures', async () => {
  for (const drift of ['none', 'copy', 'missing', 'structure', 'uncertain']) {
    const record = {
      key: 'home',
      identity: { id: 'home' },
      data: { title: 'Mizuren', class: 'keep' },
      ...nativeCopyBindings({ title: 'Mizuren' }, ['title'])
    }
    const filled = {
      workflow: 'quickstart-first/1',
      state: 'filled',
      wrote: 1,
      copyHash: quickstartCopyHash([record]),
      initialStructure: nativeStructure([record]),
      photos: { receipts: [], gaps: [] }
    }
    const source = {
      id: 'build',
      revision_id: 'revision',
      brief: { business: { name: 'Mizuren' } },
      profile_effective: {},
      content: { writes: { 'quickstart:fill': filled } }
    }
    if (drift === 'copy') record.data.title = 'Human edit'
    if (drift === 'structure') record.data.class = 'changed'
    if (drift === 'uncertain') source.content.writes['quickstart:term:test'] = { state: 'sending' }
    const engine = createQuickstartFirstEngine({
      legacy: {},
      woContent: {
        quickstartFor: async () => source,
        recordWrite: async (_id, key, value) => {
          source.content.writes[key] = value
        }
      },
      siteReader: async () => ({}),
      openNative: async () => ({ ...identityReads('Mizuren'), records: drift === 'missing' ? [] : [record] }),
      generateFor: async () => () => {
        throw Error('must not rerun copy')
      },
      realPictures: {
        forSite: () => {
          throw Error('must not rerun pictures')
        }
      }
    })
    const ctx = { platform: 'wordpress', normalized: { languages: ['en'] }, time: () => {} }
    const prepared = await engine.prepare(ctx)
    if (drift === 'none') assert.equal((await engine.apply(ctx, prepared)).copyHash, filled.copyHash)
    else
      await assert.rejects(
        engine.apply(ctx, prepared),
        /QUICKSTART_(RESUME_CONTENT_CHANGED|MUTATION_UNCERTAIN)/
      )
  }
})

test('seed taxonomy editorial preserves routes and associations with conditional metadata readback', async () => {
  const { replaceQuickstartTerms } = await import('../src/sites/brief-engines/quickstart-terms.js')
  for (const mode of ['success', 'changed', 'no-cas', 'receipt-missing', 'association-drift', 'resume']) {
    let snapshot = {
      id: 'term1',
      name: 'tag',
      locale: 'en',
      label: 'Framework',
      slug: 'framework',
      dataRaw: null,
      _rev: 'r1',
      associations: [{ entryGroup: 'post1', collection: 'posts' }],
      sortOrder: 0,
      parentId: null,
      translationGroup: 'term1'
    }
    let writes = 0,
      calls = 0
    const held = {}
    if (mode === 'changed') snapshot.label = 'Human edit'
    if (mode === 'resume')
      held['quickstart:term:tag:term1'] = { state: 'verified', after: structuredClone(snapshot) }
    const adapter = {
      api: async (method, path, body) => {
        if (path.endsWith('/write-capabilities'))
          return { conditionalTermMetadata: mode !== 'no-cas', mutationRevisionReceipts: true }
        if (path.includes('/terms?')) return { terms: [{ id: 'term1', slug: 'framework', locale: 'en' }] }
        if (method === 'GET') return structuredClone(snapshot)
        assert.equal(body._rev, 'r1')
        assert.equal(body.mode, 'patch')
        assert.equal(body.slug, 'framework')
        writes++
        snapshot = { ...snapshot, label: body.label, _rev: 'r2' }
        if (mode === 'association-drift') snapshot.associations = []
        return mode === 'receipt-missing' ? {} : { _mutationRev: 'r2' }
      }
    }
    const operation = replaceQuickstartTerms({
      adapter,
      ctx: { normalized: { languages: ['en'] } },
      seed: {
        taxonomies: [{ name: 'tag', locale: 'en', terms: [{ slug: 'framework', label: 'Framework' }] }]
      },
      held,
      sources,
      checkAllowed: async () => {},
      checkpoint: async (key, value) => {
        held[`quickstart:${key}`] = value
      },
      generate: async ({ input }) => {
        calls++
        return {
          inputHash: input.inputHash,
          fields: input.fields.map((f) => ({ key: f.key, value: 'Dining', sourceIds: [0], claimRefs: [] }))
        }
      }
    })
    if (['success', 'resume'].includes(mode)) {
      assert.equal((await operation).terms, 1)
      assert.equal(writes, mode === 'resume' ? 0 : 1)
      assert.equal(calls, mode === 'resume' ? 0 : 1)
      assert.equal(snapshot.slug, 'framework')
    } else await assert.rejects(operation, /QUICKSTART_TERM_/)
  }
})

test('plain cards without source-link support become verified visit information, preserving every card and unrelated field', async () => {
  const { quickstartReviewFallback } = await import(
    '../src/sites/brief-engines/quickstart-review-fallback.js'
  )
  const data = {
    quotes: [
      { quote: 'A fictional testimonial', name: 'Demo person', role: 'Customer' },
      { quote: 'Another testimonial', name: 'Another person', role: 'Customer' }
    ],
    heading: 'Reviews',
    css: 'unchanged'
  }
  const record = {
    key: 'home',
    identity: { collection: 'home' },
    data,
    ...nativeCopyBindings(data, ['quotes', 'heading']),
    schema: {
      fields: [
        {
          slug: 'quotes',
          type: 'repeater',
          validation: { subFields: ['quote', 'name', 'role'].map((slug) => ({ slug, type: 'string' })) }
        }
      ]
    }
  }
  let writes = 0
  const adapter = {
    records: [record],
    get: (data, path) => path.reduce((v, k) => v[k], data),
    set: (data, path, value) => {
      let p = data
      for (const key of path.slice(0, -1)) p = p[key]
      p[path.at(-1)] = value
    },
    write: async (r, data, save) => {
      writes++
      r.data = data
      await save({ state: 'verified' })
    }
  }
  const descriptor = {
    renderer: 'plain-topic-cards',
    sourceLink: false,
    rating: false,
    reviewStructuredData: false,
    sourceProof: { 'Quotes.astro': 'hash' },
    groups: [{ collection: 'home', field: 'quotes', labels: ['heading'] }]
  }
  const input = {
    adapter,
    ctx: { normalized: { languages: ['en'] } },
    business: { name: 'Mizuren', phone: '+971 52 555 0102', address: 'Dubai' },
    descriptor,
    checkpoint: async () => {}
  }
  const report = await quickstartReviewFallback(input)
  assert.equal(report.state, 'verified')
  assert.equal(writes, 1)
  assert.equal(record.data.quotes.length, 2)
  assert.equal(record.data.css, 'unchanged')
  assert.equal(record.data.heading, 'Plan your visit')
  assert.equal(record.data.quotes[0].quote, 'Call +971 52 555 0102.')
  assert.equal(record.data.quotes[0].name, 'Contact')
  assert.equal(record.data.quotes[0].role, 'Mizuren')
  await quickstartReviewFallback(input)
  assert.equal(writes, 1)
  await assert.rejects(
    quickstartReviewFallback({ ...input, descriptor: { ...descriptor, rating: true } }),
    /RENDERER_UNPROVEN/
  )
  await assert.rejects(
    quickstartReviewFallback({ ...input, business: { name: 'Only a name' } }),
    /FACTS_REQUIRED/
  )
})

test('plain cards without source-link support carry the collected reviews word for word, then visit information', async () => {
  const { quickstartReviewFallback } = await import(
    '../src/sites/brief-engines/quickstart-review-fallback.js'
  )
  const data = {
    quotes: [
      { quote: 'A fictional testimonial', name: 'Demo person', role: 'Customer' },
      { quote: 'Another testimonial', name: 'Another person', role: 'Customer' }
    ],
    heading: 'Reviews'
  }
  const record = {
    key: 'home',
    identity: { collection: 'home' },
    data,
    ...nativeCopyBindings(data, ['quotes', 'heading']),
    schema: {
      fields: [
        {
          slug: 'quotes',
          type: 'repeater',
          validation: { subFields: ['quote', 'name', 'role'].map((slug) => ({ slug, type: 'string' })) }
        }
      ]
    }
  }
  const adapter = {
    records: [record],
    get: (d, path) => path.reduce((v, k) => v[k], d),
    set: (d, path, value) => {
      let p = d
      for (const key of path.slice(0, -1)) p = p[key]
      p[path.at(-1)] = value
    },
    write: async (r, next, save) => {
      r.data = next
      await save({ state: 'verified' })
    }
  }
  const report = await quickstartReviewFallback({
    adapter,
    ctx: { normalized: { languages: ['en'] } },
    business: { name: 'Mizuren', phone: '+971 52 555 0102' },
    reviews: [
      { text: 'Best ramen in Dubai, rich broth.', author: 'Sara', provenance: { provider: 'Google Reviews' } }
    ],
    descriptor: {
      renderer: 'plain-topic-cards',
      sourceLink: false,
      rating: false,
      reviewStructuredData: false,
      sourceProof: { 'Quotes.astro': 'hash' },
      groups: [{ collection: 'home', field: 'quotes', labels: ['heading'] }]
    },
    checkpoint: async () => {}
  })
  assert.equal(report.state, 'verified')
  assert.deepEqual(record.data.quotes[0], {
    quote: 'Best ramen in Dubai, rich broth.',
    name: 'Sara',
    role: 'Google Reviews'
  })
  assert.equal(record.data.quotes[1].quote, 'Call +971 52 555 0102.')
  // A heading over guests' words stays the template's.
  assert.equal(record.data.heading, 'Reviews')
})

test('plain quote renderer descriptors match reviewed source files without star ratings or Review structured data', async () => {
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const descriptors = JSON.parse(
    readFileSync(new URL('../src/lib/quickstart-review-renderers.json', import.meta.url), 'utf8')
  )
  for (const [id, descriptor] of Object.entries(descriptors)) {
    const directory = new URL(
      `../../../packages/cms/tracy-emdash-theme-${id.replace('tracy-', '')}/`,
      import.meta.url
    )
    for (const [file, hash] of Object.entries(descriptor.sourceProof)) {
      const source = readFileSync(new URL(file, directory), 'utf8')
      assert.equal(createHash('sha256').update(source).digest('hex'), hash)
      assert.doesNotMatch(source, /itemtype=.*Review|schema.org\/Review|ratingValue|aggregateRating/)
    }
  }
})

test('verified review retry projects the exact prior baseline and restores only unbound metadata', async () => {
  const { qualityHash } = await import('../src/opportunities-build/quality-dossier.js')
  const { quickstartReviewResumeProjection, reconcileQuickstartReviewPaths } = await import(
    '../src/sites/brief-engines/quickstart-review-fallback.js'
  )
  const before = { quote: 'A real excerpt', initials: '', css: 'keep' },
    data = { quote: 'Call the business.', initials: 'CB', css: 'keep' }
  const record = {
    key: 'home',
    identity: { id: 'entry' },
    revision: 'r2',
    data: structuredClone(data),
    references: {},
    bindings: [
      { key: 'quote', path: ['quote'] },
      { key: 'initials', path: ['initials'] }
    ]
  }
  const receipt = {
    state: 'verified',
    beforeData: before,
    beforeHash: qualityHash(before),
    afterHash: qualityHash(data),
    after: { _rev: 'r2', item: { id: 'entry', liveData: data, references: {} } },
    paths: [['quote'], ['initials']]
  }
  const held = {
    'quickstart:review-fallback:home': receipt,
    'quickstart:editorial-baseline': {
      records: [{ key: 'home', bindings: [{ key: 'quote', path: ['quote'] }] }]
    }
  }
  const adapter = {
    records: [record],
    get: (data, path) => path.reduce((v, k) => v[k], data),
    set: (data, path, value) => {
      data[path[0]] = value
    },
    write: async (r, next, save) => {
      r.data = next
      await save({ state: 'verified' })
    }
  }
  const projected = quickstartReviewResumeProjection(adapter, held)[0]
  assert.deepEqual(projected.data, before)
  assert.equal(projected.bindings.length, 1)
  record.revision = 'human-revision'
  assert.throws(() => quickstartReviewResumeProjection(adapter, held), /RECONCILIATION_REQUIRED/)
  record.revision = 'r2'
  record.data.css = 'human-edit'
  assert.throws(() => quickstartReviewResumeProjection(adapter, held), /RECONCILIATION_REQUIRED/)
  record.data.css = 'keep'
  record.bindings = projected.bindings
  const saved = []
  await reconcileQuickstartReviewPaths({ adapter, held, checkpoint: async (k, v) => saved.push({ k, v }) })
  assert.equal(record.data.initials, '')
  assert.equal(record.data.quote, data.quote)
  assert.equal(record.data.css, 'keep')
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0].v.restored, [['initials']])
})

test('legacy baseline recovery pins original inventory bytes to the released media instead of adopting current pictures', async () => {
  const { recoverQuickstartPictureBaseline } = await import(
    '../src/sites/brief-engines/quickstart-baseline.js'
  )
  const { createHash } = await import('node:crypto')
  const bytes = Buffer.from('original-release-picture'),
    sha = createHash('sha256').update(bytes).digest('hex')
  const input = {
    inventory: {
      copyHash: 'saved',
      structure: [
        {
          shape: {
            image: {
              id: 'media',
              provider: 'local',
              filename: 'original.jpg',
              meta: { storageKey: 'original-key.jpg' }
            }
          }
        }
      ]
    },
    reader: { base: 'http://site.test', bytes: async () => bytes },
    checkAllowed: async () => {},
    releaseVersion: '1.0.0',
    releaseMedia: new Map([['original.jpg', [sha]]])
  }
  const baseline = await recoverQuickstartPictureBaseline(input)
  const { demoQaBody } = await import('../../tracy-host/src/demo-qa.js')
  assert.equal(demoQaBody({ label: 'fixture', platform: 'emdash', baseline }).error, null)
  assert.deepEqual(baseline.pictures.shas, [sha])
  assert.deepEqual(baseline.pictures.files, ['_emdash/api/media/file/original-key.jpg'])
  assert.equal(baseline.provenance.releaseVersion, '1.0.0')
  await assert.rejects(
    recoverQuickstartPictureBaseline({
      ...input,
      reader: { ...input.reader, bytes: async () => Buffer.from('replacement') }
    }),
    /RELEASE_BYTES_MISMATCH/
  )
  await assert.rejects(
    recoverQuickstartPictureBaseline({ ...input, reader: { ...input.reader, bytes: async () => null } }),
    /PICTURE_UNREADABLE/
  )
  await assert.rejects(
    recoverQuickstartPictureBaseline({ ...input, releaseMedia: new Map() }),
    /RELEASE_BYTES_MISMATCH/
  )
})

test('the visual baseline checkpoints before photo work and survives a failed read-only retry', async () => {
  const data = { title: 'Original heading' },
    record = { key: 'home', identity: { id: 'home' }, data, ...nativeCopyBindings(data, ['title']) }
  const source = {
    id: 'build',
    revision_id: 'revision',
    brief: { business: { name: 'Mizuren' } },
    profile_effective: {},
    content: { writes: {} }
  }
  let baselines = 0
  const baseline = { pictures: { files: ['original.jpg'], shas: ['original-hash'] }, read: ['/'], unread: [] }
  const engine = createQuickstartFirstEngine({
    legacy: {},
    woContent: {
      quickstartFor: async () => source,
      recordWrite: async (_id, key, value) => {
        source.content.writes[key] = value
      }
    },
    siteReader: async () => ({}),
    openNative: async () => ({ ...identityReads('Mizuren'), records: [record] }),
    generateFor: async () => async () => {
      throw Error('No paid model expected')
    },
    verifySite: async () => {
      baselines++
      return { baseline }
    },
    planPictures: async () => ({ groups: [{ id: 'photo' }], unresolved: [], excluded: [] }),
    realPictures: {
      forSite: async () => {
        assert.deepEqual(source.content.writes['quickstart:baseline'].baseline, baseline)
        throw Error('PHOTO_READ_FAILURE')
      }
    }
  })
  const ctx = { platform: 'wordpress', normalized: { languages: ['en'] }, time: () => {} }
  for (let i = 0; i < 2; i++)
    await assert.rejects(engine.apply(ctx, await engine.prepare(ctx)), /PHOTO_READ_FAILURE/)
  assert.equal(baselines, 1)
})

test('mixed hours and an exact cited phone span retain independent typed number proofs', () => {
  const sources = [
    {
      id: 'hours',
      type: 'opening-hours',
      text: 'Monday through Saturday: 8:00 AM to 11:00 PM; Sunday closed',
      branch: 'one'
    },
    { id: 'phone', type: 'phone', text: '+84 907 555 268', branch: 'one' }
  ]
  const slot = { key: 'paragraph', sample: 'Visit information', maxWords: 60 }
  const field = {
    key: slot.key,
    value: 'Open 8:00 AM to 11:00 PM. Call +84 907 555 268.',
    sourceIds: ['hours', 'phone'],
    claimRefs: sources.map((s) => ({ id: s.id, type: s.type, branch: s.branch, value: s.text }))
  }
  validateQuickstartEditorial({ inputHash: 'a', fields: [field] }, { inputHash: 'a', slots: [slot], sources })
  assert.equal(field.phoneSpanEvidence.spans[0].sourceId, 'phone')
  for (const value of [
    'Call +84 907 555 269. Open 8:00 AM to 11:00 PM.',
    'Open 9:00 AM to 11:00 PM. Call +84 907 555 268.',
    'Happy hour 8:00 AM to 11:00 PM. Call +84 907 555 268.',
    'Pay USD 907. Call +84 907 555 268.'
  ])
    assert.throws(
      () =>
        validateQuickstartEditorial(
          { inputHash: 'a', fields: [{ ...field, value }] },
          { inputHash: 'a', slots: [slot], sources }
        ),
      /EDITORIAL_CLAIM/
    )
})

test('two rejected promotional drafts can fall back only to a bound real photo observation in article prose', async () => {
  for (const review of [false, true]) {
    const caption = 'Fresh oysters served on ice with a lemon wedge.'
    const record = {
      key: review ? 'testimonials/guest' : 'articles/story',
      identity: { collection: review ? 'testimonials' : 'articles' },
      data: {
        excerpt: 'Original introduction with a detailed paragraph about the business and its services'
      },
      schema: { fields: [{ slug: 'excerpt', type: 'text', label: 'Excerpt' }] },
      context: { pictures: [caption] },
      copy: {
        '["excerpt"]': 'Original introduction with a detailed paragraph about the business and its services'
      }
    }
    const sources = [
      { id: 'business.name', type: 'name', text: 'Example Eatery', branch: 'one' },
      { id: 'photo.real', type: 'story', text: caption, branch: 'one' },
      { id: 'profile.review', type: 'story', text: 'A guest mentioned a past happy hour.', branch: 'one' }
    ]
    let calls = 0
    const receipts = []
    const operation = editQuickstart({
      records: [record],
      sources,
      generate: async ({ input }) => {
        calls++
        return {
          inputHash: input.inputHash,
          fields: input.fields.map((f) => ({
            key: f.key,
            value: 'Happy hour every day',
            sourceIds: [2],
            claimRefs: []
          }))
        }
      },
      recordBatch: async (receipt) => receipts.push(receipt)
    })
    if (review) await assert.rejects(operation, /EDITORIAL_CLAIM/)
    else {
      const result = await operation
      assert.equal(result.records[0].copy['["excerpt"]'], caption)
      assert.equal(receipts[0].fields[0].codeFallback.version, 'bound-photo-prose/1')
    }
    assert.equal(calls, 2)
  }
})

test('old WP photo snapshots recover only exact receipt readback and verified featured media', async () => {
  const raw = {
    ID: 42,
    post_type: 'page',
    post_title: 'Home',
    post_modified: 'new',
    post_modified_gmt: 'new'
  }
  const record = {
    key: 'post/42',
    identity: { kind: 'post', id: 42 },
    raw,
    data: { ...raw, post_modified: 'old', post_modified_gmt: 'old', featured_image_id: 193 }
  }
  const held = {
    'quickstart:photo:post/42': { state: 'verified', after: { item: structuredClone(raw) } },
    'quickstart:pictures': {
      state: 'verified',
      report: {
        receipts: [
          { recordKey: 'post/42', key: 'photo42', derivativeHash: 'hash42', uploaded: { attachment: 193 } }
        ]
      }
    },
    'quickstart:upload:photo42': { state: 'verified', derivativeHash: 'hash42' }
  }
  const reader = {
    text: async (path) => {
      assert.equal(path, '/wp-json/wp/v2/pages/42')
      return JSON.stringify({ featured_media: 193 })
    }
  }
  const result = await quickstartResumeRecords([record], held, reader)
  assert.deepEqual(result[0].data, raw)
  assert.equal(record.data.post_modified, 'old')
  const canonical = { ...record, data: structuredClone(raw) }
  held['quickstart:pictures'].report.receipts[0].featured = true
  await assert.rejects(
    quickstartResumeRecords([canonical], held, { text: async () => '{"featured_media":194}' }),
    /RESUME_CONTENT_CHANGED/
  )
  await assert.rejects(
    quickstartResumeRecords([record], held, { text: async () => '{"featured_media":194}' }),
    /RESUME_CONTENT_CHANGED/
  )
  await assert.rejects(
    quickstartResumeRecords([{ ...record, data: { ...record.data, post_title: 'Changed' } }], held, reader),
    /RESUME_CONTENT_CHANGED/
  )
  const noReceipt = await quickstartResumeRecords([record], {}, reader)
  assert.equal(noReceipt[0].data.featured_image_id, 193)
  const changedRaw = await quickstartResumeRecords(
    [{ ...record, raw: { ...raw, post_title: 'Changed' } }],
    held,
    reader
  )
  assert.equal(changedRaw[0].data.post_modified, 'old')
})

test('editorial preflights all batches and splits only oversized requests without losing fields', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ key: `row${i}`, copy: { title: 'Our story' } }))
  let calls = 0
  const generate = async ({ input }) => {
    calls++
    assert.ok(input.fields.length <= 2)
    return {
      inputHash: input.inputHash,
      fields: input.fields.map((f) => ({ key: f.key, value: 'Mizuren', sourceIds: [0], claimRefs: [] }))
    }
  }
  generate.preflightEditorial = async ({ input }) => {
    assert.match(input.inputHash, /^[a-f0-9]{64}$/)
    if (input.fields.length > 2) throw Object.assign(new Error('large'), { code: 'QUALITY_INPUT_LIMIT' })
  }
  const result = await editQuickstart({ records: rows, sources, generate })
  assert.equal(calls, 3)
  assert.deepEqual(
    result.records.map((r) => r.copy.title),
    Array(5).fill('Mizuren')
  )
  calls = 0
  generate.preflightEditorial = async () => {
    throw Object.assign(new Error('large'), { code: 'QUALITY_INPUT_LIMIT' })
  }
  await assert.rejects(editQuickstart({ records: rows, sources, generate }), /large/)
  assert.equal(calls, 0)
})

test('a local labelled phone heading keeps cache bytes and validates only the exact typed phone', () => {
  const phoneSources = [
    { id: 'business.phone', type: 'phone', branch: 'unspecified', text: '+971 4 555 0223' }
  ]
  const check = (sample, label = 'Helpline', role = null, renderer = null) => {
    const data = { body: `<div><h4>${label}</h4><h2>${sample}</h2></div>` }
    const record = {
      key: 'any-template',
      data,
      copy: { body: data.body },
      bindings: [{ key: 'body', path: ['body'], role, renderer }]
    }
    const inventory = quickstartEditorialInventory([record])
    const slot = inventory.slots.at(-1)
    const field = {
      key: slot.key,
      value: '97145550223',
      sourceIds: ['business.phone'],
      claimRefs: [{ id: 'business.phone', type: 'phone', branch: 'unspecified', value: phoneSources[0].text }]
    }
    return {
      slot,
      field,
      validate: () =>
        validateQuickstartEditorial(
          { inputHash: 'test', fields: [field] },
          { inputHash: 'test', slots: [slot], sources: phoneSources }
        )
    }
  }
  const good = check('1 800 458 56 97')
  assert.ok(good.slot.contactPhone)
  assert.ok(!JSON.stringify(good.slot).includes('contactPhone'))
  good.validate()
  good.field.value = '97148866224'
  assert.throws(good.validate, /EDITORIAL_CLAIM/)
  for (const [sample, label, role, renderer] of [
    ['100', 'Call us', null],
    ['1 000 000', 'Helpline', null],
    ['2026-10-21', 'Helpline', null],
    ['98%', 'Helpline', null],
    ['1 800 458 56 97', 'Annual revenue', null],
    ['1 800 458 56 97', 'Helpline', 'rating'],
    ['1 800 458 56 97', 'Helpline', null, 'number']
  ]) {
    const bad = check(sample, label, role, renderer)
    assert.ok(!bad.slot.contactPhone)
    assert.throws(bad.validate, /EDITORIAL_CLAIM/)
  }
})

test('native shortcode and repeated zero-padded card ordinals retain original bytes with no model claims', () => {
  const make = (captions = ['Give money', 'Give time'], counts = ['01', '02']) => ({
    key: 'generic',
    copy: {
      body: counts.map((n, i) => `<div class="card"><h1>${n}</h1><h2>${captions[i]}</h2></div>`).join('')
    }
  })
  const record = make()
  record.copy.body = `<section>${record.copy.body}</section><!-- wp:shortcode -->\n[any-form title="A &#38; B"]\n<!-- /wp:shortcode -->`
  const { slots } = quickstartEditorialInventory([record])
  const technical = slots.filter((s) => s.technicalContent)
  assert.equal(technical.length, 3)
  assert.ok(!JSON.stringify(slots).includes('technicalContent'))
  const expanded = expandQuickstartEditorial(
    {
      inputHash: 'technical',
      fields: slots.map((_s, i) => ({ key: i, value: 'Wrong', sourceIds: [0], claimRefs: [] }))
    },
    { slots, sources }
  )
  for (const slot of technical) {
    const f = expanded.fields.find((f) => f.key === slot.key)
    assert.equal(f.value, slot.sample)
    assert.deepEqual(f.sourceIds, [])
  }
  const output = applyQuickstartEditorial([record], slots, expanded.fields)[0].copy.body
  assert.match(output, /<h1>01<\/h1>/)
  assert.match(output, /<h1>02<\/h1>/)
  assert.match(output, /title="A &#38; B"/)
  for (const other of [
    make(['Years', 'Awards']),
    make(['Story', 'Story'], ['01', '03']),
    make(['Story', 'Story'], ['01', '01']),
    make(['Story', 'Story'], ['01', '2']),
    { key: 'plain', copy: { body: '<p>[A prose bracket]</p>' } }
  ]) {
    const html = other.copy.body
    other.copy.body = `<section>${html}</section>`
    assert.equal(quickstartEditorialInventory([other]).slots.filter((s) => s.technicalContent).length, 0)
  }
})

test('pagination numbers are native interface state while metric links and controls are not inferred', () => {
  const nav = (values = ['1', '2', '3'], prefix = '') =>
    `<nav>${prefix}<ul>${values.map((v) => `<li><a href="#">${v}</a></li>`).join('')}</ul></nav>`
  const slots = quickstartEditorialInventory([
    { key: 'navigation', copy: { body: nav(['«', '1', '2', '3', '»']) } }
  ]).slots
  assert.equal(slots.filter((s) => s.technicalContent?.version === 'navigation-page-number/1').length, 3)
  for (const body of [
    nav(['1', '3']),
    nav(['1', '2'], '<p>Years of experience</p>'),
    '<nav><a href="https://outside.example">1</a><a href="#">2</a></nav>',
    nav(['1', '2'], '<button>Pay</button>'),
    nav().replace('<nav>', '<nav data-action="payment">'),
    nav().replace('href="#"', 'href="#" aria-controls="tabs"'),
    `<form>${nav()}</form>`
  ]) {
    assert.equal(
      quickstartEditorialInventory([{ key: 'other', copy: { body } }]).slots.filter((s) => s.technicalContent)
        .length,
      0
    )
  }
  for (const label of ['Helpline and support', 'Support 24/7']) {
    const body = `<div><p>${label}</p><p>1 800 458 56 97</p></div>`
    const phone = quickstartEditorialInventory([{ key: 'contact', copy: { body } }]).slots.at(-1)
    assert.ok(phone.contactPhone)
  }
})

test('WordPress template content writes preserve title and area, and a no-op never writes', async () => {
  let item = { id: 42, title: 'Header', content: '<p>Old</p>', area: 'header' },
    writes = []
  const adapter = await openNativeQuickstart({
    ctx: { platform: 'wordpress', runId: 'title-test' },
    apply: async ({ action, params }) => {
      if (action === 'content.list')
        return { items: params.kind === 'templatePart' ? [{ key: 'header' }] : [] }
      if (params.kind === 'option') return { item: null }
      if (action === 'content.get') return { item: structuredClone(item), body_revision: 'body' }
      if (action === 'content.update') {
        writes.push(params.fields)
        item = { ...item, ...params.fields, title: params.fields.title ?? params.key }
        return { ok: true }
      }
      throw Error('Unexpected action')
    }
  })
  const record = adapter.records[0]
  await adapter.write(record, structuredClone(record.data))
  assert.equal(writes.length, 0)
  await adapter.write(record, { ...record.data, content: '<p>New</p>' })
  assert.deepEqual(writes, [{ content: '<p>New</p>', title: 'Header', area: 'header' }])
  assert.equal(record.data.title, 'Header')
})

test('filled Retry restores only receipt-proven template titles after validating the entire snapshot', async () => {
  for (const mode of ['repair', 'resume-one', 'structure-drift', 'revision-drift', 'uncertain']) {
    const records = ['header', 'footer'].map((key, index) => {
      const data = {
        id: index + 1,
        title: key === 'header' ? 'Header' : 'Footer',
        area: key,
        content: '<p>Mizuren</p>'
      }
      return {
        key: `templatePart/${key}`,
        identity: { kind: 'templatePart', key },
        data,
        raw: structuredClone(data),
        bodyRevision: `body-${key}`,
        ...nativeCopyBindings(data, ['content'])
      }
    })
    const filled = {
      workflow: 'quickstart-first/1',
      state: 'filled',
      wrote: 2,
      copyHash: quickstartCopyHash(records),
      initialStructure: nativeStructure(records),
      photos: { receipts: [], gaps: [] }
    }
    const held = { 'quickstart:fill': filled }
    for (const r of records) {
      const beforeData = structuredClone(r.data)
      r.data.title = r.identity.key
      r.raw.title = r.identity.key
      held[`quickstart:copy:${r.key}`] = {
        state: 'verified',
        beforeData,
        after: { item: structuredClone(r.raw), body_revision: r.bodyRevision }
      }
    }
    if (mode === 'resume-one') {
      records[0].data.title = 'Header'
      records[0].raw.title = 'Header'
      records[0].bodyRevision = 'corrected'
    }
    if (mode === 'structure-drift') records[0].data.area = 'different'
    if (mode === 'revision-drift') records[1].bodyRevision = 'external'
    if (mode === 'uncertain') held['quickstart:template-title:header'] = { state: 'sending' }
    let writes = 0
    const adapter = {
      ...identityReads('Mizuren'),
      records,
      write: async (r, data, save) => {
        writes++
        r.data = data
        r.raw = structuredClone(data)
        r.bodyRevision += '-corrected'
        await save({ state: 'verified', after: { item: r.raw, body_revision: r.bodyRevision } })
      }
    }
    const source = {
      id: 'build',
      revision_id: 'revision',
      brief: { business: { name: 'Mizuren' } },
      profile_effective: {},
      content: { writes: held }
    }
    const engine = createQuickstartFirstEngine({
      legacy: {},
      woContent: {
        quickstartFor: async () => source,
        recordWrite: async (_id, key, value) => {
          held[key] = value
        }
      },
      siteReader: async () => ({}),
      openNative: async () => adapter,
      generateFor: async () => () => {
        throw Error('No model call')
      }
    })
    const ctx = { platform: 'wordpress', normalized: { languages: ['en'] }, time: () => {} }
    const prepared = await engine.prepare(ctx)
    if (['repair', 'resume-one'].includes(mode)) {
      await engine.apply(ctx, prepared)
      assert.equal(writes, mode === 'repair' ? 2 : 1)
      assert.deepEqual(
        records.map((r) => r.data.title),
        ['Header', 'Footer']
      )
      assert.equal(held['quickstart:copy:templatePart/footer'].after.item.title, 'footer')
      assert.match(held['quickstart:template-title:templatePart/footer'].sourceReceiptHash, /^[a-f0-9]{64}$/)
    } else {
      await assert.rejects(
        engine.apply(ctx, prepared),
        /QUICKSTART_(RESUME_CONTENT_CHANGED|MUTATION_UNCERTAIN)/
      )
      assert.equal(writes, 0)
    }
  }
})

test('Joomla nested JSON image and URL bindings use the same complete path as contract coverage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nested-media-'))
  try {
    writeFileSync(
      join(dir, 'content-map.json'),
      JSON.stringify({
        entities: [
          { key: 'module-94', kind: 'module', sourceId: 94 },
          { key: 'module-98', kind: 'module', sourceId: 98 }
        ],
        slots: [
          { key: 'trashed', entity: 'module-98', column: 'content', type: 'text' },
          {
            key: 'photo',
            entity: 'module-94',
            column: 'params',
            type: 'image',
            nestedJson: 'jatools-config',
            jsonPath: ['slides', 'image', 0]
          },
          {
            key: 'link',
            entity: 'module-94',
            column: 'params',
            type: 'url',
            nestedJson: 'jatools-config',
            jsonPath: ['slides', 'url', 0]
          }
        ]
      })
    )
    const adapter = await openNativeQuickstart({
      ctx: { platform: 'joomla', contract: { dir } },
      apply: async ({ action, params }) => {
        if (action === 'content.list')
          return { items: params.kind === 'module' ? [{ id: 94, published: 1, client_id: 0 }] : [] }
        if (action === 'content.get' && Number(params.id) === 98) return { item: { id: 98, published: -2 } }
        if (action === 'content.get')
          return {
            item: {
              id: 94,
              title: 'Slides',
              client_id: 0,
              params: JSON.stringify({
                'jatools-config': JSON.stringify({
                  slides: { image: ['images/real.jpg'], url: ['index.php?Itemid=142'] }
                })
              })
            }
          }
        throw Error('Unexpected mutation')
      }
    })
    const record = adapter.records[0]
    assert.deepEqual(record.mediaBindings[0].path, ['params', 'jatools-config', 'slides', 'image', 0])
    assert.deepEqual(record.linkBindings[0].path, ['params', 'jatools-config', 'slides', 'url', 0])
    assert.equal(adapter.get(record.data, record.mediaBindings[0].path), 'images/real.jpg')
    assert.equal(adapter.coverage.filter((c) => c.state === 'required-unresolved').length, 0)
    assert.equal(adapter.coverage.find((c) => c.surface === 'trashed').reason, 'native-record-trashed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Joomla inventory reads every page before filtering published rows', async () => {
  const pages = [],
    reads = []
  const all = Array.from({ length: 201 }, (_, n) => ({ id: n + 1, state: n === 200 ? 1 : 0 }))
  const adapter = await openNativeQuickstart({
    ctx: { platform: 'joomla' },
    apply: async ({ action, params }) => {
      if (action === 'content.list') {
        if (params.kind !== 'article') return { items: [] }
        pages.push(params.offset)
        return { items: all.slice(params.offset, params.offset + params.limit) }
      }
      if (action === 'content.get') {
        reads.push(params.id)
        return { item: { id: params.id, state: 1, title: 'Last page', introtext: '<p>Real content</p>' } }
      }
      throw Error('Inventory must not write')
    }
  })
  assert.deepEqual(pages, [0, 100, 200])
  assert.deepEqual(reads.map(Number), [201])
  assert.equal(adapter.records.length, 1)
})

test('Joomla inventory refuses a Cowork plugin that repeats pages instead of silently truncating', async () => {
  let reads = 0
  await assert.rejects(
    openNativeQuickstart({
      ctx: { platform: 'joomla' },
      apply: async ({ action }) => {
        if (action === 'content.list')
          return { items: Array.from({ length: 100 }, (_, n) => ({ id: n + 1, state: 1 })) }
        reads++
        throw Error('No writes or detail reads before complete inventory')
      }
    }),
    { code: 'QUICKSTART_INVENTORY_PAGINATION_REQUIRED' }
  )
  assert.equal(reads, 0)
})

test('contract compilation shares nested text, image and link paths while preserving observed empty values', async () => {
  const { compileQuickstartContract } = await import('../src/sites/brief-engines/quickstart-contract-plan.js')
  const data = { params: { nested: { title: 'Welcome', empty: '', image: '/photo.jpg', href: '/visit' } } }
  const original = structuredClone(data)
  const record = { key: 'module/7', identity: { kind: 'module', id: 7 }, data, copy: {}, bindings: [] }
  const slot = (key, type) => ({
    key,
    entity: 'm',
    column: 'params',
    nestedJson: 'nested',
    jsonPath: [key],
    type
  })
  const plan = compileQuickstartContract({
    platform: 'joomla',
    records: [record],
    map: {
      entities: [{ key: 'm', kind: 'module', sourceId: 7 }],
      slots: [
        { ...slot('title', 'text'), input: 'name', maxCharacters: 30 },
        slot('empty', 'text'),
        slot('image', 'image'),
        slot('href', 'url')
      ]
    }
  })
  assert.deepEqual(plan.issues, [])
  assert.equal(plan.coverage.find((entry) => entry.surface === 'empty').disposition, 'empty-preserved')
  assert.equal(record.bindings.length, 1)
  assert.equal(record.bindings[0].fact, 'name')
  assert.deepEqual(record.bindings[0].path, ['params', 'nested', 'title'])
  assert.deepEqual(record.mediaBindings[0].path, ['params', 'nested', 'image'])
  assert.deepEqual(record.linkBindings[0].path, ['params', 'nested', 'href'])
  assert.deepEqual(record.data, original)
})

test('contract compilation reports every missing or wrong-type target even when the contract sample is empty', async () => {
  const { compileQuickstartContract } = await import('../src/sites/brief-engines/quickstart-contract-plan.js')
  const record = {
    key: 'module/7',
    identity: { kind: 'module', id: 7 },
    data: { params: { object: {} } },
    copy: {},
    bindings: []
  }
  const plan = compileQuickstartContract({
    platform: 'joomla',
    records: [record],
    map: {
      entities: [
        { key: 'm', kind: 'module', sourceId: 7 },
        { key: 'missing', kind: 'module', sourceId: 8 }
      ],
      slots: [
        { key: 'absent', entity: 'm', column: 'params', jsonPath: ['absent'], sample: '', type: 'text' },
        { key: 'object', entity: 'm', column: 'params', jsonPath: ['object'], sample: '', type: 'text' },
        { key: 'missing', entity: 'missing', column: 'title', sample: '', type: 'text' }
      ]
    }
  })
  assert.deepEqual(
    plan.issues.map((entry) => entry.reason),
    ['contract-path-missing', 'contract-value-type-unsupported', 'contract-entity-missing']
  )
  assert.equal(record.bindings.length, 0)
})

test('native unpublished contract entities are excluded with publication proof without any write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qs-publication-test-'))
  try {
    writeFileSync(
      join(dir, 'content-map.json'),
      JSON.stringify({
        entities: [{ key: 'banner', kind: 'module', sourceId: 102 }],
        slots: [{ key: 'image', entity: 'banner', column: 'content', type: 'image' }]
      })
    )
    const adapter = await openNativeQuickstart({
      ctx: { platform: 'joomla', contract: { dir } },
      apply: async ({ action, params }) => {
        if (action === 'content.list')
          return {
            items:
              params.kind === 'module'
                ? [
                    { id: 1, published: 1 },
                    { id: 102, published: 0 }
                  ]
                : []
          }
        if (action === 'content.get')
          return {
            item: {
              id: params.id,
              published: params.id === 102 ? 0 : 1,
              title: 'Module',
              content: '<p>Text</p>'
            }
          }
        throw Error('No CMS write allowed')
      }
    })
    const entry = adapter.coverage.find((item) => item.surface === 'image')
    assert.equal(entry.disposition, 'nonpublic-preserved')
    assert.equal(entry.proof.publication, 0)
    assert.equal(adapter.records.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('WordPress page contract identity resolves native posts by declared post type and slug', async () => {
  const { compileQuickstartContract } = await import('../src/sites/brief-engines/quickstart-contract-plan.js')
  const data = {
    post_type: 'page',
    post_name: 'about',
    post_content: '<!-- wp:paragraph {"metadata":{"name":"text.about"}} --><p>About</p><!-- /wp:paragraph -->'
  }
  const record = {
    key: 'post/42',
    identity: { kind: 'post', id: 42 },
    data,
    ...nativeCopyBindings(data, ['post_content'])
  }
  const map = {
    entities: [{ key: 'about', kind: 'page', sourceId: 10, identity: { slug: 'about', postType: 'page' } }],
    slots: [{ key: 'body', entity: 'about', type: 'text', target: { block: 'text.about' } }]
  }
  const compiled = compileQuickstartContract({ map, records: [record], platform: 'wordpress' })
  assert.equal(compiled.issues.length, 0)
  assert.equal(record.bindings[0].slots[0].key, 'body')
  const wrong = structuredClone(record)
  wrong.data.post_type = 'post'
  assert.equal(
    compileQuickstartContract({ map, records: [wrong], platform: 'wordpress' }).issues[0].reason,
    'contract-entity-missing'
  )
})

test('picture preflight reports all unreadable slots before paid vision or uploads', async () => {
  const data = { title: 'Original heading' }
  const record = { key: 'home', identity: { id: 'home' }, data, ...nativeCopyBindings(data, ['title']) }
  const source = {
    id: 'build',
    revision_id: 'revision',
    brief: { business: { name: 'Mizuren' }, reviewMode: 'manual' },
    profile_effective: {},
    content: { writes: {} }
  }
  let paid = 0,
    writes = 0
  const issues = [
    { record: 'home', path: ['one'], reason: 'image-unreadable' },
    { record: 'home', path: ['two'], reason: 'external-image-reference' }
  ]
  const engine = createQuickstartFirstEngine({
    legacy: {},
    woContent: {
      quickstartFor: async () => source,
      recordWrite: async (_id, key, value) => {
        source.content.writes[key] = value
      }
    },
    siteReader: async () => ({}),
    openNative: async () => ({ ...identityReads('Mizuren'), records: [record], coverage: [] }),
    generateFor: async () => async () => {
      paid++
      throw Error('No model call allowed')
    },
    planPictures: async () => ({ groups: [], unresolved: issues, excluded: [] }),
    realPictures: {
      forSite: async () => {
        paid++
        throw Error('No vision call allowed')
      }
    },
    placePictures: async () => {
      writes++
      throw Error('No upload allowed')
    }
  })
  const ctx = { platform: 'wordpress', normalized: { languages: ['en'] }, time: () => {} }
  await assert.rejects(engine.apply(ctx, await engine.prepare(ctx)), /QUICKSTART_PICTURE_COVERAGE_INCOMPLETE/)
  assert.equal(paid, 0)
  assert.equal(writes, 0)
  assert.deepEqual(source.content.writes['quickstart:preflight'].issues, issues)
  assert.equal(source.content.writes['quickstart:preflight'].ok, false)
})

test('contract XPath metadata applies only to its occurrence and missing targets stay unresolved', async () => {
  const { compileQuickstartContract } = await import('../src/sites/brief-engines/quickstart-contract-plan.js')
  const data = { content: '<h2>Heading</h2><p>Body copy</p><img src="photo.jpg" alt="">' }
  const record = {
    key: 'module/1',
    identity: { kind: 'module', id: 1 },
    data,
    ...nativeCopyBindings(data, ['content'])
  }
  const map = {
    entities: [{ key: 'module', kind: 'module', sourceId: 1 }],
    slots: [
      {
        key: 'heading',
        entity: 'module',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/h2/text()',
        maxCharacters: 25
      },
      {
        key: 'body',
        entity: 'module',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/p/text()',
        maxCharacters: 250
      },
      {
        key: 'absent',
        entity: 'module',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/aside/text()',
        maxCharacters: 3
      },
      {
        key: 'alt',
        entity: 'module',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/img/@alt',
        maxCharacters: 40
      }
    ]
  }
  const compiled = compileQuickstartContract({ map, records: [record], platform: 'joomla' })
  assert.deepEqual(
    compiled.issues.map((item) => item.surface),
    ['absent']
  )
  assert.equal(compiled.coverage.find((item) => item.surface === 'alt').disposition, 'empty-preserved')
  assert.deepEqual(
    quickstartEditorialInventory([record]).slots.map((item) => item.maxCharacters),
    [25, 250]
  )
  assert.equal(record.data.content, data.content)
  record.copy[record.bindings[0].key] = '<img src="a-much-longer-upload-path.jpg">' + data.content
  assert.deepEqual(
    quickstartEditorialInventory([record]).slots.map((item) => item.maxCharacters),
    [25, 250]
  )
})

test('media descriptors in named blocks do not override editorial roles', async () => {
  const { compileQuickstartContract } = await import('../src/sites/brief-engines/quickstart-contract-plan.js')
  const data = {
    post_type: 'page',
    post_content:
      '<!-- wp:paragraph {"metadata":{"name":"contact"}} --><p>Contact us</p><!-- /wp:paragraph -->'
  }
  const record = {
    key: 'post/1',
    identity: { kind: 'post', id: 1 },
    data,
    ...nativeCopyBindings(data, ['post_content'])
  }
  const map = {
    entities: [{ key: 'page', kind: 'page', sourceId: 1 }],
    slots: [
      {
        key: 'url',
        entity: 'page',
        type: 'url',
        target: { block: 'contact', attr: 'url' },
        role: 'website',
        maxCharacters: 2048
      },
      {
        key: 'text',
        entity: 'page',
        type: 'text',
        target: { block: 'contact' },
        role: 'cta',
        maxCharacters: 40
      }
    ]
  }
  const compiled = compileQuickstartContract({ map, records: [record], platform: 'wordpress' })
  assert.deepEqual(
    compiled.issues.map((item) => item.reason),
    ['contract-block-attribute-unresolved']
  )
  assert.equal(record.bindings[0].slots.length, 1)
  const [field] = quickstartEditorialInventory([record]).slots
  assert.equal(field.semanticRole, 'cta')
  assert.equal(field.maxCharacters, 40)
})

test('named block empty text is preserved and malformed block markup reports an issue', async () => {
  const { compileQuickstartContract } = await import('../src/sites/brief-engines/quickstart-contract-plan.js')
  const map = {
    entities: [{ key: 'page', kind: 'page', sourceId: 1 }],
    slots: [{ key: 'text', entity: 'page', type: 'text', target: { block: 'empty', attr: 'content' } }]
  }
  const make = (post_content) => {
    const data = { post_type: 'page', post_content }
    return {
      key: 'post/1',
      identity: { kind: 'post', id: 1 },
      data,
      ...nativeCopyBindings(data, ['post_content'])
    }
  }
  const empty = make('<!-- wp:paragraph {"metadata":{"name":"empty"}} --><p></p><!-- /wp:paragraph -->')
  assert.equal(
    compileQuickstartContract({ map, records: [empty], platform: 'wordpress' }).coverage[0].disposition,
    'empty-preserved'
  )
  const malformed = make('<!-- wp:paragraph {"metadata": -->')
  assert.equal(
    compileQuickstartContract({ map, records: [malformed], platform: 'wordpress' }).issues.length,
    1
  )
})

test('a revision frozen without a profile has no reviews, it does not fail the fill', async () => {
  // A /v1/demos revision stores profile_effective as JSON null; the fill died on "reading 'googlePlace'" (25/10/2026).
  const { quickstartReviews } = await import('../src/lib/quickstart-reviews.js')
  assert.deepEqual(quickstartReviews(null), [])
})

test('a pinned review is the whole collected review, never cut to the template copy length', () => {
  const text =
    'We came for the noodles and stayed for the broth, which was deep and fragrant, and the staff explained every dish with patience and good humour all evening long.'
  const record = {
    key: 'testimonials',
    copy: { quote: 'Short demo words', author: 'Sample' },
    bindings: [
      { key: 'quote', path: ['reviews', 0, 'quote'] },
      { key: 'author', path: ['reviews', 0, 'author'] }
    ]
  }
  const pins = quickstartFactCopy(record, {}, [{ text, author: 'An', provider: 'Google Reviews' }])
  assert.ok(pins.quote.startsWith(`${text} — An`), pins.quote)
  assert.doesNotMatch(pins.quote, /…/)
})

test("the review sites' reviews (TripAdvisor, Google Maps) reach the quickstart's testimonials", async () => {
  const { quickstartReviews } = await import('../src/lib/quickstart-reviews.js')
  const reviews = quickstartReviews({
    reviewSources: {
      tripadvisor: {
        attribution: 'TripAdvisor',
        reviews: [
          { id: 't1', source: 'tripadvisor', text: 'Superb.', author: 'Lan', url: 'https://ta.test/t1' }
        ]
      },
      googleMaps: {
        attribution: 'Google',
        reviews: [
          {
            id: 'g1',
            source: 'google-maps',
            attribution: 'Google',
            text: 'Cosy.',
            author: 'Ben',
            url: 'https://maps.test/g1'
          }
        ]
      }
    }
  })
  assert.deepEqual(
    reviews.map((r) => [r.author, r.provenance.provider, r.provenance.url]),
    [
      ['Lan', 'TripAdvisor', 'https://ta.test/t1'],
      ['Ben', 'Google', 'https://maps.test/g1']
    ]
  )
})

test("the editor's sources hold the place's own website pages, own posts, Google's rating and its social figures, each citable (product owner, 26/10/2026)", async () => {
  const { quickstartSources } = await import('../src/sites/brief-engines/quickstart-first.js')
  const sources = quickstartSources({
    brief: {
      business: { name: 'Lotus Spa' },
      googlePlace: { rating: 4.6, userRatingCount: 1234, googleMapsUri: 'https://maps.test/lotus' },
      content: {
        items: [
          {
            id: 'post:facebook:1',
            authorship: 'page',
            kinds: ['story'],
            title: 'Ten years',
            body: 'We opened in 2016.'
          },
          { id: 'post:facebook:2', authorship: 'guest', kinds: ['story'], body: 'A guest wrote this.' }
        ]
      },
      agentDemoSnapshot: {
        sources: [
          {
            id: 's1',
            data: {
              source: 'website',
              collected: {
                pages: [{ url: 'https://lotus.test/about', title: 'About', text: 'Thai massage since 2016.' }]
              }
            }
          }
        ]
      }
    },
    profile_effective: {},
    socialFigures: [
      { platform: 'Facebook', label: 'followers', amount: 5321, url: 'https://facebook.com/lotus' }
    ]
  })
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]))
  assert.match(byId['website.pages.0'].text, /Thai massage since 2016\./)
  assert.match(byId['website.pages.0'].text, /https:\/\/lotus\.test\/about/)
  assert.match(byId['content.post:facebook:1'].text, /We opened in 2016\./)
  // Only the place's own posts: a guest's words are no source of the business.
  assert.equal(byId['content.post:facebook:2'], undefined)
  assert.equal(byId['brief.googlePlace.rating'].type, 'rating')
  assert.match(byId['brief.googlePlace.rating'].text, /Google: 4\.6 \/ 5 from 1234 reviews/)
  assert.match(byId['social.0'].text, /Facebook.*5321 followers.*https:\/\/facebook\.com\/lotus/)
})

test('the editor reads a new revision’s website pages through the research the app resolves for it (#1791)', async () => {
  const { quickstartSources } = await import('../src/sites/brief-engines/quickstart-first.js')
  const page = { url: 'https://lotus.test/about', title: 'About', text: 'Thai massage since 2016.' }
  const source = {
    brief: { business: { name: 'Lotus Spa' }, agentDemoResearch: { version: 'agent-demo-research-ref/1' } },
    profile_effective: {}
  }
  const seen = []
  const sources = quickstartSources(source, {
    researchOf: (s) => {
      seen.push(s)
      return { sources: [{ id: 's1', data: { source: 'website', collected: { pages: [page] } } }] }
    }
  })
  assert.deepEqual(seen, [source])
  assert.match(sources.find((s) => s.id === 'website.pages.0').text, /Thai massage since 2016\./)
  // No resolver injected: a brief that embeds no research gives no website page.
  assert.equal(
    quickstartSources(source).find((s) => s.id === 'website.pages.0'),
    undefined
  )
})
