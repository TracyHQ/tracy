import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { validateContent, validateContentGraph, assertSchemaVocabulary, schema } from '../validate.mjs'

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
const fixture = (cms = 'joomla') => read(`./fixtures/${cms}.json`)
const heavy = ['bodyHtml', 'tags', 'fields', 'blocks', 'images', 'relations']
const summary = (c) => {
  for (const key of heavy) delete c[key]
  c.detailState = 'summary'
}
const rejects = (value, code, validator = validateContent) => {
  const errors = validator(value)
  assert.ok(
    errors.some((e) => e.code === code),
    JSON.stringify(errors)
  )
}

for (const cms of ['joomla', 'wordpress', 'emdash']) {
  test(`${cms}: extracted fixture and synthetic graph conform`, () => {
    const value = fixture(cms)
    assert.deepEqual(validateContent(value), [])
    assert.deepEqual(validateContentGraph(value.contents), [])
  })
  test(`${cms}: summary omits unloaded data and keeps identity/revision`, () => {
    const value = fixture(cms)
    const ids = value.contents.map((c) => [c.id, c.revision])
    value.contents.forEach(summary)
    assert.deepEqual(validateContent(value), [])
    assert.deepEqual(
      value.contents.map((c) => [c.id, c.revision]),
      ids
    )
    value.contents[0].blocks = []
    rejects(value, 'CONTENT_SCHEMA_INVALID')
  })
  test(`${cms}: block and item continuations use partial state`, () => {
    const value = fixture(cms)
    const c = value.contents[0]
    c.detailState = 'partial'
    c.links.next = `/content.json?id=${c.id}&blocksCursor=opaque-example`
    c.blocksPagination = { limit: 1, nextCursor: 'opaque-example', total: null }
    c.blocks = [c.blocks[0]]
    assert.deepEqual(validateContent(value), [])
    delete c.links.next
    rejects(value, 'CONTENT_SCHEMA_INVALID')
    c.links.next = `/content.json?id=${c.id}&blockId=b-list&itemsCursor=opaque-example`
    c.blocks = [fixture(cms).contents[0].blocks[1]]
    delete c.blocksPagination
    c.blocks[0].itemsPagination = { limit: 1, nextCursor: 'opaque-example', total: null }
    assert.deepEqual(validateContent(value), [])
    c.detailState = 'complete'
    rejects(value, 'CONTENT_PARTIAL_REQUIRED')
  })
}

const pointer = (value, path) =>
  path
    .slice(1)
    .split('/')
    .reduce((at, key) => at[key], value)
