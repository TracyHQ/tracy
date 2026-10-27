/**
 * `POST /_host/capture` — the demo screenshotter. tracy-host is the only process on the demo host
 * that can reach a demo container over the host's own docker network, so the shot is taken HERE,
 * by URL, and returned to tracy-web as base64 PNGs.
 *
 * The browser itself is injected as `shoot`, so these tests never launch Chromium: what they prove
 * is the route's own contract — the internal target it composes per platform, the two viewports it
 * honours, the shape it returns, and that one page failing does not sink the batch.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { captureBody, captureTarget, CAPTURE_VIEWPORTS, runCapture } from '../src/capture.js'
// The real signing half, so a REAL signed call gets past the middleware — never a header fixture.
import { signHostCall } from '../../tracy-web/src/host/client.js'

const config = { hostName: 'demo', hostSecret: 'host-secret', sitesRoot: process.cwd() }

/** Sign and fire one POST at the app, the way tracy-web's `hostCall` does. */
async function post(app, path, body, secret = 'host-secret') {
  const raw = JSON.stringify(body)
  const headers = await signHostCall({ secret, path, body: raw })
  return app.fetch(new Request(`http://tracy-host.test${path}`, { method: 'POST', headers, body: raw }))
}

test('captureTarget reaches an EmDash demo on :4321 and a PHP demo on Apache’s :80', () => {
  assert.equal(captureTarget('acme', 'emdash'), 'http://acme-web-1:4321/')
  assert.equal(captureTarget('acme', 'joomla'), 'http://acme-web-1/')
  assert.equal(captureTarget('acme', 'wordpress'), 'http://acme-web-1/')
})

test('captureTarget falls back to the bounded alias for a long label, never <label>-web-1 (#165)', () => {
  // The container-name fallback is last resort (a demo with no port and no public host), but it is
  // still a DNS dial: an over-long `<label>-web-1` fails ENOTFOUND, so it must use the same
  // `tracy-web-<hash>` alias render-compose.sh puts on the network.
  const long = 'synthetic-imported-site-dns-length-regression-165-0a1b2c3def' // synthetic 60 chars → 66-octet name
  assert.equal(captureTarget(long, 'wordpress'), 'http://tracy-web-df7e98761c149c8be701bc8688f7db77/')
  assert.equal(captureTarget(long, 'emdash'), 'http://tracy-web-df7e98761c149c8be701bc8688f7db77:4321/')
  // The port and public-host branches are unaffected — they never dialled by container name.
  assert.equal(captureTarget(long, 'wordpress', 52019), 'http://127.0.0.1:52019/')
})

test('the two viewports are the card’s, desktop first', () => {
  assert.deepEqual(
    CAPTURE_VIEWPORTS.map((v) => [v.width, v.height]),
    [
      [1440, 900],
      [390, 844]
    ]
  )
})

test('captureBody refuses a label that could name a path, and a layout path that is not one', () => {
  assert.match(captureBody({ label: '../etc', platform: 'joomla', layouts: [] }).error, /label/)
  assert.match(
    captureBody({ label: 'acme', platform: 'joomla', layouts: [{ key: 'home', path: 'about' }] }).error,
    /path/
  )
  assert.match(
    captureBody({ label: 'acme', platform: 'joomla', layouts: [{ key: 'Home', path: '/' }] }).error,
    /key/
  )
  assert.equal(
    captureBody({ label: 'acme', platform: 'joomla', layouts: [{ key: 'home', path: '/' }] }).error,
    null
  )
})

test('a signed capture shoots every layout at both viewports and returns them keyed by key and width', async () => {
  const seen = []
  const shoot = async ({ url, width, height }) => {
    seen.push({ url, width, height })
    return Buffer.from(`png:${url}:${width}`)
  }
  const app = buildApp({ config, run: async () => ({ code: 0, tail: [] }), shoot })
  const res = await post(app, '/_host/capture', {
    label: 'acme',
    platform: 'emdash',
    layouts: [
      { key: 'home', path: '/' },
      { key: 'services', path: '/services' }
    ]
  })
  assert.equal(res.status, 200)
  const body = await res.json()

  // The internal target, composed here and nowhere else: EmDash on :4321, the path joined onto it.
  assert.deepEqual(
    seen.map((s) => s.url),
    [
      'http://acme-web-1:4321/',
      'http://acme-web-1:4321/',
      'http://acme-web-1:4321/services',
      'http://acme-web-1:4321/services'
    ]
  )
  // Two layouts × two viewports, desktop first, each a base64 PNG the caller can name.
  assert.equal(body.shots.length, 4)
  assert.deepEqual(
    body.shots.map((s) => [s.key, s.width, s.ok]),
    [
      ['home', 1440, true],
      ['home', 390, true],
      ['services', 1440, true],
      ['services', 390, true]
    ]
  )
  assert.equal(Buffer.from(body.shots[0].png, 'base64').toString(), 'png:http://acme-web-1:4321/:1440')
})

