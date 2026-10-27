/**
 * REG-PR-1139 — the desktop app's first-run screen, end to end in the app from source.
 *
 * Launches the app (test/e2e/launch.mjs) on a running stand with TRACY_DESKTOP_ONBOARDING=again,
 * signs in with a session cookie minted from the stand web container's SESSION_SECRET, then walks the
 * three steps through the DOM and the preload bridge: the dialog and its three step buttons; step 1's
 * cards against `GET /api/desktop/config` `catalogue` and `agents.detect`; Dark / System / Light on
 * step 2; the test notification on step 3 (read back through `notifications.status()`, never a
 * banner); Done → preferences.json and Settings › AI accounts on the picked row; a relaunch of the same
 * profile without the variable shows nothing; Help › Getting started (the real menu item, clicked
 * from the main process) brings it back.
 *
 * Selectors are the ones both layouts have (`[data-tracy-onboard]`, `[data-agent]`, `[data-action]`,
 * `[data-theme-pick]`); the step buttons branch: `[data-rail-step]` (setup rail) or `.tv-ob-bar`
 * (one column). REG_EVIDENCE_OUT (env, optional) is a folder for steps.log, config.json, detect.json,
 * console-errors.json and one PNG per step. The stand is only read; the profile is a fresh one.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, ROOT } from './lib.mjs'

const STAND = (process.env.REG_STAND_URL ?? 'http://oa.tracy.test:44080').replace(/\/$/, '')
const EMAIL = process.env.REG_ONBOARD_EMAIL ?? 'ceo@tracy.ai'
const PICK = 'codex'
const OUT = process.env.REG_EVIDENCE_OUT ? resolve(process.env.REG_EVIDENCE_OUT) : null
if (OUT) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'steps.log'), `# ${new Date().toISOString()} stand ${STAND}\n`)
}

// Every check also goes to steps.log as PASS/FAIL.
const base = checks()
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
const c = {
  check(label, pass, got) {
    if (OUT)
      appendFileSync(
        join(OUT, 'steps.log'),
        `${pass ? 'PASS' : 'FAIL'} ${label}${pass ? '' : ` — got ${show(got)}`}\n`
      )
    return base.check(label, pass, got)
  },
  eq(label, got, want) {
    return c.check(`${label} = ${show(want)}`, got === want, got)
  },
  done: base.done
}
const save = (name, value) => OUT && writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`)

// --- What the machine needs -------------------------------------------------------------------
const launcher = join(ROOT, 'packages/desktop/tracy-desktop/test/e2e/launch.mjs')
if (!existsSync(launcher)) cannotRun(`no launcher at ${launcher}`)
let config
try {
  const r = await fetch(`${STAND}/api/desktop/config`)
  if (!r.ok) cannotRun(`${STAND}/api/desktop/config answers ${r.status}`)
  config = await r.json()
} catch (error) {
  cannotRun(`stand ${STAND} is not reachable (${error.message})`)
}
save('config.json', config)
const port = new URL(STAND).port || '80'
const ps = spawnSync('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}'], {
  encoding: 'utf8'
})
const web = (ps.stdout ?? '').split('\n').find((n) => /tracy-web/.test(n))
if (!web) cannotRun(`no tracy-web container publishes port ${port}`)
const envs = spawnSync('docker', ['inspect', web, '--format', '{{range .Config.Env}}{{println .}}{{end}}'], {
  encoding: 'utf8'
}).stdout
const secret = envs
  .split('\n')
  .find((l) => l.startsWith('SESSION_SECRET='))
  ?.slice('SESSION_SECRET='.length)
const domain = envs
  .split('\n')
  .find((l) => l.startsWith('SESSION_DOMAIN='))
  ?.slice('SESSION_DOMAIN='.length)
if (!secret) cannotRun(`${web} has no SESSION_SECRET`)
const { mintSession } = await import(pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/session.js')).href)
const cookie = await mintSession(EMAIL, secret)
const { launchFromSource } = await import(pathToFileURL(launcher).href)

// --- Helpers ----------------------------------------------------------------------------------
const errors = []
async function open(env) {
  const launched = await launchFromSource({ origin: STAND, env, instance: open.instance })
  open.instance = launched.instance
  const { window } = launched
  const phase = env.TRACY_DESKTOP_ONBOARDING ? 'first-launch' : 'relaunch'
  window.on('console', (m) => {
    if (m.type() === 'error') errors.push({ phase: open.phase ?? phase, text: m.text().slice(0, 400) })
  })
  window.on('pageerror', (e) =>
    errors.push({ phase: open.phase ?? phase, text: `pageerror: ${String(e).slice(0, 400)}` })
  )
  await window.waitForLoadState('domcontentloaded')
  await window.context().addCookies([
    {
      name: 'tracy_sess',
      value: cookie,
      domain: `.${domain ?? new URL(STAND).hostname}`,
      path: '/',
      httpOnly: true
    }
  ])
  await window.goto(`${STAND}/`)
  await window.waitForLoadState('domcontentloaded')
  return launched
}
/** Poll `fn` in the page until it returns a truthy value or `ms` passes. */
async function until(window, fn, arg, ms = 30_000) {
  try {
    return await (await window.waitForFunction(fn, arg, { timeout: ms, polling: 250 })).jsonValue()
  } catch {
    return null
  }
}
const shot = async (window, name) => OUT && (await window.screenshot({ path: join(OUT, name) }))
const stepIndex = (window) =>
  window.evaluate(
    () => document.querySelector('[data-tracy-onboard]')?.getAttribute('data-step-index') ?? null
  )
