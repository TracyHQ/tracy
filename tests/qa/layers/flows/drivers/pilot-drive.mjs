// The browser half of the local publish run: drives the REAL screens of a running stand through
// the publish flow and MEASURES each state — chip text, button state, the site's x-robots-tag
// header, the publish flag and the job rows in PostgreSQL. One row per case in the results table,
// one screenshot per state. Imported by publish-pilot.mjs once the stack is up and a site exists.
//
// Every case catches its own failure and records it as FAIL with what was measured; nothing is
// skipped silently — a case that could not run is a FAIL row saying why.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Playwright from the workspace install (it is a dependency of apps/tracy-host), never a fixed path. */
function loadPlaywright(repo) {
  for (const anchor of ['package.json', 'apps/tracy-host/package.json']) {
    try {
      return createRequire(path.join(repo, anchor))('playwright')
    } catch {
      // try the next anchor
    }
  }
  throw new Error(
    'playwright is not installed in this checkout (expected via apps/tracy-host); run pnpm install'
  )
}

/**
 * @param {object} cfg
 * @param {string} cfg.repo - the repository root Playwright is resolved from (its workspace install)
 * @param {string} cfg.cdp @param {string} cfg.origin e.g. http://localhost:52710
 * @param {string} cfg.siteKey @param {string} cfg.label @param {string} cfg.siteUrl
 * @param {{owner: string, editor: string, viewer: string}} cfg.cookies - `tracy_sess=…` header strings
 * @param {string} cfg.pg - the postgres container name
 * @param {string} cfg.stubDir - host dir of the go-live stub's control files
 * @param {() => void} cfg.pauseHost @param {() => void} cfg.unpauseHost
 * @param {() => Promise<void>} cfg.restartHost - restart tracy-host and wait until it answers
 * @param {() => string} cfg.dropHostJobs - delete the host's go-live job records; answers how many
 * @param {(label: string) => Promise<{siteKey: string}>} [cfg.createSite] - build another site (the delete rows)
 * @param {(label: string) => string[]} cfg.siteContainers - container names of a site's compose project
 * @param {string} cfg.outDir
 */
