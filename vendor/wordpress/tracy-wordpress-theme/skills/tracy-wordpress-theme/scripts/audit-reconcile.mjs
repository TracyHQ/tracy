#!/usr/bin/env node
// Independent, occurrence-by-occurrence ledger for audit-live detector output.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRootOf } from './lib/record-paths.mjs'
import { withBrowser } from './lib/browser.mjs'

const REPO_ROOT = repoRootOf(path.dirname(fileURLToPath(import.meta.url)))
const FROZEN_TIME = 1700000000000
const sha = (v) => createHash('sha256').update(Buffer.isBuffer(v) ? v : typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')
const usage = () => { throw new Error('usage: audit-reconcile.mjs measure --findings <json> --out <ledger.json> [--site <origin>] [--source <origin>] | check --ledger <ledger.json> [--reaudit <REPORT.md or json>]') }
function args(argv) {
  const command = argv.shift()
  if (!['measure', 'check'].includes(command)) usage()
  const out = { command }
  while (argv.length) {
    const key = argv.shift()
    if (!['--findings', '--out', '--site', '--source', '--ledger', '--reaudit'].includes(key) || out[key]) throw new Error(`unknown or repeated option ${key}`)
    if (!argv.length || argv[0].startsWith('--')) throw new Error(`${key} requires a value`)
    out[key] = argv.shift()
  }
  if (command === 'measure' && (!out['--findings'] || !out['--out'] || out['--ledger'] || out['--reaudit'])) usage()
  if (command === 'check' && (!out['--ledger'] || out['--out'] || out['--site'] || out['--source'])) usage()
  return out
}

/** audit-live keeps operational findings in both its top-level list and finding arrays in `extra`. */
export function auditLiveOccurrences(report) {
  const out = []
  const counts = new Map()
  const add = (origin, raw) => {
    const occurrenceIndex = counts.get(origin) ?? 0
    counts.set(origin, occurrenceIndex + 1)
    out.push({ origin, occurrenceIndex, raw })
  }
  for (const raw of Array.isArray(report.findings) ? report.findings : []) add('findings', raw)
  const walk = (node, at) => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      const next = `${at}.${key}`
      if (key === 'findings' && Array.isArray(value)) {
        for (const raw of value) add(next, raw)
      } else if (Array.isArray(value)) {
        if (next === 'extra.behavior-copy.inventory') {
          for (const raw of value) if (raw?.contradicts) add(next, raw)
        }
        value.forEach((child, index) => walk(child, `${next}[${index}]`))
      } else if (value && typeof value === 'object') walk(value, next)
    }
  }
  walk(report.extra ?? {}, 'extra')
  return out
}

