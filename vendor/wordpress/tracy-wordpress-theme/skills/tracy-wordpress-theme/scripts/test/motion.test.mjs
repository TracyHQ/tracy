import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { compareMotion, freezeMotion, measureMotion, measureMotionInPage, FREEZE_CSS, LOOP_HOLD_MS, TRACY_MOTION } from '../lib/motion.mjs'
import { withBrowser } from '../lib/browser.mjs'
import { formatMarkdown, motionRoutes, routePairsOf } from '../visual/motion.mjs'
import { run } from '../visual/visual-qa.mjs'
import { buildContract, specHash } from '../visual/contract.mjs'
import { runChild } from '../lib/child.mjs'

const inv = ({ reveals = [], carousels = [], loops = [] } = {}) => ({ reveals, carousels, loops })
const reveal = (near, effect = 'fade-up', delay = 0, duration = null) => ({ near, effect, delay, duration, tag: 'div' })
const carousel = (near, over = {}) => ({ near, kind: 'owl', slides: 6, autoplay: false, nav: true, dots: true, ...over })

test('motion: identical inventories have no rows', () => {
  const a = inv({ reveals: [reveal('hero'), reveal('hero', 'fade-up', 100)], carousels: [carousel('team')] })
  const r = compareMotion(a, structuredClone(a))
  assert.deepEqual(r.rows, [])
  assert.deepEqual(r.source, { reveals: 2, carousels: 1, autoplay: 0, loops: 0 })
})

test('motion: a port without the reveals, or with a different carousel, is named per heading', () => {
  const src = inv({ reveals: [reveal('hero'), reveal('hero', 'fade-up', 100)], carousels: [carousel('team', { autoplay: true })] })
  const site = inv({ carousels: [carousel('team', { kind: 'generic', dots: false })] })
  const r = compareMotion(src, site)
  assert.deepEqual(r.rows.map((x) => [x.kind, x.near, x.source, x.site]), [
    ['reveal', 'hero', '2 × fade-up, delay 0/100 ms', 'none'],
    ['carousel', 'team', '6 slides autoplay nav dots', '6 slides nav']
  ])
})

test('motion: each carousel property, reveal delay and duration, and a missing loop is its own row; another library with the same behaviour is not', () => {
  const src = inv({ reveals: [reveal('a', 'fade-up', 200, 800)], carousels: [carousel('t')], loops: [{ near: 'w', name: 'pulse', tag: 'a' }] })
  for (const [change, words] of [
    [{ slides: 4 }, '4 slides nav dots'],
    [{ autoplay: true }, '6 slides autoplay nav dots'],
    [{ nav: false }, '6 slides dots'],
    [{ dots: false }, '6 slides nav']
  ]) {
    const r = compareMotion(src, { ...src, carousels: [carousel('t', change)] })
    assert.deepEqual(r.rows.map((x) => [x.kind, x.source, x.site]), [['carousel', '6 slides nav dots', words]])
  }
  assert.deepEqual(compareMotion(src, { ...src, carousels: [carousel('t', { kind: 'swiper' })] }).rows, [])
  assert.deepEqual(compareMotion(src, { ...src, reveals: [reveal('a', 'fade-up', 0, 800)] }).rows.map((x) => x.site), ['1 × fade-up, duration 800 ms'])
  assert.deepEqual(compareMotion(src, { ...src, reveals: [reveal('a', 'fade-up', 200, 400)] }).rows.map((x) => x.site), ['1 × fade-up, delay 200 ms, duration 400 ms'])
  // A stagger with the same first and last delay, one in the middle moved: still a row.
  const stagger = (d) => inv({ reveals: d.map((x) => reveal('s', 'fade-up', x, 600)) })
  assert.deepEqual(compareMotion(stagger([0, 100, 200]), stagger([0, 150, 200])).rows.map((x) => [x.kind, x.source, x.site]), [['reveal', '3 × fade-up, delay 0/100/200 ms, duration 600 ms', '3 × fade-up, delay 0/150/200 ms, duration 600 ms']])
  const effects = (e) => inv({ reveals: e.map((x) => reveal('s', x)) })
  assert.equal(compareMotion(effects(['fade-up', 'fade-left']), effects(['fade-left', 'fade-up'])).rows.length, 1, 'effects in another order are another entrance')
  assert.deepEqual(compareMotion(src, { ...src, loops: [] }).rows.map((x) => [x.kind, x.source, x.site]), [['loop', '1 looping', 'none']])
})

