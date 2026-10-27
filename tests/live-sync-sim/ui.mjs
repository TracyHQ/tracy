#!/usr/bin/env node
/**
 * The Sync from live button, step by step, on the real dsh page of the local stack: the copy's
 * workspace → site menu → Manage sites (My Sites) → the copy's ••• row menu → Sync from live (or
 * Export site as ZIP → Sync from live, then export), one picture per thing the page says.
 *
 *   node tests/live-sync-sim/ui.mjs <sync|export> <prefix> [--clash]
 *
 * Reads the two sites from the simulator's state (`sim.mjs` builds them). `--clash` first makes
 * both sites change the same places — a title, a CSS line, a new article each — so the pictures
 * show what Tracy keeps.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(
  join(fileURLToPath(new URL('../../', import.meta.url)), 'apps/tracy-host/package.json')
)
const { chromium } = require('playwright')
const [, , mode = 'sync', prefix = 'U', ...rest] = process.argv
const SHOTS = `${process.env.HOME}/TCH-local/live-sync/sim-shots`
const s = JSON.parse(readFileSync(`${SHOTS}/state.json`, 'utf8'))
const ORIGIN = 'http://tracy.test:51710'

const sql = (label, script) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      `${label}-db-1`,
      'sh',
      '-c',
      'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -B joomla'
    ],
    {
      input: script,
      encoding: 'utf8'
    }
  ).trim()
const prefixOf = (label) =>
  execFileSync(
    'docker',
    [
      'exec',
      `${label}-web-1`,
      'sh',
      '-c',
      'grep -oE "dbprefix *= *\'[a-zA-Z0-9_]+" configuration.php | grep -oE "[a-zA-Z0-9_]+$"'
    ],
    {
      encoding: 'utf8'
    }
  ).trim()
const sed = (label, path, line, text) =>
  execFileSync('docker', [
    'exec',
    '-u',
    'www-data',
    `${label}-web-1`,
    'sed',
    '-i',
    `${line}s#.*#${text}#`,
    path
  ])

if (rest.includes('--clash')) {
  const L = s.live.label
  const C = s.copy.label
  const [lp, cp] = [prefixOf(L), prefixOf(C)]
  const id = sql(
    C,
    `SELECT id FROM ${cp}content WHERE title LIKE 'Our house blend%' OR title LIKE 'House blend%' ORDER BY id LIMIT 1`
  )
  sql(C, `UPDATE ${cp}content SET title = 'Our house blend (Tracy)' WHERE id = ${id}`)
  sql(L, `UPDATE ${lp}content SET title = 'House blend — new autumn roast' WHERE id = ${id}`)
  const css = 'media/templates/site/cassiopeia/css/user.css'
  sed(C, css, 5, '.item-title a { font-weight: 800 !important; } /* Tracy */')
  sed(L, css, 5, '.item-title a { font-weight: 300 !important; } /* customer */')
  sed(L, css, 20, 'body { letter-spacing: .01em; } /* customer */')
  console.log(`clash made on article ${id} and ${css}`)
}

const tok = execFileSync(
  'docker',
  [
    'exec',
    'tracy-tracy-web-1',
    'node',
    '-e',
    "import('/opt/tracy-web/src/lib/session.js').then(async (m) => console.log(await m.mintSession('owner@livesync.test', process.env.SESSION_SECRET)))"
  ],
  {
    encoding: 'utf8'
  }
).trim()
const browser = await chromium.launch({ args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await ctx.addCookies([{ name: 'tracy_sess', value: tok, domain: 'tracy.test', path: '/' }])
const page = await ctx.newPage()
let n = 0
const shot = async (name) => {
  const file = `${SHOTS}/${prefix}-${String(++n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file })
  console.log('shot', file)
}
const site = async (label, name) => {
  const p = await ctx.newPage()
  await p.setViewportSize({ width: 1100, height: 900 })
  await p.goto(`http://${label}.tracy.test:51710/`, { waitUntil: 'networkidle' })
  const file = `${SHOTS}/${prefix}-${String(++n).padStart(2, '0')}-${name}.png`
  await p.screenshot({ path: file, fullPage: true })
  console.log('shot', file)
  await p.close()
}

await site(s.live.label, 'live-site')
await site(s.copy.label, 'copy-before')
await page.goto(`${ORIGIN}/${s.copy.siteKey}/`, { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForTimeout(8000)
await page
  .getByRole('button', { name: 'Skip' })
  .click({ timeout: 3000 })
  .catch(() => {})
await page.waitForTimeout(1000)
await shot('workspace')
await page.getByRole('button', { name: 'Your sites' }).click()
await page.waitForTimeout(800)
await page.getByText('Manage sites').click()
await page.waitForTimeout(4000)
await shot('my-sites')
const row = page.locator('tr', { hasText: s.copy.siteKey })
await row.getByRole('button', { name: 'More' }).click()
await page.waitForTimeout(600)
await shot('row-menu')
await page.getByRole('menuitem', { name: mode === 'sync' ? 'Sync from live' : 'Export site as ZIP' }).click()
await page.waitForSelector('[data-live-sync]', { timeout: 30000 })
await page.waitForTimeout(800)
await shot('dialog')
await page.locator(mode === 'sync' ? '[data-sync-now]' : '[data-sync-then-export]').click()

let last = ''
let seenRunning = false
const until = Date.now() + 25 * 60_000
while (Date.now() < until) {
  const state = await page
    .locator('[data-live-sync]')
    .getAttribute('data-live-sync-state')
    .catch(() => null)
  const stage = await page
    .locator('[data-export-stage]')
    .getAttribute('data-export-stage')
    .catch(() => null)
  if (state === 'running') seenRunning = true
  const said = (
    await page
      .locator('[role="dialog"]')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ')
  if (seenRunning && said !== last) {
    last = said
    await shot(`${state}${stage && stage !== 'confirm' && stage !== 'syncing' ? `-${stage}` : ''}`)
  }
  if (seenRunning && state === 'failed') break
  if (seenRunning && state === 'applied') {
    const kept = page.locator('[data-live-sync-kept] button').first()
    if ((await kept.count()) && !(await page.locator('[data-kept]').count())) {
      await kept.click()
      await page.waitForTimeout(500)
      await shot('kept-list')
      last = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ')
    }
    if (mode === 'sync' || stage === 'ready' || stage === 'failed') break
  }
  await page.waitForTimeout(800)
}
await site(s.copy.label, 'copy-after')
await browser.close()
