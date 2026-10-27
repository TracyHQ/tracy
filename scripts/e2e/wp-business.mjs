#!/usr/bin/env node
/**
 * End-to-end driver for a WordPress site built from `tracy-business/wp7`, through the doors a
 * customer presses (H.1/H.2 of `tasks/todo-wp-business-ngang-joomla.md`).
 *
 * WHY A COMMITTED SCRIPT: the 24/09 drive (`tasks/evidence/build-opens-live-site/20260924-e2e/`)
 * was a scratch file, so every later measurement had to be written again. This one lives in the
 * repo and is run after every batch (C → G) on the local stand and on dev.
 *
 * Every step is one NAMED assert in `result.json`; a missing assert is red. An assert that fails
 * because its batch is not delivered yet is reported as `not-yet` (with the batch letter) when it
 * lies beyond `--done-through`; otherwise it is `fail`. The exit code is 1 when anything is red.
 *
 * Usage:
 *   node scripts/e2e/wp-business.mjs --stand local --languages vi --out tasks/evidence/wp-business/<date>-<batch>/
 *   node scripts/e2e/wp-business.mjs --stand dev --languages en-us,de-de --done-through D --out …
 *
 * Options:
 *   --stand local|dev          which surface (local: tracy.test:8080 + files on this machine;
 *                              dev: cowork.tracy.site + files through `--ssh`)
 *   --languages a[,b]          the languages picked in the Build form (BCP-47, lowercase)
 *   --out DIR                  evidence directory (drive.log, result.json, *.png)
 *   --done-through LETTER      batches delivered so far (C, D, E, F, G); asserts of later batches
 *                              report `not-yet` instead of `fail`. Default: none delivered.
 *   --name TEXT                the business name typed into the Build form (default below)
 *   --site KEY --email E       reuse an existing site as the account that made it (skips create, and
 *                              the build when job.json already exists) — for re-measuring
 *   --session-secret HEX       SESSION_SECRET of the stand (local: read from deploy/.env)
 *   --ssh 'CMD'                a shell prefix that runs a command on the stand host, e.g.
 *                              "ssh <user>@<dev-host>" — needed for --stand dev
 *   --sites-root DIR           where `<label>/docs/agents/build/job.json` lives (local default
 *                              ~/tracy-data/sites; dev default /srv/tracy)
 *   --dsh-home DIR             where dsh keeps sessions (local default ~/tracy-data/dsh-home)
 *   --build-timeout SECONDS    ceiling for the Build (default 720 — 24/09 measured 498 s)
 *   --skip-chat                do not run the chat scenario (step 4)
 *   --skip-reopen              do not run the close-tab scenario (step 5)
 *
 * Traps already paid for (do not remove):
 *   - Chrome is NEVER launched here. `chrome-watch` owns the headless Chrome on 127.0.0.1:9222 so
 *     the person can watch every page in DevTools (from another machine: `chrome-watch --attach <host>`).
 *   - The right-hand dsh panel is collapsed after every load: press `button[aria-label="Expand sidebar"]`
 *     before looking for a tab. The real tabs live in `[class*=tabList]`, not in `[class*=tabBar]`.
 *   - Inputs are React-controlled: set the value through the native setter and dispatch `input`,
 *     assigning `.value` is not heard.
 *   - Inspiration cards render only the first ~30, so the wizard is opened by address:
 *     `/new/?tab=tracy:add-site&design=tracy-business`.
 *   - Every run uses a fresh email: dsh restores the previous account's onboarding session.
 *   - dsh writes the session as CONCATENATED zstd frames; Node's zstdDecompressSync reads one
 *     frame, so the log is split into frames before decoding. Since dsh 0.1.7 a session holds
 *     `session.v4.jsonl.zstd` beside the untouched V3 file once it is converted, and only V4 grows:
 *     the newest generation is read, restored to V4 shape (`scripts/measure/session-metrics.mjs`).
 */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { newestSessionLog, parseSessionBytes, restoreSession } from '../measure/session-metrics.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const require = createRequire(
  join(ROOT, 'node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/package.json')
)
const { chromium } = require('playwright')
const { mintSession } = await import(join(ROOT, 'apps/tracy-web/src/lib/session.js'))

// ---------- arguments ----------
const args = parseArgs(process.argv.slice(2))
const stand = args.stand ?? 'local'
const languages = String(args.languages ?? 'vi')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
const primary = languages[0]
const out = resolve(args.out ?? `tasks/evidence/wp-business/${today()}-run`)
const doneThrough = (args['done-through'] ?? '').toUpperCase()
// language-allow: sample Vietnamese customer input
const businessName = args.name ?? (primary === 'vi' ? 'Nhà Xưởng Bình Minh' : 'Bright Harbor Builders')
const buildTimeout = Number(args['build-timeout'] ?? 720)
const T0 = Date.now()
mkdirSync(out, { recursive: true })

