/**
 * REG-PR-1082-account-menu: the face at the foot of the left column opens the account menu.
 *
 * Steps S1–S10 of the case, in order. Seat `a` holds an owner seat on the stand's WordPress test
 * site (`siteKey('wp')`, or `REG_SITE` when the stand's name is too short for a label); the case gives it a display name for the run and takes it away after.
 * The display name is written through `docker exec <stand>-postgres-1 psql`, the one write the
 * case's own steps name (S1, S10); `REG_PG` overrides the container.
 */
import { execFileSync } from 'node:child_process'
import { api, expect, ORIGIN, seatContext, seatEmail, siteKey, STAND_NAME, test } from './stand.mjs'

const PG = process.env.REG_PG ?? `tracy-${STAND_NAME}-postgres-1`
const NAME = 'Reg Menu A'
const TRIGGER = '[data-tracy-account-trigger]'
const DIALOG = '[role=dialog][data-shortcut-modal=settings]'
const ROWS = ['account', 'ai-accounts', 'settings', 'appearance', 'community']
/** Which row each switch removes from the menu (S4 expect). */
const ROW_SWITCH = {
  account: 'tracy-account',
  'ai-accounts': 'tracy-model-plan',
  community: 'community-link'
}

/** @param {string} sql - one statement, the email inlined by the caller (a fixed test address). */
const psql = (sql) =>
  execFileSync('docker', ['exec', PG, 'psql', '-U', 'tracy', '-d', 'tracy', '-At', '-c', sql]).toString()

/** `rgb(…)` / `#rrggbb` → [r, g, b]. */
function rgb(colour) {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim())
  if (hex) return [0, 2, 4].map((i) => Number.parseInt(hex[1].slice(i, i + 2), 16))
  const m = /rgba?\(([^)]+)\)/.exec(colour)
  return m
    ? m[1]
        .split(/[ ,/]+/)
        .slice(0, 3)
        .map(Number)
    : []
}
const luminance = (colour) => {
  const [r, g, b] = rgb(colour)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** The rows of the first (top-level) menu, in document order, and which row holds focus. */
async function readMenu(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role=menu]')
    if (!panel) return null
    const rows = [...panel.querySelectorAll('[data-menu-item]')]
      .filter((el) => el.closest('[role=menu]') === panel)
      .map((el) => el.getAttribute('data-menu-item'))
    return {
      rows,
      focused: document.activeElement?.closest('[data-menu-item]')?.getAttribute('data-menu-item') ?? null
    }
  })
}

/** Is the Settings dialog open, and on which section (the active nav row and the page title). */
async function readSettings(page) {
  return page.evaluate((dialog) => {
    const d = document.querySelector(dialog)
    if (!d) return { open: false }
    return {
      open: true,
      nav: d.querySelector('.ts-nav[aria-current="page"]')?.textContent?.trim() ?? null,
      title: d.querySelector('.ts-page-title')?.textContent?.trim() ?? null,
      text: d.textContent ?? ''
    }
  }, DIALOG)
}

const triggerFocused = (page) =>
  page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, TRIGGER)

async function openMenu(page) {
  if (!(await page.locator('[role=menu]').count())) await page.locator(TRIGGER).click()
  await page.locator('[role=menu]').first().waitFor()
}

async function closeSettings(page) {
  await page.keyboard.press('Escape')
  await page.locator(DIALOG).waitFor({ state: 'detached', timeout: 10_000 })
}

/** The `.ts-kbd` text (`⌘ ,`, `Ctrl Alt ,`…) as a Playwright chord. */
function chordOf(text) {
  const names = {
    '⌘': 'Meta',
    '⌃': 'Control',
    '⌥': 'Alt',
    '⇧': 'Shift',
    ctrl: 'Control',
    control: 'Control',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    cmd: 'Meta',
    meta: 'Meta',
    ',': 'Comma'
  }
  const parts = []
  for (const token of text.split(/[\s+]+/).filter(Boolean)) {
    const low = token.toLowerCase()
    if (names[low]) parts.push(names[low])
    else for (const ch of token) parts.push(names[ch] ?? names[ch.toLowerCase()] ?? ch)
  }
  return parts.join('+')
}