test('motion: the freeze stylesheet ends reveals and animations', () => {
  assert.match(FREEZE_CSS, /\[data-aos\][^{]*\{opacity:1!important/)
  assert.match(FREEZE_CSS, /animation-duration:0s!important/)
})

// ─── a live animated page: an AOS-style reveal driven by IntersectionObserver, a Swiper-style
// carousel on a 250 ms timer (the instance on the element, as Swiper leaves it), an Owl carousel
// whose options say autoplay:false, a looping keyframe, and — on /generic — a hand-written carousel
// on a timer that no library API reaches.
const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
const ANIMATED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)} main{padding:40px}
[data-aos]{opacity:0;transform:translateY(80px);transition:opacity 2s,transform 2s}
[data-aos].aos-animate{opacity:1;transform:none}
.pulse{display:inline-block;animation:pulse 1s infinite} @keyframes pulse{50%{transform:scale(1.4)}}
.swiper{overflow:hidden;width:600px;height:200px;position:relative} .swiper-wrapper{display:flex;transition:transform .3s}
.swiper-slide{flex:0 0 600px;height:200px} .s0{background:rgb(200,40,40)} .s1{background:rgb(40,200,40)} .s2{background:rgb(40,40,200)}
.swiper-button-next{position:absolute;right:0;top:80px} .swiper-pagination{position:absolute;bottom:0} .hidden-nav{display:none}
.spacer{height:1400px}
</style></head><body class="tracy-page-page"><main>
<h1>Motion fixture</h1><div>${words}</div>
<h2>Team members</h2>
<div class="swiper" id="team"><div class="swiper-wrapper"><div class="swiper-slide s0">A</div><div class="swiper-slide s1">B</div><div class="swiper-slide s2">C</div></div>
<div class="swiper-button-next">next</div><div class="swiper-pagination"><span>•</span></div></div>
<h2>Our clients</h2>
<div class="owl-carousel" data-owl-options='{"items":3,"autoplay":false,"loop":true}'><div>One</div><div>Two</div><div>Three</div><div>Four</div><div class="owl-nav hidden-nav"><button class="owl-next">›</button></div></div>
<h2>Why us</h2><a class="pulse" href="#x">Pulse link</a>
<div class="spacer"></div>
<h2>Services below the fold</h2>
<div data-aos="fade-up" data-aos-delay="200" data-aos-duration="800"><p>Revealed when scrolled to.</p></div>
<div data-aos="zoom-in"><p>Revealed as well.</p></div>
</main><script>
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('aos-animate')))
document.querySelectorAll('[data-aos]').forEach((el) => { el.classList.add('aos-init'); io.observe(el) })
const el = document.getElementById('team'), wrap = el.querySelector('.swiper-wrapper')
let i = 0
const go = (n) => { i = n; wrap.style.transform = 'translateX(' + (-600 * n) + 'px)'; el.dataset.index = n }
let timer = setInterval(() => go((i + 1) % 3), 250)
el.swiper = { params: { autoplay: { enabled: true } }, autoplay: { running: true, stop() { clearInterval(timer); this.running = false } }, slideTo: (n) => go(n), get realIndex() { return i } }
</script></body></html>`
const GENERIC = `<!doctype html><html lang="en"><body><main><h2>Hand made</h2><div class="hero-carousel" id="g"><div class="slide">1</div><div class="slide">2</div></div></main>
<script>let k = 0; setInterval(() => { k = (k + 1) % 2; document.getElementById('g').dataset.index = k }, 200)</script></body></html>`

function serve(routes) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const body = routes[new URL(req.url, 'http://x').pathname]
      res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body ?? '<html><body>gone</body></html>')
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

test('motion: the inventory of a live page — reveal delay/duration, timer carousel with autoplay, options autoplay:false is off, a hidden nav is no nav, one loop', async () => {
  const srv = await serve({ '/': ANIMATED })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(srv.origin + '/')
      const m = await measureMotion(page)
      assert.deepEqual(m.reveals.map((r) => [r.near, r.effect, r.delay, r.duration]), [
        ['services below the fold', 'fade-up', 200, 800],
        ['services below the fold', 'zoom-in', 0, null]
      ])
      assert.deepEqual(m.carousels.map((c) => [c.near, c.kind, c.slides, c.autoplay, c.nav, c.dots]), [
        ['our clients', 'owl', 4, false, false, false],
        ['team members', 'swiper', 3, true, true, true]
      ])
      assert.deepEqual(m.loops.map((l) => [l.near, l.name]), [['why us', 'pulse']])
    })
  } finally {
    await srv.close()
  }
})

test('motion: the page moves live, and after freezeMotion it holds still — reveals shown, carousel stopped on its first slide, loops held', async () => {
  const srv = await serve({ '/': ANIMATED, '/generic': GENERIC })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(srv.origin + '/')
      const state = () =>
        page.evaluate(() => ({
          index: document.getElementById('team').dataset.index,
          transform: document.querySelector('.swiper-wrapper').style.transform,
          opacity: [...document.querySelectorAll('[data-aos]')].map((e) => getComputedStyle(e).opacity),
          loops: document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations === Infinity && a.playState === 'running').length
        }))
      const seen = new Set()
      for (let n = 0; n < 6; n++) {
        seen.add((await state()).index)
        await page.waitForTimeout(130)
      }
      assert.ok(seen.size >= 2, `the carousel moves before the freeze (${[...seen]})`)
      const live = await state()
      assert.deepEqual(live.opacity, ['0', '0'], 'the reveals below the fold are hidden until scrolled to')
      assert.equal(live.loops, 1)
      const r = await freezeMotion(page)
      assert.equal(r.swiper, 1)
      assert.equal(r.loops, 1)
      assert.equal(r.unhandled, 0, 'Owl markup Owl never initialised stands still; the timer carousel was reached through its API')
      const a = await state()
      await page.waitForTimeout(700)
      const b = await state()
      assert.deepEqual(a, b, 'nothing moved over more than two timer periods')
      assert.equal(a.index, '0')
      assert.deepEqual(a.opacity, ['1', '1'])
      assert.equal(a.loops, 0)
      await page.goto(srv.origin + '/generic')
      assert.equal((await freezeMotion(page)).unhandled, 1, 'a hand-written carousel no API reaches is counted, not assumed still')
    })
  } finally {
    await srv.close()
  }
})

test('motion.mjs: a side that does not load is an error row, never a clean empty inventory; a page against itself has no rows', async () => {
  const srv = await serve({ '/': ANIMATED })
  try {
    const r = await withBrowser((browser) => motionRoutes(browser, { source: srv.origin, site: srv.origin, routes: ['/', '/gone'] }))
    assert.deepEqual(r[0].rows, [])
    assert.deepEqual(r[0].source, { reveals: 2, carousels: 2, autoplay: 1, loops: 1 })
    assert.match(r[1].error, /source .*HTTP 404; site .*HTTP 404/)
    assert.equal(r[1].rows[0].kind, 'error')
  } finally {
    await srv.close()
  }
})

// A from-joomla page map names each page twice: `path` on the port (the WordPress slug follows the
// article alias) and `source.joomlaPath` on the source. The pair is read from the map; reading
// `path` on both sides compares the port with some other source page, or with a 404.
const MOTION_CLI = new URL('../visual/motion.mjs', import.meta.url).pathname
const motionCli = (args, timeoutMs = 120000) => runChild(process.execPath, [MOTION_CLI, ...args], { timeoutMs })
const pairMap = {
  pages: [
    { file: 'Cloud.html', view: 'page', path: '/services/cloud-services', source: { menuId: 7, joomlaPath: '/services/cloud-services-2' } },
    { file: 'Home.html', view: 'page', path: '/', source: { menuId: 1, joomlaPath: '/' } },
    { file: 'About.html', view: 'page', path: '/about' },
    { file: '404.html', view: '404', path: '/404', synthetic: true, source: { joomlaPath: '/this-page-does-not-exist' } }
  ]
}
test('motion.mjs: a page map pairs each site path with its source.joomlaPath (path when absent), under the source prefix, and reports both sides', async () => {
  const src = await serve({ '/': ANIMATED, '/index.php/services/cloud-services-2': ANIMATED, '/index.php/about': ANIMATED })
  const site = await serve({ '/': ANIMATED, '/services/cloud-services': ANIMATED, '/about': ANIMATED })
  const root = mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'motion-pairs-'))
  try {
    const map = path.join(root, 'page-map.json')
    writeFileSync(map, JSON.stringify(pairMap))
    const out = path.join(root, 'motion.json')
    const r = await motionCli(['--source', src.origin, '--site', site.origin, '--routes', map, '--source-prefix', '/index.php', '--out', out])
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`)
    const { results } = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual(results.map((x) => [x.route, x.sourceRoute, x.sourceUrl, x.siteUrl, x.rows.length]), [
      ['/services/cloud-services', '/services/cloud-services-2', `${src.origin}/index.php/services/cloud-services-2`, `${site.origin}/services/cloud-services`, 0],
      ['/', '/', `${src.origin}/`, `${site.origin}/`, 0],
      ['/about', '/about', `${src.origin}/index.php/about`, `${site.origin}/about`, 0]
    ])
    assert.deepEqual(results[0].source, { reveals: 2, carousels: 2, autoplay: 1, loops: 1 })
    const md = readFileSync(out.replace(/\.json$/, '.md'), 'utf8')
    assert.match(md, /^## \/services\/cloud-services \(source \/services\/cloud-services-2\) — reveals 2\/2/m)
    assert.ok(md.includes(`source ${src.origin}/index.php/services/cloud-services-2 · site ${site.origin}/services/cloud-services`), md)
    assert.equal(r.stdout.trim(), md.trim())
  } finally {
    await src.close()
    await site.close()
  }
})