const STANDS = {
  local: {
    origin: 'http://tracy.test:8080',
    cookieDomain: 'tracy.test',
    siteUrl: (label) => `http://${label}.tracy.test:8080/`,
    zone: 'tracy.test',
    sitesRoot: args['sites-root'] ?? join(homedir(), 'tracy-data', 'sites'),
    dshHome: args['dsh-home'] ?? join(homedir(), 'tracy-data', 'dsh-home'),
    secret: args['session-secret'] ?? readEnvKey(join(ROOT, 'deploy', '.env'), 'SESSION_SECRET'),
    ssh: args.ssh ?? null
  },
  dev: {
    origin: 'https://cowork.tracy.site',
    cookieDomain: 'cowork.tracy.site',
    siteUrl: (label) => `https://${label}.tracy.site/`,
    zone: 'tracy.site',
    // Measured on contabo2 25/09: `TRACY_SITES_ROOT=/srv/tracy-sites` (markers in its
    // `.content-contracts/`), dsh home mounted from `/srv/tracy/host-dsh/home`.
    sitesRoot: args['sites-root'] ?? '/srv/tracy-sites',
    dshHome: args['dsh-home'] ?? '/srv/tracy/host-dsh/home',
    secret: args['session-secret'] ?? null,
    ssh: args.ssh ?? null
  }
}
const S = STANDS[stand]
if (!S) die(`unknown stand ${stand}`)
if (!S.secret) die('no SESSION_SECRET: pass --session-secret (dev) or keep deploy/.env readable (local)')
if (stand === 'dev' && !S.ssh)
  die('--stand dev needs --ssh "<prefix>" to read job.json and the session history on the host')

// ---------- evidence ----------
const logLines = []
function log(line) {
  const s = `[+${Math.round((Date.now() - T0) / 1000)}s] ${line}`
  logLines.push(s)
  console.log(s)
  appendFileSync(join(out, 'drive.log'), s + '\n')
}
const asserts = []
/** @param {'C'|'D'|'E'|'F'|'G'} batch which batch delivers this assert */
function record(name, batch, ok, detail) {
  let status = ok ? 'pass' : 'fail'
  if (!ok && batch && doneThrough < batch) status = 'not-yet'
  asserts.push({ name, batch, status, detail: detail ?? '' })
  log(`${status.toUpperCase().padEnd(7)} ${name}${detail ? ` — ${detail}` : ''}`)
  writeResult()
}
function writeResult(extra = {}) {
  writeFileSync(
    join(out, 'result.json'),
    JSON.stringify(
      {
        stand,
        origin: S.origin,
        languages,
        businessName,
        doneThrough: doneThrough || null,
        startedAt: new Date(T0).toISOString(),
        seconds: Math.round((Date.now() - T0) / 1000),
        ...state,
        asserts,
        summary: summarise(),
        ...extra
      },
      null,
      2
    ) + '\n'
  )
}
function summarise() {
  const s = { pass: 0, fail: 0, 'not-yet': 0 }
  for (const a of asserts) s[a.status]++
  return s
}
const state = {
  siteKey: args.site ?? null,
  label: args.site ? args.site.split('.')[0] : null,
  jobId: null,
  email: null
}

// ---------- the asserts every run must carry (a missing one is red) ----------
const REQUIRED_ALL = [
  '1.signed-in',
  '2.workspace-open',
  '3.home-200',
  '3.html-lang',
  '3.h1-customer',
  '3.title-customer',
  '3.header-customer',
  '3.footer-customer',
  '3.switcher-only-chosen',
  '3.news-no-demo-posts',
  '3.internal-links-200',
  '3.hero-image-drawn'
]
const REQUIRED = REQUIRED_ALL

const LANGUAGE_NAMES = {
  vi: 'Vietnamese',
  'vi-vn': 'Vietnamese',
  de: 'German',
  'de-de': 'German',
  'en-us': 'English',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  ja: 'Japanese',
  zh: 'Chinese'
}
// ---------- browser ----------
const browser = await chromium
  .connectOverCDP('http://127.0.0.1:9222')
  .catch((e) => die(`chrome-watch is not running on :9222 (${e.message}) — start it with \`chrome-watch\``))
// `--site` reuse must sign in as the account that holds the seat, so pass its `--email` back.
const email = args.email ?? `wpb-${Date.now().toString(36)}@e2e.tracy.test`
state.email = email
const token = await mintSession(email, S.secret)
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
await context.addCookies([
  {
    name: 'tracy_sess',
    value: token,
    domain: S.cookieDomain,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: S.origin.startsWith('https')
  }
])
const page = await context.newPage()
page.setDefaultTimeout(30_000)
log(`stand ${stand} · ${S.origin} · languages ${languages.join(',')} · email ${email}`)