const click = (window, selector) => window.locator(`[data-tracy-onboard] ${selector}`).first().click()
const dark = (window) => window.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))

// --- S1–S6: first launch ----------------------------------------------------------------------
const catalogue = Array.isArray(config?.catalogue) ? config.catalogue : []
c.check(
  'S1: catalogue is a non-empty list of {id, name, homepage}',
  catalogue.length > 0 &&
    catalogue.every((v) => typeof v.id === 'string' && typeof v.name === 'string' && 'homepage' in v),
  config?.catalogue
)
const ids = catalogue.map((v) => v.id)

let { app, window, profileDir } = await open({ TRACY_DESKTOP_ONBOARDING: 'again' })
try {
  c.eq('S1: protocolVersion', await window.evaluate(() => window.tracyDesktop?.app?.protocolVersion), 2)
  const shown = await until(window, () => !!document.querySelector('[data-tracy-onboard]'), undefined, 45_000)
  c.check('S2: the overlay [data-tracy-onboard] is present', shown === true, window.url())
  if (!shown) throw new Error('no overlay — the remaining checks cannot run')
  const shape = await window.evaluate(() => {
    const d = document.querySelector('[data-tracy-onboard]')
    const rail = d.querySelectorAll('[data-rail-step]').length
    return {
      role: d.getAttribute('role'),
      layout: rail > 0 ? 'setup-rail' : 'one-column',
      steps: rail || d.querySelectorAll('.tv-ob-bar').length
    }
  })
  c.eq('S2: role', shape.role, 'dialog')
  c.eq(`S2: step buttons (${shape.layout} layout)`, shape.steps, 3)

  // S3 — the cards against the catalogue and the bridge.
  let detect = await window.evaluate((list) => window.tracyDesktop.app.agents.detect(list), ids)
  for (let i = 0; i < 15 && !detect.scanComplete; i++) {
    await window.waitForTimeout(1000)
    detect = await window.evaluate((list) => window.tracyDesktop.app.agents.detect(list), ids)
  }
  save('detect.json', detect)
  c.eq('S3: detect scanComplete', detect.scanComplete, true)
  const found = detect.results
    .filter((r) => r.status === 'found')
    .map((r) => r.id)
    .sort()
  c.check('S3: claude is found on this machine', found.includes('claude'), found)
  // The screen polls the bridge on its own; wait until it shows the complete answer.
  const screen = await until(
    window,
    (n) => {
      const cards = [...document.querySelectorAll('[data-tracy-onboard] [data-agent][data-found="true"]')]
      const count = document.querySelector('[data-tracy-onboard] .tv-ob-count')?.textContent ?? null
      if (cards.length !== n || count === null) return null
      return {
        found: cards.map((el) => el.getAttribute('data-agent')).sort(),
        count: document.querySelector('[data-tracy-onboard] .tv-ob-count')?.textContent ?? null
      }
    },
    found.length
  )
  c.check(
    'S3: cards marked found = detect found',
    JSON.stringify(screen?.found) === JSON.stringify(found),
    screen
  )
  c.eq('S3: the "found" section count', screen?.count, String(found.length))
  // Every catalogue id has a card once "Show more" is open.
  const more = window.locator('[data-tracy-onboard] .tv-ob-disclosure')
  if ((await more.count()) > 0) await more.first().click()
  const cards = await window.evaluate(() =>
    [...document.querySelectorAll('[data-tracy-onboard] [data-agent]')]
      .map((el) => el.getAttribute('data-agent'))
      .sort()
  )
  c.check('S3: one card per catalogue id', JSON.stringify(cards) === JSON.stringify([...ids].sort()), cards)
  await shot(window, 'step-1-account.png')

  // S4 — pick, Continue, the three looks, Continue.
  await click(window, `[data-agent="${PICK}"]`)
  c.eq(
    `S4: ${PICK} card pressed`,
    await window.locator(`[data-tracy-onboard] [data-agent="${PICK}"]`).getAttribute('aria-pressed'),
    'true'
  )
  await click(window, '[data-action="next"]')
  c.eq('S4: Continue moves to step 2', await stepIndex(window), '1')
  open.phase = 'interaction'
  await click(window, '[data-theme-pick="dark"]')
  c.eq(
    'S4: Dark sets body[data-ds-dark-theme]',
    await until(window, () => document.body.hasAttribute('data-ds-dark-theme'), undefined, 5000),
    true
  )
  await shot(window, 'step-2-appearance-dark.png')
  await click(window, '[data-theme-pick="system"]')
  await window.waitForTimeout(500)
  c.eq('S4: System (this Mac is light) clears it', await dark(window), false)
  await click(window, '[data-theme-pick="dark"]')
  await window.waitForTimeout(300)
  await click(window, '[data-theme-pick="light"]')
  await window.waitForTimeout(500)
  c.eq('S4: Light clears it', await dark(window), false)
  await click(window, '[data-action="next"]')
  c.eq('S4: Continue moves to step 3', await stepIndex(window), '2')

  // S5 — the switch, the test button, the bridge's answer.
  const controls = await window.evaluate(() => ({
    toggle: !!document.querySelector('[data-tracy-onboard] [data-action="notify"]'),
    test: !!document.querySelector('[data-tracy-onboard] [data-action="send-test"]')
  }))
  c.check('S5: switch and "Send a test notification" are shown', controls.toggle && controls.test, controls)
  await shot(window, 'step-3-notifications.png')
  const before = await window.evaluate(() => window.tracyDesktop.app.notifications.status())
  await window.waitForTimeout(20)
  await click(window, '[data-action="send-test"]')
  const after =
    (await until(
      window,
      (was) => window.tracyDesktop.app.notifications.status().then((s) => (s.lastShownAt !== was ? s : null)),
      before.lastShownAt,
      8000
    )) ?? (await window.evaluate(() => window.tracyDesktop.app.notifications.status()))
  save('notify.json', { before, after })
  c.check(
    'S5: the test went through the bridge (lastShownAt advanced, or unsupported and unchanged)',
    after.supported
      ? typeof after.lastShownAt === 'number' && after.lastShownAt > (before.lastShownAt ?? 0)
      : after.lastShownAt === before.lastShownAt,
    { before, after }
  )

  // S6 — Done.
  await click(window, '[data-action="next"]')
  const gone = await until(window, () => !document.querySelector('[data-tracy-onboard]'), undefined, 10_000)
  c.eq('S6: Done closes the overlay', gone, true)
  let prefs = null
  for (let i = 0; i < 20 && prefs?.onboarding?.closedAt == null; i++) {
    try {
      prefs = JSON.parse(readFileSync(join(profileDir, 'preferences.json'), 'utf8'))
    } catch {}
    if (prefs?.onboarding?.closedAt == null) await new Promise((r) => setTimeout(r, 250))
  }
  save('preferences.json', prefs)
  c.eq('S6: preferences.json onboarding.closedAt is a number', typeof prefs?.onboarding?.closedAt, 'number')
  c.eq('S6: outcome', prefs?.onboarding?.outcome, 'completed')
  c.eq('S6: picked', prefs?.onboarding?.picked, PICK)
  // Settings opens on the address the screen navigated to; the section may consume the query.
  const row = await until(window, (id) => !!document.querySelector(`[data-vendor="${id}"]`), PICK, 30_000)
  c.eq('S6: Settings › AI accounts shows the picked row', row, true)
  await window.waitForTimeout(1500)
  const focus = await window.evaluate(() => ({
    url: location.pathname + location.search,
    active: document.activeElement?.closest('[data-vendor]')?.getAttribute('data-vendor') ?? null,
    activeTag: document.activeElement?.tagName ?? null,
    activeClass: String(document.activeElement?.className ?? '').slice(0, 80),
    activeEditable: document.activeElement?.isContentEditable ?? false,
    activeText: (document.activeElement?.textContent ?? '').trim().slice(0, 60),
    highlighted:
      document.querySelector('[data-vendor][data-active="true"]')?.getAttribute('data-vendor') ?? null
  }))
  save('settings-focus.json', focus)
  c.eq('S6: the focused element sits in the picked row', focus.active, PICK)
  await shot(window, 'after-done-ai-accounts.png')
} catch (error) {
  c.check('S1–S6 ran to the end', false, String(error?.message ?? error))
} finally {
  await app.close()
}

