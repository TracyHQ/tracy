/**
 * `?template=<JoomlArt id>` on the root or the creation workspace — the door joomlart.com's
 * Download button and the JoomlArt sign-in door come through (`tasks/todo-tai-joomlart-qua-tracy.md`
 * B5). The resolver answers from `quickstart_releases` under Design inspiration's own rule, and a
 * signed-in person lands on one page with the two ways out: build here, or take the file.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { templateLandingPage, templateLookupFailedPage, templateNotOnTracyPage } from '../src/bar/pages.js'
import { readReleases } from '../src/lib/quickstart-releases.js'
import { mintSession } from '../src/lib/session.js'
import { workspaceRoutes } from '../src/workspace/route.js'
import { intentForTemplate, landingOf, offeredRelease } from '../src/workspace/template-intent.js'

/** One `quickstart_releases` row as `readReleases` reads it. */
const releaseRow = (template, extra = {}) => ({
  tag: `quickstart/${template}/j6`,
  release: {
    name: `quickstart/${template}/j6`,
    kind: 'quickstart',
    github: 'published',
    publishedAt: '2026-09-14T00:00:00Z',
    assets: [{ name: `${template}-j6-quickstart-1.0.0.zip`, size: 1 }]
  },
  setting: { platform: 'joomla', version: '1.0.0', template, label: template },
  inspiration: { template, blurb: 'Ship fast.', image: `${template}-home-1440.png` },
  inspiration_hidden: false,
  tracy: 'ready',
  reason: null,
  fetched_at: null,
  ...extra
})

/** `readReleases` over these rows, without a database. */
const poolOf = (rows, { shots = [] } = {}) => ({
  query: async (sql) => {
    if (/quickstart_releases/.test(sql)) {
      if (rows === null) throw new Error('relation "quickstart_releases" does not exist')
      return { rows }
    }
    if (/template_shots/.test(sql)) return { rows: shots }
    return { rows: [] }
  }
})
const releasesOf = (rows) => readReleases(poolOf(rows))

test('a template Design inspiration shows becomes the creation workspace intent', async () => {
  const intent = intentForTemplate(await releasesOf([releaseRow('ja-kinetic')]), 'ja-kinetic')
  assert.deepEqual(intent, { inspiration: 'ja-kinetic', platform: 'joomla' })
})

test('a template nobody released, a draft, or a hidden card is not offered', async () => {
  const releases = await releasesOf([
    releaseRow('ja-draft', {
      release: { name: 'quickstart/ja-draft/j6', kind: 'quickstart', github: 'draft', assets: [] }
    }),
    releaseRow('ja-hidden', { inspiration_hidden: true })
  ])
  for (const id of ['ja-civica', 'ja-draft', 'ja-hidden', '', 'JA Kinetic']) {
    assert.equal(offeredRelease(releases, id), null, id)
    assert.equal(intentForTemplate(releases, id), null, id)
  }
})

test('the platform asked for wins, then Joomla, then the newest', async () => {
  const releases = await releasesOf([
    releaseRow('ja-kinetic'),
    releaseRow('ja-kinetic', {
      tag: 'quickstart/ja-kinetic/wp7',
      release: {
        name: 'quickstart/ja-kinetic/wp7',
        kind: 'quickstart',
        github: 'published',
        publishedAt: '2026-09-25T00:00:00Z',
        assets: []
      },
      setting: { platform: 'wordpress', version: '1.0.0', template: 'ja-kinetic', label: 'ja-kinetic' }
    })
  ])
  // Nothing said: Joomla first, even when the WordPress quickstart is newer.
  assert.deepEqual(intentForTemplate(releases, 'ja-kinetic'), {
    inspiration: 'ja-kinetic',
    platform: 'joomla'
  })
  assert.equal(
    landingOf(offeredRelease(releases, 'ja-kinetic')).downloadHref,
    '/api/quickstarts/ja-kinetic/j6/quickstart.zip'
  )
  // The page the person came from said WordPress.
  assert.deepEqual(intentForTemplate(releases, 'ja-kinetic', { platform: 'wordpress' }), {
    inspiration: 'ja-kinetic',
    platform: 'wordpress'
  })
  // The WordPress release ships no quickstart zip (webroot + database only): no Download.
  assert.equal(
    landingOf(offeredRelease(releases, 'ja-kinetic', { platform: 'wordpress' })).downloadHref,
    null
  )
  // A platform nobody released for is not offered.
  assert.equal(offeredRelease(releases, 'ja-kinetic', { platform: 'emdash' }), null)
})