test('motion.mjs: routePairsOf — joomlaPath or path, synthetic pages out, page order kept; a map that names nothing, or a path that is not a route, is an error', () => {
  assert.deepEqual(routePairsOf(pairMap), [
    { site: '/services/cloud-services', source: '/services/cloud-services-2' },
    { site: '/', source: '/' },
    { site: '/about', source: '/about' }
  ])
  assert.deepEqual(routePairsOf({ pages: [{ path: '/b', source: { joomlaPath: null } }, { path: '/a', source: {} }] }), [{ site: '/b', source: '/b' }, { site: '/a', source: '/a' }])
  for (const [map, why] of [
    [null, /no "pages" array/],
    [{}, /no "pages" array/],
    [{ pages: {} }, /no "pages" array/],
    [{ pages: [] }, /names no page/],
    [{ pages: [{ path: '/404', synthetic: true }] }, /names no page/],
    [{ pages: [null] }, /page 0 is not an object/],
    [{ pages: [{ path: '/a' }, { title: 'no path' }] }, /page 1: path undefined is not a route/],
    [{ pages: [{ path: 'about' }] }, /page 0: path "about" is not a route/],
    [{ pages: [{ path: '//evil.example/x' }] }, /is not a route/],
    [{ pages: [{ path: '/a', source: { joomlaPath: '' } }] }, /source\.joomlaPath "" is not a route/],
    [{ pages: [{ path: '/a', source: { joomlaPath: 'a-2' } }] }, /source\.joomlaPath "a-2" is not a route/],
    [{ pages: [{ path: '/a', source: { joomlaPath: 5 } }] }, /source\.joomlaPath 5 is not a route/],
    [{ pages: [{ path: '/a?x=1' }] }, /path "\/a\?x=1" is not a route \(a query, fragment/],
    [{ pages: [{ path: '/a#top' }] }, /path "\/a#top" is not a route \(a query, fragment/],
    [{ pages: [{ path: '/a\\b' }] }, /is not a route \(a query, fragment, backslash/],
    [{ pages: [{ path: '/a/../b' }] }, /path "\/a\/..\/b" is not a route \(a dot segment/],
    [{ pages: [{ path: '/a', source: { joomlaPath: '/../../x' } }] }, /source\.joomlaPath "\/..\/..\/x" is not a route \(a dot segment/],
    [{ pages: [{ path: '/a', source: { joomlaPath: '/b/%2E%2e/c' } }] }, /source\.joomlaPath .* is not a route \(a dot segment/],
    [{ pages: [{ path: '/a', source: { joomlaPath: '/b?id=4' } }] }, /source\.joomlaPath "\/b\?id=4" is not a route \(a query/],
    [{ pages: [{ path: '/a', source: { joomlaPath: '/b c' } }] }, /source\.joomlaPath "\/b c" is not a route \(.*whitespace/]
  ])
    assert.throws(() => routePairsOf(map), why, JSON.stringify(map))
})

test('motion.mjs: routes and pairs mix in input order, `/` stays `/` under the prefix, and a pair that does not load is NOT MEASURED with both sides named', async () => {
  const src = await serve({ '/': ANIMATED, '/j/joomla-a': ANIMATED, '/j/same': ANIMATED })
  const site = await serve({ '/': ANIMATED, '/wp-a': ANIMATED, '/same': ANIMATED })
  try {
    await assert.rejects(motionRoutes(null, { source: src.origin, site: site.origin, routes: [] }), /no route to measure/)
    await assert.rejects(motionRoutes(null, { source: src.origin, site: site.origin, routes: [{ site: '/a' }] }), /is not a route/)
    const routes = [{ site: '/wp-a', source: '/joomla-a' }, '/same', { site: '/', source: '/' }, { site: '/wp-a', source: '/joomla-gone' }, { site: '/wp-gone', source: '/joomla-a' }]
    const r = await withBrowser((browser) => motionRoutes(browser, { source: src.origin, site: site.origin, routes, prefix: '/j' }))
    assert.deepEqual(r.map((x) => [x.route, x.sourceRoute, x.sourceUrl, x.siteUrl, x.error ?? null]), [
      ['/wp-a', '/joomla-a', `${src.origin}/j/joomla-a`, `${site.origin}/wp-a`, null],
      ['/same', '/same', `${src.origin}/j/same`, `${site.origin}/same`, null],
      ['/', '/', `${src.origin}/`, `${site.origin}/`, null],
      ['/wp-a', '/joomla-gone', `${src.origin}/j/joomla-gone`, `${site.origin}/wp-a`, `source ${src.origin}/j/joomla-gone: HTTP 404`],
      ['/wp-gone', '/joomla-a', `${src.origin}/j/joomla-a`, `${site.origin}/wp-gone`, `site ${site.origin}/wp-gone: HTTP 404`]
    ])
    assert.deepEqual(r.map((x) => x.rows.map((row) => row.kind)), [[], [], [], ['error'], ['error']])
    assert.deepEqual(r[3].rows[0], { near: '(page)', kind: 'error', source: `${src.origin}/j/joomla-gone: HTTP 404`, site: 'measured' })
    const md = formatMarkdown(r)
    assert.match(md, /^## \/wp-a \(source \/joomla-gone\) — NOT MEASURED: source .*HTTP 404$/m)
    assert.ok(md.includes(`source ${src.origin}/j/joomla-gone · site ${site.origin}/wp-a`), md)
    assert.match(md, /^## \/wp-gone \(source \/joomla-a\) — NOT MEASURED: site .*HTTP 404$/m)
    assert.doesNotMatch(md.split('## /wp-gone')[1], /reveals/, 'a pair not measured has no inventory line')
  } finally {
    await src.close()
    await site.close()
  }
})

// Every page loads (HTTP 200); what fails comes after: opening the page, the scroll, the
// measurement, closing the page, the comparison. Each is an error row on the pair being measured,
// and the pairs after it are still measured, in order.
function failingBrowser(failAt) {
  const opened = []
  return {
    opened,
    newPage: async () => {
      let url = null
      if (failAt.newPage && opened.length === failAt.newPage - 1) {
        opened.push('(refused)')
        throw new Error('browser.newPage: Target closed\ndetail')
      }
      return {
        goto: async (u) => {
          url = u
          opened.push(u)
          return { status: () => 200 }
        },
        // measureMotion hands TRACY_MOTION as the argument; the scroll passes none
        evaluate: async (fn, arg) => {
          if (arg === undefined && failAt[url] === 'scroll') throw new Error('page.evaluate: Execution context was destroyed')
          if (arg !== undefined && failAt[url] === 'measure') throw new Error('page.evaluate: measure threw')
          if (arg !== undefined && failAt[url] === 'compare') return { reveals: null, carousels: [], loops: [] }
          return arg === undefined ? undefined : inv({ reveals: [reveal('welcome')] })
        },
        waitForTimeout: async () => {},
        close: async () => {
          if (failAt[url] === 'close') throw new Error('page.close: Target crashed')
        }
      }
    }
  }
}
test('motion.mjs: a failure after the page loads — open, scroll, measure, close, compare — is NOT MEASURED on the pair it was measuring; the next pair is still measured', async () => {
  const S = 'http://source.test'
  const W = 'http://site.test'
  const routes = [
    { site: '/wp-open', source: '/j-open' },
    { site: '/wp-scroll', source: '/j-scroll' },
    { site: '/wp-measure', source: '/j-measure' },
    { site: '/wp-close', source: '/j-close' },
    { site: '/wp-compare', source: '/j-compare' },
    { site: '/', source: '/' }
  ]
  const browser = failingBrowser({
    newPage: 1,
    [`${S}/index.php/j-scroll`]: 'scroll',
    [`${W}/wp-measure`]: 'measure',
    [`${S}/index.php/j-close`]: 'close',
    [`${W}/wp-compare`]: 'compare'
  })
  // an origin given with its trailing slash is the same origin: `/` is read at `/`, not `//`
  const r = await motionRoutes(browser, { source: `${S}/`, site: `${W}/`, routes, prefix: '/index.php' })
  assert.deepEqual(r.map((x) => [x.route, x.sourceRoute, x.sourceUrl, x.siteUrl]), [
    ['/wp-open', '/j-open', `${S}/index.php/j-open`, `${W}/wp-open`],
    ['/wp-scroll', '/j-scroll', `${S}/index.php/j-scroll`, `${W}/wp-scroll`],
    ['/wp-measure', '/j-measure', `${S}/index.php/j-measure`, `${W}/wp-measure`],
    ['/wp-close', '/j-close', `${S}/index.php/j-close`, `${W}/wp-close`],
    ['/wp-compare', '/j-compare', `${S}/index.php/j-compare`, `${W}/wp-compare`],
    ['/', '/', `${S}/`, `${W}/`]
  ])
  assert.deepEqual(r.slice(0, 4).map((x) => x.error), [
    `source ${S}/index.php/j-open: not measured (browser.newPage: Target closed)`,
    `source ${S}/index.php/j-scroll: not measured (page.evaluate: Execution context was destroyed)`,
    `site ${W}/wp-measure: not measured (page.evaluate: measure threw)`,
    `source ${S}/index.php/j-close: not measured (page did not close: page.close: Target crashed)`
  ])
  assert.match(r[4].error, /^site not compared \(.* is not iterable\)$/)
  assert.equal(r[5].error, undefined)
  assert.deepEqual(r.map((x) => x.rows.map((row) => row.kind)), [['error'], ['error'], ['error'], ['error'], ['error'], []])
  assert.equal(r[0].rows[0].site, 'measured')
  assert.equal(r[2].rows[0].source, 'measured')
  assert.deepEqual(r[5].source, { reveals: 1, carousels: 0, autoplay: 0, loops: 0 })
  // every page that opened was read in pair order, source then site
  assert.deepEqual(browser.opened, ['(refused)', `${W}/wp-open`, `${S}/index.php/j-scroll`, `${W}/wp-scroll`, `${S}/index.php/j-measure`, `${W}/wp-measure`, `${S}/index.php/j-close`, `${W}/wp-close`, `${S}/index.php/j-compare`, `${W}/wp-compare`, `${S}/`, `${W}/`])
  const md = formatMarkdown(r)
  for (const x of r.slice(0, 5)) {
    assert.ok(md.includes(`## ${x.route} (source ${x.sourceRoute}) — NOT MEASURED: ${x.error}`), md)
    assert.ok(md.includes(`source ${x.sourceUrl} · site ${x.siteUrl}`), md)
  }
  // the API refuses what the CLI refuses: an address with a path, query or fragment, or a bad prefix
  for (const [o, why] of [
    [{ source: `${S}/#x` }, /--source .* must be an origin/],
    [{ site: `${W}/about` }, /--site .* must be an origin/],
    [{ prefix: '/index.php/' }, /--source-prefix .* must be a path/],
    [{ prefix: '/index.php?x' }, /--source-prefix .* must be a path/],
    [{ routes: ['/a?x=1'] }, /is not a route \(a query/]
  ])
    await assert.rejects(motionRoutes(browser, { source: S, site: W, routes: ['/'], prefix: '', ...o }), why)
})

test('motion.mjs: input that names nothing to measure exits 2 before a browser starts; a symlinked page map reads; a report that cannot be written exits 1', async () => {
  const root = mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'motion-input-'))
  const file = (name, body) => {
    const f = path.join(root, name)
    writeFileSync(f, body)
    return f
  }
  const good = file('good.json', JSON.stringify({ pages: [{ path: '/wp-a', source: { joomlaPath: '/joomla-a' } }] }))
  mkdirSync(path.join(root, 'dir.json'))
  execFileSync('mkfifo', [path.join(root, 'fifo.json')])
  const base = ['--source', 'http://127.0.0.1:9', '--site', 'http://127.0.0.1:9']
  for (const [args, why] of [
    [['--site', 'http://127.0.0.1:9', '--routes', '/'], /usage:/],
    [[...base, '--routes'], /--routes needs a value/],
    [['--source', '--site', 'http://127.0.0.1:9', '--routes', '/'], /--source needs a value/],
    [[...base, '--routes', path.join(root, 'missing.json')], /ENOENT/],
    [[...base, '--routes', path.join(root, 'dir.json')], /is not a regular file/],
    [[...base, '--routes', path.join(root, 'fifo.json')], /is not a regular file/],
    [[...base, '--routes', file('empty.json', '')], /Unexpected end of JSON input/],
    [[...base, '--routes', file('bad.json', '{"pages": [')], /JSON/],
    [[...base, '--routes', file('none.json', JSON.stringify({ pages: [{ path: '/404', synthetic: true }] }))], /names no page/],
    [[...base, '--routes', file('badpath.json', JSON.stringify({ pages: [{ path: '/a', source: { joomlaPath: 'a' } }] }))], /source\.joomlaPath "a" is not a route/],
    [[...base, '--routes', ','], /"" is not a route/],
    [[...base, '--routes', '/a,b'], /"b" is not a route/],
    [[...base, '--routes', '/a?x=1'], /"\/a\?x=1" is not a route \(a query/],
    [[...base, '--routes', '/a#top'], /"\/a#top" is not a route \(a query/],
    [[...base, '--routes', '/a/../b'], /is not a route \(a dot segment/],
    [[...base, '--routes', '/a/%2e%2E/b'], /is not a route \(a dot segment/],
    [[...base, '--routes', '/a\\b'], /is not a route \(a query, fragment, backslash/],
    [[...base, '--routes', file('query.json', JSON.stringify({ pages: [{ path: '/wp-a', source: { joomlaPath: '/index.php?option=com_content' } }] }))], /source\.joomlaPath .* is not a route \(a query/],
    [['--source', 'http://127.0.0.1:9/#x', '--site', 'http://127.0.0.1:9', '--routes', '/about'], /--source http:\/\/127\.0\.0\.1:9\/#x must be an origin/],
    [['--source', 'http://127.0.0.1:9', '--site', 'http://127.0.0.1:9/#x', '--routes', '/about'], /--site .* must be an origin/],
    [['--source', 'http://127.0.0.1:9/index.php', '--site', 'http://127.0.0.1:9', '--routes', '/'], /--source .* must be an origin/],
    [['--source', 'http://127.0.0.1:9', '--site', 'http://127.0.0.1:9/wp/', '--routes', '/'], /--site .* must be an origin/],
    [['--source', 'http://127.0.0.1:9?x=1', '--site', 'http://127.0.0.1:9', '--routes', '/'], /--source .* must be an origin/],
    [['--source', 'http://u:p@127.0.0.1:9', '--site', 'http://127.0.0.1:9', '--routes', '/'], /--source .* must be an origin/],
    [[...base, '--routes', '/', '--source-prefix', '/index.php?x=1'], /--source-prefix .* must be a path like \/index\.php/],
    [[...base, '--routes', '/', '--source-prefix', '/a/..'], /--source-prefix .* must be a path like \/index\.php/],
    [[...base, '--routes', '/', '--source-prefix', '/%2e%2e'], /--source-prefix .* must be a path like \/index\.php/],
    [[...base, '--routes', '/', '--source-prefix', '/index.php#x'], /--source-prefix .* must be a path like \/index\.php/],
    [['--source', 'not a url', '--site', 'http://127.0.0.1:9', '--routes', '/'], /--source not a url is not a URL/],
    [['--source', 'http://127.0.0.1:9', '--site', 'file:///tmp', '--routes', '/'], /--site file:\/\/\/tmp is not an http\(s\) URL/],
    [[...base, '--routes', '/', '--source-prefix', 'index.php'], /--source-prefix index\.php must be a path/],
    [[...base, '--routes', '/', '--source-prefix', '/index.php/'], /--source-prefix \/index\.php\/ must be a path/],
    [[...base, '--routes', '/', '--width', '0'], /--width must be a positive integer/],
    [[...base, '--routes', '/', '--out', path.join(root, 'out.md')], /--out .* must end in \.json/]
  ]) {
    const r = await motionCli(args, 20000)
    assert.equal(r.timedOut, false, `${args.join(' ')}: returned`)
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`)
    assert.match(r.stderr, why, args.join(' '))
    assert.equal(r.stdout, '', `${args.join(' ')}: nothing measured`)
  }
  const src = await serve({ '/joomla-a': ANIMATED })
  const site = await serve({ '/wp-a': ANIMATED })
  try {
    const link = path.join(root, 'link.json')
    symlinkSync(good, link)
    const ok = await motionCli(['--source', src.origin, '--site', site.origin, '--routes', link])
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`)
    assert.match(ok.stdout, /^## \/wp-a \(source \/joomla-a\) — reveals 2\/2/m)
    const out = path.join(root, 'no-such-dir', 'motion.json')
    const unwritable = await motionCli(['--source', src.origin, '--site', site.origin, '--routes', good, '--out', out])
    assert.equal(unwritable.status, 1, unwritable.stderr)
    assert.match(unwritable.stderr, /ENOENT.*no-such-dir/)
    assert.equal(unwritable.stdout, '', 'no report is printed as if the run completed')
    // A source that refuses the connection is a NOT MEASURED pair, exit 1.
    const refused = await motionCli(['--source', 'http://127.0.0.1:9', '--site', site.origin, '--routes', good])
    assert.equal(refused.status, 1, refused.stderr)
    assert.match(refused.stdout, /^## \/wp-a \(source \/joomla-a\) — NOT MEASURED: source http:\/\/127\.0\.0\.1:9\/joomla-a: /m)
    // A browser that does not start fails the run; it is not a skipped, passing one.
    const noBrowser = await runChild(process.execPath, [MOTION_CLI, '--source', src.origin, '--site', site.origin, '--routes', good], { timeoutMs: 60000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') } })
    assert.equal(noBrowser.status, 1, `${noBrowser.stdout}${noBrowser.stderr}`)
    assert.match(noBrowser.stderr, /^motion\.mjs: /m)
    assert.equal(noBrowser.stdout, '')
  } finally {
    await src.close()
    await site.close()
  }
})

// Two runs of the visual review on the same animated page must read the same: the same pictures
// byte for byte and the same measurements. Live, the carousel above is on another slide and the
// reveals are mid-transition at every read (the test above shows it moving).
const scratch = () => mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'motion-vqa-'))
test('visual-qa: two runs of an animated page give the same pictures and the same measurements', async () => {
  const root = scratch()
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), ANIMATED)
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const pageMap = { locales: ['en'], defaultLocale: 'en', theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'About.html', view: 'page', title: 'Motion fixture', path: '/about/', locale: 'en' }] }
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(spec), id: 'motion' })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  const srv = await serve({ '/about/': ANIMATED })
  try {
    const runs = []
    for (const n of [1, 2]) {
      const out = path.join(root, `out-${n}`)
      const report = await run({ contract: contractFile, site: srv.origin, out, spec, sourceSite: null, concurrency: 1, megaItems: '.none', stage: 'light-desktop' })
      runs.push({ out, axis: report.pages[0].axes.find((a) => a.variant === '1440-light') })
    }
    const [a, b] = runs
    assert.ok(a.axis.screenshot && a.axis.sourceScreenshot, 'both sides were shot')
    // Same picture: every pixel within the colour tolerance of the parity check (±8/255 per
    // channel). Byte equality is too strict for Chromium's compositor, which antialiases the edge
    // of a transformed layer one level apart between two loads (6 px at 1/255 seen here); a
    // carousel on another slide or a reveal mid-transition is off by far more than 8.
    for (const k of ['screenshot', 'sourceScreenshot']) {
      const [p, q] = [a, b].map((x) => PNG.sync.read(readFileSync(path.join(x.out, x.axis[k]))))
      assert.deepEqual([p.width, p.height], [q.width, q.height], `${k}: same size`)
      let off = 0
      for (let i = 0; i < p.data.length; i += 4) if (Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2])) > 8) off++
      assert.equal(off, 0, `${k}: ${off} pixels differ by more than 8/255 between the two runs`)
    }
    const measured = (x) => JSON.stringify({ findings: x.findings, components: x.components, coverage: x.coverage, examined: x.examined, motion: x.motion, sourceMotion: x.sourceMotion })
    assert.equal(measured(a.axis), measured(b.axis))
    assert.deepEqual(a.axis.motion, { loops: 1, owl: 0, swiper: 1, splide: 0, slick: 0, tracy: 0, unhandled: 0 })
  } finally {
    await srv.close()
  }
})

// Content only a loop shows: three words, each `opacity: 0`, faded in one at a time by a 9 s loop
// with delays 0/3/6 s. Ending every animation (duration 0 s) showed none of them; held, the page
// reads as it does live LOOP_HOLD_MS in — one word shown — whenever the freeze happens.
const ROTATING = `<!doctype html><html lang="en"><head><style>
@keyframes word{0%{opacity:0}5%,30%{opacity:1}35%,100%{opacity:0}}
@keyframes fade{from{opacity:0}to{opacity:1}}
.rot{position:absolute;opacity:0;animation:word 9s linear infinite}
.rot:nth-child(2){animation-delay:3s}.rot:nth-child(3){animation-delay:6s}
#late{opacity:0;animation:fade 1s 2s forwards}
</style></head><body><main><h1>Words</h1><div id="w" style="position:relative;height:40px"><span class="rot">one</span><span class="rot">two</span><span class="rot">three</span></div>
<p id="late">Faded in late.</p></main></body></html>`
test('motion: a loop that alone shows content is held where the live page shows it, the same whenever the freeze runs; a finite animation ends', async () => {
  assert.equal(LOOP_HOLD_MS, 1000)
  const srv = await serve({ '/': ROTATING })
  try {
    await withBrowser(async (browser) => {
      const reads = []
      for (const wait of [50, 1700]) {
        const page = await browser.newPage()
        await page.goto(srv.origin + '/')
        await page.waitForTimeout(wait)
        const r = await freezeMotion(page)
        assert.equal(r.loops, 3)
        const read = () => page.evaluate(() => [...document.querySelectorAll('.rot, #late')].map((e) => getComputedStyle(e).opacity))
        const a = await read()
        await page.waitForTimeout(400)
        assert.deepEqual(await read(), a, 'nothing moves after the freeze')
        reads.push(a)
        await page.close()
      }
      assert.deepEqual(reads[0], reads[1], 'a freeze at 50 ms and at 1.7 s read the same')
      assert.deepEqual(reads[0], ['1', '0', '0', '1'], 'the first word shown, as live at 1 s; the late fade ended visible')
    })
  } finally {
    await srv.close()
  }
})

// An animate.css loop (`animate__animated animate__infinite`) that alone shows and places its
// element: the WOW / animate.css reset must not cancel it once it is held.
const ANIMATE_LOOP = `<!doctype html><html lang="en"><head><style>
@keyframes slide{0%{opacity:1;transform:translateX(0)}100%{opacity:1;transform:translateX(200px)}}
#a{opacity:0;animation:slide 4s linear infinite}
</style></head><body><main><h1>Loop</h1><div id="a" class="animate__animated animate__infinite">moving</div>
<div id="b" class="animate__animated" style="opacity:0">revealed</div></main></body></html>`
test('motion: an animate.css loop is held where the live page shows it, not cancelled by the reveal reset; a plain animate.css element is revealed', async () => {
  const srv = await serve({ '/': ANIMATE_LOOP })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage()
      await page.goto(srv.origin + '/')
      const r = await freezeMotion(page)
      assert.equal(r.loops, 1)
      const read = () => page.evaluate(() => ['a', 'b'].map((id) => {
        const cs = getComputedStyle(document.getElementById(id))
        return [cs.opacity, cs.transform]
      }))
      const a = await read()
      assert.deepEqual(a, [['1', 'matrix(1, 0, 0, 1, 50, 0)'], ['1', 'none']], 'the loop 1 s into its 4 s run, 50 px along; the plain one shown')
      await page.waitForTimeout(300)
      assert.deepEqual(await read(), a, 'nothing moves after the freeze')
    })
  } finally {
    await srv.close()
  }
})

// WOW / animate.css reveals whose finite animation places the element and keeps it there
// (`forwards`), and a WOW element the script has not revealed yet. A reset to `animation: none`
// put the placed ones back at 0 px, where the live page never leaves them.
const REVEAL_FILL = `<!doctype html><html lang="en"><head><style>
@keyframes place{from{transform:translateX(0)}to{transform:translateX(120px)}}
#w,#a{animation:place 300ms ease-out forwards}
.pending{opacity:0}
</style></head><body><main><h1>Fill</h1><div id="w" class="wow">wow placed</div><div id="a" class="animate__animated">animate placed</div>
<div id="u" class="wow pending" style="visibility:hidden;animation-name:none">not revealed yet</div></main></body></html>`
test('motion: a finite WOW / animate.css animation is frozen at its filled end state, where the live page leaves it; an unrevealed WOW element is shown', async () => {
  const srv = await serve({ '/': REVEAL_FILL })
  try {
    await withBrowser(async (browser) => {
      const read = (page) => page.evaluate(() => ['w', 'a', 'u'].map((id) => {
        const el = document.getElementById(id)
        const cs = getComputedStyle(el)
        return [cs.visibility, cs.opacity, Math.round(el.getBoundingClientRect().x)]
      }))
      const live = await browser.newPage()
      await live.goto(srv.origin + '/')
      await live.waitForTimeout(700)
      const ended = await read(live)
      assert.deepEqual(ended.slice(0, 2).map((r) => r[2] - ended[2][2]), [120, 120], 'live, both placed 120 px along once finished')
      await live.close()
      for (const wait of [30, 700]) {
        const page = await browser.newPage()
        await page.goto(srv.origin + '/')
        await page.waitForTimeout(wait)
        const r = await freezeMotion(page)
        assert.equal(r.error, undefined)
        const frozen = await read(page)
        assert.deepEqual(frozen.slice(0, 2), ended.slice(0, 2), `frozen at ${wait} ms: where the live page ends them`)
        assert.deepEqual(frozen[2].slice(0, 2), ['visible', '1'], 'the unrevealed WOW element is shown')
        await page.close()
      }
    })
  } finally {
    await srv.close()
  }
})

// Owl's classes with jQuery on the page but no Owl instance: `trigger` does not throw, so an
// unchecked stop counted it as stopped while its own timer kept it moving.
const OWL_MARKUP = `<!doctype html><html lang="en"><body><main><h2>Clients</h2>
<div class="owl-carousel owl-loaded" id="o"><div class="owl-item">1</div><div class="owl-item">2</div></div></main>
<script>
window.jQuery = (el) => ({ data: () => undefined, trigger() { return this } })
let k = 0; setInterval(() => { k = (k + 1) % 2; document.getElementById('o').dataset.index = k }, 150)
</script></body></html>`
// A page whose Content-Security-Policy blocks inline styles: the freeze stylesheet never applies.
test('motion: Owl markup without an Owl instance is unhandled, and a freeze whose stylesheet is refused is an error, not a clean result', async () => {
  const srv = createServer((req, res) => {
    const csp = req.url === '/csp'
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...(csp ? { 'content-security-policy': "style-src 'self'" } : {}) })
    res.end(csp ? '<!doctype html><html><body><h1>Locked</h1></body></html>' : OWL_MARKUP)
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${srv.address().port}`
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage()
      await page.goto(origin + '/')
      const r = await freezeMotion(page)
      assert.equal(r.owl, 0)
      assert.equal(r.unhandled, 1)
      await page.goto(origin + '/csp')
      const locked = await freezeMotion(page)
      assert.deepEqual(Object.keys(locked), ['error'])
      assert.match(locked.error, /Content Security Policy/)
    })
  } finally {
    await new Promise((r) => srv.close(r))
  }
})

// ─── Tracy's own motion library (TracyHQ/tch `packages/cms/tracy-cms-motion`, runtime v2). The
// stylesheet is the library's reveal/base/pulse rules; the script is a trimmed copy of its runtime
// (reveal once in view, pulse on, carousel moved by a Web Animations transform on its track, no
// timer). Its <body> carries `tracy-nav-top-left`, as a Tracy theme's does, and the stories section
// holds a button that is no carousel control.
const TRACY_CSS = `
html.tracy-motion main section{opacity:0} html.tracy-motion main section section{opacity:1} html.tracy-motion main section.tracy-motion-done{opacity:1}
html.tracy-motion main .tracy-motion-reveal{opacity:0} html.tracy-motion main .tracy-motion-reveal.tracy-motion-done{opacity:1}
html.tracy-motion .tracy-motion-reveal.tracy-motion-in{--tracy-motion-dur:700ms;--tracy-motion-shift:32px;animation:tracy-motion-reveal-up var(--tracy-motion-dur) ease var(--tracy-motion-delay,0ms) both}
html.tracy-motion .tracy-motion-reveal.tracy-motion-in.tracy-motion-bold{--tracy-motion-dur:1500ms;--tracy-motion-shift:100px}
html.tracy-motion .tracy-motion-reveal--fade-left.tracy-motion-in{animation-name:tracy-motion-reveal-left}
html.tracy-motion .tracy-motion-reveal--flip-up.tracy-motion-in{animation-name:tracy-motion-reveal-flip-up}
html.tracy-motion .tracy-motion-delay-2{--tracy-motion-delay:200ms} html.tracy-motion .tracy-motion-delay-4{--tracy-motion-delay:400ms}
.stat{--tracy-motion-delay:.1s} .stat+.stat{--tracy-motion-delay:.2s}
@keyframes tracy-motion-reveal-up{from{opacity:0;transform:translateY(var(--tracy-motion-shift))}to{opacity:1;transform:none}}
@keyframes tracy-motion-reveal-left{from{opacity:0;transform:translateX(var(--tracy-motion-shift))}to{opacity:1;transform:none}}
@keyframes tracy-motion-reveal-flip-up{from{opacity:0;transform:perspective(2500px) rotateX(-100deg)}to{opacity:1;transform:perspective(2500px) rotateX(0)}}
html.tracy-motion .tracy-motion-pulse.tracy-motion-on::before,html.tracy-motion .tracy-motion-pulse.tracy-motion-on::after{animation:tracy-motion-pulse 2200ms ease-out infinite}
html.tracy-motion .tracy-motion-pulse.tracy-motion-on::after{animation-delay:600ms}
@keyframes tracy-motion-pulse{from{opacity:1;scale:1}to{opacity:0;scale:1.3}}
.tracy-motion-pulse{position:relative;display:inline-block;width:40px;height:40px}
.tracy-motion-pulse::before,.tracy-motion-pulse::after{content:'';position:absolute;inset:0;border:2px solid rgb(200,40,40);border-radius:50%}
.tracy-motion-carousel{overflow:hidden;width:600px} .tracy-motion-track{display:flex;margin:0;padding:0;list-style:none}
.tracy-motion-track>*{flex:0 0 300px;height:100px} .spacer{height:1600px}
`
const TRACY_RUNTIME = `
const config = window.TracyMotion
const slot = (id) => (config.effects || []).some((e) => e.id === id)
const bold = (config.effects || []).some((e) => e.id === 'reveal' && e.intensity === 'bold')
const show = (el) => { el.classList.remove('tracy-motion-in', 'tracy-motion-bold'); el.classList.add('tracy-motion-done') }
if (slot('reveal')) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return
    io.unobserve(e.target)
    if (bold) e.target.classList.add('tracy-motion-bold')
    e.target.classList.add('tracy-motion-in')
    Promise.all(e.target.getAnimations().map((a) => a.finished)).then(() => show(e.target), () => show(e.target))
  }))
  document.querySelectorAll('main .tracy-motion-reveal').forEach((el) => io.observe(el))
}
if (slot('pulse')) document.querySelectorAll('main .tracy-motion-pulse').forEach((el) => el.classList.add('tracy-motion-on'))
document.querySelectorAll('main section:not(.tracy-motion-later)').forEach((s) => s.classList.add('tracy-motion-done'))
function carousel(root) {
  const track = root.querySelector(':scope > .tracy-motion-track') || root.firstElementChild
  const slides = [...track.children]
  slides.forEach((s) => s.classList.add('tracy-motion-slide'))
  const scope = root.closest('section') || root.parentElement || root
  root.classList.add('tracy-motion-carousel-step')
  let index = 0, animation = null
  const offset = (i) => slides[i].offsetLeft - slides[0].offsetLeft
  const perView = () => Math.max(1, Math.min(slides.length, Math.round(root.clientWidth / (offset(1) || slides[0].offsetWidth || 1))))
  const last = () => slides.length - perView()
  const dots = []
  const paint = () => {
    slides.forEach((s, i) => (i >= index && i < index + perView() ? s.removeAttribute('aria-hidden') : s.setAttribute('aria-hidden', 'true')))
    dots.forEach((d, i) => (i === index ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')))
  }
  const go = (to, animate) => {
    const end = last()
    index = to < 0 ? end : to > end ? 0 : to
    const from = animation ? getComputedStyle(track).transform : 'none'
    const next = track.animate([{ transform: from === 'none' ? 'translateX(0px)' : from }, { transform: 'translateX(' + -offset(index) + 'px)' }], { duration: animate ? 400 : 0, fill: 'forwards' })
    if (animation) animation.cancel()
    animation = next
    paint()
  }
  scope.querySelectorAll('.tracy-motion-prev').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); go(index - 1, true) }))
  scope.querySelectorAll('.tracy-motion-next').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); go(index + 1, true) }))
  if (root.classList.contains('tracy-motion-carousel--dots')) {
    const holder = document.createElement('div')
    holder.className = 'tracy-motion-dots'
    for (let i = 0; i <= last(); i++) {
      const dot = document.createElement('button')
      dot.className = 'tracy-motion-dot'
      dot.addEventListener('click', () => go(i, true))
      dots.push(dot)
      holder.append(dot)
    }
    root.append(holder)
  }
  root.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(index - 1, true); else if (e.key === 'ArrowRight') go(index + 1, true) })
  go(0, false)
}
if (slot('carousel-step')) document.querySelectorAll('main .tracy-motion-carousel').forEach(carousel)
`
const tracyPage = ({ marker = true, effects = [{ id: 'reveal', v: 2, intensity: 'bold' }, { id: 'carousel-step', v: 2 }, { id: 'pulse', v: 2 }] } = {}) => `<!doctype html><html lang="en"${marker ? ' class="tracy-motion"' : ''}><head><meta charset="utf-8"><style>${TRACY_CSS}</style>
<script>window.TracyMotion = ${JSON.stringify({ effects })}</script></head><body class="tracy tracy-page-home tracy-nav-top-left"><main>
<section><h1>Hero</h1><p class="tracy-motion-reveal">Lead</p><div class="tracy-motion-reveal tracy-motion-reveal--fade-left tracy-motion-delay-4">Picture</div>
<div class="stat tracy-motion-reveal tracy-motion-reveal--fade-right">12</div><div class="stat tracy-motion-reveal tracy-motion-reveal--fade-right">34</div></section>
<section><h2>Stories</h2><div class="tracy-motion-carousel tracy-motion-carousel--dots" id="stories"><ul class="tracy-motion-track"><li>1</li><li>2</li><li>3</li><li>4</li></ul></div><button type="button">Load more</button></section>
<section><h2>Team</h2><div class="tracy-motion-prev"><a href="#">‹</a></div><div class="tracy-motion-next"><a href="#">›</a></div>
<div class="tracy-motion-carousel" id="team"><div class="tracy-motion-track"><div>A</div><div>B</div><div>C</div><div>D</div><div>E</div><div>F</div></div></div></section>
<section><h2>Video</h2><a class="tracy-motion-pulse" href="#v"></a></section>
<div class="spacer"></div>
<section class="tracy-motion-later"><h2>Below</h2><div class="tracy-motion-reveal tracy-motion-reveal--flip-up tracy-motion-delay-2">Flip</div><div class="tracy-motion-reveal tracy-motion-reveal--zoom-in">Unstyled modifier</div><p id="plain">Plain text</p></section>
</main><script>${TRACY_RUNTIME}</script></body></html>`
// The same reveals written for AOS, with AOS's init options on <body> as AOS 2 leaves them.
const AOS_TWIN = `<!doctype html><html lang="en"><body data-aos-easing="ease" data-aos-duration="1500" data-aos-delay="0"><main>
<section><h1>Hero</h1><p data-aos="fade-up">Lead</p><div data-aos="fade-left" data-aos-delay="400">Picture</div>
<div data-aos="fade-right" data-aos-delay="100">12</div><div data-aos="fade-right" data-aos-delay="200">34</div></section>
<section><h2>Below</h2><div data-aos="flip-up" data-aos-delay="200">Flip</div><div data-aos="fade-up">Zoom</div></section></main></body></html>`

test('motion: the Tracy vocabulary names effects as AOS does, and every reveal modifier the library styles is in it', () => {
  const aos = ['fade', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'fade-up-right', 'fade-up-left', 'fade-down-right', 'fade-down-left', 'flip-up', 'flip-down', 'flip-left', 'flip-right', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'zoom-in-up', 'zoom-in-down', 'zoom-in-left', 'zoom-in-right', 'zoom-out', 'zoom-out-up', 'zoom-out-down', 'zoom-out-left', 'zoom-out-right']
  const named = [TRACY_MOTION.reveal.defaultEffect, ...Object.values(TRACY_MOTION.reveal.effects), ...Object.values(TRACY_MOTION.sections).map((x) => x.effect)]
  for (const e of named) assert.ok(aos.includes(e), `${e} is an AOS effect name`)
  assert.deepEqual(Object.keys(TRACY_MOTION.reveal.effects).sort(), ['fade-left', 'fade-right', 'flip-up'])
  assert.equal(TRACY_MOTION.reveal.defaultEffect, 'fade-up')
  assert.deepEqual(TRACY_MOTION.reveal.durationMs, { subtle: 700, bold: 1500 })
  assert.throws(() => measureMotionInPage(), /measureMotion\(page\)/, 'called without the vocabulary it cannot read a Tracy page')
})

test('motion: Tracy reveals, carousels and loops are counted before, during and after their entrance, and compare equal to the AOS reveals they port', async () => {
  const srv = await serve({ '/': tracyPage(), '/aos': AOS_TWIN, '/off': tracyPage({ marker: false }), '/narrow': tracyPage({ effects: [{ id: 'reveal', v: 2, minWidth: 5000 }] }), '/subtle': tracyPage({ effects: [{ id: 'reveal', v: 2 }] }) })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(srv.origin + '/')
      await page.waitForTimeout(100)
      const reads = [await measureMotion(page)]
      // In view: the hero reveals are playing (`tracy-motion-in`, `-bold`); below the fold, not yet.
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.tracy-motion-reveal')].map((e) => e.classList.contains('tracy-motion-in'))), [true, true, true, true, false, false])
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(2500)
      assert.equal(await page.evaluate(() => document.querySelectorAll('.tracy-motion-in, .tracy-motion-bold').length), 0, 'every reveal has played and dropped its classes')
      reads.push(await measureMotion(page))
      assert.deepEqual(reads[1], reads[0], 'the same inventory before and after the entrances')
      const m = reads[0]
      assert.deepEqual(m.reveals.map((r) => [r.near, r.effect, r.delay, r.duration, r.tag]), [
        ['hero', 'fade-up', 0, 1500, 'p'],
        ['hero', 'fade-left', 400, 1500, 'div'],
        // No delay class: the theme's own rule sets the library's delay property.
        ['hero', 'fade-right', 100, 1500, 'div'],
        ['hero', 'fade-right', 200, 1500, 'div'],
        ['below', 'flip-up', 200, 1500, 'div'],
        ['below', 'fade-up', 0, 1500, 'div']
      ])
      assert.deepEqual(m.carousels.map((c) => [c.near, c.kind, c.slides, c.autoplay, c.nav, c.dots]), [
        ['stories', 'tracy', 4, false, false, true],
        ['team', 'tracy', 6, false, true, false]
      ])
      assert.deepEqual(m.loops.map((l) => [l.near, l.name]), [['video', 'tracy-motion-pulse'], ['video', 'tracy-motion-pulse']])
      await page.goto(srv.origin + '/aos')
      const twin = await measureMotion(page)
      assert.deepEqual(compareMotion(inv({ reveals: twin.reveals }), inv({ reveals: m.reveals })).rows, [], 'an AOS page and its Tracy port compare equal')
      const moved = structuredClone(m.reveals)
      moved[4].effect = 'fade-right'
      assert.deepEqual(compareMotion(inv({ reveals: twin.reveals }), inv({ reveals: moved })).rows.map((r) => [r.near, r.source, r.site]), [['below', '2 × flip-up/fade-up, delay 200/0 ms, duration 1500 ms', '2 × fade-right/fade-up, delay 200/0 ms, duration 1500 ms']])
      await page.goto(srv.origin + '/subtle')
      assert.deepEqual((await measureMotion(page)).reveals.map((r) => r.duration), [700, 700, 700, 700, 700, 700], 'subtle reveals run 700 ms')
      // The runtime declined (marker off) or the viewport is under minWidth: nothing enters.
      for (const route of ['/off', '/narrow']) {
        await page.goto(srv.origin + route)
        assert.deepEqual((await measureMotion(page)).reveals, [], route)
      }
    })
  } finally {
    await srv.close()
  }
})

// Runtime v1: `hero-stagger` plays the first section's units on load, `fade-up` each later section
// when it is scrolled to; each unit's delay goes on its animation with updateTiming. Afterwards the
// runtime removes every class it added. The step is the library's (hero 90 ms, bold fade-up 120 ms).
const TRACY_V1 = `<!doctype html><html lang="en" class="tracy-motion"><head><meta charset="utf-8"><style>
html.tracy-motion main section{opacity:0} html.tracy-motion main section.tracy-motion-done{opacity:1}
html.tracy-motion .tracy-motion-hero-stagger,html.tracy-motion .tracy-motion-fade-up{opacity:1}
html.tracy-motion .tracy-motion-hero-stagger .tracy-motion-unit{animation:tracy-motion-hero-stagger 520ms both}
html.tracy-motion .tracy-motion-fade-up .tracy-motion-unit{animation:tracy-motion-fade-up 640ms both}
@keyframes tracy-motion-hero-stagger{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes tracy-motion-fade-up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:none}}
.spacer{height:1600px}
</style><script>window.TracyMotion = { effects: [{ id: 'hero-stagger', v: 1 }, { id: 'fade-up', v: 1, intensity: 'bold' }] }</script></head><body><main>
<section id="hero"><div class="cols"><div class="copy"><h1>Hero title</h1><p>Lead</p><a class="btn" href="#">Start</a></div></div></section>
<div class="spacer"></div>
<section id="features"><h2>Features</h2><div class="cards"><div class="card">A</div><div class="card">B</div><div class="card">C</div></div></section>
</main><script>
const walk = (level, units) => {
  const kids = [...level.children]
  const sig = (k) => k.tagName + '|' + (k.getAttribute('class') || '')
  if (kids.length >= 3 && kids.every((k) => sig(k) === sig(kids[0]))) return units.push(...kids)
  for (const k of kids) (k.matches('h1,h2,h3,h4,h5,h6,p,img,picture,figure') || /btn/.test(k.className) ? units.push(k) : walk(k, units))
}
function play(section, id, step) {
  const units = []
  walk(section, units)
  units.forEach((u) => u.classList.add('tracy-motion-unit'))
  section.classList.add('tracy-motion-' + id)
  const running = []
  units.forEach((u, i) => u.getAnimations().forEach((a) => { if (a.animationName === 'tracy-motion-' + id) { a.effect.updateTiming({ delay: Math.min(i, 7) * step }); running.push(a.finished) } }))
  const done = () => { section.classList.add('tracy-motion-done'); section.classList.remove('tracy-motion-' + id); units.forEach((u) => u.classList.remove('tracy-motion-unit')) }
  Promise.all(running).then(done, done)
}
play(document.getElementById('hero'), 'hero-stagger', 90)
const features = document.getElementById('features')
const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); play(features, 'fade-up', 120) } })
io.observe(features)
</script></body></html>`

test('motion: Tracy v1 section entrances are counted per content unit with the library stagger, before and after they play; frozen, every unit and every waiting section shows', async () => {
  const srv = await serve({ '/': TRACY_V1 })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(srv.origin + '/')
      const before = await measureMotion(page)
      assert.deepEqual(before.reveals.map((r) => [r.near, r.effect, r.delay, r.duration, r.tag]), [
        ['hero title', 'fade-up', 0, 520, 'h1'],
        ['hero title', 'fade-up', 90, 520, 'p'],
        ['hero title', 'fade-up', 180, 520, 'a'],
        ['features', 'fade-up', 0, 640, 'h2'],
        ['features', 'fade-up', 120, 640, 'div'],
        ['features', 'fade-up', 240, 640, 'div'],
        ['features', 'fade-up', 360, 640, 'div']
      ])
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(1500)
      assert.equal(await page.evaluate(() => document.querySelectorAll('.tracy-motion-unit, .tracy-motion-hero-stagger, .tracy-motion-fade-up').length), 0, 'the runtime cleaned up')
      assert.deepEqual(await measureMotion(page), before)
      // Frozen 30 ms in: the hero mid-stagger, the features section still hidden, never scrolled to.
      const fresh = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await fresh.goto(srv.origin + '/')
      await fresh.waitForTimeout(30)
      const r = await freezeMotion(fresh)
      assert.equal(r.error, undefined)
      const read = () => fresh.evaluate(() => [...document.querySelectorAll('#hero h1, #hero p, #hero a, #features')].map((e) => getComputedStyle(e).opacity))
      assert.deepEqual(await read(), ['1', '1', '1', '1'])
      assert.deepEqual(await fresh.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.effect.target.tagName)), [], 'no unit is still waiting out its delay')
      await fresh.waitForTimeout(300)
      assert.deepEqual(await read(), ['1', '1', '1', '1'], 'and they stay shown')
    })
  } finally {
    await srv.close()
  }
})

test('motion: frozen, a Tracy page shows every reveal and waiting section, holds its pulse, and puts each carousel on its first slide — also mid-step', async () => {
  const srv = await serve({ '/': tracyPage() })
  try {
    await withBrowser(async (browser) => {
      for (const settle of [600, 0]) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
        await page.goto(srv.origin + '/')
        await page.waitForTimeout(50)
        // Move both carousels off their first slide; `settle: 0` freezes during the 400 ms step.
        await page.click('.tracy-motion-next a')
        await page.click('.tracy-motion-next a')
        await page.click('#stories .tracy-motion-dot:nth-child(3)')
        await page.waitForTimeout(settle)
        const state = () =>
          page.evaluate(() => ({
            reveals: [...document.querySelectorAll('.tracy-motion-reveal, main section')].map((e) => getComputedStyle(e).opacity),
            tracks: [...document.querySelectorAll('.tracy-motion-track')].map((t) => new DOMMatrixReadOnly(getComputedStyle(t).transform === 'none' ? undefined : getComputedStyle(t).transform).m41),
            first: [...document.querySelectorAll('.tracy-motion-track')].map((t) => t.children[0].getAttribute('aria-hidden')),
            pulse: document.getAnimations().filter((a) => a.animationName === 'tracy-motion-pulse').map((a) => [a.playState, Math.round(a.currentTime)])
          }))
        const moved = await state()
        assert.ok(moved.first.every((x) => x === 'true'), `settle ${settle}: both carousels were moved off their first slide`)
        const r = await freezeMotion(page)
        assert.deepEqual({ ...r }, { loops: 2, owl: 0, swiper: 0, splide: 0, slick: 0, tracy: 2, unhandled: 0 }, `settle ${settle}`)
        const a = await state()
        assert.ok(a.reveals.every((o) => o === '1'), `settle ${settle}: every reveal and section shown (${a.reveals})`)
        assert.deepEqual(a.tracks, [0, 0], `settle ${settle}: both tracks at their first slide`)
        assert.deepEqual(a.first, [null, null])
        assert.deepEqual(a.pulse, [['paused', LOOP_HOLD_MS], ['paused', LOOP_HOLD_MS]], 'the pulse rings are held, not ended')
        await page.waitForTimeout(600)
        assert.deepEqual(await state(), a, `settle ${settle}: nothing moves after the freeze`)
        await page.close()
      }
    })
  } finally {
    await srv.close()
  }
})

// Loops nobody sees: a form spinner kept `visibility: hidden` until a submit (Contact Form 7), one
// `display: none`, one inside a hidden ancestor of each kind, one with no box. Seen: one far below
// the fold, and a word that only its loop fades in (`opacity: 0` at rest).
const HIDDEN_LOOPS = `<!doctype html><html lang="en"><head><style>
@keyframes spin{to{transform:rotate(360deg)}} @keyframes word{0%,100%{opacity:0}50%{opacity:1}}
.l{display:inline-block;width:20px;height:20px;animation:spin 1s linear infinite}
.word{display:inline-block;opacity:0;animation:word 3s infinite}
</style></head><body><main><h2>Contact us</h2>
<span class="l wpcf7-spinner" style="visibility:hidden"></span>
<span class="l" style="display:none"></span>
<div style="display:none"><span class="l"></span></div>
<div style="visibility:hidden"><span class="l"></span></div>
<span class="l" style="width:0;height:0"></span>
<div style="height:3000px"></div><h2>Far below</h2><span class="l" id="seen"></span><span class="word">now</span>
</main></body></html>`

test('motion: a loop that is not rendered is not counted; one below the fold or one that fades its own element in is', async () => {
  const srv = await serve({ '/': HIDDEN_LOOPS })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(srv.origin + '/')
      assert.equal(await page.evaluate(() => document.getAnimations().length), 5, 'Chromium runs the animations of the hidden-by-visibility and zero-size ones')
      const m = await measureMotion(page)
      assert.deepEqual(m.loops.map((l) => [l.near, l.name]), [['far below', 'spin'], ['far below', 'word']])
    })
  } finally {
    await srv.close()
  }
})

// Controls belong to the carousel only when they are inside it or its own wrapper. A Tracy <body>
// carries `tracy-nav-top-left`; the unanchored `[class*="-nav"] button` matched through it.
const NAV_BOUNDS = `<!doctype html><html lang="en"><body class="tracy tracy-nav-top-left"><main>
<section><h2>Plain</h2><div class="wrap"><div class="team-carousel"><div class="slide">1</div><div class="slide">2</div></div><button type="button">Contact</button></div></section>
<section><h2>Pair</h2><div class="row"><div class="a-carousel"><div class="slide">1</div><div class="slide">2</div><span class="a-next">›</span></div><div class="b-carousel"><div class="slide">1</div><div class="slide">2</div></div></div></section>
<section><h2>Arrows outside</h2><div class="cw"><div class="cw-owl-nav"><button>‹</button><button>›</button></div><div class="inner"><div class="c-carousel"><div class="slide">1</div><div class="slide">2</div></div></div></div></section>
</main></body></html>`

test('motion: carousel controls are found inside the carousel and its own wrapper only — never through <body> classes or a neighbouring carousel', async () => {
  const srv = await serve({ '/': NAV_BOUNDS })
  try {
    await withBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(srv.origin + '/')
      const m = await measureMotion(page)
      assert.deepEqual(m.carousels.map((c) => [c.near, c.slides, c.nav, c.dots]), [
        ['plain', 2, false, false],
        ['pair', 2, true, false],
        ['pair', 2, false, false],
        ['arrows outside', 2, true, false]
      ])
    })
  } finally {
    await srv.close()
  }
})
