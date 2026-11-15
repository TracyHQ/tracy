// The built site check end to end with Part 1's real demo scan and link check, on an invented florist (ticket #601):
// one command on a locally built site (a fake local server) writes a report; a demo sentence, a dead internal link and
// a link to a demo route are reported and nothing else; a kit with no demo source is not_run, never a pass; the exit
// code never reads a not_run check as a pass.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { test } from 'node:test'
import { main } from '../built-site-check/run.mjs'
import { approval, folderOf, kit, pages, writeResult } from './fixtures/built-site-check/florist.mjs'

const quiet = () => {}
const DEMO = 'Our trainers coach every fighter through each round'
// The template's released content map: its demo words and the routes of its demo pages.
const released = () => ({
  slots: [{ key: 'module-30.0', entity: 'module-30', column: 'content', type: 'text', sample: `${DEMO}.` }],
  pages: [{ route: 'demo-classes' }]
})

/** The florist pages with one demo sentence, one dead internal link and one link to a demo route on the home page. */
const dirty = () => {
  const files = pages()
  files['index.html'] = files['index.html']
    .replace(/<p>Train like[^]*?<\/p>/, `<p class="intro">${DEMO}.</p>`)
    .replace(/<img[^>]*>/, '<a href="/gone-page">Old news</a>')
  delete files['demo-classes.html']
  return files
}
/** The same florist, clean: no demo words, every link answers. */
const clean = () => {
  const files = pages()
  files['index.html'] = files['index.html']
    .replace(/<p>Train like[^]*?<\/p>/, '<p>Fresh stems daily.</p>')
    .replace(/<img[^>]*>/, '')
    .replace('<li><a href="/demo-classes">Boxing classes</a></li>', '')
  delete files['demo-classes.html']
  return files
}

/** The input files in a fresh folder; `demo` writes the released content map. */
function inputs(files, { demo = true } = {}) {
  const dir = folderOf({})
  mkdirSync(path.join(dir, 'pages'))
  for (const [name, html] of Object.entries(files)) writeFileSync(path.join(dir, 'pages', name), html)
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
  writeFileSync(path.join(dir, 'released.json'), JSON.stringify(released()))
  const at = (name) => path.join(dir, name)
  const args = ['--plan', at('plan.json'), '--kit', at('kit'), '--write-result', at('write.json')]
  if (demo) args.push('--demo-content', at('released.json'))
  return { at, args }
}
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))

test('one command on a locally built site (a fake local server) writes the report with exactly the planted findings', async () => {
  const files = dirty()
  const { at, args } = inputs(files)
  const asked = []
  const server = createServer((req, res) => {
    asked.push(req.method)
    const p = req.url
      .replace(/^\/index\.php/, '')
      .replace(/^\/|\/$/g, '')
      .split('?')[0]
    const html = files[`${p || 'index'}.html`]
    res.writeHead(html === undefined ? 404 : 200, { 'content-type': 'text/html' })
    res.end(html ?? 'Not found')
  })
  await new Promise((resolve) => server.listen(0, 'localhost', resolve))
  try {
    const site = `http://localhost:${server.address().port}/`
    const code = await main([...args, '--site', site, '--out', at('site.json')], { log: quiet })
    assert.equal(code, 0)
    const report = read(at('site.json'))
    assert.equal(report.source.kind, 'site')
    assert.deepEqual(
      report.checks.demo.findings.map((f) => [f.kind, f.page, f.place.element, f.excerpt]),
      [['demo_text', '/', 'p', DEMO.toLowerCase()]]
    )
    assert.deepEqual(
      report.checks.links.findings.map((f) => [f.kind, f.page, f.href]),
      [
        ['demo_page', '/', '/demo-classes'],
        ['missing_page', '/', '/gone-page']
      ]
    )
    assert.ok(
      report.checks.links.findings.every((f) =>
        Object.keys(f.place).every((k) => ['element', 'menu', 'anchor'].includes(k))
      )
    )
    assert.ok(asked.length > 3 && asked.every((m) => m === 'GET'))
    assert.match(readFileSync(at('site.txt'), 'utf8'), /Every check ran\./)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('saved pages: the demo sentence is found; with nothing to probe, a link to a page not read is told as missing', async () => {
  const { at, args } = inputs(dirty())
  assert.equal(await main([...args, '--pages', at('pages'), '--out', at('r.json')], { log: quiet }), 0)
  const { demo, links } = read(at('r.json')).checks
  assert.deepEqual(
    demo.findings.map((f) => f.kind),
    ['demo_text']
  )
  // A folder cannot probe an address: a link to a declared demo route is demo_page, a link to a page not among the saved
  // pages is missing_page.
  assert.deepEqual(
    links.findings.map((f) => [f.kind, f.href]),
    [
      ['demo_page', '/demo-classes'],
      ['missing_page', '/gone-page']
    ]
  )
})

test('a clean set: both checks ran with no finding, exit 0', async () => {
  const { at, args } = inputs(clean())
  assert.equal(await main([...args, '--pages', at('pages'), '--out', at('c.json')], { log: quiet }), 0)
  const report = read(at('c.json'))
  assert.deepEqual([report.checks.demo.status, report.checks.links.status], ['ran', 'ran'])
  assert.deepEqual([report.counts.demo, report.counts.links], [0, 0])
  assert.equal(report.complete, true)
})

test('a kit with no demo source: demo is not_run with demo_corpus_empty, the exit code is 3, never a pass', async () => {
  const { at, args } = inputs(dirty(), { demo: false })
  let text = ''
  const code = await main([...args, '--pages', at('pages'), '--out', at('n.json')], {
    log: (t) => (text += t)
  })
  assert.equal(code, 3)
  const report = read(at('n.json'))
  assert.equal(report.checks.demo.status, 'not_run')
  assert.match(report.checks.demo.reason, /^demo_corpus_empty:/)
  assert.deepEqual([report.counts.demo, report.complete, report.notRun], [null, false, ['demo']])
  assert.deepEqual(report.checks.demo.findings, [])
  assert.match(text, /demo: NOT RUN \(demo_corpus_empty/)
  assert.match(text, /INCOMPLETE: 1 check\(s\) did not run \(demo\)/)
  assert.doesNotMatch(text, /Every check ran/)
  assert.match(readFileSync(at('n.txt'), 'utf8'), /INCOMPLETE/)
})

test('exit codes: 0 every check ran, 3 a check did not run, 1 could not run, 2 usage', async () => {
  const { at, args } = inputs(clean())
  assert.equal(await main([...args, '--pages', at('pages'), '--out', at('a.json')], { log: quiet }), 0)
  const noPlan = ['--kit', at('kit'), '--demo-content', at('released.json')]
  assert.equal(await main([...noPlan, '--pages', at('pages'), '--out', at('b.json')], { log: quiet }), 3)
  assert.equal(await main([...args, '--pages', at('nowhere'), '--out', at('c.json')], { log: quiet }), 1)
  assert.equal(await main(['--pages', at('pages')], { log: quiet }), 2)
})

test('a held name in a demo finding, a link or the home page never reaches the report', async () => {
  const files = dirty()
  files['index.html'] = files['index.html'].replace('Old news', 'Odalys Brenwick news')
  const { at, args } = inputs(files)
  await main([...args, '--pages', at('pages'), '--out', at('h.json')], { log: quiet })
  const out = (readFileSync(at('h.json'), 'utf8') + readFileSync(at('h.txt'), 'utf8')).toLowerCase()
  assert.ok(!out.includes('brenwick') && !out.includes('odalys'))
})