test('one page that will not load is reported, and the rest of the batch is still taken', async () => {
  const shoot = async ({ url }) => {
    if (url.endsWith('/broken')) throw new Error('navigation timed out')
    return Buffer.from('ok')
  }
  const app = buildApp({ config, run: async () => ({ code: 0, tail: [] }), shoot })
  const res = await post(app, '/_host/capture', {
    label: 'acme',
    platform: 'joomla',
    layouts: [
      { key: 'home', path: '/' },
      { key: 'broken', path: '/broken' }
    ]
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  const broken = body.shots.filter((s) => s.key === 'broken')
  const home = body.shots.filter((s) => s.key === 'home')
  assert.equal(home.length, 2)
  assert.ok(home.every((s) => s.ok === true))
  assert.equal(broken.length, 2)
  assert.ok(broken.every((s) => s.ok === false && s.png === undefined))
  assert.match(broken[0].error, /timed out/)
})

test('a shot that outruns its time box is a per-shot failure, not a hung request', async () => {
  const shoot = () => new Promise(() => {}) // never resolves
  const app = buildApp({
    config,
    run: async () => ({ code: 0, tail: [] }),
    shoot,
    captureTimeoutMs: 20
  })
  const res = await post(app, '/_host/capture', {
    label: 'acme',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }]
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.shots.every((s) => s.ok === false))
  assert.match(body.shots[0].error, /time/i)
})

test('a capture on a host with no browser configured is refused, not a 500', async () => {
  const app = buildApp({ config, run: async () => ({ code: 0, tail: [] }) }) // no shoot
  const res = await post(app, '/_host/capture', {
    label: 'acme',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }]
  })
  assert.equal(res.status, 503)
  assert.equal((await res.json()).code, 'NO_BROWSER')
})

test('a bad label is refused 400 before any shoot runs', async () => {
  let shot = false
  const app = buildApp({
    config,
    run: async () => ({ code: 0, tail: [] }),
    shoot: async () => {
      shot = true
      return Buffer.from('x')
    }
  })
  const res = await post(app, '/_host/capture', {
    label: '../../etc/passwd',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }]
  })
  assert.equal(res.status, 400)
  assert.equal(shot, false)
})

test('an unsigned capture never reaches the handler', async () => {
  const app = buildApp({
    config,
    run: async () => ({ code: 0, tail: [] }),
    shoot: async () => Buffer.from('x')
  })
  const res = await app.fetch(
    new Request('http://tracy-host.test/_host/capture', { method: 'POST', body: '{}' })
  )
  assert.equal(res.status, 403)
})

test('a published loopback port is used, because the container name does not always resolve', () => {
  // ⚠ THE BUG THIS EXISTS FOR. `tracy-tracy-host-1` runs with `network_mode: host` on the dev
  // machine (measured 17/09), so it resolves through the machine's DNS and `<label>-web-1` — an
  // alias inside a Docker network it is not on — does not resolve. Every capture answered
  // ERR_NAME_NOT_RESOLVED while the demo itself served HTTP 200.
  assert.equal(captureTarget('ja-voyara-joomla', 'joomla', 52011), 'http://127.0.0.1:52011/')
  assert.equal(captureTarget('base-emdash', 'emdash', 52008), 'http://127.0.0.1:52008/')
  // Without one, the container name — right where this process IS on that network.
  assert.equal(captureTarget('ja-voyara-joomla', 'joomla'), 'http://ja-voyara-joomla-web-1/')
  assert.equal(captureTarget('base-emdash', 'emdash'), 'http://base-emdash-web-1:4321/')
})

test('a port that is not a usable port falls back rather than composing a broken address', () => {
  for (const bad of [0, -1, 70000, 1.5, '52011', null, undefined, {}])
    assert.equal(captureTarget('demo', 'joomla', bad), 'http://demo-web-1/', `refused ${String(bad)}`)
})

test('the body reads a port, and an unusable one is dropped rather than carried', () => {
  const base = { label: 'demo', platform: 'joomla', layouts: [{ key: 'home', path: '/' }] }
  assert.equal(captureBody({ ...base, port: 52011 }).port, 52011)
  assert.equal(captureBody({ ...base, port: '52011' }).port, null)
  assert.equal(captureBody(base).port, null)
})

