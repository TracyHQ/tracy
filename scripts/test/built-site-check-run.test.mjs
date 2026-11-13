// One command runs the built site check and writes a report; it is never part of a build (ticket #601).
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { foldHeld } from '../../packages/wo/website-opportunities/domain/held-text-match.mjs'
import { main } from '../built-site-check/run.mjs'
import { approval, folderOf, kit, pages, writeResult } from './fixtures/built-site-check/florist.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const quiet = () => {}

/** The florist's input files in a fresh folder. */
function inputs() {
  const dir = folderOf({ 'pages/index.html': pages()['index.html'] })
  for (const [name, html] of Object.entries(pages())) writeFileSync(path.join(dir, 'pages', name), html)
  const k = kit()
  mkdirSync(path.join(dir, 'kit', 'blank-site-contract'), { recursive: true })
  writeFileSync(path.join(dir, 'kit', 'block-store.json'), JSON.stringify(k.blockStore))
  writeFileSync(path.join(dir, 'kit', 'mapping.json'), JSON.stringify(k.mapping))
  writeFileSync(
    path.join(dir, 'kit', 'blank-site-contract', 'content-map.json'),
    JSON.stringify(k.contentMap)
  )
  writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(approval()))
  writeFileSync(path.join(dir, 'write.json'), JSON.stringify(writeResult()))
  const at = (name) => path.join(dir, name)
  return {
    dir,
    at,
    args: ['--plan', at('plan.json'), '--kit', at('kit'), '--write-result', at('write.json')]
  }
}

test('one command on saved pages writes a JSON report and a readable summary, exit 0', async () => {
  const { at, args } = inputs()
  const code = await main([...args, '--pages', at('pages'), '--out', at('report.json')], { log: quiet })
  assert.equal(code, 0)
  const report = JSON.parse(readFileSync(at('report.json'), 'utf8'))
  assert.equal(report.schema, 'tracy-built-site-check/v1')
  assert.match(report.decides, /^nothing/)
  assert.deepEqual(report.counts, { demo: null, links: null, design: 0, limits: 1, pages: 2 })
  const text = readFileSync(at('report.txt'), 'utf8')
  assert.match(text, /demo: NOT RUN \(part_one_export_missing/)
  assert.match(text, /text_over_limit page=\/bouquets .*length 68 over 60/)
  for (const out of [JSON.stringify(report), text]) assert.ok(!foldHeld(out).includes('brenwick'))
})

test('the write order given apart from the write result is read with --write-order', async () => {
  const { at, args } = inputs()
  const { order, ...rest } = writeResult()
  writeFileSync(at('plan-only.json'), JSON.stringify(rest))
  writeFileSync(at('order.json'), JSON.stringify(order))
  const base = args.slice(0, 4)
  const without = [...base, '--write-result', at('plan-only.json'), '--pages', at('pages')]
  assert.equal(await main([...without, '--out', at('a.json')], { log: quiet }), 0)
  const a = JSON.parse(readFileSync(at('a.json'), 'utf8'))
  assert.match(a.checks.limits.reason, /^write_order_missing/)
  const given = [...without, '--write-order', at('order.json'), '--out', at('b.json')]
  assert.equal(await main(given, { log: quiet }), 0)
  assert.equal(JSON.parse(readFileSync(at('b.json'), 'utf8')).counts.limits, 1)
})

test('one command on a local base address crawls it with GET only', async () => {
  const { at, args } = inputs()
  const files = pages()
  const asked = []
  const fetchImpl = async (url, init) => {
    asked.push([init.method, new URL(url).host])
    const p = new URL(url).pathname.replace(/^\/index\.php/, '').replace(/^\/|\/$/g, '')
    const html = files[`${p || 'index'}.html`]
    return new Response(html ?? 'Not found', {
      status: html === undefined ? 404 : 200,
      headers: { 'content-type': 'text/html' }
    })
  }
  const code = await main([...args, '--site', 'http://florist.test/', '--out', at('site.json')], {
    log: quiet,
    fetchImpl
  })
  assert.equal(code, 0)
  const report = JSON.parse(readFileSync(at('site.json'), 'utf8'))
  assert.equal(report.source.kind, 'site')
  assert.equal(report.counts.limits, 1)
  assert.ok(asked.every(([method, host]) => method === 'GET' && host === 'florist.test'))
})

test('a site that is not local is refused before any request: exit 1, no report', async () => {
  const { at, args } = inputs()
  let calls = 0
  const code = await main(
    [...args, '--site', 'https://quillhaven-florist.example/', '--out', at('no.json')],
    {
      log: quiet,
      fetchImpl: async () => {
        calls++
        return new Response('')
      }
    }
  )
  assert.deepEqual([code, calls, existsSync(at('no.json'))], [1, 0, false])
})

test('a usage error exits 2; an unreadable input exits 1', async () => {
  const { at, args } = inputs()
  assert.equal(await main(['--pages', at('pages')], { log: quiet }), 2)
  assert.equal(
    await main(['--site', 'http://florist.test/', '--pages', at('pages'), '--out', 'x'], { log: quiet }),
    2
  )
  writeFileSync(at('bad.json'), '{')
  assert.equal(
    await main([...args, '--plan', at('bad.json'), '--pages', at('pages'), '--out', at('r.json')], {
      log: quiet
    }),
    1
  )
})

test('the help says it reads only a local site and never a customer site', async () => {
  let out = ''
  assert.equal(await main(['--help'], { log: (t) => (out += t) }), 0)
  assert.match(out, /Never point it at a customer site/)
  assert.match(out, /only GET requests/)
})

/** Every module reachable from `files` through relative and `website-opportunities/` imports. */
function reachable(files) {
  const seen = new Set()
  const todo = [...files]
  const pkg = path.join(ROOT, 'packages/wo/website-opportunities')
  while (todo.length) {
    const file = todo.pop()
    if (seen.has(file) || !existsSync(file) || statSync(file).isDirectory()) continue
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1]
      if (spec.startsWith('.')) todo.push(path.resolve(path.dirname(file), spec))
      else if (spec.startsWith('website-opportunities/'))
        todo.push(path.join(pkg, spec.slice('website-opportunities/'.length)))
    }
  }
  return seen
}
const sources = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? sources(p) : /\.(m?js)$/.test(n) ? [p] : []
  })

test('no module of the app or of the build path reaches the tool, so it never changes a build outcome', () => {
  const graph = reachable([
    ...sources(path.join(ROOT, 'apps/tracy-web/src')),
    ...sources(path.join(ROOT, 'packages/wo/website-opportunities/domain'))
  ])
  assert.ok(graph.size > 500, `${graph.size} modules walked`)
  const tool = path.join(ROOT, 'scripts', 'built-site-check')
  assert.deepEqual(
    [...graph].filter((f) => f.startsWith(tool)),
    []
  )
  for (const f of graph) assert.ok(!readFileSync(f, 'utf8').includes('built-site-check'), f)
})