test('REG-PR-1082 account menu', async ({ browser }) => {
  const A = seatEmail('a')
  const record = {}
  // S1
  psql(`update account set display_name = '${NAME}' where email = '${A}'`)
  const context = await seatContext(browser, 'a', { colorScheme: 'light' })
  const page = await context.newPage()
  try {
    await page.goto(ORIGIN)
    await page.locator('.tsb-root').first().waitFor({ timeout: 90_000 })
    await page.locator(`${TRIGGER} [data-tracy-face]`).first().waitFor({ timeout: 30_000 })

    // S2
    const me = (await api('a', 'GET', '/auth/me')).json
    const hidden = (await api('a', 'GET', '/api/ui')).json?.hidden ?? []
    const planRes = await api('a', 'GET', '/api/seat-plan/status')
    record.S2 = { me, hidden, plan: { status: planRes.status, json: planRes.json } }
    console.log(`S2 ${JSON.stringify(record.S2)}`)
    for (const key of ['email', 'defaultSite', 'face', 'name'])
      expect.soft(me, `ME has ${key}`).toHaveProperty(key)
    expect.soft(me?.name).toBe(NAME)
    expect.soft(me?.face?.initial, 'face.initial').toBeTruthy()
    expect.soft(me?.face?.color, 'face.color').toBeTruthy()

    // S3 (the trigger renders before /auth/me answers with the new name; wait for it)
    await page.waitForFunction(
      ([sel, name]) => document.querySelector(sel)?.getAttribute('aria-label')?.includes(name),
      [TRIGGER, NAME],
      { timeout: 30_000 }
    )
    record.S3 = await page.evaluate((sel) => {
      const t = document.querySelector(sel)
      const faces = t?.querySelectorAll('[data-tracy-face]') ?? []
      const f = faces[0]
      return {
        exists: !!t,
        faces: faces.length,
        text: f?.textContent?.trim() ?? null,
        background: f ? getComputedStyle(f).backgroundColor : null,
        ariaLabel: t?.getAttribute('aria-label') ?? null,
        community: !!document.querySelector('.tsb-root .tsb-community, .tsb-community'),
        gear: [...(t?.querySelectorAll('svg') ?? [])].filter((s) => !s.closest('[data-tracy-face]')).length
      }
    }, TRIGGER)
    console.log(`S3 ${JSON.stringify(record.S3)}`)
    expect.soft(record.S3.exists).toBe(true)
    expect.soft(record.S3.faces).toBe(1)
    expect.soft(record.S3.text).toBe(me?.face?.initial)
    expect.soft(rgb(record.S3.background), 'face colour').toEqual(rgb(me?.face?.color ?? ''))
    expect.soft(record.S3.ariaLabel).toContain(NAME)
    expect.soft(record.S3.community, 'no .tsb-community in the rail').toBe(false)
    expect.soft(record.S3.gear, 'no gear svg in the trigger').toBe(0)

    // S4
    const expected = ROWS.filter((r) => !(ROW_SWITCH[r] && hidden.includes(ROW_SWITCH[r])))
    await page.locator(TRIGGER).focus()
    await page.keyboard.press('Enter')
    await page.locator('[role=menu]').first().waitFor()
    const opened = await readMenu(page)
    await page.keyboard.press('End')
    const end = await readMenu(page)
    await page.keyboard.press('Home')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    record.S4 = {
      rows: opened?.rows,
      firstFocus: opened?.focused,
      endFocus: end?.focused,
      menuGone: (await page.locator('[role=menu]').count()) === 0,
      focusOnTrigger: await triggerFocused(page)
    }
    console.log(`S4 ${JSON.stringify(record.S4)} expected rows ${JSON.stringify(expected)}`)
    expect.soft(record.S4.rows).toEqual(expected)
    expect.soft(record.S4.firstFocus).toBe(expected[0])
    expect.soft(record.S4.endFocus).toBe(expected.at(-1))
    expect.soft(record.S4.menuGone).toBe(true)
    expect.soft(record.S4.focusOnTrigger).toBe(true)

    // S5
    const scheme = () =>
      page.evaluate(() => {
        const body = getComputedStyle(document.body).backgroundColor
        // dsh paints in oklch(); a 1px canvas turns any CSS colour into sRGB bytes.
        const ctx = document.createElement('canvas').getContext('2d')
        ctx.fillStyle = body
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        return {
          htmlClass: document.documentElement.className,
          dataTheme: document.documentElement.getAttribute('data-theme'),
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
          body,
          bodyRgb: `rgb(${r}, ${g}, ${b})`
        }
      })
    await openMenu(page)
    await page.locator('[data-menu-item=appearance]').hover()
    await page.waitForTimeout(400)
    const sub = await page.evaluate(() => {
      const menus = document.querySelectorAll('[role=menu]')
      const panel = menus[1]
      if (!panel) return null
      return [...panel.querySelectorAll('[data-menu-item]')].map((el) => ({
        id: el.getAttribute('data-menu-item'),
        role: el.getAttribute('role'),
        checked: el.getAttribute('aria-checked')
      }))
    })
    await page.locator('[data-menu-item=theme-dark]').click()
    await page.waitForTimeout(500)
    const dark = await scheme()
    await openMenu(page)
    await page.locator('[data-menu-item=appearance]').hover()
    await page.waitForTimeout(400)
    await page.locator('[data-menu-item=theme-system]').click()
    await page.waitForTimeout(500)
    const system = await scheme()
    record.S5 = { submenu: sub, dark, system }
    console.log(`S5 ${JSON.stringify(record.S5)}`)
    expect.soft(sub?.map((r) => r.id)).toEqual(['theme-light', 'theme-dark', 'theme-system'])
    expect.soft(sub?.every((r) => r.role === 'menuitemradio')).toBe(true)
    expect.soft(sub?.filter((r) => r.checked === 'true').length).toBe(1)
    expect.soft(luminance(dark.bodyRgb), 'dark body background').toBeLessThan(0.3)
    // the context's OS scheme is light: System follows it back to a light page
    expect.soft(luminance(system.bodyRgb), 'system (light OS) body background').toBeGreaterThan(0.7)
    if (await page.locator('[role=menu]').count()) await page.keyboard.press('Escape')

    // S6
    const plan = planRes.status === 200 ? planRes.json : null
    const connected = plan
      ? [...new Set(plan.connections.filter((c) => c.connected).map((c) => c.provider))]
      : []
    await openMenu(page)
    const marks = await page.evaluate(() => {
      const row = document.querySelector('[data-menu-item=ai-accounts]')
      return {
        row: !!row,
        stack: row?.querySelector('[data-vendor-stack]')?.getAttribute('data-vendor-stack') ?? null,
        marks: [...(row?.querySelectorAll('[data-vendor-mark]') ?? [])].map((m) =>
          m.getAttribute('data-vendor-mark')
        )
      }
    })
    if (marks.row) {
      await page.locator('[data-menu-item=ai-accounts]').click()
      await page.locator(DIALOG).waitFor({ timeout: 10_000 })
    }
    const s6settings = await readSettings(page)
    if (s6settings.open) await closeSettings(page)
    await page.waitForTimeout(200)
    record.S6 = {
      marks,
      connected,
      settings: { nav: s6settings.nav, title: s6settings.title },
      focusOnTrigger: await triggerFocused(page)
    }
    console.log(`S6 ${JSON.stringify(record.S6)}`)
    if (!hidden.includes('tracy-model-plan')) {
      expect.soft(marks.row).toBe(true)
      if (!plan) expect.soft(marks.stack).toBeNull()
      else if (connected.length) {
        expect.soft(marks.stack).toBe('connected')
        expect.soft(marks.marks).toEqual(connected)
      } else {
        expect.soft(marks.stack).toBe('none')
        expect.soft(marks.marks).toEqual(plan.providers.map((p) => p.id))
      }
      expect.soft(s6settings.nav).toBe('AI accounts')
      expect.soft(record.S6.focusOnTrigger).toBe(true)
    }

    // S7
    await openMenu(page)
    const kbd = (await page.locator('[data-menu-item=settings] .ts-kbd').textContent())?.trim() ?? ''
    await page.keyboard.press('Escape')
    await page
      .locator('body')
      .click({ position: { x: 600, y: 10 } })
      .catch(() => {})
    await page.evaluate(() =>
      document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
    )
    const chord = chordOf(kbd)
    await page.keyboard.press(chord)
    await page
      .locator(DIALOG)
      .waitFor({ timeout: 10_000 })
      .catch(() => {})
    const s7 = await readSettings(page)
    if (s7.open) await closeSettings(page)
    record.S7 = { kbd, chord, settings: { open: s7.open, nav: s7.nav } }
    console.log(`S7 ${JSON.stringify(record.S7)}`)
    expect.soft(kbd).not.toBe('')
    expect.soft(s7.open).toBe(true)
    expect.soft(s7.nav).toBe('General')

    // S8
    await openMenu(page)
    await page.locator('[data-menu-item=account]').click()
    await page.locator(DIALOG).waitFor({ timeout: 10_000 })
    await page.waitForTimeout(500)
    const s8 = await readSettings(page)
    await closeSettings(page)
    record.S8 = { nav: s8.nav, hasEmail: s8.text.includes(me?.email ?? '\u0000') }
    console.log(`S8 ${JSON.stringify(record.S8)}`)
    expect.soft(s8.nav).toBe('Account')
    expect.soft(record.S8.hasEmail).toBe(true)

    // S9: the Team tab of the stand's WordPress site, where A is owner.
    const site = process.env.REG_SITE ?? siteKey('wp')
    await page.goto(`${ORIGIN}/${site}`)
    await page.waitForURL(/\/s\/session-/, { timeout: 90_000 })
    const url = new URL(page.url())
    url.searchParams.set('tab', 'tracy:team')
    url.searchParams.set('site', site)
    await page.goto(url.toString())
    await page.locator('[data-member-name]').first().waitFor({ timeout: 60_000 })
    record.S9 = await page.evaluate((name) => {
      const row = [...document.querySelectorAll('tr')].find(
        (tr) => tr.querySelector('[data-member-name]')?.textContent?.trim() === name
      )
      const f = row?.querySelector('[data-tracy-face]')
      return f ? { text: f.textContent?.trim(), background: getComputedStyle(f).backgroundColor } : null
    }, NAME)
    console.log(`S9 ${JSON.stringify(record.S9)}`)
    expect.soft(record.S9?.text).toBe(record.S3.text)
    expect.soft(record.S9?.background).toBe(record.S3.background)
  } finally {
    // S10
    // (the theme went back to System in S5)
    psql(`update account set display_name = null where email = '${A}'`)
    if (process.env.REG_RECORD) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(process.env.REG_RECORD, JSON.stringify(record, null, 2))
    }
  }
})