test('the demo’s own public address comes first, because that is what it is configured for', () => {
  // ⚠ MEASURED 17/09 ON apple-joomla: `force_ssl = 2` and `live_site =
  // https://apple-joomla.tracy.site/`. Joomla answers http://127.0.0.1:52019/ with a 301 to
  // https://127.0.0.1:52019/, where nothing speaks TLS, and the shot dies as
  // ERR_SSL_PROTOCOL_ERROR on a URL that plainly says http. ja-voyara (force_ssl = 0) had no such
  // redirect, which is why one worked and the other did not.
  assert.equal(
    captureTarget('apple-joomla', 'joomla', 52019, 'apple-joomla.tracy.site'),
    'https://apple-joomla.tracy.site/'
  )
  // No public address — every demo on a developer's machine — falls to the port.
  assert.equal(captureTarget('apple-joomla', 'joomla', 52019, null), 'http://127.0.0.1:52019/')
  // Neither: the container name, for a deployment that really is on that network.
  assert.equal(captureTarget('apple-joomla', 'joomla'), 'http://apple-joomla-web-1/')
})

test('a host that is not a hostname cannot become an origin', () => {
  for (const bad of [
    'evil.test/../x',
    'evil.test:8080',
    'user@evil.test',
    'http://evil.test',
    'localhost',
    '-lead.test',
    '',
    null,
    42
  ])
    assert.equal(
      captureTarget('demo', 'joomla', 52019, bad),
      'http://127.0.0.1:52019/',
      `refused ${JSON.stringify(bad)}`
    )
})

test('a layout is photographed at the address it ANSWERS at, not at the path that names it', async () => {
  // 🔒 THE BUG THIS PINS. Every Joomla demo Tracy provisions runs SEF with rewriting off
  // (`sef = true`, `sef_rewrite = false`), so its menu links are `/index.php/our-services` and the
  // pretty `/our-services` is Apache's 404 — measured 17/09 on ja_vital locally and on dev's
  // ja-kidscorner. A 404 screenshots exactly as well as a site does, so three of four layouts came
  // back as clean pictures of "Not Found" and nothing anywhere said so.
  const asked = []
  const shots = await runCapture({
    label: 'ja-vital-joomla',
    platform: 'joomla',
    layouts: [
      { key: 'home', path: '/' },
      { key: 'our-services', path: '/our-services', address: '/index.php/our-services' }
    ],
    shoot: async ({ url }) => {
      asked.push(url)
      return new Uint8Array([1])
    },
    timeoutMs: 1000
  })
  assert.equal(
    shots.shots.every((s) => s.ok),
    true
  )
  // Both viewports of each layout, so each address appears twice.
  assert.deepEqual(
    [...new Set(asked)],
    ['http://ja-vital-joomla-web-1/', 'http://ja-vital-joomla-web-1/index.php/our-services']
  )
})

test('captureBody carries an address only when it is one, and never lets a bad one refuse a capture', () => {
  const layouts = (address) => [{ key: 'home', path: '/', ...(address === undefined ? {} : { address }) }]
  const read = (address) => captureBody({ label: 'acme', platform: 'joomla', layouts: layouts(address) })

  assert.deepEqual(read('/index.php/').layouts, [{ key: 'home', path: '/', address: '/index.php/' }])
  // A site whose paths are its addresses says nothing extra, and the layout is exactly what it was.
  assert.deepEqual(read().layouts, [{ key: 'home', path: '/' }])
  // ⚠ DROPPED, NOT REFUSED. An address that is not a path is a fact this hop cannot use; falling
  // back to `path` is what every caller did before the field existed, and refusing here would turn
  // one unusable field into a capture that does not happen at all.
  for (const bad of ['https://elsewhere.test/', 'our-services', '', 42, null, {}])
    assert.deepEqual(read(bad).layouts, [{ key: 'home', path: '/' }], JSON.stringify(bad))
  assert.equal(read('https://elsewhere.test/').error, null)
})

