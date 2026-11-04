// The write run review page (#357), on invented data only: its words, its model, how a frame is found on a page, the
// captures with a fake browser, the HTML, and the command. A real browser is used by one test only when Playwright can be
// loaded (PLAYWRIGHT_DIR names its folder); otherwise that test is skipped.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { main } from '../scripts/write-step-review.mjs'
import { buildReviewPage, parseJsonLoose } from '../src/write-step/review-page/build.js'
import { captureSite, loadChromium } from '../src/write-step/review-page/capture.js'
import { dataUri, sniffType } from '../src/write-step/review-page/images.js'
import { DEFAULT_LABELS, withLabels } from '../src/write-step/review-page/labels.js'
import { assignBoxes, locateInPage } from '../src/write-step/review-page/locate.js'
import { buildReviewModel, stateOf } from '../src/write-step/review-page/model.js'
import { renderReviewPage } from '../src/write-step/review-page/render.js'
import {
  brief,
  copy,
  PNG,
  pictures,
  plan,
  report,
  SHA_A,
  SHA_B,
  SHA_C
} from './_write-step-review-fixtures.mjs'

const model = () =>
  buildReviewModel({ report, plan, copy, pictures, brief, routes: { 'page-studio': '/index.php/studio' } })
const noImages = { pageShots: {}, crops: {}, made: {}, source: {}, byHash: {} }

test('labels: English defaults hold no long dash, overrides win, unknown keys are dropped, long dashes become commas', () => {
  for (const value of Object.values(DEFAULT_LABELS)) assert.doesNotMatch(value, /[–—]/)
  const labels = withLabels({ approve: 'Accept it', reject: 'No — redo', nonsense: 'x', title: 7 })
  assert.equal(labels.approve, 'Accept it')
  assert.equal(labels.reject, 'No, redo')
  assert.equal(labels.title, DEFAULT_LABELS.title)
  assert.equal('nonsense' in labels, false)
  assert.equal(withLabels(undefined).approve, DEFAULT_LABELS.approve)
})

test('stateOf: failed on a refusal or a failed read back, ok when read back matches, unchecked, skipped', () => {
  assert.equal(stateOf({ status: 'failed' }), 'failed')
  assert.equal(stateOf({ status: 'written', readBack: 'failed' }), 'failed')
  assert.equal(stateOf({ status: 'written', readBack: 'match' }), 'ok')
  assert.equal(stateOf({ status: 'written', readBack: null }), 'unchecked')
  assert.equal(stateOf({ status: 'skipped', readBack: 'failed' }), 'skipped')
})

test('model: one row per kept page, failed slots first, a shared row, dropped pages left out', () => {
  const m = model()
  assert.deepEqual(m.pages.map((p) => p.id).sort(), ['page-home', 'page-studio'])
  const home = m.pages.find((p) => p.id === 'page-home')
  assert.equal(home.title, 'Harbour Pilates')
  assert.equal(home.slots[0].slot, 'block-10.2', 'the failed slot leads')
  assert.deepEqual(
    home.slots.map((s) => s.state),
    ['failed', 'ok', 'ok', 'ok']
  )
  assert.equal(m.pages.find((p) => p.id === 'page-studio').path, '/index.php/studio')
  const failedIn = (p) => p.slots.filter((x) => x.state === 'failed').length
  assert.ok(failedIn(m.pages[0]) >= failedIn(m.pages[1]), 'the page with most failed slots comes first')
  assert.deepEqual(
    m.shared.slots.map((s) => s.slot),
    ['menuItem-1.0']
  )
  assert.equal(m.shared.skipped.length, 1)
  assert.deepEqual(m.stats, { failed: 2, written: 6, skipped: 2, frames: 3 })
  assert.equal(m.siteUrl, 'https://studio-bench.example.test')
  assert.equal(m.run.check, 'red')
})

test('model: a frame carries its state, plan words, nearby copy, picture shas and source photo', () => {
  const frames = model().frames
  assert.deepEqual(
    frames.map((f) => f.id),
    ['block-20.2', 'block-10.3', 'block-20.4']
  )
  const drawn = frames.find((f) => f.id === 'block-10.3')
  assert.equal(drawn.state, 'ok')
  assert.equal(drawn.pageId, 'page-home')
  assert.equal(drawn.sha, SHA_A)
  assert.equal(drawn.planned.shows, 'a class on mats in soft light')
  assert.deepEqual(
    drawn.nearby.map((n) => n.slot),
    ['block-10.2', 'block-10.1', 'block-10.9']
  )
  assert.equal(drawn.photoSha, SHA_C)
  assert.equal(frames.find((f) => f.id === 'block-20.2').state, 'failed')
  assert.equal(frames.find((f) => f.id === 'block-20.4').planned, null)
})

