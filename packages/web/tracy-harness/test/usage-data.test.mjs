import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const require = createRequire(import.meta.url)
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootRequire = createRequire(path.resolve(pkgRoot, '../../../package.json'))
let usage
before(async () => {
  const result = await rootRequire('esbuild').build({
    stdin: {
      contents:
        "export * from './usage-data'; export { createUsageReader } from './usage-api'; export { tr } from '../i18n'",
      resolveDir: path.join(pkgRoot, 'src/beta'),
      loader: 'ts'
    },
    bundle: true,
    plugins: [opsI18nPlugin()],
    write: false,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  usage = module.exports
})
const customer = (changes) => ({ requests: 10, changed: changes, bad: 0, undone: 0, reworks: 0 })

test('frequent requests without a confirmed change stay a neutral review cue', () => {
  assert.deepEqual(usage.customerStatus(usage.tr, customer(0)), {
    label: 'No confirmed changes',
    tone: 'neutral'
  })
  assert.equal(usage.customerStatus(usage.tr, customer(1)).label, 'Frequent user')
  assert.equal(usage.customerStatus(usage.tr, { ...customer(0), requests: 2 }).label, 'Active')
})

test('direct adverse evidence takes priority over the frequent-user label', () => {
  for (const key of ['bad', 'undone', 'reworks']) {
    assert.equal(usage.customerStatus(usage.tr, { ...customer(5), [key]: 1 }).label, 'Review feedback')
  }
})

test('zero eligible requests differ from a measured zero and small groups keep counts', () => {
  assert.equal(usage.rateLabel(usage.tr, { a: 0, b: 0, rate: null }), '0 of 0 requests eligible')
  assert.equal(usage.rateLabel(usage.tr, { a: 0, b: 10, rate: null }), '0 of 10 requests')
  assert.equal(usage.rateLabel(usage.tr, { a: 0, b: 20, rate: 0 }), '0 of 20 requests')
  assert.equal(usage.rateLabel(usage.tr, { a: 0, b: 1, rate: null }, 'sites'), '0 of 1 site')
  assert.equal(usage.rateLabel(usage.tr, { a: 1, b: 10, rate: null }), '1 of 10')
})

test('a missing measured duration is never rendered as zero', () => {
  assert.equal(usage.duration(usage.tr, null), 'Not available')
})

test('a slow refresh cannot replace a newer filter response even when the network ignores abort', async () => {
  const original = globalThis.fetch
  const pending = []
  globalThis.fetch = (url, options) => new Promise((resolve) => pending.push({ url, options, resolve }))
  try {
    const reader = usage.createUsageReader()
    const older = reader.read({ ...usage.USAGE_DEFAULTS, cms: 'wordpress' })
    const newer = reader.read({ ...usage.USAGE_DEFAULTS, cms: 'joomla' })
    assert.equal(pending.length, 2)
    assert.match(pending[0].url, /cms=wordpress/)
    assert.match(pending[1].url, /cms=joomla/)
    pending[1].resolve(new Response(JSON.stringify({ marker: 'newer' })))
    assert.equal((await newer).body.marker, 'newer')
    pending[0].resolve(new Response(JSON.stringify({ marker: 'older' })))
    assert.equal(await older, null)
    assert.equal(pending[0].options.signal.aborted, true)
  } finally {
    globalThis.fetch = original
  }
})

test('cancelled manual refresh cannot publish a response after the page is left', async () => {
  const original = globalThis.fetch
  let respond
  globalThis.fetch = () =>
    new Promise((resolve) => {
      respond = resolve
    })
  try {
    const reader = usage.createUsageReader()
    const pending = reader.read(usage.USAGE_DEFAULTS)
    reader.cancel()
    respond(new Response(JSON.stringify({ marker: 'unmounted' })))
    assert.equal(await pending, null)
  } finally {
    globalThis.fetch = original
  }
})