test('makeShoot: two device pixels per CSS pixel, fonts and first-screen images awaited, the page walked, a bounded full page', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const seen = { context: null, goto: null, evaluated: [], screenshot: null, closed: false }
  const page = {
    goto: async (url, opts) => {
      seen.goto = { url, opts }
    },
    evaluate: async (fn, arg) => {
      const src = String(fn)
      seen.evaluated.push(
        src.includes('fonts')
          ? `fonts+images<${arg.h}`
          : src.includes('scrollTo')
            ? `scroll by ${arg.step}`
            : 'height'
      )
      return src.includes('scrollTo') ? undefined : src.includes('scrollHeight') ? 9000 : undefined
    },
    waitForTimeout: async (ms) => {
      seen.evaluated.push(`wait ${ms}`)
    },
    screenshot: async (opts) => {
      seen.evaluated.push('shot')
      seen.screenshot = opts
      return Buffer.from('png')
    }
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async (opts) => {
          seen.context = opts
          return {
            newPage: async () => page,
            close: async () => {
              seen.closed = true
            }
          }
        }
      })
    }
  }
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  // A phone width: at 2× its four screens (780 × 7200 px) stay under the pixel cap.
  const bytes = await shoot({ url: 'http://acme-web-1/', width: 390, height: 844 })
  assert.equal(bytes.toString(), 'png')
  assert.deepEqual(seen.context, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    // A template that honours reduced motion shows its scroll-revealed sections at once (JA Voyara).
    reducedMotion: 'reduce'
  })
  // Parsed is the condition; load and network-idle are only graces (a demo with a polling slider
  // never idles, one with a hanging third-party script never loads).
  assert.equal(seen.goto.opts.waitUntil, 'domcontentloaded')
  // The page is walked a screen at a time and given its entrance animations BEFORE it is measured
  // and shot: a full-page shot does not scroll, so AOS sections (JA Vega) would come out blank.
  assert.deepEqual(seen.evaluated, ['fonts+images<844', 'scroll by 844', 'wait 2000', 'height', 'shot'])
  // The whole page, but no more than four screens of it: a 9000-px page is shot as 3600.
  assert.deepEqual(seen.screenshot, {
    type: 'png',
    fullPage: true,
    clip: { x: 0, y: 0, width: 390, height: 3600 }
  })
  assert.equal(seen.closed, true, 'the context is closed even though nothing failed')
})

test('makeShoot: a page shorter than the viewport is shot at the viewport, never clipped smaller', async () => {
  const { makeShoot } = await import('../src/browser.js')
  let clip
  const page = {
    goto: async () => {},
    evaluate: async (fn) => (String(fn).includes('scrollHeight') ? 500 : undefined),
    waitForTimeout: async () => {},
    screenshot: async (opts) => {
      clip = opts.clip
      return Buffer.from('png')
    }
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({ newPage: async () => page, close: async () => {} })
      })
    }
  }
  const shoot = await makeShoot({ playwright })
  await shoot({ url: 'http://acme-web-1/', width: 390, height: 844 })
  assert.deepEqual(clip, { x: 0, y: 0, width: 390, height: 844 })
})

test('makeShoot: the page is walked down a screen at a time, capped, and left at the top', async () => {
  const { makeShoot } = await import('../src/browser.js')
  /** Run the in-page walk against a fake window of `scrollHeight` px; return every scrollTo as `top behavior`. */
  const walk = async (scrollHeight) => {
    const ys = []
    const page = {
      goto: async () => {},
      evaluate: async (fn, arg) => {
        if (!String(fn).includes('scrollTo')) return String(fn).includes('scrollHeight') ? 900 : undefined
        const saved = { window: globalThis.window, document: globalThis.document }
        globalThis.window = { scrollTo: ({ top, behavior }) => ys.push(`${top} ${behavior}`) }
        globalThis.document = { documentElement: { scrollHeight } }
        try {
          // No real pauses in a unit test; the walk's own logic is what is under test.
          await fn({ ...arg, pause: 0 })
        } finally {
          Object.assign(globalThis, saved)
        }
      },
      waitForTimeout: async () => {},
      screenshot: async () => Buffer.from('png')
    }
    const playwright = {
      chromium: {
        launch: async () => ({
          isConnected: () => true,
          newContext: async () => ({ newPage: async () => page, close: async () => {} })
        })
      }
    }
    await (await makeShoot({ playwright }))({ url: 'http://acme-web-1/', width: 1440, height: 900 })
    return ys
  }
  // A 3000-px page: three screens down (900, 1800, 2700), then home — every step instant, since a
  // smooth-scrolling page (JA Vega) would otherwise only start gliding before the next step.
  assert.deepEqual(await walk(3000), ['900 instant', '1800 instant', '2700 instant', '0 instant'])
  // A page no taller than the viewport has nothing to reveal below; it is only put back at the top.
  assert.deepEqual(await walk(900), ['0 instant'])
  // An endless page stops after 30 screens instead of holding the shot forever.
  const endless = await walk(10_000_000)
  assert.equal(endless.length, 31)
  assert.equal(endless.at(-1), '0 instant')
})