// --- S7: relaunch without the variable, then Help › Getting started ---------------------------
open.phase = undefined
;({ app, window } = await open({}))
try {
  // Give the page the time the first launch needed to show the overlay.
  await until(
    window,
    () =>
      !!document.querySelector('[data-tracy-onboard]') || !!document.querySelector('[data-shell-overlay]'),
    undefined,
    30_000
  )
  await window.waitForTimeout(4000)
  c.eq(
    'S7: relaunch without the variable shows no overlay',
    await window.evaluate(() => !!document.querySelector('[data-tracy-onboard]')),
    false
  )
  const clicked = await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('tracy-getting-started')
    if (!item) return false
    item.click()
    return true
  })
  c.eq('S7: Help › Getting started menu item exists and was clicked', clicked, true)
  const back = await until(window, () => !!document.querySelector('[data-tracy-onboard]'), undefined, 10_000)
  c.eq('S7: Help › Getting started reopens the overlay', back, true)
  await shot(window, 'help-reopened.png')
} catch (error) {
  c.check('S7 ran to the end', false, String(error?.message ?? error))
} finally {
  await app.close()
}

// Console errors: those raised by this screen are ours; @deepseek-ai/* ones exist without it.
const ours = errors.filter((e) => /tracy-onboard|dsh-onboard|tv-ob-/.test(e.text))
save('console-errors.json', { ours, all: errors })
c.eq('console: errors from the onboarding plugin', ours.length, 0)
c.done()
