// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/runtime.mjs — WordPress changes: the default hook is html[data-theme] (class hooks stay configurable), the env var is WP_REVIEW_CONFIG, the T4 toggle/storage names are gone.
// Shared browser contract for every scanner. Configure the observed theme, not guessed hooks.
//
// Every scanner opens its page through lib/browser.mjs (`withBrowser` + `withPage` with
// SCAN_PAGE), so review/scan.mjs can run them all on one browser; `verdict()` is the JSON line a
// scanner prints, in one place, so scan.mjs prints the same line the standalone script does.
import { readFileSync } from 'node:fs'
import { LAUNCH_ARGS } from '../lib/browser.mjs'
const i = process.argv.indexOf('--config')
const path = i < 0 ? process.env.WP_REVIEW_CONFIG : process.argv[i + 1]
if (i >= 0) {
  if (!path) throw new Error('--config needs a JSON file')
  process.argv.splice(i, 2)
}
export const config = path
  ? JSON.parse(readFileSync(path, 'utf8'))
  : {
      hook: { type: 'attribute', name: 'data-theme' },
      toggle: '.theme-toggle',
      persistence: { type: 'localStorage', key: 'theme' },
      expectedSelectors: [],
      expectedStatus: 200
    }
export const configured = Boolean(path)
export function validateConfig(c) {
  if (!['class', 'attribute'].includes(c.hook?.type) || !/^[a-zA-Z][\w-]*$/.test(c.hook?.name ?? ''))
    throw new Error('hook requires type class|attribute and a name')
  if (!['cookie', 'localStorage'].includes(c.persistence?.type) || !c.persistence.key)
    throw new Error('persistence requires type cookie|localStorage and key')
  if (
    !c.toggle ||
    !Array.isArray(c.expectedSelectors) ||
    c.expectedSelectors.some((s) => typeof s !== 'string' || !s)
  )
    throw new Error('toggle and expectedSelectors are required')
}
validateConfig(config)
export const launchOptions = { args: LAUNCH_ARGS }
// Neutralise scroll-in (AOS) animations so nothing is invisibly opacity:0 when a scanner reads it.
export const AOS_INIT = `(() => {
  const s = document.createElement('style')
  s.textContent = '[data-aos]{opacity:1!important;transform:none!important}'
  document.documentElement.appendChild(s)
})()`
// The page every dark-mode scanner reads: dark colour scheme, 1440 wide, AOS neutralised.
export const SCAN_PAGE = {
  colorScheme: 'dark',
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  initScripts: [AOS_INIT]
}
// Scroll the page so lazy/clone elements render, then return to top.
export async function scrollThrough(page, stepMs = 40) {
  await page.evaluate(async (ms) => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, ms))
    }
    window.scrollTo(0, 0)
  }, stepMs)
}
export const countExamined = (page) =>
  page.evaluate(() => (document.body ? document.body.querySelectorAll('*').length : 0))
export const COVERAGE_MIN = 20
export const coverageError = (examined, url) =>
  `ERR coverage — only ${examined} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`
export async function setTheme(page, mode) {
  await page.evaluate(
    ({ hook, mode }) => {
      const root = document.documentElement
      if (hook.type === 'class') root.classList.toggle(hook.name, mode === 'dark')
      else root.setAttribute(hook.name, mode)
    },
    { hook: config.hook, mode }
  )
}
export async function readTheme(page) {
  return page.evaluate(
    (hook) =>
      hook.type === 'class'
        ? document.documentElement.classList.contains(hook.name)
          ? 'dark'
          : 'light'
        : document.documentElement.getAttribute(hook.name),
    config.hook
  )
}
export async function persisted(page) {
  if (config.persistence.type === 'cookie') {
    const cookies = await page.context().cookies(page.url())
    return cookies.find((c) => c.name === config.persistence.key)?.value ?? null
  }
  return page.evaluate((key) => localStorage.getItem(key), config.persistence.key)
}
/**
 * The status a NAVIGATION on this page must answer with, when it is not the config's.
 *
 * 🔒 Per page, not on `config`. A scanner reads its expectation through a module-level object, and
 * `visual-qa.mjs` scans several pages CONCURRENTLY: writing `config.expectedStatus = page.status`
 * let a 200 page overwrite the expectation of the 404 page already in flight, and the /404 axes
 * failed with `HTTP 404 expected 200` — a defect reported against the site for a race in the
 * harness. A WeakMap keyed by the Playwright page is request-scoped by construction and needs no
 * signature change in the four scanners.
 */
const expectedStatusByPage = new WeakMap()
export const expectStatus = (page, status) => expectedStatusByPage.set(page, status)

export async function navigate(page, url) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  const expected = expectedStatusByPage.get(page) ?? config.expectedStatus ?? 200
  if (!response || response.status() !== expected)
    throw new Error(`HTTP ${response?.status()} expected ${expected}`)
  if (new URL(page.url()).origin !== new URL(url).origin) throw new Error('Unexpected cross-origin redirect')
  for (const selector of config.expectedSelectors) {
    if (!(await page.locator(selector).first().isVisible()))
      throw new Error(`Expected visible page element missing: ${selector}`)
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}
export function resultStatus({ examined, findings = [], failure = false, verified = true }) {
  if (failure || examined === 0) return 'fail'
  return findings.length || !verified ? 'needs-review' : 'pass'
}
export function verdict(url, examined, findings = [], failure = false) {
  const status = resultStatus({
    examined,
    findings,
    failure,
    verified: configured && config.expectedSelectors.length > 0
  })
  return { status, url, examined, findings, configured }
}
const exitCodeFor = (status) => (status === 'pass' ? 0 : status === 'fail' ? 1 : 3)
export function report(page, examined, findings = [], failure = false) {
  const v = verdict(page.url(), examined, findings, failure)
  console.log(JSON.stringify(v))
  process.exitCode = exitCodeFor(v.status)
}