test('makeShoot: a page that never goes quiet on the network is still shot, not failed', async () => {
  const { makeShoot } = await import('../src/browser.js')
  let shot = false
  const page = {
    goto: async () => {},
    waitForLoadState: async () => {
      throw new Error('Timeout 8000ms exceeded while waiting for networkidle')
    },
    evaluate: async (fn) => (String(fn).includes('scrollHeight') ? 900 : undefined),
    waitForTimeout: async () => {},
    screenshot: async () => {
      shot = true
      return Buffer.from('png')
    }
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({ newPage: async () => page, close: async () => {} })
      })
    }
  }
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  assert.equal((await shoot({ url: 'http://acme-web-1/', width: 1440, height: 900 })).toString(), 'png')
  assert.equal(shot, true)
})

/**
 * A fake browser whose screenshot size depends on the pixel density of the PICTURE — the context's
 * device scale factor, or one pixel per CSS pixel when the screenshot asks for `scale: 'css'` — so
 * a test can say "this page is too heavy at 2× and fits at 1×" without a real Chromium. Every load
 * (`goto`) and every screenshot is recorded, because a reload is what the time box pays for.
 *
 * @param {(scale: number, clipHeight: number) => number} sizeFor how many bytes a shot weighs
 */
function shrinkingBrowser(sizeFor) {
  const contexts = []
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async (opts) => {
          const seen = { opts, screenshot: null, screenshots: [], gotos: 0, walked: false }
          contexts.push(seen)
          return {
            newPage: async () => ({
              goto: async () => {
                seen.gotos++
              },
              evaluate: async (fn) => {
                if (String(fn).includes('scrollTo')) seen.walked = true
                else if (String(fn).includes('scrollHeight')) return 9000
              },
              waitForTimeout: async () => {},
              screenshot: async (shotOpts) => {
                seen.screenshot = shotOpts
                seen.screenshots.push(shotOpts)
                const scale = shotOpts.scale === 'css' ? 1 : opts.deviceScaleFactor
                return Buffer.alloc(sizeFor(scale, shotOpts.clip.height))
              }
            }),
            close: async () => {}
          }
        }
      })
    }
  }
  return { playwright, contexts }
}

test('captureBody: a picture ceiling is carried when usable, and absent when it is not', () => {
  const asked = { label: 'acme', platform: 'joomla', layouts: [{ key: 'home', path: '/' }] }
  assert.equal(captureBody({ ...asked, maxBytes: 8 * 1024 * 1024 }).maxBytes, 8 * 1024 * 1024)
  // Anything that is not a positive whole number falls back to no ceiling, which is exactly the
  // behaviour every caller had before the ceiling existed.
  for (const bad of [0, -1, 1.5, '8388608', null, undefined, Number.NaN])
    assert.equal(captureBody({ ...asked, maxBytes: bad }).maxBytes, null, `refused ${String(bad)}`)
})

test('makeShoot: a shot past the caller ceiling is retaken at one CSS pixel from the SAME loaded page', async () => {
  const { makeShoot } = await import('../src/browser.js')
  // 2× weighs four times 1×, the way pixel count does: 40 bytes then 10.
  const { playwright, contexts } = shrinkingBrowser((scale) => (scale === 2 ? 40 : 10))
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  const bytes = await shoot({ url: 'http://acme-web-1/', width: 390, height: 844, maxBytes: 20 })
  assert.equal(bytes.length, 10, 'the picture that fits is the one returned')
  // 🔒 ONE LOAD, HOWEVER MANY STEPS (12/10/2026, ja-vogue /category-2). Each retake used to open a
  // fresh context and load the page again, so a heavy page paid two full loads, walks and settles
  // inside ONE 30 s time box: measured 25 s on a Mac mini, and "shot timed out after 30000ms" four
  // times in a row on fleet01. The lighter picture is the same page re-screenshotted at 1 px per
  // CSS pixel.
  assert.equal(contexts.length, 1, 'the page is opened once')
  assert.equal(contexts[0].gotos, 1, 'and loaded once')
  assert.equal(contexts[0].opts.deviceScaleFactor, 2)
  assert.deepEqual(
    contexts[0].screenshots.map((s) => s.scale ?? 'device'),
    ['device', 'css'],
    'the retake asks for one pixel per CSS pixel'
  )
  // The retake frames what the first shot framed: same width, same four screens.
  assert.deepEqual(contexts[0].screenshot.clip, { x: 0, y: 0, width: 390, height: 3600 })
  assert.equal(contexts[0].walked, true)
  assert.equal(contexts[0].opts.reducedMotion, 'reduce')
})

