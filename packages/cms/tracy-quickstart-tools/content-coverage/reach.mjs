#!/usr/bin/env node
// The reach graph of an audited site: which audited pages a visitor of a customer site reaches from the front page once
// the showcase map hides its menu entries and the kit's hidden-page-links hide their containers (lib/reach.mjs). Every
// link occurrence is read in the browser, never the audit's merged link items. An accept that a hole is shown only on
// pages a visitor cannot reach reads this file.
//
//   node reach.mjs --site <url> --findings <audit out>/findings.json --contract <contract folder> --out <reach.json>
//                  [--hide-links '<css>,<css>'] [--showcase-map <showcase-nav-map.json>]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { anchorsInPage, hiddenSelectorOf, pageKeyOf, reachOf } from './lib/reach.mjs'

const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > 0 ? process.argv[i + 1] : undefined
}
const site = arg('--site')
const findings = arg('--findings')
const contract = arg('--contract')
const outFile = arg('--out')
if (!site || !findings || !contract || !outFile) {
  console.error(
    'usage: reach.mjs --site <url> --findings <file> --contract <dir> --out <file> [--hide-links <css,...>] [--showcase-map <file>]'
  )
  process.exit(2)
}
const map = JSON.parse(readFileSync(join(contract, 'content-map.json'), 'utf8'))
const navFile = arg('--showcase-map') ?? join(contract, 'showcase-nav-map.json')
const nav = JSON.parse(readFileSync(navFile, 'utf8'))
const menuIds = (nav.operations ?? [])
  .filter((o) => o.path === 'menu_show' && String(o.to) === '0')
  .map((o) => String(o.key).replace(/^menuItem-/, ''))
const containers = (arg('--hide-links') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const hidden = hiddenSelectorOf({ menuIds, containers })
const routeOfItem = new Map(
  (map.pages ?? []).map((p) => [String(p.entity).replace(/^menuItem-/, ''), p.route])
)
const key = (u) => pageKeyOf(u, site, routeOfItem)
const pages = JSON.parse(readFileSync(findings, 'utf8')).pages ?? []

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
const browser = await chromium.launch()
const links = new Map()
const failed = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  for (const p of pages) {
    try {
      await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const host = new URL(site).host
      const anchors = (await page.evaluate(anchorsInPage, { hidden })).filter(
        (a) => new URL(a.href).host === host
      )
      links.set(
        key(p.url),
        anchors.map((a) => ({ target: key(a.href), hidden: a.hidden }))
      )
    } catch (e) {
      failed.push({ url: p.url, error: String(e?.message ?? e).split('\n')[0] })
    }
  }
} finally {
  await browser.close()
}
const { reached, unreached } = reachOf({ home: '/', links })
writeFileSync(
  outFile,
  `${JSON.stringify({ site, hidden, pages: links.size, failed, reached: Object.fromEntries(reached), unreached }, null, 2)}\n`
)
console.log(
  `pages ${links.size}, reached ${reached.size}, unreached ${unreached.length}, failed ${failed.length}`
)
if (failed.length) process.exitCode = 1