/** This page script resolves the raw finding's named target without detector code. */
export function resolveDomTarget(request) {
  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const exact = norm(request.control)
  const interactive = 'button,a,input,select,textarea,[role="button"],[role="link"],[aria-label],[title]'
  let targets = []
  if (request.selector) {
    try { targets = [...document.querySelectorAll(request.selector)] } catch { return { measured: false, reason: `invalid selector: ${request.selector}` } }
  } else if (request.kind === 'header-height') {
    targets = [...document.querySelectorAll('header,[role="banner"]')]
  } else if (request.kind?.startsWith('nav-current-')) {
    targets = [...document.querySelectorAll('[aria-current],.current,.current-menu-item,.current_page_item,.active')]
  } else if (exact) {
    targets = [...document.querySelectorAll(interactive)].filter((el) => [el.innerText, el.getAttribute('aria-label'), el.getAttribute('title'), el.value].some((x) => norm(x) === exact))
  }
  if (targets.length !== 1) return { measured: false, reason: targets.length ? `target is ambiguous (${targets.length} elements)` : 'the finding target could not be resolved from its selector or control name' }
  const el = targets[0]
  const box = el.getBoundingClientRect()
  const selector = (() => {
    if (el.id) return `#${CSS.escape(el.id)}`
    const path = []
    let node = el
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let part = node.tagName.toLowerCase()
      if (node.parentElement) {
        const same = [...node.parentElement.children].filter((sibling) => sibling.tagName === node.tagName)
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`
      }
      path.unshift(part)
      node = node.parentElement
    }
    return path.join(' > ')
  })()
  return { measured: true, selector, center: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
}

/** After any requested action, take only the named element's box and the finding's relevant computed properties. */
export function independentDomRead(request) {
  const el = document.querySelector(request.selector)
  if (!el) return { measured: false, reason: 'resolved target disappeared before the read' }
  const box = el.getBoundingClientRect()
  const computed = getComputedStyle(el)
  const properties = [...new Set([
    ...(request.properties ?? []),
    ...(request.kind === 'header-height' ? ['height', 'min-height', 'max-height'] : []),
    ...(request.kind === 'touch-target-small' || request.kind === 'touch-target-obstructed' ? ['width', 'height', 'display', 'visibility'] : []),
    ...(request.kind === 'responsive-visibility' ? ['display', 'visibility', 'opacity', 'width', 'height'] : []),
    ...(request.kind === 'label-wrap' ? ['font-size', 'line-height', 'width', 'height', 'white-space'] : []),
    ...(request.kind?.startsWith('nav-current-') ? ['display', 'visibility', 'color', 'background-color'] : []),
    ...(request.kind === 'header-control-position' ? ['display', 'visibility', 'position'] : [])
  ])]
  const styles = Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)]))
  return {
    measured: true,
    target: { selector: request.selector, tag: el.tagName.toLowerCase(), label: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 240) },
    state: { requested: request.state ?? null, action: request.action ?? 'none' },
    box: { x: Math.round(box.x * 10) / 10, y: Math.round(box.y * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 },
    styles,
    ...(request.kind === 'touch-target-obstructed' ? (() => { const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return { hitTarget: { tag: hit?.tagName?.toLowerCase() ?? null, isControl: Boolean(hit && (hit === el || el.contains(hit))), label: (hit?.innerText || hit?.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 160) } } })() : {}),
    ...(request.kind === 'label-wrap' ? { textLineCount: computed.lineHeight.endsWith('px') && Number.parseFloat(computed.lineHeight) > 0 ? Math.max(1, Math.round(box.height / Number.parseFloat(computed.lineHeight))) : null } : {}),
    clock: { dateNow: Date.now(), performanceNow: performance.now() },
    document: { title: document.title, bodyText: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400), loadClock: document.documentElement?.dataset?.auditClockAtLoad ?? null }
  }
}
function routeUrls(report, finding, opts) {
  const route = finding.route ?? finding.page ?? finding.path
  if (typeof route !== 'string' || !route) return { site: finding.siteUrl ?? null, source: finding.sourceUrl ?? null }
  const pages = report.pages ?? {}
  const page = Object.values(pages).find((p) => p && (p.route === route || [p.site, p.source].some((u) => { try { return new URL(u).pathname === route } catch { return false } })))
  const site = (finding.siteUrl ?? page?.site) || (opts['--site'] ? new URL(route, opts['--site']).href : null)
  const source = (finding.sourceUrl ?? page?.source) || (opts['--source'] ? new URL(route, opts['--source']).href : null)
  return { site, source }
}
function labelOf(raw) {
  const control = raw.control
  if (typeof control === 'string') return control
  if (control && typeof control === 'object') return control.label ?? control.name ?? control.selector ?? null
  return raw.label ?? (typeof raw.element === 'string' && !/^[.#[]/.test(raw.element) ? raw.element : null)
}
function selectorOf(raw) {
  for (const candidate of [raw.selector, raw.control?.selector, raw.element?.selector, typeof raw.element === 'string' && /^[.#[]/.test(raw.element) ? raw.element : null]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}
function propertiesOf(raw) {
  const values = [...(Array.isArray(raw.properties) ? raw.properties : []), ...Object.keys(raw.styles ?? raw.computed ?? {}), raw.property, raw.propertyName, raw.cssProperty].filter((x) => typeof x === 'string')
  return values
}
function identityOf(raw, urls) {
  return {
    routePair: { site: urls.site ?? null, source: urls.source ?? null },
    width: raw.width ?? null,
    theme: raw.theme ?? raw.mode ?? null,
    control: labelOf(raw),
    state: raw.state ?? raw.action ?? null
  }
}
function stableId(identity, raw, origin, occurrenceIndex) { return `AR-${sha({ routePair: identity.routePair, width: identity.width, theme: identity.theme, control: identity.control, state: identity.state, rawHash: sha(raw), origin, occurrenceIndex }).slice(0, 20)}` }
function detectorLocation(file) {
  const abs = path.resolve(file)
  if (REPO_ROOT) {
    const relative = path.relative(REPO_ROOT, abs)
    if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return { path: relative.split(path.sep).join('/'), scope: 'repo' }
  }
  return { path: path.basename(abs), scope: 'external' }
}
function requestFor(row) {
  const raw = row.raw
  const properties = propertiesOf(raw)
  const supported = new Set(['header-height', 'header-control-position', 'touch-target-small', 'touch-target-obstructed', 'responsive-visibility', 'label-wrap', 'nav-current-missing', 'nav-current-wrong', 'nav-current-extra'])
  if (!supported.has(raw.kind)) return { supported: false, reason: `independent DOM measurement is not implemented for ${raw.kind ?? 'this finding kind'}` }
  const selector = selectorOf(raw)
  const control = labelOf(raw)
  if (!selector && !control && raw.kind !== 'header-height' && !raw.kind.startsWith('nav-current-')) return { supported: false, reason: 'the finding has no named selector or control' }
  const state = raw.state ?? raw.action ?? 'initial'
  if (raw.kind.startsWith('nav-current-') && state && state !== 'initial') return { supported: false, reason: `nav current state ${state} cannot be opened independently` }
  return { supported: true, request: { kind: raw.kind, selector, control, state, properties } }
}
async function measurePage(browser, url, identity, request, side, profile) {
  const page = await browser.newPage({ viewport: { width: Number(identity.width) || 1280, height: 900 } })
  try {
    await page.addInitScript(({ fixed, theme, side }) => {
      const NativeDate = Date
      class FrozenDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])) } static now() { return fixed } }
      Object.setPrototypeOf(FrozenDate, NativeDate)
      globalThis.Date = FrozenDate
      try { Object.defineProperty(performance, 'now', { value: () => 0 }) } catch {}
      if (theme && side === 'site') document.cookie = `tracy_theme=${theme};path=/`
      const apply = () => { if (theme && side === 'source') document.documentElement?.setAttribute('data-theme', theme) }
      if (document.documentElement) apply()
      else new MutationObserver((_, observer) => { if (document.documentElement) { apply(); observer.disconnect() } }).observe(document, { childList: true })
    }, { fixed: FROZEN_TIME, theme: identity.theme, side })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const resolved = await page.evaluate(resolveDomTarget, request)
    if (!resolved.measured) return resolved
    const state = String(request.state ?? '').trim().toLowerCase()
    let action = 'none'
    if (state && !['initial', 'default', 'closed'].includes(state)) {
      if (['hover', 'hovered'].includes(state)) { action = 'hover'; await page.locator(resolved.selector).hover() }
      else if (['click', 'clicked', 'open', 'opened', 'expanded'].includes(state)) {
        action = 'click'
        await page.evaluate((selector) => { const el = document.querySelector(selector); el?.addEventListener('click', (event) => event.preventDefault(), { once: true, capture: true }); el?.click() }, resolved.selector)
      } else return { measured: false, reason: `state action is not supported: ${request.state}` }
    }
    return await page.evaluate(independentDomRead, { ...request, selector: resolved.selector, action })
  } finally { await page.close() }
}
async function measure(opts) {
  let report, findingsText
  try { findingsText = readFileSync(opts['--findings'], 'utf8'); report = JSON.parse(findingsText) } catch (e) { throw new Error(`cannot read detector findings: ${e.message}`) }
  const occurrences = auditLiveOccurrences(report)
  const rows = []
  await withBrowser(async (browser) => {
    for (const occurrence of occurrences) {
      const { origin, occurrenceIndex, raw } = occurrence
      const urls = routeUrls(report, raw, opts)
      const identity = identityOf(raw, urls)
      const id = stableId(identity, raw, origin, occurrenceIndex)
      const row = { id, origin, occurrenceIndex, ...identity, raw: structuredClone(raw), remeasure: null, basis: '', verdict: null }
      const spec = requestFor(row)
      if (!spec.supported) row.remeasureReason = spec.reason
      else if (!urls.site || !urls.source) row.remeasureReason = 'route pair URLs were not available in the detector output'
      else {
        try {
          const [site, source] = await Promise.all([
            measurePage(browser, urls.site, identity, spec.request, 'site', report.profile),
            measurePage(browser, urls.source, identity, spec.request, 'source', report.profile)
          ])
          if (!site.measured || !source.measured) row.remeasureReason = `site: ${site.reason ?? 'measured'}; source: ${source.reason ?? 'measured'}`
          else {
            row.remeasure = { method: 'targeted-dom-read/2', site, source }
            row.basis = `independent measurement: resolved ${raw.kind} target and read its box/styles at the requested state`
          }
        } catch (e) { row.remeasureReason = String(e.message).split('\n')[0].slice(0, 240) }
      }
      rows.push(row)
    }
  })
  const inventory = occurrences.map(({ origin, occurrenceIndex, raw }) => {
    const urls = routeUrls(report, raw, opts)
    return { origin, occurrenceIndex, raw: structuredClone(raw), identity: identityOf(raw, urls) }
  })
  const absFindings = path.resolve(opts['--findings'])
  const location = detectorLocation(absFindings)
  const ledger = {
    schema: 'audit-reconcile/2', detector: location.path, detectorScope: location.scope, detectorHash: sha(Buffer.from(findingsText)),
    occurrences: occurrences.length, pagePairs: Object.values(report.pages ?? {}).filter((page) => page && (page.site || page.source)).map(({ route, site, source }) => ({ route: route ?? null, site: site ?? null, source: source ?? null })), inventory, rows
  }
  writeFileSync(opts['--out'], `${JSON.stringify(ledger, null, 2)}\n`)
}
function readReaudit(file) {
  const text = readFileSync(file, 'utf8')
  if (file.endsWith('.json')) {
    const data = JSON.parse(text)
    return Array.isArray(data) ? data : data.items
  }
  const blocks = text.split(/(?=^##?\s)/m)
  const items = blocks.map((block) => {
    const get = (name) => block.match(new RegExp(`^\\s*(?:[-*]\\s*)?${name}\\s*:\\s*(.*?)\\s*$`, 'im'))?.[1]
    return { id: get('id'), kind: get('kind'), control: get('control'), width: Number(get('width')), state: get('state') }
  }).filter((item) => item.id)
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim().replace(/^`|`$/g, ''))
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length - 1; i++) {
    const header = cells(lines[i]).map((x) => x.toLowerCase())
    if (!['id', 'kind', 'control', 'width', 'state'].every((key) => header.includes(key))) continue
    const columns = Object.fromEntries(['id', 'kind', 'control', 'width', 'state'].map((key) => [key, header.indexOf(key)]))
    for (let j = i + 2; j < lines.length && lines[j].includes('|'); j++) {
      const row = cells(lines[j])
      const item = Object.fromEntries(Object.entries(columns).map(([key, at]) => [key, key === 'width' ? Number(row[at]) : row[at]]))
      if (item.id) items.push(item)
    }
  }
  return items
}
function check(opts) {
  const problems = []
  let ledger
  try { ledger = JSON.parse(readFileSync(opts['--ledger'], 'utf8')) } catch (e) { throw new Error(`cannot read ledger: ${e.message}`) }
  if (ledger.schema !== 'audit-reconcile/2' || !Array.isArray(ledger.rows) || !Array.isArray(ledger.inventory) || !Array.isArray(ledger.pagePairs)) throw new Error('ledger schema or rows/inventory/pagePairs are invalid')
  if (!Number.isInteger(ledger.occurrences) || ledger.occurrences !== ledger.rows.length) problems.push(`declared occurrence count ${ledger.occurrences} does not equal row count ${ledger.rows.length}`)
  const ledgerPath = path.resolve(opts['--ledger'])
  let detectorFile = null
  if (opts['--findings']) detectorFile = path.resolve(opts['--findings'])
  else if (ledger.detectorScope === 'repo') detectorFile = REPO_ROOT ? path.resolve(REPO_ROOT, ledger.detector) : null
  else if (ledger.detectorScope === 'external') {
    const beside = path.resolve(path.dirname(ledgerPath), ledger.detector ?? '')
    detectorFile = beside
  }
  let currentOccurrences = []
  if (!detectorFile || !existsSync(detectorFile)) problems.push(`detector occurrence source is unavailable${detectorFile ? ` (${path.basename(detectorFile)})` : ''}`)
  else {
    try {
      const detectorText = readFileSync(detectorFile, 'utf8')
      if (sha(Buffer.from(detectorText)) !== ledger.detectorHash) problems.push('detector occurrence source hash changed')
      const report = JSON.parse(detectorText)
      if (!sameJson(ledger.pagePairs, Object.values(report.pages ?? {}).filter((page) => page && (page.site || page.source)).map(({ route, site, source }) => ({ route: route ?? null, site: site ?? null, source: source ?? null })))) problems.push('ledger page route pairs do not match detector output')
      currentOccurrences = auditLiveOccurrences(report).map(({ origin, occurrenceIndex, raw }) => ({ origin, occurrenceIndex, raw, identity: identityOf(raw, routeUrls(report, raw, {})) }))
    } catch (e) { problems.push(`detector occurrence source is unreadable: ${e.message}`) }
  }
  const expected = currentOccurrences
  const expectedKeys = expected.map(({ origin, occurrenceIndex, raw }) => sha({ origin, occurrenceIndex, raw })).sort()
  const inventoryKeys = ledger.inventory.map(({ origin, occurrenceIndex, raw }) => sha({ origin, occurrenceIndex, raw })).sort()
  const rowKeys = ledger.rows.map(({ origin, occurrenceIndex, raw }) => sha({ origin, occurrenceIndex, raw })).sort()
  if (!sameList(expectedKeys, inventoryKeys)) problems.push('ledger inventory does not equal detector occurrences')
  const expectedIdentity = new Map(expected.map((item) => [sha({ origin: item.origin, occurrenceIndex: item.occurrenceIndex, raw: item.raw }), item.identity]))
  for (const item of ledger.inventory) if (!sameJson(item.identity, expectedIdentity.get(sha({ origin: item.origin, occurrenceIndex: item.occurrenceIndex, raw: item.raw })))) problems.push('ledger inventory identity does not match detector occurrence fields')
  if (!sameList(expectedKeys, rowKeys)) problems.push(`ledger rows do not equal detector occurrences (expected ${expected.length}, got ${ledger.rows.length}; missing or duplicate occurrences)`)
  const identityReport = { pages: Object.fromEntries(ledger.pagePairs.map((page, index) => [`page-${index}`, page])) }
  const identities = new Map()
  for (const item of ledger.inventory) {
    const calculated = identityOf(item.raw, routeUrls(identityReport, item.raw, {}))
    if (!sameJson(item.identity, calculated)) problems.push(`detector occurrence ${item.origin}: identity fields do not match its raw finding`)
    identities.set(sha({ origin: item.origin, occurrenceIndex: item.occurrenceIndex, raw: item.raw }), item.identity)
  }
  const ids = new Set()
  for (const row of ledger.rows) {
    if (!row.id || ids.has(row.id)) problems.push(`${row.id ?? '(missing id)'}: duplicate id`)
    ids.add(row.id)
    const identityKey = sha({ origin: row.origin, occurrenceIndex: row.occurrenceIndex, raw: row.raw })
    const expectedIdentity = identities.get(identityKey)
    if (!expectedIdentity || !sameJson(identityFields(row), expectedIdentity)) problems.push(`${row.id}: route pair, width, theme, control or state does not match its raw finding`)
    if (row.id !== stableId(expectedIdentity ?? identityFields(row), row.raw, row.origin, row.occurrenceIndex)) problems.push(`${row.id}: id is inconsistent with its raw finding identity`)
    const measurementSpec = requestFor(row)
    if (row.remeasure === null) problems.push(`${row.id}: independent measurement unavailable (${row.remeasureReason ?? 'no reason supplied'})`)
    if (row.remeasure !== null && !measurementSpec.supported) problems.push(`${row.id}: ${measurementSpec.reason}; this kind cannot claim an independent measurement`)
    if (row.remeasure && row.basis?.includes('independent measurement') !== true) problems.push(`${row.id}: basis does not name the independent measurement`)
    if (row.remeasure === null && row.basis?.includes('independent measurement')) problems.push(`${row.id}: unavailable measurement cannot claim an independent measurement basis`)
    if (row.remeasure && (!row.remeasure.site?.measured || !row.remeasure.source?.measured)) problems.push(`${row.id}: remeasurement does not contain measured site and source targets`)
    const verdict = row.verdict
    if (!verdict) { problems.push(`${row.id}: no verdict`); continue }
    if (!['REAL', 'FALSE_POSITIVE', 'UNRESOLVED'].includes(verdict.value)) { problems.push(`${row.id}: invalid verdict ${verdict.value}`); continue }
    if (verdict.value === 'UNRESOLVED') problems.push(`${row.id}: UNRESOLVED remains`)
    if (verdict.value === 'FALSE_POSITIVE') {
      const fixture = verdict.fixture && path.resolve(path.dirname(ledgerPath), verdict.fixture)
      try { if (!fixture) throw new Error('no fixture path cited'); readFileSync(fixture); problems.push(`${row.id}: FALSE_POSITIVE requires a fixture and remains incomplete until fixed`) }
      catch (e) { if (!String(e.message).includes('requires a fixture')) problems.push(`${row.id}: FALSE_POSITIVE fixture does not exist (${verdict.fixture ?? 'missing path'})`); else problems.push(`${row.id}: FALSE_POSITIVE ${e.message}`) }
    }
  }
  let items = null
  if (opts['--reaudit']) {
    try { items = readReaudit(opts['--reaudit']); if (!Array.isArray(items)) throw new Error('expected items array') }
    catch (e) { problems.push(`re-audit file unreadable: ${e.message}`) }
  }
  for (const row of ledger.rows) if (row.verdict?.value === 'REAL' && row.verdict.reAuditId && !opts['--reaudit']) problems.push(`${row.id}: cited re-audit id requires --reaudit`)
  for (const row of ledger.rows) if (row.verdict?.value === 'REAL' && row.verdict.reAuditId && items) {
    const item = items.find((x) => x.id === row.verdict.reAuditId)
    const raw = row.raw ?? {}
    if (!item || item.kind !== raw.kind || item.control !== labelOf(raw) || Number(item.width) !== Number(raw.width) || item.state !== (raw.state ?? raw.action ?? null)) problems.push(`${row.id}: cited re-audit item ${row.verdict.reAuditId} does not match kind, control, width and state`)
  }
  if (problems.length) { process.stderr.write(`${problems.map((p) => `- ${p}`).join('\n')}\n`); process.exitCode = 1 }
  else process.stdout.write(`Complete: ${ledger.rows.length} occurrence(s) reconciled.\n`)
}
function identityFields(row) { return { routePair: row.routePair, width: row.width, theme: row.theme, control: row.control, state: row.state } }
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
function sameList(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]) }

try {
  const opts = args(process.argv.slice(2))
  if (opts.command === 'measure') await measure(opts)
  else check(opts)
} catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1 }