test('the landing names the build intent, the download door and the card picture', async () => {
  const landing = landingOf(offeredRelease(await releasesOf([releaseRow('ja-kinetic')]), 'ja-kinetic'))
  assert.equal(landing.buildHref, '/new/?inspiration=ja-kinetic&platform=joomla')
  assert.equal(landing.downloadHref, '/api/quickstarts/ja-kinetic/j6/quickstart.zip')
  assert.equal(landing.picture, '/api/templates/ja-kinetic/shots/ja-kinetic-home-1440.png')
  assert.equal(landing.blurb, 'Ship fast.')
})

test('the landing names the app download page the web offers beside the file', async () => {
  const landing = landingOf(offeredRelease(await releasesOf([releaseRow('ja-kinetic')]), 'ja-kinetic'), {
    desktopDownloadUrl: 'https://tracy.site/download/'
  })
  assert.equal(landing.platform, 'joomla')
  assert.equal(landing.desktopHref, 'https://tracy.site/download/?from=template-ja-kinetic')
  assert.equal('memberHref' in landing, false, 'the web downloads itself: no member-area detour')
})

const config = {
  origin: 'https://cowork.tracy.test',
  sessionSecret: 'secret',
  secure: true,
  desktopDownloadUrl: 'https://tracy.ai/download/'
}

/** The workspace routes with only what the template door touches. */
const doorWith = (
  rows,
  shots = [{ template_id: 'ja-kinetic', file: 'ja-kinetic-home-1440.png', sha256: 'x' }]
) =>
  workspaceRoutes({
    config,
    sites: { hostOf: async () => null, dshOf: () => null },
    pool: poolOf(rows, { shots }),
    pages: {
      noSites: null,
      workspaceUnavailable: null,
      templateLanding: templateLandingPage,
      templateNotOnTracy: templateNotOnTracyPage,
      templateLookupFailed: templateLookupFailedPage
    }
  })

const signedIn = async () => `tracy_sess=${await mintSession('a@example.test', config.sessionSecret)}`

/** The app and a browser get the same page; only the web adds the Tracy Desktop offer (`lib/desktop-surface.js`). */
const APP_UA = 'Mozilla/5.0 (Macintosh) Electron/38.2.0 TracyCowork/0.5.1'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0.0.0 Safari/537.36'

const ask = (app, path, { accept = 'text/html', cookie = '', userAgent = BROWSER_UA } = {}) =>
  app.fetch(
    new Request(`https://cowork.tracy.test${path}`, {
      headers: { accept, 'user-agent': userAgent, ...(cookie ? { cookie } : {}) }
    })
  )

test('a signed-out person is sent to sign in and comes straight back to the same address', async () => {
  const app = doorWith([releaseRow('ja-kinetic')])
  for (const path of ['/new?template=ja-kinetic', '/new/?template=ja-kinetic', '/?template=ja-kinetic']) {
    const res = await ask(app, path)
    assert.equal(res.status, 302, path)
    assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(path)}`, path)
  }
})

test('in Tracy Desktop, a signed-in person lands on the page with Build and Download', async () => {
  const res = await ask(doorWith([releaseRow('ja-kinetic')]), '/new?template=ja-kinetic', {
    cookie: await signedIn(),
    userAgent: APP_UA
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const html = await res.text()
  assert.match(html, /href="\/new\/\?inspiration=ja-kinetic&amp;platform=joomla"/)
  assert.match(html, /href="\/api\/quickstarts\/ja-kinetic\/j6\/quickstart\.zip" download/)
  assert.match(html, /src="\/api\/templates\/ja-kinetic\/shots\/ja-kinetic-home-1440\.png"/)
  assert.match(html, /Ship fast\./)
  assert.doesNotMatch(html, /data-template-desktop/, 'the app does not offer itself')
})

test('on the web, a signed-in person gets the same Build and Download, then the Tracy Desktop offer', async () => {
  const res = await ask(doorWith([releaseRow('ja-kinetic')]), '/new?template=ja-kinetic', {
    cookie: await signedIn()
  })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /href="\/new\/\?inspiration=ja-kinetic&amp;platform=joomla" data-template-build/)
  const zip = html.search(/href="\/api\/quickstarts\/ja-kinetic\/j6\/quickstart\.zip" download/)
  assert.ok(zip > 0, 'the web downloads the zip as the app does')
  assert.match(html, /<h2>Also in Tracy Desktop<\/h2>/)
  assert.ok(html.indexOf('<h2>Also in Tracy Desktop</h2>') > zip, 'the offer comes after the download')
  assert.match(
    html,
    /Sign in there with the same Tracy account: <strong>a@example\.test<\/strong>, and this page opens with everything ready\./
  )
  assert.match(
    html,
    /<a class="button" href="https:\/\/tracy\.ai\/download\/\?from=template-ja-kinetic" data-template-desktop>Get Tracy Desktop<\/a>/
  )
  assert.doesNotMatch(html, /member\/downloads/)
  assert.doesNotMatch(html, /target="_blank"/)
})

test('on the web, a release with no quickstart zip still offers the app, after Build', async () => {
  const noZip = releaseRow('ja-kinetic', {
    release: { ...releaseRow('ja-kinetic').release, assets: [{ name: 'ja-kinetic-j6-webroot-1.0.0.tar.gz' }] }
  })
  const res = await ask(doorWith([noZip]), '/new?template=ja-kinetic', { cookie: await signedIn() })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /data-template-build/)
  assert.doesNotMatch(html, /quickstart\.zip/)
  assert.match(html, /data-template-desktop/)
})

const askWith = (app, path, headers) =>
  app.fetch(
    new Request(`https://cowork.tracy.test${path}`, {
      headers: { accept: 'text/html', ...headers }
    })
  )