test('makeShoot: a shot that already fits the ceiling is taken once', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const { playwright, contexts } = shrinkingBrowser(() => 10)
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  const bytes = await shoot({
    url: 'http://acme-web-1/',
    width: 1440,
    height: 900,
    maxBytes: 8 * 1024 * 1024
  })
  assert.equal(bytes.length, 10)
  assert.equal(contexts.length, 1, 'no page is loaded twice for nothing')
})

test('makeShoot: with no ceiling asked for, one shot is taken at 2× as before', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const { playwright, contexts } = shrinkingBrowser((scale) => (scale === 2 ? 40 : 10))
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  const bytes = await shoot({ url: 'http://acme-web-1/', width: 390, height: 844 })
  assert.equal(bytes.length, 40, 'an unasked ceiling never silently shrinks a picture')
  assert.equal(contexts.length, 1)
})

test('makeShoot: a page too heavy even at 1× is shot shorter rather than given up on', async () => {
  const { makeShoot } = await import('../src/browser.js')
  // Heavy at every density: only clipping less page brings it under. 3600 → 40, 1800 → 20, 900 → 10.
  const { playwright, contexts } = shrinkingBrowser((_scale, clipHeight) => clipHeight / 90)
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  const bytes = await shoot({ url: 'http://acme-web-1/', width: 1440, height: 900, maxBytes: 15 })
  assert.ok(bytes.length <= 15, `a picture under the ceiling came back, got ${bytes.length}`)
  assert.ok(
    contexts.at(-1).screenshot.clip.height < 3600,
    'the last attempt keeps less of the page than the first'
  )
  assert.equal(contexts.length, 1, 'every step of the ladder is a screenshot of one loaded page')
  assert.equal(contexts[0].gotos, 1)
})

test('runCapture: the ceiling the caller named reaches every shot', async () => {
  const asked = []
  await runCapture({
    label: 'acme',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }],
    maxBytes: 8 * 1024 * 1024,
    shoot: async (args) => {
      asked.push(args)
      return new Uint8Array([1])
    },
    timeoutMs: 1000
  })
  assert.equal(asked.length, 2, 'both viewports')
  for (const args of asked) assert.equal(args.maxBytes, 8 * 1024 * 1024)
})

/**
 * A fake page whose `load` never fires (11/10/2026: ja-restaurant on fleet01, a third-party
 * reservation widget held `load` past 25 s, so every outline and Create listing failed while the
 * page itself was readable). Navigation answers at DOMContentLoaded; anything waiting for `load`
 * times out the way Playwright does.
 */
function pageWithoutLoad(seen, read) {
  return {
    goto: async (url, opts) => {
      seen.gotos.push(opts.waitUntil)
      if (opts.waitUntil !== 'domcontentloaded' && opts.waitUntil !== 'commit')
        throw new Error(`page.goto: Timeout ${opts.timeout}ms exceeded.`)
    },
    waitForLoadState: async (state, opts) => {
      seen.waits.push([state, opts?.timeout])
      throw new Error(`Timeout ${opts?.timeout}ms exceeded while waiting for ${state}`)
    },
    waitForTimeout: async () => {},
    evaluate: async (fn) => {
      const src = String(fn)
      if (src.includes('backgroundColor')) return 'rgb(255, 255, 255)'
      if (src.includes('scrollHeight') && !src.includes('scrollTo')) return 900
      if (src.includes('maxLinks')) return read
      return undefined
    },
    screenshot: async () => Buffer.from('png')
  }
}
const fakePlaywright = (page) => ({
  chromium: {
    launch: async () => ({
      isConnected: () => true,
      newContext: async () => ({ newPage: async () => page, close: async () => {} })
    })
  }
})

test('makeOutline: a page whose load never fires is still outlined from its DOM, with bounded waits', async () => {
  const { makeOutline } = await import('../src/browser.js')
  const seen = { gotos: [], waits: [] }
  const read = { title: 'JA Restaurant', description: '', links: [{ label: 'Home', path: '/' }], text: 'x' }
  const outline = await makeOutline({
    playwright: fakePlaywright(pageWithoutLoad(seen, read)),
    log: { warn: () => {} }
  })
  const answer = await outline({ url: 'https://ja-restaurant-joomla.tracy.site/' })
  assert.equal(answer.title, 'JA Restaurant')
  assert.deepEqual(answer.links, read.links)
  assert.ok(
    seen.gotos.every((w) => w === 'domcontentloaded'),
    JSON.stringify(seen.gotos)
  )
  // Every wait after navigation is bounded and short: the whole outline stays well inside the
  // caller's deadline even when nothing ever settles.
  assert.ok(seen.waits.length > 0)
  for (const [, timeout] of seen.waits) assert.ok(timeout > 0 && timeout <= 10000, String(timeout))
})