for (const source of read('./fixtures/sources.json'))
  test(`source provenance: ${source.fixture}`, () => {
    const bytes = readFileSync(new URL(`../../../../${source.source}`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256)
    const original = JSON.parse(bytes)
    const output = read(`./fixtures/${source.fixture}`)
    for (const extraction of source.extracted)
      assert.deepEqual(pointer(output, extraction.target), pointer(original, extraction.source))
    assert.match(source.synthetic, /No live CMS response/)
  })

const mutations = [
  [
    'missing required envelope field',
    (v) => {
      delete v.snapshot
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'missing nullable field is not null',
    (v) => {
      delete v.contents[0].title
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown visibility is explicit',
    (v) => {
      v.contents[0].blocks[0].visibility = null
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown field type',
    (v) => {
      v.contents[0].fields[0].type = 'mystery'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'wrong typed field value',
    (v) => {
      v.contents[0].fields[0].value = 1
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'zero media size is not unknown',
    (v) => {
      v.contents[0].images[0].width = 0
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'negative position',
    (v) => {
      v.contents[0].blocks[0].position = -1
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'unknown major',
    (v) => {
      v.schemaVersion = 'tracy-content/v2'
    },
    'CONTENT_VERSION_UNSUPPORTED'
  ],
  [
    'public feed not enabled',
    (v) => {
      v.view = 'public'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'duplicate content',
    (v) => {
      v.contents.push(v.contents[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate block',
    (v) => {
      v.contents[0].blocks.push(v.contents[0].blocks[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate item',
    (v) => {
      v.contents[0].blocks[1].items.push(v.contents[0].blocks[1].items[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate field',
    (v) => {
      v.contents[0].fields.push(v.contents[0].fields[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'duplicate media',
    (v) => {
      v.contents[0].images.push(v.contents[0].images[0])
    },
    'CONTENT_DUPLICATE_ID'
  ],
  [
    'shared source must not be copied into occurrence',
    (v) => {
      v.contents[0].blocks[0].fields.push(v.contents[0].fields[0])
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'missing detail payload',
    (v) => {
      delete v.contents[0].blocks
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'complete with continuation',
    (v) => {
      v.contents[0].blocksPagination = { limit: 1, nextCursor: 'next', total: null }
    },
    'CONTENT_PARTIAL_REQUIRED'
  ],
  [
    'invalid locale',
    (v) => {
      v.contents[0].locale = 'en_GB'
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'undeclared locale',
    (v) => {
      v.contents[0].locale = 'vi-VN'
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'duplicate locales',
    (v) => {
      v.site.locales.push('en-GB')
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'unknown default locale',
    (v) => {
      v.site.defaultLocale = 'vi-VN'
    },
    'CONTENT_LOCALE_INVALID'
  ],
  [
    'external continuation',
    (v) => {
      v.contents[0].links.self = 'https://other.invalid/content.json'
    },
    'CONTENT_LINK_INVALID'
  ],
  [
    'script link',
    (v) => {
      v.contents[0].links.self = 'javascript:alert(1)'
    },
    'CONTENT_LINK_INVALID'
  ],
  [
    'credential in link',
    (v) => {
      v.contents[0].links.self = 'https://user:secret@example.invalid/content.json'
    },
    'CONTENT_LINK_INVALID'
  ],
  [
    'unknown total differs from false count',
    (v) => {
      v.pagination.total = 0
    },
    'CONTENT_PAGINATION_INVALID'
  ],
  [
    'limit exceeded',
    (v) => {
      v.pagination.limit = 1
    },
    'CONTENT_PAGINATION_INVALID'
  ],
  [
    'zero limit',
    (v) => {
      v.pagination.limit = 0
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'over maximum limit',
    (v) => {
      v.pagination.limit = 101
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'complete coverage contradicts unresolved',
    (v) => {
      v.completeness.status = 'complete'
    },
    'CONTENT_COMPLETENESS_INVALID'
  ],
  [
    'invalid date',
    (v) => {
      v.snapshot.readAt = '2026-02-30T10:00:00Z'
    },
    'CONTENT_SCHEMA_INVALID'
  ],
  [
    'mixed success and error',
    (v) => {
      v.error = { code: 'CONTENT_NOT_FOUND', message: 'Not found.' }
    },
    'CONTENT_SCHEMA_INVALID'
  ]
]
for (const [name, mutate, code] of mutations)
  test(name, () => {
    const value = fixture()
    mutate(value)
    rejects(value, code)
  })

test('null scalars, typed values, unknown optional fields and empty known arrays', () => {
  const value = fixture()
  value.extension = { future: true }
  value.pagination.total = null
  const c = value.contents[0]
  for (const [type, fieldValue] of [
    ['text', null],
    ['number', 0],
    ['boolean', false],
    ['json', { list: [null, 3] }]
  ]) {
    c.fields[0].type = type
    c.fields[0].value = fieldValue
    assert.deepEqual(validateContent(value), [])
  }
  c.blocks = []
  c.images = []
  assert.deepEqual(validateContent(value), [])
})

test('non-JSON values cannot turn into misleading null/omitted data', () => {
  for (const bad of [undefined, NaN, Infinity, () => {}, new Date(), 1n]) {
    const value = fixture()
    value.contents[0].fields[0].value = bad
    rejects(value, 'CONTENT_SCHEMA_INVALID')
  }
  const cycle = fixture()
  cycle.loop = cycle
  rejects(cycle, 'CONTENT_SCHEMA_INVALID')
})

test('UTF-8 byte budget counts multibyte values without truncating', () => {
  const value = fixture()
  value.contents[0].bodyHtml = '界'.repeat(90000)
  const before = structuredClone(value)
  rejects(value, 'CONTENT_RESPONSE_TOO_LARGE')
  assert.deepEqual(value, before)
  assert.deepEqual(validateContent(value, { maxBytes: 300000 }), [])
})

for (const code of schema.$defs.error.properties.error.properties.code.enum)
  test(`error envelope: ${code}`, () => {
    const error = {
      code,
      message: 'Request refused.',
      ...(code === 'CONTENT_FIELD_TOO_LARGE'
        ? { field: { contentId: 'c-example', blockId: null, itemId: null, key: 'bodyHtml' } }
        : {})
    }
    assert.deepEqual(validateContent({ error }), [])
    rejects({ error: { code } }, 'CONTENT_SCHEMA_INVALID')
  })

test('references across pages are checked only in collected authorized scope', () => {
  const value = fixture()
  value.contents = [value.contents[0]]
  value.pagination.nextCursor = 'synthetic-next'
  assert.deepEqual(validateContent(value), [])
  rejects(value.contents, 'CONTENT_REFERENCE_INVALID', validateContentGraph)
  assert.deepEqual(validateContentGraph(fixture().contents), [])
  const all = fixture().contents
  all.push(all[0])
  rejects(all, 'CONTENT_DUPLICATE_ID', validateContentGraph)
})

test('shared target must be shared and cannot point to self', () => {
  const value = fixture()
  value.contents[1].type = 'page'
  rejects(value.contents, 'CONTENT_SHARED_INVALID', validateContentGraph)
  value.contents[0].type = 'shared'
  value.contents[0].blocks[0].sharedContentId = value.contents[0].id
  rejects(value.contents, 'CONTENT_SHARED_INVALID', validateContentGraph)
})

test('dangling item, relation, media block and media item references fail', () => {
  for (const mutate of [
    (c) => {
      c.blocks[1].items[0].contentId = 'missing'
    },
    (c) => {
      c.relations.push({ type: 'related', contentId: 'missing' })
    },
    (c) => {
      c.images[0].usages[0].contentId = 'missing'
    },
    (c) => {
      c.images[0].usages[0].blockId = 'missing'
    },
    (c) => {
      c.images[0].usages[0].itemId = 'missing'
    }
  ]) {
    const value = fixture()
    mutate(value.contents[0])
    rejects(value.contents, 'CONTENT_REFERENCE_INVALID', validateContentGraph)
  }
})

test('translation fixture has independent identity, confirmed group and different locale', () => {
  const value = fixture()
  const c = value.contents[0]
  const translation = structuredClone(c)
  translation.id = 'c-example-translation'
  translation.locale = 'vi-VN'
  translation.blocks = []
  translation.images = []
  c.translationGroupId = translation.translationGroupId = 'synthetic-confirmed-group'
  c.relations = [{ type: 'translation', contentId: translation.id }]
  translation.relations = [{ type: 'translation', contentId: c.id }]
  value.contents.push(translation)
  value.pagination.total = 3
  value.site.locales.push('vi-VN')
  assert.deepEqual(validateContent(value), [])
  assert.deepEqual(validateContentGraph(value.contents), [])
  for (const [key, bad] of [
    ['locale', 'en-GB'],
    ['locale', null],
    ['translationGroupId', null],
    ['translationGroupId', 'other']
  ]) {
    const previous = translation[key]
    translation[key] = bad
    rejects(value.contents, 'CONTENT_TRANSLATION_INVALID', validateContentGraph)
    translation[key] = previous
  }
})

test('schema vocabulary fails closed when extended beyond implemented keywords', () => {
  assert.throws(() => assertSchemaVocabulary({ pattern: '^x' }), /Unsupported schema keyword/)
  assert.throws(() => assertSchemaVocabulary({ format: 'uri' }), /Unsupported format/)
})

for (const status of ['draft', 'private', 'scheduled', 'published', 'archived', 'unknown'])
  test(`publication shape only: ${status}`, () => {
    const value = fixture()
    value.contents[0].publication = {
      status,
      valueSource: 'current',
      scheduledAt: status === 'scheduled' ? '2026-10-01T00:00:00Z' : null
    }
    assert.deepEqual(validateContent(value), [])
  })

test('nested pagination must agree with returned items and blocks', () => {
  const value = fixture()
  const c = value.contents[0]
  c.detailState = 'partial'
  c.links.next = '/content.json?id=c-example-page&blocksCursor=next'
  c.blocksPagination = { limit: 1, nextCursor: 'next', total: null }
  rejects(value, 'CONTENT_PAGINATION_INVALID')
  delete c.blocksPagination
  c.blocks[1].itemsPagination = { limit: 1, nextCursor: 'next', total: 0 }
  rejects(value, 'CONTENT_PAGINATION_INVALID')
})

test('invalid time and too-large field errors cannot omit their field identity', () => {
  const value = fixture()
  value.snapshot.readAt = '2026-09-25T24:00:00Z'
  rejects(value, 'CONTENT_SCHEMA_INVALID')
  rejects(
    { error: { code: 'CONTENT_FIELD_TOO_LARGE', message: 'Field exceeds budget.' } },
    'CONTENT_SCHEMA_INVALID'
  )
})

test('oversized body discovery carries a snapshot and credential-free first block link', () => {
  const response = {
    error: {
      code: 'CONTENT_FIELD_TOO_LARGE',
      message: 'Body exceeds budget',
      field: { contentId: 'page-a', blockId: null, itemId: null, key: 'bodyHtml' },
      snapshot: { revision: 'r1', readAt: '2026-09-25T00:00:00Z' },
      links: {
        firstBlock:
          'https://fixture.invalid/content.json?id=page-a&blockId=block-a&blocksCursor=signed-opaque'
      }
    }
  }
  assert.deepEqual(validateContent(response), [])
  for (const suffix of ['&token=secret', '&scope=editorial', '#fragment']) {
    const bad = structuredClone(response)
    bad.error.links.firstBlock += suffix
    rejects(bad, 'CONTENT_SCHEMA_INVALID')
  }
  for (const key of ['id', 'blockId', 'blocksCursor']) {
    const bad = structuredClone(response)
    const url = new URL(bad.error.links.firstBlock)
    url.searchParams.delete(key)
    bad.error.links.firstBlock = url.href
    rejects(bad, 'CONTENT_SCHEMA_INVALID')
  }
  const bad = structuredClone(response)
  delete bad.error.snapshot
  rejects(bad, 'CONTENT_SCHEMA_INVALID')
  const legacy = structuredClone(response)
  delete legacy.error.links
  delete legacy.error.snapshot
  assert.deepEqual(validateContent(legacy), [], 'legacy 413 remains valid; no block discovery advertised')
})