test('assignBoxes: frames sharing a file take the matches in order, the last is reused, no match gives no box', () => {
  const box = (y) => ({ x: 0, y, width: 10, height: 10 })
  const got = assignBoxes(
    [
      { id: 'a', sha: 'h' },
      { id: 'b', sha: 'h' },
      { id: 'c', sha: 'h' },
      { id: 'd', sha: 'z' },
      { id: 'e', sha: null }
    ],
    { h: [box(1), box(2)], z: [] }
  )
  assert.equal(got.get('a').y, 1)
  assert.equal(got.get('b').y, 2)
  assert.equal(got.get('c').y, 2)
  assert.equal(got.has('d'), false)
  assert.equal(got.has('e'), false)
})

/** A browser that serves two pages and answers the locate call with a box for each hash it was given. */
function fakeChromium({ failPath } = {}) {
  const log = { goto: [], clips: [], viewports: [], closed: 0 }
  const chromium = {
    launch: async () => ({
      newContext: async ({ viewport }) => {
        log.viewports.push(viewport.width)
        return {
          close: async () => {
            log.closed += 1
          },
          newPage: async () => {
            let url = ''
            return {
              goto: async (u) => {
                url = u
                log.goto.push(u)
                return { status: () => (u.endsWith(failPath ?? '/none') ? 404 : 200) }
              },
              evaluate: async (fn, arg) => {
                if (fn === locateInPage)
                  return Object.fromEntries(
                    arg.map((sha) => [
                      sha,
                      url.endsWith('/studio') ? [{ x: 5, y: 7, width: 100, height: 50 }] : []
                    ])
                  )
                return typeof fn === 'string' ? 900 : undefined
              },
              waitForTimeout: async () => {},
              screenshot: async (o) => {
                if (o.clip) log.clips.push(o.clip)
                return Buffer.from(o.clip ? 'crop' : 'page')
              }
            }
          }
        }
      },
      close: async () => {}
    })
  }
  return { chromium, log }
}

test('captureSite: each page at both widths, crops cut from the page the frame sits on, a failing page is marked', async () => {
  const { chromium, log } = fakeChromium({ failPath: '/gone' })
  const out = await captureSite({
    chromium,
    baseUrl: 'https://site.example.test/',
    pages: [
      { id: 'p1', path: '/' },
      { id: 'p2', path: '/index.php/studio' },
      { id: 'p3', path: '/gone' }
    ],
    frames: [{ id: 'f1', sha: SHA_A, pageId: 'p2' }]
  })
  assert.deepEqual(log.viewports, [1440, 1440, 1440, 390, 390, 390])
  assert.ok(log.goto.includes('https://site.example.test/index.php/studio'))
  assert.equal(out.pages.p1[1440].ok, true)
  assert.equal(out.pages.p3[390].ok, false)
  assert.equal(out.pages.p3[390].status, 404)
  assert.deepEqual(Object.keys(out.crops.f1).sort(), ['1440', '390'])
  assert.deepEqual(log.clips[0], { x: 0, y: 0, width: 116, height: 66 })
  assert.equal(log.closed, 6)
})

test('render: both tabs, escaped words, failed first, redo buttons, theme tokens and no long dash in the chrome', () => {
  const m = model()
  m.frames[0].reason = '<script>alert(1)</script>'
  const html = renderReviewPage(m, withLabels({ approve: 'Accept', title: 'Review — run' }), {
    ...noImages,
    crops: { 'block-10.3': { 1440: 'data:image/jpeg;base64,AA==' } },
    byHash: { [SHA_A]: 'data:image/png;base64,AA==' }
  })
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&lt;script&gt;alert/)
  assert.match(html, /<title>Review, run<\/title>/)
  assert.match(html, /data-tab="pictures"/)
  assert.match(html, /id="copy-redo"/)
  assert.match(html, /Accept/)
  assert.equal((html.match(/<article class="frame"/g) ?? []).length, 3)
  assert.ok(html.indexOf('block-20.2</h2>') < html.indexOf('block-10.3</h2>'), 'failed frames lead')
  assert.match(html, /prefers-color-scheme:dark/)
  assert.match(html, /data-theme="dark"/)
  assert.match(html, /@media \(max-width:520px\)/)
  assert.match(html, /<img class="thumb" src="data:image\/png/)
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /[–—]/)
})