export async function drive(cfg) {
  if (!cfg.stubDir)
    throw new Error(
      'pilot-drive: stubDir is required (the go-live/ingress stubs are not shipped with this layer)'
    )
  const { chromium } = loadPlaywright(cfg.repo)
  const shots = path.join(cfg.outDir, 'shots')
  mkdirSync(shots, { recursive: true })
  // The caller's own array when it gives one: rows measured before a crash are then not lost.
  const rows = cfg.rows ?? []
  let shotNo = 0
  const record = (name, expected, actual, pass) => {
    rows.push({ name, expected, actual: String(actual).replace(/\s+/g, ' ').slice(0, 400), pass })
    console.log(`${pass ? 'PASS' : 'FAIL'} · ${name} · ${String(actual).replace(/\s+/g, ' ').slice(0, 200)}`)
  }
  const S = cfg.siteKey
  const D = '[data-section="domains"]'
  const sel = {
    chip: '.tv-site-head [data-status]',
    publish: `${D} [data-card="primary"] [data-action="live"]`,
    draft: `${D} [data-action="draft"]`,
    working: `${D} [data-working]`,
    failed: `${D} [data-line="failed"]`,
    notice: `${D} [data-line="notice"]`,
    change: `${D} [data-action="change-address"]`,
    form: `${D} form.tv-site-address-form`,
    dialog: '[role="alertdialog"]'
  }

  // ── measuring outside the browser ───────────────────────────────────────────────────────────────
  const sql = (query) => {
    const out = spawnSync(
      'docker',
      ['exec', '-i', cfg.pg, 'psql', '-U', 'tracy', '-d', 'tracy', '-At', '-F', '|', '-c', query],
      {
        encoding: 'utf8',
        timeout: 30_000
      }
    )
    if (out.status !== 0) throw new Error(`psql: ${out.stderr}`)
    return out.stdout.trim()
  }
  const flag = () => sql(`select publish from site where site_key='${S}'`)
  const jobs = () => Number(sql(`select count(*) from job where site_key='${S}' and kind='go-live'`))
  const op = () => sql(`select op, state, coalesce(code,'') from site_publish_op where site_key='${S}'`)
  /** The x-robots-tag header the site sends a stranger, or '' when it sends none. */
  const robots = (siteUrl = cfg.siteUrl) => {
    const url = new URL(siteUrl)
    const out = spawnSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-D',
        '-',
        '-m',
        '30',
        '--resolve',
        `${url.hostname}:${url.port || 80}:127.0.0.1`,
        siteUrl
      ],
      {
        encoding: 'utf8',
        timeout: 40_000
      }
    )
    const line = out.stdout.split(/\r?\n/).find((l) => /^x-robots-tag:/i.test(l))
    const status = /^HTTP\/\S+ (\d+)/.exec(out.stdout)?.[1] ?? '???'
    return `${status} ${line ? line.split(':').slice(1).join(':').trim() : '(none)'}`
  }
  const apiRetries = []
  const api = async (who, method, pathname, body) => {
    const ask = () =>
      fetch(`${cfg.origin}${pathname}`, {
        method,
        headers: {
          cookie: cfg.cookies[who],
          origin: cfg.origin,
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    let res
    try {
      res = await ask()
    } catch (error) {
      // A kept-alive socket the server closed while the driver was busy in the browser: the request
      // never left. Anything else is told with its cause, so a server that went away is not a riddle.
      const code = error.cause?.code ?? ''
      if (!['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(code))
        throw new Error(
          `${method} ${pathname}: ${error.message} (${code || error.cause?.message || 'no cause'})`
        )
      apiRetries.push(`${method} ${pathname} ${code}`)
      console.error(
        `pilot-drive: ${method} ${pathname} asked again after ${code} on a closed kept-alive socket`
      )
      res = await ask().catch((again) => {
        throw new Error(
          `${method} ${pathname}: ${again.message} twice (${code}, then ${again.cause?.code ?? again.cause?.message ?? 'no cause'})`
        )
      })
    }
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const state = async (who = 'owner') => (await api(who, 'GET', `/api/sites/${S}/state`)).body
  const until = async (read, ok, what, ms = 90_000) => {
    const deadline = Date.now() + ms
    let last
    for (;;) {
      last = await read()
      if (ok(last)) return last
      if (Date.now() > deadline)
        throw new Error(`${what}: gave up after ${ms} ms; last ${JSON.stringify(last)}`)
      await sleep(500)
    }
  }
  const settled = (who) =>
    until(
      () => state(who),
      (s) => s?.operation?.state !== 'running',
      'the operation ends',
      120_000
    )
  const stub = (file, value) => writeFileSync(path.join(cfg.stubDir, file), `${value}\n`)
  /** How often the host's go-live script was started for this site, by direction (the stub's own log). */
  const ran = (what) => {
    const file = path.join(cfg.stubDir, 'calls.log')
    if (!existsSync(file)) return 0
    return readTextSync(file)
      .split('\n')
      .filter((line) => line.split(' ')[2] === what).length
  }
  /** The last call the host's go-live script got for this site: "<label> <op> <domains…>". */
  const lastCall = () => {
    const file = path.join(cfg.stubDir, 'calls.log')
    if (!existsSync(file)) return ''
    const line = readTextSync(file).split('\n').filter(Boolean).at(-1) ?? ''
    return line.split(' ').slice(1).join(' ').trim()
  }
  /** Bring the site to `draft` or `published` with no failed operation left showing, through the door. */
  async function ensure(publish) {
    stub('mode', 'ok')
    stub('delay', '1')
    await settled()
    const now = await state()
    if (now.publish !== publish || now.operation !== null) {
      await api('owner', 'POST', `/api/sites/${S}/go-live`, {
        op: publish === 'published' ? 'live' : 'draft'
      })
      await settled()
    }
    const after = await state()
    if (after.publish !== publish)
      throw new Error(`could not bring the site to ${publish}: ${JSON.stringify(after)}`)
  }

  // ── the browser ─────────────────────────────────────────────────────────────────────────────────
  const browser = await chromium.connectOverCDP(cfg.cdp)
  const contexts = []
  async function seat(who, { colorScheme = 'light', reducedMotion = 'no-preference' } = {}) {
    const context = await browser.newContext({
      locale: 'en-US',
      colorScheme,
      reducedMotion,
      viewport: { width: 1500, height: 1000 }
    })
    contexts.push(context)
    const value = cfg.cookies[who].replace(/^tracy_sess=/, '')
    await context.addCookies([{ name: 'tracy_sess', value, url: cfg.origin, httpOnly: true }])
    return context
  }
  /** Open the site's Settings tab the way a person lands on it, optionally at a section. */
  async function openSettings(context, section) {
    const page = await context.newPage()
    await page.goto(`${cfg.origin}/${S}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForFunction(() => /\/s\//.test(location.pathname), null, { timeout: 180_000 })
    const url = new URL(page.url())
    url.searchParams.set('tab', 'tracy:site-settings')
    url.searchParams.set('site', S)
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForSelector('.tv-site-settings', { timeout: 180_000 })
    await page.waitForSelector(sel.chip, { timeout: 60_000 })
    void section
    return page
  }
  const chip = async (page) => (await page.locator(sel.chip).first().innerText()).trim()
  const waitChip = (page, text, ms = 90_000) =>
    page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent.trim() === t, [sel.chip, text], {
      timeout: ms
    })
  const count = (page, selector) => page.locator(selector).count()
  const enabled = async (page, selector) =>
    (await count(page, selector)) === 0
      ? 'absent'
      : (await page.locator(selector).first().isEnabled())
        ? 'enabled'
        : 'disabled'
  const shot = async (page, name, anchor = sel.chip) => {
    shotNo++
    const file = path.join(shots, `${String(shotNo).padStart(2, '0')}-${name}.png`)
    // The whole page: the pane sits beside the chat, and a dialog lives in a portal over both.
    // Not before the app's loading cover has gone: the status chip must be what is drawn at its own
    // place (a dialog's backdrop covers it on purpose, so that case does not wait).
    if ((await page.locator(sel.dialog).count()) === 0)
      await page
        .waitForFunction(
          (s) => {
            const el = document.querySelector(s)
            if (!el) return true
            const box = el.getBoundingClientRect()
            const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            return top !== null && el.contains(top)
          },
          anchor,
          { timeout: 20_000 }
        )
        .catch(() => {})
    await page.screenshot({ path: file })
  }
  const attempt = async (name, expected, fn) => {
    try {
      const { actual, pass } = await fn()
      record(name, expected, actual, pass)
    } catch (error) {
      record(name, expected, `could not be measured: ${error.message}`, false)
      if (String(error.message).startsWith('STOP_HELD')) throw error
    }
  }

  try {
    const owner = await seat('owner')
    // Start from a known state: the site a draft, the host stub answering.
    stub('mode', 'ok')
    stub('delay', '1')
    await settled()
    await ensure('draft')
    stub('mode', 'ok')
    stub('delay', '45')

    // ── 1. draft ──────────────────────────────────────────────────────────────────────────────────
    let page = await openSettings(owner)
    await attempt(
      'draft: chip, address, buttons, header, flag',
      'chip Draft · the site address with a copy button · Publish enabled · Change enabled · x-robots-tag noindex · publish=draft',
      async () => {
        const address = (await page.locator(`${D} [data-address]`).innerText()).trim()
        const copy = await count(page, `${D} [data-card="primary"] [data-copy] button`)
        const actual = `chip ${await chip(page)} · address ${address} · copy buttons ${copy} · Publish ${await enabled(page, sel.publish)} · Change ${await enabled(page, sel.change)} · robots ${robots()} · publish=${flag()}`
        await shot(page, 'draft')
        return {
          actual,
          pass:
            actual ===
            `chip Draft · address ${new URL(cfg.siteUrl).host} · copy buttons 1 · Publish enabled · Change enabled · robots 200 noindex, nofollow · publish=draft`
        }
      }
    )

    await attempt(
      "the state door cannot open the site: publish is go-live's alone",
      '409 PUBLISH_BY_GO_LIVE for published and for draft · publish=draft · no operation started or changed · x-robots-tag still noindex',
      async () => {
        const opBefore = `${op()} ${jobs()}`
        const opened = await api('owner', 'POST', `/api/sites/${S}/state`, { publish: 'published' })
        const covered = await api('owner', 'POST', `/api/sites/${S}/state`, { publish: 'draft' })
        const actual = `${opened.status} ${opened.body?.code} · ${covered.status} ${covered.body?.code} · publish=${flag()} · operation ${`${op()} ${jobs()}` === opBefore ? 'untouched' : 'CHANGED'} · robots ${robots()}`
        return {
          actual,
          pass:
            actual ===
            '409 PUBLISH_BY_GO_LIVE · 409 PUBLISH_BY_GO_LIVE · publish=draft · operation untouched · robots 200 noindex, nofollow'
        }
      }
    )

    await attempt(
      'a request that carries domains at the customer door is refused by name, while draft',
      '400 DOMAINS_NOT_SUPPORTED for a list, an empty list and null, in both directions · no operation · no go-live job · the host script not run · publish=draft',
      async () => {
        const before = `${op()} ${jobs()} ${ran('live')} ${ran('draft')}`
        const answers = []
        for (const body of [
          { op: 'live', domains: ['shop.example.com'] },
          { op: 'live', domains: [] },
          { op: 'live', domains: null },
          { op: 'draft', domains: ['shop.example.com'] }
        ]) {
          const res = await api('owner', 'POST', `/api/sites/${S}/go-live`, body)
          answers.push(`${res.status} ${res.body?.code}`)
        }
        const actual = `${answers.join(' · ')} · ${`${op()} ${jobs()} ${ran('live')} ${ran('draft')}` === before ? 'nothing started' : 'SOMETHING STARTED'} · publish=${flag()}`
        return {
          actual,
          pass:
            actual ===
            '400 DOMAINS_NOT_SUPPORTED · 400 DOMAINS_NOT_SUPPORTED · 400 DOMAINS_NOT_SUPPORTED · 400 DOMAINS_NOT_SUPPORTED · nothing started · publish=draft'
        }
      }
    )

    // ── 2. keyboard: reach Publish by Tab, visible focus, press Enter ───────────────────────────────
    const before = jobs()
    const rowTop = await page.locator(`${D} .tv-domain-row`).first().boundingBox()
    await attempt(
      'keyboard: Publish is reached by Tab and shows a 1px focus stroke, no halo',
      'focused element is the Publish button; focus drawn by a border/outline of 1px; box-shadow spread 0',
      async () => {
        await page.locator(`${D} h2`).first().focus()
        let reached = false
        for (let i = 0; i < 40 && !reached; i++) {
          await page.keyboard.press('Tab')
          reached = await page.evaluate(
            (s) => document.activeElement === document.querySelector(s),
            sel.publish
          )
        }
        const style = await page.evaluate(() => {
          const cs = getComputedStyle(document.activeElement)
          return {
            outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
            border: cs.borderTopWidth,
            shadow: cs.boxShadow
          }
        })
        await shot(page, 'publish-focused')
        const halo = /\d+px \d+px \d+px [2-9]\d*px|0px 0px 0px [2-9]/.test(style.shadow)
        const stroke = style.outline === 'solid 1px' || style.border === '1px'
        return {
          actual: `reached=${reached} outline=${style.outline} border=${style.border} shadow=${style.shadow}`,
          pass: reached && stroke && !halo
        }
      }
    )
    await attempt(
      'publish (Enter on the focused button): running state',
      'chip Publishing… · one spinner line · no Publish button · Change disabled · publish=draft · +1 go-live job · op live|running · the host was sent no domain',
      async () => {
        await page.keyboard.press('Enter')
        await waitChip(page, 'Publishing…', 20_000)
        const line = (await page.locator(sel.working).first().innerText()).trim()
        const spinners = await count(page, `${D} [data-slot="spinner"]`)
        const actual = `chip ${await chip(page)} · line "${line}" · spinners ${spinners} · Publish ${await enabled(page, sel.publish)} · Change ${await enabled(page, sel.change)} · publish=${flag()} · jobs +${jobs() - before} · op ${op()} · host call "${lastCall()}"`
        await shot(page, 'publishing')
        return {
          actual,
          pass:
            actual ===
            `chip Publishing… · line "Publishing… this takes about a minute." · spinners 1 · Publish absent · Change disabled · publish=draft · jobs +1 · op live|running| · host call "${cfg.label} live"`
        }
      }
    )
    await attempt(
      'layout: the address row does not move between draft and publishing',
      'same top and height (±1px)',
      async () => {
        const now = await page.locator(`${D} .tv-domain-row`).first().boundingBox()
        const actual = `draft top=${rowTop.y.toFixed(1)} h=${rowTop.height.toFixed(1)} · publishing top=${now.y.toFixed(1)} h=${now.height.toFixed(1)}`
        return { actual, pass: Math.abs(now.y - rowTop.y) <= 1 && Math.abs(now.height - rowTop.height) <= 1 }
      }
    )
    await attempt(
      'reload while publishing: the running state is recovered',
      'chip Publishing… and the spinner line after a reload; no new job',
      async () => {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForSelector(sel.chip, { timeout: 120_000 })
        const running = op()
        const actual = `op ${running} · chip ${await chip(page)} · working ${await count(page, sel.working)} · Publish ${await enabled(page, sel.publish)} · jobs +${jobs() - before}`
        await shot(page, 'publishing-after-reload')
        return {
          actual,
          pass: actual === 'op live|running| · chip Publishing… · working 1 · Publish absent · jobs +1'
        }
      }
    )
    await attempt(
      'live: chip, button, header, flag',
      'chip Live · Back to draft enabled · no Publish · x-robots-tag absent · publish=published · op live|done',
      async () => {
        await waitChip(page, 'Live', 120_000)
        const actual = `chip ${await chip(page)} · Back ${await enabled(page, sel.draft)} · Publish ${await enabled(page, sel.publish)} · robots ${robots()} · publish=${flag()} · op ${op()}`
        await shot(page, 'live')
        return {
          actual,
          pass:
            actual ===
            'chip Live · Back enabled · Publish absent · robots 200 (none) · publish=published · op live|done|'
        }
      }
    )
    await attempt(
      'the finished provision job is polled again after the site went live',
      'the poll answers; publish stays published, the header stays open, no operation is written — only a go-live takes a site back to draft',
      async () => {
        const id = sql(
          `select id from job where site_key='${S}' and kind='provision' order by created_at limit 1`
        )
        if (!id) throw new Error('no provision job row for the site')
        const opBefore = op()
        const polls = []
        for (let i = 0; i < 2; i++) {
          const res = await api('owner', 'GET', `/api/sites/${S}/jobs/${id}`)
          polls.push(`${res.status} ${res.body?.state}`)
        }
        const actual = `polls ${polls.join(' / ')} · publish=${flag()} · robots ${robots()} · op ${op() === opBefore ? 'unchanged' : 'CHANGED'}`
        return {
          actual,
          pass: actual === 'polls 200 done / 200 done · publish=published · robots 200 (none) · op unchanged'
        }
      }
    )

    await attempt(
      'a request that carries domains at the customer door is refused by name, while live',
      '400 DOMAINS_NOT_SUPPORTED for draft with domains · the site stays live: publish=published, header open, no operation started',
      async () => {
        const before = `${op()} ${jobs()}`
        const res = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'draft', domains: [] })
        const actual = `${res.status} ${res.body?.code} · publish=${flag()} · robots ${robots()} · ${`${op()} ${jobs()}` === before ? 'nothing started' : 'SOMETHING STARTED'}`
        return {
          actual,
          pass:
            actual === '400 DOMAINS_NOT_SUPPORTED · publish=published · robots 200 (none) · nothing started'
        }
      }
    )

    await attempt('reload while live', 'chip Live after a reload', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector(sel.chip, { timeout: 120_000 })
      const actual = `chip ${await chip(page)} · Back ${await enabled(page, sel.draft)}`
      return { actual, pass: actual === 'chip Live · Back enabled' }
    })

    // ── 3. back to draft: cancel once, confirm once ─────────────────────────────────────────────────
    const liveJobs = jobs()
    let dialogBody = ''
    await attempt(
      'back to draft, cancelled',
      'a labelled alertdialog opens with focus on Cancel; after Cancel: chip Live, publish=published, no new job, focus back on the button',
      async () => {
        await page.locator(sel.draft).click()
        await page.waitForSelector(sel.dialog, { timeout: 15_000 })
        const labelled = await page.evaluate((s) => {
          const d = document.querySelector(s)
          return document.getElementById(d.getAttribute('aria-labelledby'))?.textContent ?? ''
        }, sel.dialog)
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
        dialogBody = await page.evaluate((s) => {
          const d = document.querySelector(s)
          return document.getElementById(d.getAttribute('aria-describedby'))?.textContent.trim() ?? ''
        }, sel.dialog)
        await shot(page, 'back-to-draft-dialog')
        await page.locator(`${sel.dialog} button`, { hasText: 'Cancel' }).click()
        await page.waitForSelector(sel.dialog, { state: 'detached', timeout: 15_000 })
        const back = await page
          .waitForFunction((s) => document.activeElement === document.querySelector(s), sel.draft, {
            timeout: 3000
          })
          .then(
            () => true,
            () => false
          )
        const actual = `title "${labelled}" · focus "${focused}" · chip ${await chip(page)} · publish=${flag()} · jobs +${jobs() - liveJobs} · focus back=${back}`
        return {
          actual,
          pass: /^title "Take .+ back to draft\?" · focus "Cancel" · chip Live · publish=published · jobs \+0 · focus back=true$/.test(
            actual
          )
        }
      }
    )
    await attempt(
      'back to draft dialog: the sentence says what really changes',
      'the dialog is described by: "The site is hidden from search engines again and stops sending email. Only people with the link can open it." — nothing about visitors, nothing about a domain',
      async () => {
        const actual = `"${dialogBody}"`
        return {
          actual,
          pass:
            dialogBody ===
              'The site is hidden from search engines again and stops sending email. Only people with the link can open it.' &&
            !/visitors|domain/i.test(dialogBody)
        }
      }
    )
    await attempt(
      'back to draft, confirmed',
      'flag drops at once; chip Draft; header noindex again; +1 job; then Publish is back',
      async () => {
        await page.locator(sel.draft).click()
        await page.waitForSelector(sel.dialog, { timeout: 15_000 })
        await page.locator(`${sel.dialog} [data-confirm="draft"]`).click()
        await waitChip(page, 'Draft', 20_000)
        const during = `working ${await page
          .locator(sel.working)
          .first()
          .getAttribute('data-working')
          .catch(() => 'none')} · publish=${flag()}`
        await shot(page, 'going-back-to-draft')
        await page.waitForSelector(sel.publish, { timeout: 120_000 })
        const actual = `${during} · then chip ${await chip(page)} · Publish ${await enabled(page, sel.publish)} · robots ${robots()} · jobs +${jobs() - liveJobs} · op ${op()}`
        return {
          actual,
          pass:
            actual ===
            'working draft · publish=draft · then chip Draft · Publish enabled · robots 200 noindex, nofollow · jobs +1 · op draft|done|'
        }
      }
    )
    await attempt('publish again', 'chip Live; publish=published', async () => {
      stub('delay', '2')
      await page.locator(sel.publish).click()
      await waitChip(page, 'Live', 120_000)
      const actual = `chip ${await chip(page)} · publish=${flag()} · robots ${robots()}`
      return { actual, pass: actual === 'chip Live · publish=published · robots 200 (none)' }
    })

    // ── 4. publish failing ──────────────────────────────────────────────────────────────────────────
    await ensure('draft')
    stub('mode', 'fail')
    stub('delay', '2')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel.publish, { timeout: 120_000 })
    await attempt(
      'publish failing (the host job exits non-zero)',
      'one destructive line "Couldn\'t publish. The site is still a draft." (role=alert) · button reads Try again · Details opens a reason · chip Draft · publish=draft · op live|failed|JOB_FAILED · no raw host output on screen',
      async () => {
        await page.locator(sel.publish).click()
        await page.waitForSelector(sel.failed, { timeout: 120_000 })
        const line = (await page.locator(`${sel.failed} [role="alert"]`).innerText()).trim()
        const button = (await page.locator(sel.publish).innerText()).trim()
        await page.locator(`${sel.failed} button`, { hasText: 'Details' }).click()
        const details = (await page.locator(`${sel.failed} [data-details]`).innerText()).trim()
        await shot(page, 'failed')
        const leaked = /stub: go-live failed/.test(await page.locator(D).innerText())
        const actual = `line "${line}" · button "${button}" · details "${details.split('\n')[0]}" · chip ${await chip(page)} · publish=${flag()} · op ${op()} · host output shown=${leaked}`
        return {
          actual,
          pass:
            actual ===
            `line "Couldn't publish. The site is still a draft." · button "Try again" · details "The work stopped with an error on the server that runs this site." · chip Draft · publish=draft · op live|failed|JOB_FAILED · host output shown=false`
        }
      }
    )
    await attempt('Try again after a failure', 'a new job; chip Live once the host succeeds', async () => {
      stub('mode', 'ok')
      const n = jobs()
      await page.locator(sel.publish).click()
      await waitChip(page, 'Live', 120_000)
      const actual = `jobs +${jobs() - n} · chip ${await chip(page)} · failure line ${await count(page, sel.failed)}`
      return { actual, pass: actual === 'jobs +1 · chip Live · failure line 0' }
    })

    // ── 4b. the press is taken, the state after it cannot be read ───────────────────────────────────
    await ensure('draft')
    stub('delay', '8')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel.publish, { timeout: 120_000 })
    await attempt(
      'Publish is taken by the server, but the state cannot be read back',
      'while the state door fails: no Publish button on the old reading, the wait is shown, no failure line, exactly one job; once it answers: Publishing… then Live',
      async () => {
        const n = jobs()
        let failedReads = 0
        const blocker = async (route) => {
          if (route.request().method() !== 'GET') return route.continue()
          failedReads++
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"BOOM"}' })
        }
        await page.route('**/api/sites/*/state', blocker)
        await page.locator(sel.publish).click()
        await until(
          async () => jobs() - n,
          (added) => added === 1,
          'the server takes the press',
          30_000
        )
        await sleep(3000)
        const during = `Publish ${await enabled(page, sel.publish)} · working ${await count(page, sel.working)} · failure line ${await count(page, sel.failed)} · failed reads ${failedReads >= 2 ? '≥2' : failedReads} · jobs +${jobs() - n}`
        await shot(page, 'state-unreadable')
        await page.unroute('**/api/sites/*/state', blocker)
        await waitChip(page, 'Live', 120_000)
        const actual = `${during} · then chip ${await chip(page)} · jobs +${jobs() - n} · publish=${flag()}`
        return {
          actual,
          pass:
            actual ===
            'Publish absent · working 1 · failure line 0 · failed reads ≥2 · jobs +1 · then chip Live · jobs +1 · publish=published'
        }
      }
    )

    // ── 5. double click ─────────────────────────────────────────────────────────────────────────────
    await ensure('draft')
    stub('delay', '5')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel.publish, { timeout: 120_000 })
    await attempt(
      'double click on Publish',
      'exactly one new go-live job; one operation row; chip Publishing…',
      async () => {
        const n = jobs()
        await page.locator(sel.publish).dblclick()
        await waitChip(page, 'Publishing…', 20_000)
        await sleep(1500)
        const actual = `jobs +${jobs() - n} · op rows ${sql(`select count(*) from site_publish_op where site_key='${S}'`)} · chip ${await chip(page)}`
        return { actual, pass: actual === 'jobs +1 · op rows 1 · chip Publishing…' }
      }
    )
    await attempt(
      'two requests at the door while a job runs',
      'both refused 409 PUBLISH_BUSY; still one job',
      async () => {
        const n = jobs()
        const [a, b] = await Promise.all([
          api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' }),
          api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'draft' })
        ])
        const actual = `${a.status} ${a.body?.code} · ${b.status} ${b.body?.code} · jobs +${jobs() - n}`
        return { actual, pass: actual === '409 PUBLISH_BUSY · 409 PUBLISH_BUSY · jobs +0' }
      }
    )
    await settled()

    // ── 5b. the host goes silent as Publish is pressed ──────────────────────────────────────────────
    await ensure('draft')
    stub('delay', '3')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel.publish, { timeout: 120_000 })
    await attempt(
      'the host goes silent as Publish is pressed, then answers again',
      'while silent: the operation is kept unconfirmed — the line says the server is being waited for, no failure, no button, no second operation, site still a draft; once the host answers the SAME operation goes on — one job, the host script run once — and the site goes Live',
      async () => {
        const n = jobs()
        const r = ran('live')
        cfg.pauseHost()
        let silent, again
        try {
          await page.locator(sel.publish).click()
          // The door waits 20 s for the host, then says it does not know what became of the request.
          await until(
            () => op(),
            (v) => v === 'live|starting|HOST_UNREACHABLE',
            'the operation reads unconfirmed',
            90_000
          )
          // The press reads the state back once the door has answered (each read asks the silent host again).
          await page.waitForSelector(`${sel.working}[data-confirmed="false"]`, { timeout: 90_000 })
          const line = (await page.locator(sel.working).first().innerText()).trim()
          await shot(page, 'unconfirmed')
          silent = `op ${op()} · chip ${await chip(page)} · line "${line}" · Publish ${await enabled(page, sel.publish)} · failure line ${await count(page, sel.failed)} · jobs +${jobs() - n} · publish=${flag()}`
          again = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'draft' })
        } finally {
          cfg.unpauseHost()
        }
        await waitChip(page, 'Live', 180_000)
        await settled()
        await shot(page, 'host-silent-then-live')
        const actual = `${silent} · other direction ${again.status} ${again.body?.code} · then chip ${await chip(page)} · jobs +${jobs() - n} · host script +${ran('live') - r} · op ${op()} · publish=${flag()}`
        return {
          actual,
          pass:
            actual ===
            'op live|starting|HOST_UNREACHABLE · chip Publishing… · line "Waiting for the server that runs this site to confirm. Nothing else can be started until it answers." · Publish absent · failure line 0 · jobs +0 · publish=draft · other direction 409 PUBLISH_BUSY · then chip Live · jobs +1 · host script +1 · op live|done| · publish=published'
        }
      }
    )

    // ── 5c. the host loses the job: no record, a restart, a locked site ─────────────────────────────
    await ensure('draft')
    await attempt(
      'the host has NO RECORD of the running job any more (its job records are deleted under it)',
      'never "failed": the operation stays held (running), the host is asked for the SAME operation again and runs it again under the same job id; it ends done and the site goes Live — one operation, one job row, no second reservation',
      async () => {
        stub('delay', '12')
        const n = jobs()
        const r = ran('live')
        const pressed = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
        const ref = sql(`select ref from site_publish_op where site_key='${S}'`)
        await sleep(1500)
        const dropped = cfg.dropHostJobs()
        // Every read of the state asks the host; the first one after the record is gone asks for the same operation again.
        const after = await state()
        const busyAgain = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
        const ended = await settled()
        const actual = `press ${pressed.status} · records deleted ${dropped} · read ${after.operation?.state}/${after.publish} · second press ${busyAgain.status} ${busyAgain.body?.code} · ended publish=${ended.publish} operation=${ended.operation?.state ?? 'none'} · same ref=${sql(`select ref from site_publish_op where site_key='${S}'`) === ref} · job rows +${jobs() - n} · host script +${ran('live') - r} · op ${op()} · robots ${robots()}`
        return {
          actual,
          pass: /^press 202 · records deleted [1-9]\d* · read running\/draft · second press 409 PUBLISH_BUSY · ended publish=published operation=none · same ref=true · job rows \+1 · host script \+[12] · op live\|done\| · robots 200 \(none\)$/.test(
            actual
          )
        }
      }
    )
    await ensure('draft')
    await attempt(
      'tracy-host is RESTARTED under a running publish (it marks the job failed as orphaned at boot)',
      'never "failed" from the restart: the operation stays held, is asked for again under the same key once the host is back, and ends on the real outcome — Live',
      async () => {
        stub('delay', '15')
        const n = jobs()
        const pressed = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
        const ref = sql(`select ref from site_publish_op where site_key='${S}'`)
        await sleep(2000)
        stub('delay', '2')
        await cfg.restartHost()
        const first = await state()
        const ended = await settled()
        const actual = `press ${pressed.status} · first read after the restart ${first.operation?.state ?? 'none'}/${first.publish} · ended publish=${ended.publish} operation=${ended.operation?.state ?? 'none'} · same ref=${sql(`select ref from site_publish_op where site_key='${S}'`) === ref} · job rows +${jobs() - n} · op ${op()}`
        return {
          actual,
          pass: /^press 202 · first read after the restart (running\/draft|none\/published) · ended publish=published operation=none · same ref=true · job rows \+1 · op live\|done\|$/.test(
            actual
          )
        }
      }
    )
    await ensure('draft')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel.publish, { timeout: 120_000 })
    await attempt(
      'the host script finds the site LOCKED by an earlier run (exit 75)',
      '"locked" is still running, not an outcome: no failure line, the operation stays held while the lock is held and the host is asked again; once it is free the same operation is run again and the site goes Live',
      async () => {
        stub('mode', 'busy')
        stub('delay', '1')
        const n = jobs()
        const r = ran('live')
        await page.locator(sel.publish).click()
        // The job ends on the host with exit 75; the next reads keep the operation and ask again.
        await until(
          () => ran('live') - r,
          (runs) => runs >= 2,
          'the host is asked again while locked',
          60_000
        )
        const held = await state()
        const during = `runs while locked ≥2 · operation ${held.operation?.state} · publish=${held.publish} · failure line ${await count(page, sel.failed)} · Publish ${await enabled(page, sel.publish)} · op state ${sql(`select state from site_publish_op where site_key='${S}'`)}`
        await shot(page, 'locked-still-running')
        stub('mode', 'ok')
        await waitChip(page, 'Live', 120_000)
        await settled()
        const actual = `${during} · then chip ${await chip(page)} · job rows +${jobs() - n} · op ${op()} · publish=${flag()}`
        return {
          actual,
          pass:
            actual ===
            'runs while locked ≥2 · operation running · publish=draft · failure line 0 · Publish absent · op state running · then chip Live · job rows +1 · op live|done| · publish=published'
        }
      }
    )
    stub('mode', 'ok')

    // ── 6. two tabs ─────────────────────────────────────────────────────────────────────────────────
    await ensure('draft')
    stub('delay', '8')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel.publish, { timeout: 120_000 })
    const second = await openSettings(owner)
    await attempt(
      "two tabs: the second tab presses Publish while the first tab's publish runs",
      'one job; the second tab says calmly (role=status) that it is already being published and shows Publishing…; no alert',
      async () => {
        const n = jobs()
        await second.waitForSelector(sel.publish, { timeout: 60_000 })
        await page.locator(sel.publish).click()
        await waitChip(page, 'Publishing…', 20_000)
        // The second tab was not looked at since: it still shows its button.
        const stale = await enabled(second, sel.publish)
        await second.locator(sel.publish).click()
        await second.waitForSelector(sel.notice, { timeout: 20_000 })
        const role = await second.locator(sel.notice).first().getAttribute('role')
        const said = (await second.locator(sel.notice).first().innerText()).trim()
        await shot(second, 'second-tab-busy')
        const actual = `second tab button was ${stale} · jobs +${jobs() - n} · role=${role} · "${said}" · chip ${await chip(second)} · alerts ${await count(second, `${D} [role="alert"]`)}`
        return {
          actual,
          pass:
            actual ===
            'second tab button was enabled · jobs +1 · role=status · "This site is already being published or taken back to draft. Nothing new was started." · chip Publishing… · alerts 0'
        }
      }
    )
    await attempt(
      'two tabs: a tab opened while a publish runs, and both follow it to Live',
      'a newly opened tab shows Publishing…; both tabs end on Live',
      async () => {
        const third = await openSettings(owner)
        const opened = await chip(third)
        await waitChip(page, 'Live', 120_000)
        await waitChip(second, 'Live', 120_000)
        await waitChip(third, 'Live', 120_000)
        const actual = `opened on ${opened} · ${await chip(page)} / ${await chip(second)} / ${await chip(third)}`
        await third.close()
        return { actual, pass: actual === 'opened on Publishing… · Live / Live / Live' }
      }
    )
    await second.close()

    // ── 7. the address form this tab always had: rename the Tracy address, while live and while draft ──
    const ORIGINAL = new URL(cfg.siteUrl).hostname
    const RENAMED = ORIGINAL.replace(/^[^.]+/, `${cfg.label}b`)
    const urlOf = (host) => cfg.siteUrl.replace(ORIGINAL, host)
    const renameThroughTheForm = async (to) => {
      const p = await openSettings(owner)
      await p.locator(sel.change).click()
      await p.waitForSelector(sel.form, { timeout: 15_000 })
      await p.locator(`${sel.form} input`).fill(to)
      await p.locator(`${sel.form} button`, { hasText: 'Check availability' }).click()
      await p.waitForFunction(
        (s) => /is available/.test(document.querySelector(s)?.textContent ?? ''),
        sel.form,
        { timeout: 60_000 }
      )
      await shot(p, `change-address-${to === RENAMED ? 'live' : 'draft'}`, sel.form)
      await p.locator(`${sel.form} button[type="submit"]`).click()
      // The page URL names the site key, which does not change with the address: wait on what the
      // card shows instead. The page may reload under the wait, so a destroyed context is retried.
      const wanted = new URL(urlOf(to)).host
      const until = Date.now() + 240_000
      for (;;) {
        const shown = await p
          .locator(`${D} [data-address]`)
          .innerText({ timeout: 2_000 })
          .then(
            (t) => t.trim(),
            () => null
          )
        if (shown === wanted) break
        if (Date.now() > until) throw new Error(`the card still shows ${shown} after 240s, not ${wanted}`)
        await new Promise((r) => setTimeout(r, 500))
      }
      await p.waitForSelector(sel.chip, { timeout: 180_000 })
      const seen = `chip ${await chip(p)} · address ${(await p.locator(`${D} [data-address]`).innerText()).trim()}`
      await p.close()
      return seen
    }
    await ensure('published')
    await attempt(
      'rename the Tracy address while the site is LIVE (the form under the card: Change → Check availability → Save)',
      'the page lands on the new address; chip still Live; the new address answers with no noindex; publish=published; no publish operation started by the rename',
      async () => {
        const before = `${op()} ${jobs()}`
        const seen = await renameThroughTheForm(RENAMED)
        const row = sql(`select address, primary_name, publish from site where site_key='${S}'`)
        const actual = `${seen} · site row ${row} · new address ${robots(urlOf(RENAMED))} · ${`${op()} ${jobs()}` === before ? 'no publish operation' : 'A PUBLISH OPERATION'}`
        return {
          actual,
          pass:
            actual ===
            `chip Live · address ${new URL(urlOf(RENAMED)).host} · site row ${urlOf(RENAMED)}|${RENAMED}|published · new address 200 (none) · no publish operation`
        }
      }
    )
    await attempt(
      'back to draft and publish again at the renamed address',
      'both operations end done; the renamed address is covered, then open',
      async () => {
        stub('delay', '1')
        const down = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'draft' })
        await settled()
        const covered = `${flag()} ${robots(urlOf(RENAMED))}`
        const up = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
        await settled()
        const actual = `${down.status} → ${covered} · ${up.status} → ${flag()} ${robots(urlOf(RENAMED))}`
        return { actual, pass: actual === '202 → draft 200 noindex, nofollow · 202 → published 200 (none)' }
      }
    )
    await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'draft' })
    await settled()
    await attempt(
      'rename the Tracy address back while the site is a DRAFT',
      'the page lands on the original address; chip still Draft; the address answers noindex; publish=draft',
      async () => {
        const seen = await renameThroughTheForm(ORIGINAL)
        const row = sql(`select address, primary_name, publish from site where site_key='${S}'`)
        const actual = `${seen} · site row ${row} · address ${robots()}`
        return {
          actual,
          pass:
            actual ===
            `chip Draft · address ${new URL(cfg.siteUrl).host} · site row ${cfg.siteUrl}|${ORIGINAL}|draft · address 200 noindex, nofollow`
        }
      }
    )
    await page.close()
    page = await openSettings(owner)

    // ── 9. roles ────────────────────────────────────────────────────────────────────────────────────
    await ensure('draft')
    const viewer = await seat('viewer')
    const viewerPage = await openSettings(viewer)
    await attempt(
      'Viewer seat',
      'chip Draft; no Publish, no Back to draft, no Change; the sentence that says who can publish; the door refuses 403 NOT_SITE_EDITOR',
      async () => {
        const refused = await api('viewer', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
        const sentence = (await viewerPage.locator(`${D} [data-line="role"]`).innerText()).trim()
        const buttons = await viewerPage.evaluate(
          (s) =>
            [...document.querySelectorAll(`${s} [data-action]`)]
              .map((b) => b.getAttribute('data-action'))
              .join(','),
          D
        )
        await shot(viewerPage, 'viewer')
        const actual = `chip ${await chip(viewerPage)} · actions [${buttons}] · "${sentence}" · door ${refused.status} ${refused.body?.code} · publish=${flag()}`
        return {
          actual,
          pass:
            actual ===
            'chip Draft · actions [] · "Only an Owner or an Editor can publish this site. Ask one of them to publish it." · door 403 NOT_SITE_EDITOR · publish=draft'
        }
      }
    )
    await viewerPage.close()
    const editor = await seat('editor')
    const editorPage = await openSettings(editor)
    await attempt(
      'Editor seat',
      "Publish enabled; no Change (the address is the Owner's); the address door refuses 403 NOT_SITE_OWNER; publishing works",
      async () => {
        const refused = await api('editor', 'PUT', `/api/sites/${S}/address`, {
          name: `editor-try.${ORIGINAL.split('.').slice(1).join('.')}`
        })
        const beforeState = `Publish ${await enabled(editorPage, sel.publish)} · Change ${await enabled(editorPage, sel.change)}`
        await shot(editorPage, 'editor')
        stub('delay', '2')
        await editorPage.locator(sel.publish).click()
        await waitChip(editorPage, 'Live', 120_000)
        const actual = `${beforeState} · address door ${refused.status} ${refused.body?.code} · then chip ${await chip(editorPage)} · Back ${await enabled(editorPage, sel.draft)} · publish=${flag()}`
        return {
          actual,
          pass:
            actual ===
            'Publish enabled · Change absent · address door 403 NOT_SITE_OWNER · then chip Live · Back enabled · publish=published'
        }
      }
    )
    await editorPage.close()

    // ── 10. My Sites ────────────────────────────────────────────────────────────────────────────────
    await attempt(
      'My Sites: the row chip and the menu line',
      'row chip Live; the menu has "Domains" (the site is live); pressing it opens Settings with the Domains heading focused',
      async () => {
        const list = await owner.newPage()
        await list.goto(page.url().replace(/tab=[^&]+/, 'tab=tracy:my-sites'), {
          waitUntil: 'domcontentloaded',
          timeout: 120_000
        })
        await list.waitForSelector('.tracy-mysites-site-line', { timeout: 180_000 })
        const row = list
          .locator('tr', { has: list.locator(`.tracy-mysites-site-name[title="${S}"]`) })
          .first()
        const rowChip = (await row.locator('[data-status]').innerText()).trim()
        await shot(list, 'my-sites', `.tracy-mysites-site-name[title="${S}"]`)
        await row.locator('button[aria-label="More"]').click()
        const item = list.locator('[role="menuitem"]', { hasText: /^(Publish…|Domains)$/ })
        const label = (await item.innerText()).trim()
        await item.click()
        await list.waitForSelector(`${D} h2`, { timeout: 60_000 })
        await sleep(500)
        const focused = await list.evaluate(() => document.activeElement?.textContent?.trim())
        const actual = `row chip ${rowChip} · menu "${label}" · focus "${focused}"`
        await list.close()
        return { actual, pass: actual === 'row chip Live · menu "Domains" · focus "Domains"' }
      }
    )

    await attempt(
      'My Sites left open in another tab while the site is taken back to draft elsewhere',
      'the row chip reads Live, then Draft once the tab is looked at again (window focus), with no reload',
      async () => {
        const list = await owner.newPage()
        await list.goto(page.url().replace(/tab=[^&]+/, 'tab=tracy:my-sites'), {
          waitUntil: 'domcontentloaded',
          timeout: 120_000
        })
        await list.waitForSelector('.tracy-mysites-site-line', { timeout: 180_000 })
        const rowChip = () =>
          list
            .locator('tr', { has: list.locator(`.tracy-mysites-site-name[title="${S}"]`) })
            .first()
            .locator('[data-status]')
            .innerText()
        const first = (await rowChip()).trim()
        // Elsewhere: through the door, as another browser tab's Settings would.
        await ensure('draft')
        await sleep(1500)
        const unseen = (await rowChip()).trim()
        const loads = await list.evaluate(() => performance.getEntriesByType('navigation').length)
        await list.evaluate(() => window.dispatchEvent(new Event('focus')))
        await list.waitForFunction(
          (name) =>
            [...document.querySelectorAll('tr')]
              .find((tr) => tr.querySelector(`.tracy-mysites-site-name[title="${name}"]`))
              ?.querySelector('[data-status]')
              ?.textContent.trim() === 'Draft',
          S,
          { timeout: 30_000 }
        )
        const actual = `row chip ${first} · before it is looked at ${unseen} · after focus ${(await rowChip()).trim()} · page loads ${loads}`
        await list.close()
        return {
          actual,
          pass: actual === 'row chip Live · before it is looked at Live · after focus Draft · page loads 1'
        }
      }
    )

    // (clarification 3, added by hand after `assemble-driver.py`: re-running the assembler drops it —
    // the block is kept in work/driver-clar3-mysites.txt.)
    await attempt(
      'My Sites while a publish runs',
      'the row chip reads Publishing… and the menu offers "Domains", not "Publish…", while the host works; Live with no reload once the job ended and the tab is looked at again',
      async () => {
        await ensure('draft')
        const list = await owner.newPage()
        await list.goto(page.url().replace(/tab=[^&]+/, 'tab=tracy:my-sites'), {
          waitUntil: 'domcontentloaded',
          timeout: 120_000
        })
        await list.waitForSelector('.tracy-mysites-site-line', { timeout: 180_000 })
        const row = list
          .locator('tr', { has: list.locator(`.tracy-mysites-site-name[title="${S}"]`) })
          .first()
        const rowChip = async () => (await row.locator('[data-status]').innerText()).trim()
        const before = await rowChip()
        stub('mode', 'ok')
        stub('delay', '20')
        const pressed = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
        const listed = (await api('owner', 'GET', '/api/sites')).body.sites.find((site) => site.siteKey === S)
        await list.evaluate(() => window.dispatchEvent(new Event('focus')))
        await list.waitForFunction(
          (name) =>
            [...document.querySelectorAll('tr')]
              .find((tr) => tr.querySelector(`.tracy-mysites-site-name[title="${name}"]`))
              ?.querySelector('[data-status]')
              ?.textContent.trim() === 'Publishing…',
          S,
          { timeout: 15_000 }
        )
        const during = await rowChip()
        await shot(list, 'my-sites-publishing', `.tracy-mysites-site-name[title="${S}"]`)
        await row.locator('button[aria-label="More"]').click()
        const lines = (await list.locator('[role="menuitem"]').allInnerTexts()).map((text) => text.trim())
        await list.keyboard.press('Escape')
        await settled('owner')
        stub('delay', '1')
        const loads = await list.evaluate(() => performance.getEntriesByType('navigation').length)
        await list.evaluate(() => window.dispatchEvent(new Event('focus')))
        await list.waitForFunction(
          (name) =>
            [...document.querySelectorAll('tr')]
              .find((tr) => tr.querySelector(`.tracy-mysites-site-name[title="${name}"]`))
              ?.querySelector('[data-status]')
              ?.textContent.trim() === 'Live',
          S,
          { timeout: 30_000 }
        )
        const actual = `row chip ${before} · press ${pressed.status} · list says publish=${listed?.publish} publishing=${listed?.publishing} · row chip ${during} · menu Publish… ${lines.includes('Publish…')} Domains ${lines.includes('Domains')} · then ${await rowChip()} · page loads ${loads}`
        await list.close()
        return {
          actual,
          pass:
            actual ===
            'row chip Draft · press 202 · list says publish=draft publishing=live · row chip Publishing… · menu Publish… false Domains true · then Live · page loads 1'
        }
      }
    )

    // ── 11. dark, reduced motion, 420 and 760 ───────────────────────────────────────────────────────
    await ensure('draft')
    const measure = (p, width) =>
      p.evaluate(
        ([w, d]) => {
          const frame = document.querySelector('.tracy-site-tabs.tv-site-tabs-frame')
          frame.style.width = `${w}px`
          frame.style.maxWidth = `${w}px`
          const section = document.querySelector(d)
          const out = [...section.querySelectorAll('*')].filter(
            (el) =>
              el.getBoundingClientRect().right > frame.getBoundingClientRect().right + 1 &&
              !el.closest('.tv-host')
          )
          return {
            overflow: frame.scrollWidth - frame.clientWidth,
            sticking: out.length,
            bg: getComputedStyle(section.querySelector('.tv-domain-card')).backgroundColor,
            fg: getComputedStyle(section).color
          }
        },
        [width, D]
      )
    for (const colorScheme of ['light', 'dark']) {
      const context = await seat('owner', {
        colorScheme,
        reducedMotion: colorScheme === 'dark' ? 'reduce' : 'no-preference'
      })
      const p = await openSettings(context)
      if (colorScheme === 'dark')
        await p.evaluate(() => document.documentElement.setAttribute('data-ds-dark-theme', ''))
      for (const width of [420, 760]) {
        await attempt(
          `${colorScheme}, side card ${width}px: nothing sticks out of the pane`,
          'the Domains card on screen; horizontal overflow 0px; 0 elements past the right edge',
          async () => {
            const m = await measure(p, width)
            m.cards = await count(p, `${D} [data-card="primary"]`)
            await shot(p, `${colorScheme}-${width}`)
            return {
              actual: `cards ${m.cards} · overflow ${m.overflow}px · ${m.sticking} elements past the edge · card ${m.bg} · text ${m.fg}`,
              pass: m.cards === 1 && m.overflow <= 0 && m.sticking === 0
            }
          }
        )
        if (colorScheme === 'light') {
          await attempt(
            `side card ${width}px: the site address is whole on a line of its own`,
            width === 760
              ? 'the address is drawn on one line, not broken; the actions fit beside it'
              : 'the address is drawn on one line, not broken, with nothing but its copy button beside it; Change and Publish are on the next line',
            async () => {
              const m = await p.evaluate((d) => {
                const card = document.querySelector(`${d} [data-card="primary"]`)
                const address = card.querySelector('[data-address]')
                const pieces = [...address.querySelectorAll('.tv-nowrap')].map((el) =>
                  Math.round(el.getBoundingClientRect().top)
                )
                const box = card.querySelector('.tv-domain-address').getBoundingClientRect()
                const actions = card.querySelector('[data-actions]').getBoundingClientRect()
                const change = card.querySelector('[data-action="change-address"]').getBoundingClientRect()
                const publish = card.querySelector('[data-action="live"]').getBoundingClientRect()
                return {
                  lines: new Set(pieces).size,
                  scroll: address.scrollWidth - address.clientWidth,
                  below: actions.top >= box.bottom - 1,
                  beside: actions.top < box.bottom && actions.bottom > box.top,
                  sameLine:
                    Math.abs((change.top + change.bottom) / 2 - (publish.top + publish.bottom) / 2) <= 1,
                  text: address.textContent
                }
              }, D)
              const actual = `"${m.text}" on ${m.lines} line(s) · hidden overflow ${m.scroll}px · actions ${m.below ? 'on the next line' : m.beside ? 'beside it' : 'elsewhere'} · Change and Publish on one line=${m.sameLine}`
              return {
                actual,
                pass: m.lines === 1 && m.scroll <= 0 && m.sameLine && (width === 760 ? m.beside : m.below)
              }
            }
          )
        }
      }
      if (colorScheme === 'dark') {
        await attempt(
          'dark: the card and its text are drawn from the dark tokens',
          'card background darker than its text',
          async () => {
            const m = await measure(p, 420)
            const lum = (c) => {
              const n = (c.match(/[\d.]+/g) ?? []).map(Number)
              return /oklab|oklch|lab|lch/.test(c)
                ? n[0] * (n[0] > 1 ? 1 : 100)
                : (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 2.55
            }
            return {
              actual: `card ${m.bg} (L≈${lum(m.bg).toFixed(0)}) · text ${m.fg} (L≈${lum(m.fg).toFixed(0)})`,
              pass: lum(m.bg) < lum(m.fg)
            }
          }
        )
        await attempt(
          'reduced motion: the spinner of a running publish does not turn',
          'animation-name none on the spinner and on the pulsing dot',
          async () => {
            stub('delay', '6')
            await p.locator(sel.publish).click()
            await p.waitForSelector(`${D} [data-slot="spinner"]`, { timeout: 20_000 })
            const anim = await p.evaluate((d) => {
              const spinner = getComputedStyle(
                document.querySelector(`${d} [data-slot="spinner"]`)
              ).animationName
              const dot = getComputedStyle(
                document.querySelector('.tv-site-head .tv-status-dot')
              ).animationName
              return `spinner ${spinner} · dot ${dot}`
            }, D)
            await shot(p, 'dark-publishing-reduced-motion')
            await settled()
            return { actual: anim, pass: anim === 'spinner none · dot none' }
          }
        )
      }
      await p.close()
    }
    await settled()
    await attempt('with motion allowed, the spinner turns', 'animation-name is not none', async () => {
      await ensure('draft')
      stub('delay', '5')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector(sel.publish, { timeout: 120_000 })
      await page.locator(sel.publish).click()
      await page.waitForSelector(`${D} [data-slot="spinner"]`, { timeout: 20_000 })
      const anim = await page.evaluate(
        (d) => getComputedStyle(document.querySelector(`${d} [data-slot="spinner"]`)).animationName,
        D
      )
      await settled()
      return { actual: `spinner ${anim}`, pass: anim !== 'none' && anim !== '' }
    })

    // ── 12. clipboard ───────────────────────────────────────────────────────────────────────────────
    await attempt(
      'copy address: a browser that refuses the clipboard is told as a refusal',
      '"Could not copy. Select the text and copy it yourself." and no "Copied"',
      async () => {
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: () => Promise.reject(new Error('NotAllowedError')) }
          })
        })
        await page.locator(`${D} [data-card="primary"] [data-copy] button`).click()
        await page.waitForSelector(`${D} [data-line="copy-refused"]`, { timeout: 10_000 })
        const actual = `"${(await page.locator(`${D} [data-line="copy-refused"]`).innerText()).trim()}" · said "${(await page.locator(`${D} [data-card="primary"] [data-copied]`).innerText()).trim()}"`
        return {
          actual,
          pass: actual === '"Could not copy. Select the text and copy it yourself." · said ""'
        }
      }
    )
    await ensure('draft')

    // ── 13. deleting a draft site, and a live site ──────────────────────────────────────────────────
    // Last, and only in the final run: it ends with no site left.
    if (cfg.deleteSite) {
      const gone = (key, label) =>
        `site rows ${sql(`select count(*) from site where site_key='${key}'`)} · operation rows ${sql(`select count(*) from site_publish_op where site_key='${key}'`)} · live seats ${sql(`select count(*) from seat where site_key='${key}' and revoked_at is null`)} · site containers ${cfg.siteContainers(label).length}`
      await ensure('draft')
      await page.close().catch(() => {})
      await attempt(
        'delete a DRAFT site through the customer door',
        "the door answers 200; the site row, its publish operation row and its seats are gone; the site's containers are gone; its address no longer answers 200",
        async () => {
          const had = sql(`select count(*) from site_publish_op where site_key='${S}'`)
          const res = await api('owner', 'DELETE', `/api/sites/${S}`)
          await until(
            () => cfg.siteContainers(cfg.label).length,
            (left) => left === 0,
            'the site containers go',
            180_000
          )
          const actual = `operation rows before ${had} · ${res.status} ${JSON.stringify(res.body).slice(0, 160)} · ${gone(S, cfg.label)} · address ${robots().split(' ')[0]}`
          return {
            actual,
            pass:
              res.status === 200 &&
              had === '1' &&
              / · site rows 0 · operation rows 0 · live seats 0 · site containers 0 · address (404|502|503|000|\?\?\?)$/.test(
                actual
              )
          }
        }
      )
      await attempt(
        'delete a LIVE site through the customer door (the same label, built again and published for this row)',
        "the deleted site's provision job row is removed BY HAND (develop's create door refuses an address that still has one), then the site is built again through POST /api/sites under a build id of its own, published through the door (Live, header open), then deleted: the door answers 200; its row, its operation row and its seats are gone; its containers are gone",
        async () => {
          // develop keeps the deleted site's `provision` job row, and its create door refuses an address
          // that has one (TAKEN). Not this change's to fix: the row is removed by hand here, and said so.
          const cleared = sql(
            `with gone as (delete from job where site_key='${S}' and kind='provision' returning 1) select count(*) from gone`
          )
          const made = await cfg.createSite(cfg.label)
          if (made.siteKey !== S) throw new Error(`the site built again has another key: ${made.siteKey}`)
          stub('mode', 'ok')
          stub('delay', '1')
          const pressed = await api('owner', 'POST', `/api/sites/${S}/go-live`, { op: 'live' })
          const live = await settled()
          const open = robots()
          const res = await api('owner', 'DELETE', `/api/sites/${S}`)
          await until(
            () => cfg.siteContainers(cfg.label).length,
            (left) => left === 0,
            'the site containers go',
            180_000
          )
          const actual = `old provision job rows removed by hand ${cleared} · built again ${made.siteKey} · publish ${pressed.status} → ${live.publish} · header ${open} · delete ${res.status} ${JSON.stringify(res.body).slice(0, 160)} · ${gone(S, cfg.label)}`
          return {
            actual,
            pass:
              pressed.status === 202 &&
              live.publish === 'published' &&
              open === '200 (none)' &&
              res.status === 200 &&
              actual.endsWith(' · site rows 0 · operation rows 0 · live seats 0 · site containers 0')
          }
        }
      )
    }
  } finally {
    for (const context of contexts) await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
  return rows
}

/** The results table: case · expected · actual · PASS/FAIL. */
export function table(rows, notes) {
  const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [
    '# Local run — publish flow',
    '',
    ...notes,
    '',
    '| case | expected | actual | result |',
    '|---|---|---|---|',
    ...rows.map(
      (row) =>
        `| ${cell(row.name)} | ${cell(row.expected)} | ${cell(row.actual)} | ${row.pass ? 'PASS' : 'FAIL'} |`
    ),
    ''
  ].join('\n')
}