test('makeShoot: a page whose load never fires is shot with what has painted, not failed', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const seen = { gotos: [], waits: [] }
  const shoot = await makeShoot({
    playwright: fakePlaywright(pageWithoutLoad(seen, null)),
    log: { warn: () => {} }
  })
  assert.equal((await shoot({ url: 'http://acme-web-1/', width: 1440, height: 900 })).toString(), 'png')
  assert.ok(seen.gotos.every((w) => w === 'domcontentloaded'))
  assert.ok(
    seen.waits.some(([state]) => state === 'load'),
    'a shot still gives load its bounded chance'
  )
})

// ── A shot keeps its own deadline (12/10/2026, fleet01) ───────────────────────────────────────
//
// After the one-load fix, ja-vogue /category-2 still timed out at BOTH widths on fleet01 (2 cores,
// busy with demo installs), where a read-only outline of the same demo took 56 s. Three things
// were wrong there and none of them showed: a timed-out shot kept loading and screenshotting in the
// background while the next width ran, its error never said where the time went, and the waits
// (load, network, fonts, settle) were fixed numbers that could add up past the shot's own box.

test('runCapture: a timed-out shot is cancelled, and its error names the phase it was in', async () => {
  let aborted = false
  const result = await runCapture({
    label: 'acme',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }],
    shoot: ({ signal, progress }) =>
      new Promise((_, reject) => {
        progress.phase = 'opening the page'
        signal.addEventListener('abort', () => {
          aborted = true
          reject(new Error('context closed'))
        })
      }),
    timeoutMs: 50
  })
  assert.equal(aborted, true, 'the shot that ran out of time was told to stop')
  assert.equal(result.shots.length, 2)
  for (const shot of result.shots) {
    assert.equal(shot.ok, false)
    assert.match(shot.error, /^shot timed out after 50ms while opening the page/)
    assert.equal(typeof shot.ms, 'number')
  }
})

test('runCapture: a shot that worked says how long each phase took', async () => {
  const result = await runCapture({
    label: 'acme',
    platform: 'joomla',
    layouts: [{ key: 'home', path: '/' }],
    shoot: async ({ progress }) => {
      progress.timings.goto = 1200
      return new Uint8Array([1])
    },
    timeoutMs: 1000
  })
  assert.equal(result.shots[0].ok, true)
  assert.deepEqual(result.shots[0].timings, { goto: 1200 })
  assert.equal(typeof result.shots[0].ms, 'number')
})

test('makeShoot: every wait fits what is left of the deadline, and a slow page is still shot', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const asked = []
  const page = {
    goto: async (_url, opts) => {
      asked.push(['goto', opts.timeout])
    },
    waitForLoadState: async (state, opts) => {
      asked.push([state, opts.timeout])
    },
    evaluate: async (fn, arg) => {
      const src = String(fn)
      if (src.includes('fonts')) asked.push(['fonts', arg.wait])
      if (src.includes('scrollTo')) asked.push(['walk', arg.budget])
      return src.includes('scrollHeight') && !src.includes('scrollTo') ? 900 : undefined
    },
    waitForTimeout: async (ms) => {
      asked.push(['settle', ms])
    },
    screenshot: async () => Buffer.from('png')
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({ newPage: async () => page, close: async () => {}, route: undefined })
      })
    }
  }
  const shoot = await makeShoot({ playwright })
  const progress = { phase: '', timings: {} }
  // 10 s for the whole shot: after the reserve kept for the pictures, every wait gets at most 2 s.
  const bytes = await shoot({
    url: 'http://acme-web-1/',
    width: 1440,
    height: 900,
    deadlineMs: 10000,
    progress
  })
  assert.equal(bytes.toString(), 'png')
  for (const [what, ms] of asked)
    if (what !== 'goto') assert.ok(ms <= 2000 && ms > 0, `${what} asked for ${String(ms)} ms`)
  assert.ok(asked.find(([w]) => w === 'goto')[1] <= 10000)
  assert.ok('goto' in progress.timings, 'the load is timed')
  assert.ok('pictures' in progress.timings, 'the pictures are timed')
})

test('makeShoot: no time left after the load means no waits at all, and still a picture', async () => {
  const { makeShoot } = await import('../src/browser.js')
  const waits = []
  const page = {
    goto: async () => {},
    waitForLoadState: async (state) => {
      waits.push(state)
    },
    evaluate: async (fn) => {
      const src = String(fn)
      if (src.includes('fonts') || src.includes('scrollTo')) waits.push('page wait')
      return src.includes('scrollHeight') ? 900 : undefined
    },
    waitForTimeout: async () => {
      waits.push('settle')
    },
    screenshot: async () => Buffer.from('png')
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({ newPage: async () => page, close: async () => {} })
      })
    }
  }
  const shoot = await makeShoot({ playwright })
  // A deadline inside the picture reserve: Playwright reads a timeout of 0 as "wait for ever",
  // so a spent budget must skip the wait, never pass 0.
  const bytes = await shoot({ url: 'http://acme-web-1/', width: 1440, height: 900, deadlineMs: 3000 })
  assert.equal(bytes.toString(), 'png')
  assert.deepEqual(waits, [])
})