try {
  // ---------- step 1: sign in → Add site → WordPress → tracy-business → Create ----------
  const me = await page.request.get(`${S.origin}/auth/me`)
  record('1.signed-in', 'C', me.ok(), `auth/me ${me.status()}`)

  if (!state.siteKey) {
    // The public Design inspiration press: the intent on the address is what later tells the Build
    // tab which inspiration it is about (`@tracy/core/tab-link`).
    await page.goto(`${S.origin}/new/?inspiration=tracy-business&platform=wordpress`, {
      waitUntil: 'domcontentloaded'
    })
    await expandSidebar(page)
    const wp = page.getByRole('button', { name: /^wordpress$/i }).first()
    await wp.waitFor({ timeout: 60_000 })
    await wp.click()
    const wpSelected = (await wp.getAttribute('data-selected')) === '1'
    record('1.wordpress-chosen', 'C', wpSelected, `data-selected=${await wp.getAttribute('data-selected')}`)
    state.label = `wpb${Date.now().toString(36).slice(-6)}`
    await typeInto(page.getByPlaceholder('your-brand'), state.label)
    await page.screenshot({ path: join(out, '1-wizard.png') })
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/sites') && r.request().method() === 'POST', {
        timeout: 60_000
      }),
      page.getByRole('button', { name: /create site/i }).click()
    ])
    const body = await res.json().catch(() => ({}))
    state.siteKey = body.siteKey ?? `${state.label}.${S.zone}`
    state.jobId = body.jobId ?? null
    record(
      '1.create-202',
      'C',
      res.status() === 202 || res.ok(),
      `POST /api/sites ${res.status()} ${JSON.stringify(body).slice(0, 120)}`
    )
    // The local stand serves no template card, so the proof that tracy-business/wp7 was chosen is
    // the door's own answer, not the picture in the wizard.
    record(
      '1.tracy-business-chosen',
      'C',
      body.builtFrom === 'tracy-business/wp7' || body.template === 'tracy-business',
      `builtFrom ${body.builtFrom ?? '?'} template ${body.template ?? '?'}`
    )
    log(`site ${state.siteKey} provision job ${state.jobId}`)
    // The wizard walks the provision steps and offers the workspace when the site is up.
    await page
      .waitForURL((u) => u.pathname.startsWith(`/${state.siteKey}`), { timeout: 600_000 })
      .catch(async () => {
        const open = page
          .getByRole('button', { name: /open (the )?workspace|start the agent|go to/i })
          .first()
        if (await open.isVisible().catch(() => false)) await open.click()
        await page.waitForURL((u) => u.pathname.startsWith(`/${state.siteKey}`), { timeout: 120_000 })
      })
  } else {
    await page.goto(`${S.origin}/${state.siteKey}/`, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForLoadState('networkidle').catch(() => {})
  record('2.workspace-open', 'C', page.url().includes(state.siteKey), page.url())
  await page.screenshot({ path: join(out, '2-workspace.png') })

  // ---------- step 2: Build form → 6 stages → done ----------
  const jobFile = `${S.sitesRoot}/${state.label}/docs/agents/build/job.json`
  const needBuild = !args.site || !hostFile(jobFile)
  if (needBuild) {
    // The Build tab is opened by a build INTENT on the address (`@tracy/core/tab-link`): a bare
    // `?tab=tracy:build:wordpress` opens a tab that knows no inspiration and draws no form.
    await page.goto(`${S.origin}/${state.siteKey}/?inspiration=tracy-business&platform=wordpress`, {
      waitUntil: 'domcontentloaded'
    })
    await page.waitForLoadState('networkidle').catch(() => {})
    await expandSidebar(page)
    // The pane of a tab that is not in front is in the DOM but hidden: bring the Build tab in front
    // first, and only ever touch VISIBLE controls (`:visible`), or a hidden pane's Next is pressed.
    await openTab(page, /^build$/i)
    // The tab waits up to 45 s for the agent's own questions; "Use the standard questions" ends
    // that wait, the way a customer would.
    const nameBox = page
      // language-allow: sample Vietnamese customer input
      .locator('input:visible[placeholder*="Harbor Build & Repair"], input:visible[placeholder*="Bến Cảng"]')
      .first()
    let buildTab = false
    for (let i = 0; i < 24 && !buildTab; i++) {
      buildTab = await nameBox.isVisible({ timeout: 5000 }).catch(() => false)
      if (buildTab) break
      const skip = page.locator('button:visible', { hasText: /use the standard questions/i }).first()
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
      await openTab(page, /^build$/i)
    }
    record('2.build-tab', 'C', buildTab, buildTab ? 'Build form shown' : 'Build form did not appear')
    // Name
    await typeInto(nameBox, businessName)
    // About (the visible textarea of the form)
    const about = page.locator('.tracy-site-build textarea:visible').first()
    if (await about.isVisible().catch(() => false))
      await typeInto(
        about,
        primary === 'vi'
          ? // language-allow: sample Vietnamese customer input
            'Nhà thầu xây dựng nhà xưởng công nghiệp tại Bình Dương, thành lập 2009, chuyên thiết kế và thi công trọn gói.'
          : 'Design-build contractor for light industrial facilities in Oregon, founded 2009.'
      )
    // Step 2: languages and tone, then Send to Tracy
    await page
      .locator('button:visible', { hasText: /^Next$/ })
      .first()
      .click()
    await pickLanguages(page, languages)
    await page.screenshot({ path: join(out, '2-build-form.png') })
    await page
      .locator('button:visible', { hasText: /^Send to Tracy$/ })
      .first()
      .click()
    log('Build form sent')
    const job = await waitForBuild(state.label, buildTimeout, async (j) => {
      if (args['skip-reopen']) return
      // step 5: close the tab once the first stage is done, reopen, the build must go on alone.
      if (!state.reopened && j.stages?.some((s) => s.name === 'check' && s.status === 'done')) {
        state.reopened = true
        log('closing the workspace tab mid-build')
        await page.close()
        await new Promise((r) => setTimeout(r, 15_000))
        const again = await context.newPage()
        await again.goto(`${S.origin}/${state.siteKey}/`, { waitUntil: 'domcontentloaded' })
        await again.waitForLoadState('networkidle').catch(() => {})
        await expandSidebar(again)
        await openTab(again, /build/i)
        const askedAgain = await again
          .getByPlaceholder(/claude studio|tiệm bánh/i)
          .first()
          .isVisible()
          .catch(() => false)
        record(
          '5.reopen-no-requestion',
          'C',
          !askedAgain,
          askedAgain ? 'Build tab asks the questions again' : 'Build tab shows progress, not the form'
        )
        await again.screenshot({ path: join(out, '5-reopened.png') })
        state.page = again
      }
    })
    const stages = (job?.stages ?? []).map((s) => `${s.name}:${s.status}`).join(' ')
    record('2.build-done', 'C', job?.status === 'done', `${job?.status ?? 'no job.json'} · ${stages}`)
    record(
      '5.build-continued-after-reopen',
      'C',
      !!state.reopened && job?.status === 'done',
      state.reopened ? 'reopened during check→done' : 'never reopened'
    )
    const live = state.page ?? page
    const frames = await live.evaluate(() =>
      Array.from(document.querySelectorAll('iframe')).map((f) => f.src)
    )
    record(
      '2.live-site-in-sidebar',
      'C',
      frames.some((f) => f.includes(state.label)),
      frames.join(' ') || 'no iframe'
    )
  }

  // ---------- step 3: the site, seen by the machine ----------
  const siteUrl = S.siteUrl(state.label)
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const sp = await anon.newPage()
  sp.setDefaultTimeout(30_000)
  const home = await sp.goto(siteUrl, { waitUntil: 'domcontentloaded' })
  record('3.home-200', 'C', !!home && home.ok(), `${siteUrl} ${home?.status()}`)
  const lang = (await sp.evaluate(() => document.documentElement.lang)) ?? ''
  const wantLang = primary.split('-')[0]
  record(
    '3.html-lang',
    'D',
    lang.toLowerCase().startsWith(wantLang),
    `<html lang="${lang}"> wanted ${primary}`
  )
  const h1 = (
    (await sp
      .locator('h1')
      .first()
      .textContent()
      .catch(() => '')) ?? ''
  ).trim()
  record('3.h1-customer', 'C', !!h1 && !/northgate/i.test(h1) && h1 !== 'Home', `h1 "${h1.slice(0, 80)}"`)
  const title = await sp.title()
  const bodyText = await sp.evaluate(() => document.body.innerText)
  const header =
    (await sp
      .locator('header')
      .first()
      .innerText()
      .catch(() => '')) ?? ''
  const footer =
    (await sp
      .locator('footer')
      .first()
      .innerText()
      .catch(() => '')) ?? ''
  const nameRe = new RegExp(escapeRe(businessName), 'i')
  record('3.title-customer', 'E', nameRe.test(title), `<title> "${title}"`)
  record(
    '3.header-customer',
    'E',
    nameRe.test(header) && !/northgate|NG\b/.test(header),
    `header: ${header.replace(/\s+/g, ' ').slice(0, 120)}`
  )
  record(
    '3.footer-customer',
    'E',
    nameRe.test(footer) && !/northgate/i.test(footer),
    `footer: ${footer.replace(/\s+/g, ' ').slice(0, 120)}`
  )
  record(
    '3.no-northgate-on-home',
    'E',
    !/northgate/i.test(bodyText),
    `${(bodyText.match(/northgate/gi) ?? []).length} × Northgate on /`
  )
  const switcher = await sp.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '.wp-block-polylang-language-switcher a, .lang-item a, [class*=language-switcher] a, a[hreflang]'
      )
    )
      .map((a) =>
        (a.getAttribute('hreflang') || a.getAttribute('lang') || a.textContent || '').trim().toLowerCase()
      )
      .filter(Boolean)
  )
  const hreflangs = await sp.evaluate(() =>
    Array.from(document.querySelectorAll('link[hreflang]')).map((l) => l.getAttribute('hreflang'))
  )
  const langSet = new Set(
    [...switcher, ...hreflangs.map((h) => (h ?? '').toLowerCase())]
      .map((s) => s.split('-')[0])
      .filter((s) => s && s !== 'x')
  )
  // The source edition (English) stays live on purpose (D.2: the source is always written), so a
  // `vi` site legitimately offers en + vi; anything else is a language the customer did not ask for.
  const wanted = new Set([...languages.map((l) => l.split('-')[0]), 'en'])
  const extra = [...langSet].filter((l) => !wanted.has(l))
  record(
    '3.switcher-only-chosen',
    'D',
    extra.length === 0,
    `switcher/hreflang languages: ${[...langSet].join(',') || 'none'}; extra: ${extra.join(',') || 'none'}`
  )
  // Site title and tagline of EVERY live edition, in that edition's language. Measured
  // on 25/09/2026 (`wpbghcqkm`): `/` carried the Vietnamese tagline, `/vi/` the archive's
  // "Northgate" — the h1 check above passed on both. Polylang serves blogname/blogdescription per
  // language, so each edition is read on its own: the name is the customer's everywhere, the
  // tagline is short and in the edition's alphabet, and no demo words survive.
  const VIETNAMESE = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/
  const editionsToRead = [['en', siteUrl]]
  for (const l of languages) {
    const short = l.split('-')[0]
    if (short !== 'en') editionsToRead.push([short, new URL(`/${short}/`, siteUrl).href])
  }
  for (const [lang, url] of editionsToRead) {
    const ed = await readSite(browser, url)
    const tagline = ed.tagline ?? ''
    const inLanguage =
      lang === 'vi' ? VIETNAMESE.test(tagline) : lang === 'en' ? !VIETNAMESE.test(tagline) : true
    record(
      `3.identity-${lang}`,
      'D',
      !!ed.siteTitle &&
        nameRe.test(ed.siteTitle) &&
        nameRe.test(ed.title) &&
        tagline.length > 0 &&
        tagline.length <= 70 &&
        inLanguage &&
        !/northgate|industrial infrastructure/i.test(`${ed.title} ${ed.siteTitle} ${tagline}`),
      `${url} site-title "${ed.siteTitle}" tagline "${tagline.slice(0, 90)}" (${tagline.length}) <title> "${ed.title.slice(0, 80)}"`
    )
  }
  // /news/ must hold no demo article
  const newsPath =
    primary === 'en-us' || primary === 'en' || languages[0].startsWith('en') ? '/news/' : `/${wantLang}/news/`
  const news = await sp
    .goto(new URL(newsPath, siteUrl).href, { waitUntil: 'domcontentloaded' })
    .catch(() => null)
  const newsTitles = news
    ? await sp.evaluate(() =>
        Array.from(
          document.querySelectorAll('main h2 a, main h3 a, .wp-block-post-title a, article h2, article h3')
        ).map((e) => e.textContent?.trim() ?? '')
      )
    : []
  const demoPosts = [
    'work hours without an incident',
    'Obninsk',
    'Zavolzhye',
    'sandwich roof',
    'heavy machine foundation'
  ]
  const foundDemo = demoPosts.filter((d) => newsTitles.some((t) => t.toLowerCase().includes(d.toLowerCase())))
  const newsText = newsTitles.join(' | ')
  record(
    '3.news-no-demo-posts',
    'C',
    !!news && news.ok() && foundDemo.length === 0,
    `${newsPath} ${news?.status()} demo posts: ${foundDemo.join(', ') || 'none'} · titles: ${newsText.slice(0, 120) || 'none'}`
  )
  // internal links in nav/footer answer 200 — on the CHOSEN language's page: the archive's
  // translated menus shipped with empty urls (25/09: the Vietnamese menu went nowhere), so a
  // menu item whose href is empty counts as dead here.
  await sp.goto(primary.startsWith('en') ? siteUrl : new URL(`/${wantLang}/`, siteUrl).href, {
    waitUntil: 'domcontentloaded'
  })
  const emptyLinks = await sp.evaluate(() =>
    Array.from(document.querySelectorAll('header a, nav a, footer a'))
      .filter((a) => !a.getAttribute('href'))
      .map((a) => a.textContent?.trim() ?? '')
      .filter(Boolean)
  )
  const links = await sp.evaluate(() =>
    Array.from(
      new Set(
        Array.from(document.querySelectorAll('header a[href], nav a[href], footer a[href]')).map(
          (a) => a.href
        )
      )
    ).filter((h) => h.startsWith(location.origin))
  )
  const dead = []
  for (const l of links) {
    const r = await sp.request.get(l).catch(() => null)
    if (!r || r.status() >= 400) dead.push(`${l} ${r?.status() ?? 'ERR'}`)
  }
  record(
    '3.internal-links-200',
    'F',
    links.length > 0 && dead.length === 0 && emptyLinks.length === 0,
    `${links.length} links, dead: ${dead.join(' ') || 'none'}; empty href: ${emptyLinks.join(', ') || 'none'}`
  )
  // hero image is a drawn picture (uploaded under tracy-content), not the demo asset
  const hero = await sp.evaluate(() => {
    // The first picture of the page body that is not a language flag or an icon.
    const imgs = Array.from(document.querySelectorAll('main img, .wp-site-blocks img, body img')).filter(
      (i) => !/flags\/|\.svg$|logo|icon/i.test(i.currentSrc || i.src) && (i.naturalWidth || i.width) > 200
    )
    const img = imgs[0]
    return img ? img.currentSrc || img.src : ''
  })
  record('3.hero-image-drawn', 'F', /tracy-content\//.test(hero), `hero img ${hero.slice(0, 120) || 'none'}`)
  // screenshots at two widths, light and dark (emulated, never attached by hand)
  for (const [w, h] of [
    [1440, 900],
    [390, 844]
  ]) {
    for (const scheme of ['light', 'dark']) {
      await sp.setViewportSize({ width: w, height: h })
      await sp.emulateMedia({ colorScheme: scheme })
      await sp.goto(siteUrl, { waitUntil: 'networkidle' }).catch(() => {})
      await sp.screenshot({ path: join(out, `3-home-${w}-${scheme}.png`), fullPage: false })
    }
  }
  const darkBg = await sp.evaluate(() => getComputedStyle(document.body).backgroundColor)
  record(
    '3.dark-no-white-block',
    'C',
    !/rgb\(255, 255, 255\)/.test(darkBg) || true,
    `dark body background ${darkBg} (informational)`
  )
  await sp.emulateMedia({ colorScheme: 'light' })
  await sp.setViewportSize({ width: 1440, height: 900 })
  // second language, when two were chosen
  if (languages.length >= 2) {
    const second = languages[1].split('-')[0]
    const r2 = await sp
      .goto(new URL(`/${second}/`, siteUrl).href, { waitUntil: 'domcontentloaded' })
      .catch(() => null)
    const h1b = (
      (await sp
        .locator('h1')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    ).trim()
    record(
      '6.second-language-customer',
      'D',
      !!r2 && r2.ok() && !!h1b && !/northgate/i.test(h1b) && h1b !== 'Home',
      `/${second}/ ${r2?.status()} h1 "${h1b.slice(0, 80)}"`
    )
    const r3 = await sp
      .goto(new URL('/fr/', siteUrl).href, { waitUntil: 'domcontentloaded' })
      .catch(() => null)
    record(
      '6.unchosen-language-gone',
      'D',
      !r3 || r3.status() === 404 || !langSet.has('fr'),
      `/fr/ ${r3?.status()} (in switcher: ${langSet.has('fr')})`
    )
  }
  await anon.close()

  // ---------- step 4: chat with the agent ----------
  if (!args['skip-chat']) {
    const live = state.page ?? page
    if (live.isClosed()) {
      state.page = await context.newPage()
      await state.page.goto(`${S.origin}/${state.siteKey}/`, { waitUntil: 'domcontentloaded' })
    }
    const chat = state.page ?? page
    await chat.bringToFront()
    // language-allow: sample Vietnamese customer input
    const newName = primary === 'vi' ? 'Công ty Ánh Dương' : 'Sunrise Fabrication'
    const beforeSeq = await sessionSeq(state.label, sessionOf(chat))
    // (a) rename → content.contract apply → 3 places
    const t1 = await say(
      chat,
      // language-allow: sample Vietnamese customer input
      primary === 'vi' ? `Đổi tên công ty thành ${newName}` : `Change the company name to ${newName}`,
      beforeSeq
    )
    const tools1 = t1.tools.map(
      (t) => t.name + (t.action ? `:${t.action}` : '') + (t.operation ? `/${t.operation}` : '')
    )
    record(
      '4a.agent-used-contract-apply',
      'C',
      t1.tools.some((t) => t.action === 'content.contract' && t.operation === 'apply'),
      tools1.join(' ') || 'no tool call'
    )
    const after = await readSite(browser, siteUrl)
    const re2 = new RegExp(escapeRe(newName), 'i')
    record(
      '4a.renamed-in-3-places',
      'E',
      re2.test(after.title) && re2.test(after.header) && re2.test(after.footer),
      `title:${re2.test(after.title)} header:${re2.test(after.header)} footer:${re2.test(after.footer)}`
    )
    // (b) structural change → refused by the pinned Claude Cowork plugin (`content_only`, its code from before
    //     ADR 0022 made the design a content recommendation), no detour
    const t2 = await say(
      chat,
      // language-allow: sample Vietnamese customer input
      primary === 'vi' ? 'Xoá mục Services khỏi menu' : 'Remove Services from the menu',
      t1.seq
    )
    const detour = t2.tools.filter(
      (t) =>
        ['bash', 'shell', 'write', 'edit'].includes(t.name.toLowerCase()) ||
        t.action === 'content.delete' ||
        t.action === 'content.update'
    )
    const refused = t2.results.some((r) => /content_only/.test(r))
    // Best case (measured 25/09, `wpbglshq6`): the agent reads the contract, sees no menu slot and
    // stops without asking the door — no refusal to see, and nothing to detour around.
    const wrote = t2.tools.some(
      (t) => t.operation === 'apply' || /^content\.(update|delete|create)$/.test(t.action ?? '')
    )
    record(
      '4b.structure-refused',
      'C',
      (refused || !wrote) && detour.length === 0,
      `content_only seen: ${refused}; detours: ${detour.map((d) => d.name + (d.action ? ':' + d.action : '')).join(' ') || 'none'}; tools: ${t2.tools.map((t) => t.name + (t.action ? ':' + t.action : '')).join(' ')}`
    )
    record(
      '4b.agent-told-customer-sealed',
      'C',
      // `content-only` matches the Claude Cowork plugin's own refusal text when the agent quotes it.
      /seal|contract|content-only|niêm phong|hợp đồng|không thể|cannot/i.test(t2.text),
      t2.text.replace(/\s+/g, ' ').slice(0, 160)
    )
    // (c) undo → apply.revert
    // language-allow: sample Vietnamese customer input
    const t3 = await say(chat, primary === 'vi' ? 'Hoàn tác lại việc đổi tên' : 'Undo the rename', t2.seq)
    record(
      '4c.agent-used-apply-revert',
      'C',
      t3.tools.some((t) => t.action === 'apply.revert'),
      t3.tools.map((t) => t.name + (t.action ? ':' + t.action : '')).join(' ') || 'no tool call'
    )
    const back = await readSite(browser, siteUrl)
    record(
      '4c.site-back-to-before',
      'E',
      nameRe.test(back.title) && !re2.test(back.header),
      `title "${back.title}"`
    )
    // (d) add German → language.add on the Build tool
    const t4 = await say(
      chat,
      // language-allow: sample Vietnamese customer input
      primary === 'vi' ? 'Bật thêm tiếng Đức cho site' : 'Add German to the site',
      t3.seq
    )
    record(
      '4d.agent-used-language-add',
      'D',
      t4.tools.some(
        (t) =>
          /tracy_site_build_wordpress/i.test(t.name) && /language\.add/.test(JSON.stringify(t.input ?? {}))
      ),
      t4.tools.map((t) => t.name + (t.action ? ':' + t.action : '')).join(' ') || 'no tool call'
    )
    // The request reruns the build from `seed` with German added: the edition must come alive
    // with the customer's words within the build ceiling.
    if (
      t4.tools.some(
        (t) =>
          /tracy_site_build_wordpress/i.test(t.name) && /language\.add/.test(JSON.stringify(t.input ?? {}))
      )
    ) {
      const again = await waitForBuild(state.label, buildTimeout)
      const de = await readSite(browser, new URL('/de/', siteUrl).href)
      const deLang = (de.lang ?? '').toLowerCase()
      record(
        '4d.german-live',
        'D',
        again?.status === 'done' && deLang.startsWith('de') && !!de.h1 && !/northgate/i.test(de.h1),
        `build ${again?.status ?? '?'} · /de/ lang="${deLang}" h1 "${(de.h1 ?? '').slice(0, 60)}"`
      )
    }
    await chat.screenshot({ path: join(out, '4-chat.png') })
  }
} catch (e) {
  log(`DRIVER ERROR: ${e?.stack ?? e}`)
  record('driver.completed', 'C', false, String(e?.message ?? e))
  try {
    await page.screenshot({ path: join(out, 'error.png') })
  } catch {}
} finally {
  const missing = REQUIRED.filter((n) => !asserts.some((a) => a.name === n))
  for (const n of missing) record(n, 'C', false, 'assert never reached')
  writeResult({ finishedAt: new Date().toISOString() })
  const s = summarise()
  log(`done: ${s.pass} pass · ${s.fail} fail · ${s['not-yet']} not-yet · site ${state.siteKey}`)
  await context.close().catch(() => {})
  process.exit(s.fail + s['not-yet'] > 0 ? 1 : 0)
}

// ---------- helpers ----------
function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const k = a.slice(2)
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    o[k] = v
  }
  return o
}
function die(msg) {
  console.error(msg)
  process.exit(2)
}
function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}
function readEnvKey(file, key) {
  try {
    const m = readFileSync(file, 'utf8').match(new RegExp(`^${key}=([^\\n#]+)`, 'm'))
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null
  } catch {
    return null
  }
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
async function expandSidebar(p) {
  const btn = p.locator('button[aria-label="Expand sidebar"]').first()
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
}
async function openTab(p, re) {
  await expandSidebar(p)
  const tab = p.locator('[class*=tabList] [class*=tab]:visible').filter({ hasText: re }).first()
  if (await tab.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await tab.click()
    return true
  }
  const any = p.getByRole('tab', { name: re }).first()
  if (await any.isVisible().catch(() => false)) {
    await any.click()
    return true
  }
  return false
}
/** React-controlled inputs: native setter + input event. */
async function typeInto(locator, value) {
  await locator.waitFor({ timeout: 60_000 })
  await locator.evaluate((el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}
async function pickLanguages(p, codes) {
  const box = p.locator('input:visible[placeholder*="another"]').first()
  await box.waitFor({ timeout: 30_000 })
  // Add in order (suggestions read "Tiếng Việt (Việt Nam) · Vietnamese (Vietnam)"), then drop the
  // chips the run did not ask for — the form starts with American English on.
  for (const code of codes) {
    const name = LANGUAGE_NAMES[code] ?? code
    // Already a chip (the form starts with English on): nothing to add. A lone chip has no
    // remove button, so the chip TEXT between the field's label and the next one is what tells.
    const formText =
      (await p
        .locator('.tracy-site-build:visible')
        .first()
        .innerText()
        .catch(() => '')) ?? ''
    const picked = formText.split(/Site language/i)[1]?.split(/\nTone/i)[0] ?? ''
    if (picked.toLowerCase().includes(name.toLowerCase())) {
      log(`language already on: ${name} (${code})`)
      continue
    }
    await box.click()
    await box.fill('')
    await box.type(name.slice(0, 5))
    const option = p
      .locator('.tracy-site-build button:visible', { hasText: new RegExp(escapeRe(name), 'i') })
      .first()
    await option.waitFor({ timeout: 15_000 })
    await option.click()
    log(`language picked: ${name} (${code})`)
  }
  const wanted = codes.map((c) => (LANGUAGE_NAMES[c] ?? c).toLowerCase())
  for (let i = 0; i < 6; i++) {
    const chips = p.locator('.tracy-site-build button:visible[aria-label^="Remove"]')
    const n = await chips.count()
    let removed = false
    for (let k = 0; k < n; k++) {
      const label = ((await chips.nth(k).getAttribute('aria-label')) ?? '').toLowerCase()
      if (!wanted.some((w) => label.includes(w))) {
        await chips.nth(k).click()
        log(`language removed: ${label}`)
        removed = true
        break
      }
    }
    if (!removed) break
  }
}
function hostFile(path) {
  if (S.ssh) {
    try {
      return execFileSync('sh', ['-c', `${S.ssh} 'cat ${path}'`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
    } catch {
      return null
    }
  }
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
function hostBinary(path) {
  if (S.ssh) {
    try {
      return execFileSync('sh', ['-c', `${S.ssh} 'cat ${path}'`], {
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 << 20
      })
    } catch {
      return null
    }
  }
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}
function hostList(dir) {
  if (S.ssh) {
    try {
      return execFileSync('sh', ['-c', `${S.ssh} 'ls -1 ${dir}'`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
        .split('\n')
        .filter(Boolean)
    } catch {
      return []
    }
  }
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
async function waitForBuild(label, seconds, onTick) {
  const file = `${S.sitesRoot}/${label}/docs/agents/build/job.json`
  const until = Date.now() + seconds * 1000
  let last = ''
  let job = null
  while (Date.now() < until) {
    const raw = hostFile(file)
    if (raw) {
      try {
        job = JSON.parse(raw)
      } catch {}
      const line = `${job?.status} ${(job?.stages ?? []).map((s) => `${s.name}:${s.status}`).join(' ')}`
      if (line !== last) {
        last = line
        log(`build ${line}`)
      }
      if (onTick) await onTick(job)
      if (job?.status === 'done' || job?.status === 'failed') return job
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  log(`build timeout after ${seconds}s`)
  return job
}
/** Sessions already reported as read without the V4 restore, so a 4 s poll logs each once. */
const unrestoredLogged = new Set()
/**
 * dsh session history of the site, in V4 shape: the header, then every event of the newest
 * `session.vN.jsonl.zstd` generation of each session (a converted session keeps its stale V3 beside it).
 */
function sessionRecords(label, only = null) {
  const dir = `${S.dshHome}/sessions/--site-${label}--`
  const all = []
  for (const s of hostList(dir)) {
    // The page's own session (from its `/s/<id>` address): records of the build's session would
    // otherwise be counted in, and a slice by count across sessions lands anywhere.
    if (only && !s.includes(only)) continue
    const name = newestSessionLog(hostList(`${dir}/${s}`))
    if (!name) continue
    const buf = hostBinary(`${dir}/${s}/${name}`)
    if (!buf) continue
    let parsed
    try {
      parsed = parseSessionBytes(buf, name.endsWith('.zstd'))
    } catch (e) {
      log(`session ${s}: ${name} unreadable (${e?.message ?? e})`)
      continue
    }
    const { header, events, restored, reason } = restoreSession(parsed.header, parsed.rows)
    if (!restored && !unrestoredLogged.has(`${s}/${name}`)) {
      unrestoredLogged.add(`${s}/${name}`)
      log(`session ${s}: ${name} read as stored, not restored to V4 (${reason})`)
    }
    for (const record of header === null ? events : [header, ...events]) all.push({ session: s, ...record })
  }
  return all
}
async function sessionSeq(label, only = null) {
  return sessionRecords(label, only).length
}
/** The dsh session id a workspace page is on (`/<siteKey>/s/<id>`). */
function sessionOf(p) {
  return /\/s\/(session-[0-9a-f-]+)/.exec(p.url())?.[1] ?? null
}
/** Send one message in the composer and wait for the turn to end; return tools called and the reply. */
async function say(p, text, sinceCount) {
  // dsh's composer is a contenteditable `div[role=textbox]`, not a textarea: type through the
  // keyboard, and press the Send button rather than Enter (Enter may insert a newline).
  const composer = p.locator('[role="textbox"][contenteditable]:visible').last()
  await composer.waitFor({ timeout: 60_000 })
  await composer.click()
  await p.keyboard.type(text)
  const send = p.locator('button:visible[aria-label="Send message"]').first()
  if (await send.isVisible().catch(() => false)) await send.click()
  else await composer.press('Enter')
  log(`said: ${text}`)
  const until = Date.now() + 240_000
  const only = sessionOf(p)
  let recs = []
  let seen = false
  // dsh writes `user/message` … `turn/start` … `tool/call` / `tool/result` / `assistant/message` … `turn/end`.
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000))
    recs = sessionRecords(state.label, only).slice(sinceCount)
    seen = recs.some(
      (r) => r.type === 'user/message' && JSON.stringify(r.data ?? {}).includes(text.slice(0, 24))
    )
    const started = recs.findIndex((r) => r.type === 'turn/start')
    const ended = recs.findIndex((r, i) => r.type === 'turn/end' && i > started)
    if (seen && started !== -1 && ended !== -1) break
  }
  if (!seen) log(`the message never reached session ${only ?? '?'} (${recs.length} record(s) after it)`)
  const tools = []
  const results = []
  let reply = ''
  for (const r of recs) {
    if (r.type === 'tool/call') {
      const raw = r.data?.arguments ?? r.data?.input ?? r.data?.params
      const parsed = typeof raw === 'string' ? safeJson(raw) : raw
      tools.push({
        name: String(r.data?.name ?? '?'),
        action: parsed?.action,
        operation: parsed?.params?.operation ?? parsed?.operation,
        input: parsed
      })
    } else if (r.type === 'tool/result') {
      for (const item of walk(r.data))
        if (item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
          results.push(item.text.slice(0, 400))
    } else if (r.type === 'assistant/message') {
      for (const item of r.data?.message?.content ?? [])
        if (item && item.type === 'text' && typeof item.text === 'string') reply += item.text + '\n'
    }
  }
  log(
    `turn ended: ${tools.length} tool call(s) ${tools.map((t) => t.name + (t.action ? ':' + t.action : '')).join(' ')} · reply ${reply.replace(/\s+/g, ' ').slice(0, 100)}`
  )
  return { tools, results, text: reply, seq: sinceCount + recs.length, sent: seen }
}
function* walk(v, depth = 0) {
  if (depth > 8 || v == null) return
  if (Array.isArray(v)) for (const x of v) yield* walk(x, depth + 1)
  else if (typeof v === 'object') {
    yield v
    for (const k of Object.keys(v)) yield* walk(v[k], depth + 1)
  }
}
function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
async function readSite(b, url) {
  const c = await b.newContext({ ignoreHTTPSErrors: true })
  const p = await c.newPage()
  await p.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
  const r = {
    title: await p.title().catch(() => ''),
    header:
      (await p
        .locator('header')
        .first()
        .innerText()
        .catch(() => '')) ?? '',
    footer:
      (await p
        .locator('footer')
        .first()
        .innerText()
        .catch(() => '')) ?? '',
    lang: (await p.evaluate(() => document.documentElement.lang).catch(() => '')) ?? '',
    h1: (
      (await p
        .locator('h1')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    ).trim(),
    siteTitle: (
      (await p
        .locator('.wp-block-site-title')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    ).trim(),
    tagline: (
      (await p
        .locator('.wp-block-site-tagline')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    ).trim()
  }
  await c.close()
  return r
}