const downloadOf = (html) => {
  const href = /href="([^"]*quickstart\.zip[^"]*)" download/.exec(html)?.[1].replaceAll('&amp;', '&')
  return href ? new URL(href, 'https://cowork.tracy.test') : null
}

test('the Download link carries the referring page: the landing ref first, else the Referer, else none', async () => {
  const app = doorWith([releaseRow('ja-kinetic')])
  const cookie = await signedIn()
  const page = 'https://www.joomlart.com/joomla/templates/ja-kinetic'
  const carried = await askWith(app, `/new?template=ja-kinetic&ref=${encodeURIComponent(page)}`, {
    cookie,
    referer: 'https://elsewhere.example/'
  })
  assert.equal(downloadOf(await carried.text()).searchParams.get('ref'), page)
  const header = await askWith(app, '/new?template=ja-kinetic', {
    cookie,
    referer: 'https://www.joomlart.com/'
  })
  assert.equal(downloadOf(await header.text()).searchParams.get('ref'), 'https://www.joomlart.com/')
  for (const headers of [{ cookie }, { cookie, referer: 'https://cowork.tracy.test/agent' }]) {
    const none = await askWith(app, '/new?template=ja-kinetic&ref=javascript%3Ax', headers)
    const link = downloadOf(await none.text())
    assert.equal(link.pathname, '/api/quickstarts/ja-kinetic/j6/quickstart.zip')
    assert.equal(link.searchParams.get('ref'), null)
  }
})

test('a signed-out person keeps the Referer through sign-in: it rides on next as ref', async () => {
  const res = await askWith(doorWith([releaseRow('ja-kinetic')]), '/new?template=ja-kinetic', {
    referer: 'https://www.joomlart.com/'
  })
  assert.equal(res.status, 302)
  const next = new URL(
    new URL(res.headers.get('location'), 'https://cowork.tracy.test').searchParams.get('next'),
    'https://cowork.tracy.test'
  )
  assert.equal(next.pathname, '/new')
  assert.equal(next.searchParams.get('ref'), 'https://www.joomlart.com/')
})