test('images: type sniffing and data URIs', () => {
  assert.equal(sniffType(PNG), 'image/png')
  assert.equal(sniffType(Buffer.from('plain text')), null)
  assert.match(dataUri(PNG), /^data:image\/png;base64,/)
  assert.equal(dataUri(Buffer.from('plain text')), null)
})

test('parseJsonLoose: reads JSON after a stray first line and names the file when it is not JSON', () => {
  assert.deepEqual(parseJsonLoose('report.json\n{"a":1}', 'x'), { a: 1 })
  assert.throws(() => parseJsonLoose('nothing here', 'the report'), /the report is not JSON/)
})

async function packageFolder() {
  const root = await mkdtemp(path.join(tmpdir(), 'review-page-'))
  const dir = path.join(root, 'package')
  await mkdir(path.join(dir, 'files'), { recursive: true })
  await mkdir(path.join(dir, 'photos'))
  await writeFile(path.join(dir, 'plan.json'), JSON.stringify(plan))
  await writeFile(path.join(dir, 'site-copy.json'), JSON.stringify(copy))
  await writeFile(path.join(dir, 'site-pictures.json'), JSON.stringify(pictures))
  await writeFile(path.join(dir, 'brief.json'), JSON.stringify(brief))
  for (const f of ['a', 'b', 'c']) await writeFile(path.join(dir, 'files', `${f}.png`), PNG)
  await writeFile(path.join(dir, 'photos', SHA_C), PNG)
  await writeFile(path.join(root, 'report.json'), `site-write-report.json\n${JSON.stringify(report)}`)
  return { root, dir }
}

test('build and command: a page from files with no browser, labels from a file outside the package, usage errors', async () => {
  const { root, dir } = await packageFolder()
  try {
    await writeFile(path.join(root, 'labels.json'), JSON.stringify({ approve: 'Accept all', htmlLang: 'xx' }))
    const out = path.join(root, 'out', 'review.html')
    const lines = []
    const code = await main(
      [
        '--report',
        path.join(root, 'report.json'),
        '--package',
        dir,
        '--out',
        out,
        '--labels',
        path.join(root, 'labels.json'),
        '--no-capture'
      ],
      { out: (l) => lines.push(l), err: (l) => lines.push(l) }
    )
    assert.equal(code, 0, lines.join('\n'))
    const html = await readFile(out, 'utf8')
    assert.match(html, /<html lang="xx">/)
    assert.match(html, /Accept all/)
    assert.match(html, /Harbour Pilates/)
    assert.match(html, /<img src="data:image\/png/, 'the made and source pictures are embedded')
    assert.match(lines.at(-1), /3 frames/)
    const quiet = []
    assert.equal(await main([], { out: () => {}, err: (l) => quiet.push(l) }), 2)
    assert.match(quiet[0], /usage/)
    assert.equal(
      await main(['--report', 'nope.json', '--package', dir, '--out', out, '--no-capture'], {
        out: () => {},
        err: (l) => quiet.push(l)
      }),
      1
    )
    const direct = await buildReviewPage({
      reportFile: path.join(root, 'report.json'),
      packageDir: dir,
      outFile: out,
      chromium: null
    })
    assert.equal(direct.frames, 3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a real browser finds a frame by its file hash in an image, a srcset and a background', async (t) => {
  let chromium
  try {
    chromium = await loadChromium(process.env.PLAYWRIGHT_DIR)
  } catch {
    return t.skip('Playwright is not available')
  }
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`<body><img id="a" width="120" height="80" src="/images/tracy-content/${SHA_A}.png">
      <img id="s" width="60" height="60" srcset="/x/${SHA_B}.png 1x">
      <div id="bg" style="width:90px;height:40px;background-image:url('/images/tracy-content/${SHA_C}.png')"></div>
      <img width="2" height="2" src="/images/tracy-content/${SHA_A}.png"><script>var u = "${SHA_B}"</script></body>`)
    const found = await page.evaluate(locateInPage, [SHA_A, SHA_B, SHA_C, 'f'.repeat(64)])
    assert.equal(found[SHA_A].length, 1, 'a 2 pixel image is not a frame')
    assert.equal(found[SHA_A][0].width, 120)
    assert.equal(found[SHA_B].length, 1)
    assert.equal(found[SHA_C][0].height, 40)
    assert.deepEqual(found['f'.repeat(64)], [])
  } finally {
    await browser.close()
  }
})