test('makeShoot: an abort closes the shot’s context, so it stops using the machine', async () => {
  const { makeShoot } = await import('../src/browser.js')
  let closed = false
  let release
  const page = {
    goto: () =>
      new Promise((_, reject) => {
        release = reject
      }),
    evaluate: async () => undefined,
    waitForTimeout: async () => {},
    screenshot: async () => Buffer.from('png')
  }
  const playwright = {
    chromium: {
      launch: async () => ({
        isConnected: () => true,
        newContext: async () => ({
          newPage: async () => page,
          close: async () => {
            closed = true
            release?.(new Error('Target page, context or browser has been closed'))
          }
        })
      })
    }
  }
  const shoot = await makeShoot({ playwright })
  const ac = new AbortController()
  const shot = shoot({ url: 'http://acme-web-1/', width: 1440, height: 900, signal: ac.signal })
  await new Promise((r) => setTimeout(r, 10))
  ac.abort()
  await assert.rejects(shot)
  assert.equal(closed, true)
})

test('makeShoot: a step whose picture would pass the pixel cap is skipped, so a tall desktop page is drawn at 1×', async () => {
  // fleet01, 13/10/2026: ja-vogue /category-2 at 1440 × 2 × 3600 (2880 × 7200 px, 20.7 MP) ended in
  // "page.screenshot: Target crashed"; the same page at 390 (780 × 7200, 5.6 MP) was stored.
  const { makeShoot } = await import('../src/browser.js')
  const { playwright, contexts } = shrinkingBrowser(() => 10)
  const shoot = await makeShoot({ playwright, log: { warn: () => {} } })
  await shoot({ url: 'http://acme-web-1/', width: 1440, height: 900, maxBytes: 8 * 1024 * 1024 })
  assert.deepEqual(
    contexts[0].screenshots.map((s) => [s.scale ?? 'device', s.clip.height]),
    [['css', 3600]],
    'the 2× step (20.7 MP) is never asked for; the 1× full page is'
  )
  // A phone width stays at 2×: 780 × 7200 is under the cap.
  const phone = shrinkingBrowser(() => 10)
  await (await makeShoot({ playwright: phone.playwright, log: { warn: () => {} } }))({
    url: 'http://acme-web-1/',
    width: 390,
    height: 844,
    maxBytes: 8 * 1024 * 1024
  })
  assert.deepEqual(
    phone.contexts[0].screenshots.map((s) => s.scale ?? 'device'),
    ['device']
  )
})

// 23/10/2026: on the macOS stand the loopback port refuses; the route probes like `/demo-qa` and hands the
// answering address on, and every shot is taken there.
test('a capture given the address that answered shoots there, not at the first rule', async () => {
  const urls = []
  const out = await runCapture({
    label: 'acme',
    platform: 'wordpress',
    port: 51001,
    layouts: [{ key: 'home', path: '/about/' }],
    shoot: async ({ url }) => {
      urls.push(url)
      return Buffer.from('ok')
    },
    timeoutMs: 1000,
    base: 'http://acme-web-1:80/'
  })
  assert.ok(out.shots.every((s) => s.ok === true))
  assert.deepEqual([...new Set(urls)], ['http://acme-web-1/about/'])
})

test('captureBody: the site’s own address is taken on the host named, and left out otherwise', async () => {
  const { captureBody } = await import('../src/capture.js')
  const body = (publicOrigin) => ({
    label: 'levain-bakery',
    platform: 'wordpress',
    layouts: [{ key: 'home', path: '/' }],
    host: 'levain-bakery.tracy.test',
    ...(publicOrigin === undefined ? {} : { publicOrigin })
  })
  assert.equal(
    captureBody(body('http://levain-bakery.tracy.test:51710/')).publicOrigin,
    'http://levain-bakery.tracy.test:51710'
  )
  for (const other of [
    'https://evil.test/',
    'http://levain-bakery.tracy.test:51710/x',
    'javascript:alert(1)',
    'nope'
  ])
    assert.equal(captureBody(body(other)).publicOrigin, null, other)
  assert.equal(captureBody(body(undefined)).error, null)
})