test('a stand whose shot store holds no picture draws none rather than a 404', async () => {
  const res = await ask(doorWith([releaseRow('ja-kinetic')], []), '/new?template=ja-kinetic', {
    cookie: await signedIn()
  })
  assert.equal(res.status, 200)
  assert.doesNotMatch(await res.text(), /\/api\/templates\/ja-kinetic\/shots\//)
})

test('a template Tracy does not offer gets the member-area page, signed in or not', async () => {
  const app = doorWith([releaseRow('ja-kinetic')])
  for (const cookie of ['', await signedIn()]) {
    const res = await ask(app, '/new?template=ja-civica', { cookie })
    assert.equal(res.status, 404)
    const html = await res.text()
    assert.match(html, /joomlart\.com\/member\/downloads\/joomlart\/joomla-templates\/ja-civica/)
  }
})

test('a template id is cut to what a product id can be before it is shown or linked', async () => {
  const res = await ask(doorWith([]), '/new?template=%3Cscript%3Ealert(1)%3C%2Fscript%3E')
  assert.equal(res.status, 404)
  const html = await res.text()
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /joomla-templates\/scriptalert1script"/)
})

test('a catalogue that cannot be read says try again, and never sends a person to the member area', async () => {
  const res = await ask(doorWith(null), '/new?template=ja-kinetic')
  assert.equal(res.status, 503)
  assert.equal(res.headers.get('retry-after'), '60')
  assert.doesNotMatch(await res.text(), /member\/downloads/)
})

test('the door answers HTML navigations only, and leaves an explicit intent alone', async () => {
  const app = doorWith([releaseRow('ja-kinetic')])
  const json = await ask(app, '/new?template=ja-kinetic', {
    accept: 'application/json',
    cookie: await signedIn()
  })
  assert.notEqual(json.status, 200)
  const explicit = await ask(app, '/?template=ja-kinetic&inspiration=ja-kinetic&platform=joomla')
  assert.equal(explicit.status, 302)
  assert.equal(
    explicit.headers.get('location'),
    '/new/?template=ja-kinetic&inspiration=ja-kinetic&platform=joomla'
  )
})

// ── A template waiting on the account (plan B6) ──────────────────────────────────────────────

/** `intents` as app.js wires it off the identity store, over one in-memory row. */
const intentsOf = (initial, platform = null) => {
  let waiting = initial
  const taken = []
  const written = []
  return {
    taken,
    written,
    peek: async () => (waiting ? { template: waiting, platform } : null),
    put: async (email, template, named) => {
      written.push({ email, template, platform: named })
      waiting = template
      platform = named
    },
    take: async (_email, template) => {
      if (waiting !== template) return null
      taken.push(template)
      waiting = null
      return template
    }
  }
}

const doorWithIntents = (rows, intents) =>
  workspaceRoutes({
    config,
    sites: { hostOf: async () => null, dshOf: () => null },
    pool: poolOf(rows),
    intents,
    pages: {
      noSites: null,
      workspaceUnavailable: null,
      templateLanding: templateLandingPage,
      templateNotOnTracy: templateNotOnTracyPage,
      templateLookupFailed: templateLookupFailedPage
    }
  })

test('in Tracy Desktop, a signed-in person with a template waiting is sent from the root to its page, once', async () => {
  const intents = intentsOf('ja-kinetic')
  const app = doorWithIntents([releaseRow('ja-kinetic')], intents)
  const cookie = await signedIn()
  const root = await ask(app, '/', { cookie, userAgent: APP_UA })
  assert.equal(root.status, 302)
  assert.equal(root.headers.get('location'), '/new?template=ja-kinetic')
  const landing = await ask(app, '/new?template=ja-kinetic', { cookie, userAgent: APP_UA })
  assert.equal(landing.status, 200)
  assert.match(await landing.text(), /quickstart\.zip" download/)
  assert.deepEqual(intents.taken, ['ja-kinetic'])
  assert.deepEqual(intents.written, [])
  const again = await ask(app, '/', { cookie, userAgent: APP_UA })
  assert.notEqual(again.headers.get('location'), '/new?template=ja-kinetic')
})

test('in Tracy Desktop, a waiting template that names its platform opens that quickstart', async () => {
  const app = doorWithIntents([releaseRow('ja-kinetic')], intentsOf('ja-kinetic', 'wordpress'))
  const root = await ask(app, '/', { cookie: await signedIn(), userAgent: APP_UA })
  assert.equal(root.status, 302)
  assert.equal(root.headers.get('location'), '/new?template=ja-kinetic&platform=wordpress')
})

test('on the web, the landing leaves the template waiting for the app, and the root does not follow it', async () => {
  const intents = intentsOf(null)
  const app = doorWithIntents([releaseRow('ja-kinetic')], intents)
  const cookie = await signedIn()
  const landing = await ask(app, '/new?template=ja-kinetic', { cookie })
  assert.equal(landing.status, 200)
  assert.deepEqual(intents.written, [{ email: 'a@example.test', template: 'ja-kinetic', platform: 'joomla' }])
  assert.deepEqual(intents.taken, [])
  // The row is the app's to follow: a browser going home is not sent back to the template page.
  const root = await ask(app, '/', { cookie })
  assert.notEqual(root.headers.get('location'), '/new?template=ja-kinetic&platform=joomla')
  assert.notEqual(root.headers.get('location'), '/new?template=ja-kinetic')
})

test('a fetch for the root is never sent to the template page', async () => {
  const app = doorWithIntents([releaseRow('ja-kinetic')], intentsOf('ja-kinetic'))
  const res = await ask(app, '/', {
    cookie: await signedIn(),
    accept: 'application/json',
    userAgent: APP_UA
  })
  assert.notEqual(res.headers.get('location'), '/new?template=ja-kinetic')
})
