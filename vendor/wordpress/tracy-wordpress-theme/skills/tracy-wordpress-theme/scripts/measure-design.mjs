#!/usr/bin/env node
// Measure explicitly planned source design rules and produce a contract candidate.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateDesign, designHash } from './design-contract.mjs'
import { captureDesign } from './design-probe.mjs'
import { withBrowser, withPage } from './lib/browser.mjs'

const fail = (message) => { throw new Error(message) }
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const nonempty = (x) => typeof x === 'string' && x.trim().length > 0
function argumentsOf(argv) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!['--spec', '--source-site', '--plan', '--out'].includes(key)) fail(`Unknown argument ${key}`)
    if (result[key]) fail(`Duplicate argument ${key}`)
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`${key} requires a value`)
    result[key] = argv[++i]
  }
  for (const key of ['--spec', '--source-site', '--plan', '--out']) if (!result[key]) fail(`Missing ${key}`)
  return result
}
function validatePlan(plan, contract) {
  if (!object(plan) || !Array.isArray(plan.rules) || plan.rules.length === 0) fail('Plan must contain a non-empty rules array')
  const pageIds = new Set(contract.pages.map((p) => p.id)), ids = new Set()
  for (const [i, r] of plan.rules.entries()) {
    const label = `plan.rules[${i}]`
    if (!object(r)) fail(`${label} must be an object`)
    for (const key of ['id', 'category', 'selector']) if (!nonempty(r[key])) fail(`${label}.${key} must be a non-empty string`)
    if (!['typography', 'color', 'layout', 'component'].includes(r.category)) fail(`${label}.category is unknown`)
    if (ids.has(r.id)) fail(`Duplicate rule id ${r.id}`)
    ids.add(r.id)
    const existing = contract.rules.find((rule) => rule.id === r.id)
    if (existing && (existing.selector !== r.selector || existing.category !== r.category)) {
      fail(`${label} changes existing rule ${r.id} selector/category; expected ${existing.category} ${existing.selector}`)
    }
    if (!Array.isArray(r.pages) || r.pages.length === 0 || r.pages.some((p) => !nonempty(p)) || new Set(r.pages).size !== r.pages.length) fail(`${label}.pages must contain distinct page ids`)
    for (const page of r.pages) if (!pageIds.has(page)) fail(`${label} references unknown page id ${page}`)
    if (!Array.isArray(r.properties) || r.properties.length === 0 || r.properties.some((p) => !nonempty(p)) || new Set(r.properties).size !== r.properties.length) fail(`${label}.properties must contain distinct non-empty CSS properties`)
  }
}
function comparablePath(path) {
  return path === '/' ? '/' : path.replace(/\/+$/, '')
}
function samePlannedRoute(planned, actual) {
  try {
    const expected = new URL(planned), final = new URL(actual)
    return expected.origin === final.origin && comparablePath(expected.pathname) === comparablePath(final.pathname)
  } catch { return false }
}
function sourceUrl(url, origin, mode) {
  const u = new URL(url.replaceAll('{mode}', mode))
  const base = new URL(origin)
  u.protocol = base.protocol
  u.host = base.host
  return u.href
}
const propertyName = (p) => p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
function requestFor(rules, page, variant, url, contract) {
  return {
    contractId: contract.id, contractHash: designHash(contract), page: page.id, variant: variant.id,
    url, expectedUrl: url, identity: page.identity, width: variant.width, height: variant.height, mode: variant.mode,
    theme: contract.theme, coverage: [], tokens: [],
    rules: rules.map((rule) => ({ id: rule.id, selector: rule.selector, properties: rule.properties.map(propertyName) }))
  }
}
async function measure(args) {
  let origin
  try { origin = new URL(args['--source-site']) } catch { fail('--source-site must be an http(s) origin') }
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== args['--source-site'] || origin.username) fail('--source-site must be a bare http(s) origin')
  const specDir = resolve(args['--spec'])
  const contractPath = join(specDir, 'design-contract.json')
  const contractText = readFileSync(contractPath, 'utf8')
  const contract = JSON.parse(contractText)
  const plan = JSON.parse(readFileSync(resolve(args['--plan']), 'utf8'))
  validatePlan(plan, contract)
  const out = resolve(args['--out'])
  mkdirSync(out, { recursive: true })
  const cases = []
  const plannedPages = [...new Set(plan.rules.flatMap((r) => r.pages))]
  await withBrowser(async (browser) => {
    for (const pageId of plannedPages) {
      const planned = plan.rules.filter((r) => r.pages.includes(pageId))
        const pageSpec = contract.pages.find((p) => p.id === pageId)
        for (const variant of contract.variants) {
          const url = sourceUrl(pageSpec.url, origin.origin, variant.mode)
          const hook = `attr:${contract.theme.attribute}=${contract.theme[variant.mode + 'Value']}`
          const record = { page: pageId, variant: variant.id, requestedMode: variant.mode, url, mode: null, probe: null, reason: null }
          try {
            await withPage(browser, {
              viewport: { width: variant.width, height: variant.height }, theme: variant.mode,
              darkHook: variant.mode === 'dark' ? hook : null,
              lightHook: variant.mode === 'light' ? hook : null,
              hookUrl: url
            }, async (page) => {
              const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
              if (!response || response.status() >= 400) throw new Error(`source returned HTTP ${response?.status() ?? 'no response'}`)
              const finalUrl = page.url()
              if (!samePlannedRoute(url, finalUrl)) {
                record.reason = `redirected to ${finalUrl}`
                return
              }
              await page.evaluate(() => document.fonts?.ready)
              await page.waitForTimeout(250)
              const mode = await page.evaluate(({ selector, attribute, lightValue, darkValue }) => {
                const value = document.querySelector(selector)?.getAttribute(attribute)
                return value === darkValue ? 'dark' : value === lightValue ? 'light' : 'unknown'
              }, contract.theme)
              record.mode = mode
              if (mode !== variant.mode) {
                record.reason = `requested ${variant.mode} mode, observed ${mode}`
                return
              }
              const request = requestFor(planned, pageSpec, variant, url, contract)
              record.probe = await page.evaluate(captureDesign, request)
              if (!samePlannedRoute(url, record.probe.url)) {
                record.reason = `navigated to ${record.probe.url} before capture`
                return
              }
              if (pageSpec.identity && record.probe.identityMatches <= 0) {
                record.reason = `identity selector not found: ${pageSpec.identity}`
              }
            })
          } catch (error) { record.reason = error.message }
          cases.push(record)
      }
    }
  })
  const aggregateRules = plan.rules.map((rule) => {
    const results = {}
    for (const variant of contract.variants) {
      const variantResults = {}
      for (const property of rule.properties) {
        const values = [], failures = []
        for (const pageId of rule.pages) {
          const item = cases.find((c) => c.page === pageId && c.variant === variant.id)
          if (!item?.probe || item.reason) { failures.push({ page: pageId, reason: item?.reason ?? 'no observation' }); continue }
          const matches = item.probe.rules.find((r) => r.id === rule.id)?.elements ?? []
          if (!matches.length) { failures.push({ page: pageId, reason: 'no matching visible elements' }); continue }
          for (const element of matches) {
            const value = element.styles[propertyName(property)] ?? ''
            if (!value.trim()) failures.push({ page: pageId, element: element.path, reason: `missing computed property ${property}` })
            else values.push({ page: pageId, element: element.path, value: value.trim() })
          }
        }
        const unique = [...new Set(values.map((x) => x.value))].sort()
        if (!failures.length && unique.length === 1) variantResults[property] = { status: 'measured', value: unique[0], values }
        else variantResults[property] = {
          status: 'unmeasured', reason: failures.length ? failures : (unique.length > 1 ? 'matched elements disagree' : 'no value measured'),
          values
        }
      }
      results[variant.id] = variantResults
    }
    return { id: rule.id, category: rule.category, selector: rule.selector, pages: [...rule.pages], results }
  })
  const candidate = structuredClone(contract)
  const eligible = new Set()
  const ruleApplications = new Map()
  for (const measured of aggregateRules) {
    let target = candidate.rules.find((r) => r.id === measured.id)
    const allPropertiesMeasured = candidate.variants.every((v) => Object.values(measured.results[v.id]).every((r) => r.status === 'measured'))
    if (!target) {
      if (!allPropertiesMeasured) {
        ruleApplications.set(measured.id, { applied: false, reason: 'new rule requires every planned property measured for every variant' })
        continue
      }
      target = { id: measured.id, category: measured.category, selector: measured.selector, styles: Object.fromEntries(candidate.variants.map((v) => [v.id, {}])) }
      candidate.rules.push(target)
    } else {
      const referencedPages = candidate.pages.filter((p) => p.rules.includes(measured.id)).map((p) => p.id)
      const outsidePlan = referencedPages.filter((pageId) => !measured.pages.includes(pageId))
      if (outsidePlan.length || !allPropertiesMeasured) {
        const details = []
        if (outsidePlan.length) details.push(`not measured on contract pages that reference this rule: ${outsidePlan.join(', ')}`)
        if (!allPropertiesMeasured) details.push('not every planned property was measured for every variant')
        ruleApplications.set(measured.id, { applied: false, reason: details.join('; '), pagesOutsidePlan: outsidePlan })
        continue
      }
    }
    for (const variant of candidate.variants) for (const [property, measurement] of Object.entries(measured.results[variant.id]))
      if (measurement.status === 'measured') target.styles[variant.id][property] = measurement.value
    for (const pageId of measured.pages) {
      const pageMeasured = candidate.variants.every((variant) => {
        if (!Object.values(measured.results[variant.id]).every((result) => result.status === 'measured')) return false
        const item = cases.find((c) => c.page === pageId && c.variant === variant.id)
        const elements = item?.probe?.rules.find((r) => r.id === measured.id)?.elements ?? []
        return Boolean(item?.probe && elements.length && elements.every((element) => measuredRuleProperties(measured).every((property) => (element.styles[propertyName(property)] ?? '').trim())))
      })
      if (!pageMeasured) continue
      const page = candidate.pages.find((p) => p.id === pageId)
      if (!page.rules.includes(measured.id)) page.rules.push(measured.id)
    }
    eligible.add(measured.id)
    ruleApplications.set(measured.id, { applied: true })
  }
  // A pending note naming a category is resolved only when this run supplied a validated rule for it.
  candidate.pending = candidate.pending.filter((note) => {
    const match = String(note).match(/no (typography|color|layout|component) rule could be read/i)
    return !match || !aggregateRules.some((r) => r.category === match[1] && eligible.has(r.id))
  })
  const observations = {
    schemaVersion: 1, sourceSite: origin.origin, contractId: contract.id, inputContractHash: designHash(contract),
    measuredAt: new Date().toISOString(), pages: cases.map(({ page, variant, requestedMode, url, mode, reason, probe }) => ({ page, variant, requestedMode, url, mode, ...(reason ? { reason } : {}), ...(probe ? { probe } : {}) })),
    rules: aggregateRules.map((rule) => ({ ...rule, candidateUpdate: ruleApplications.get(rule.id) ?? { applied: false, reason: 'rule was not eligible for candidate update' } }))
  }
  writeFileSync(join(out, 'design-contract.candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`)
  let validation = { valid: true }
  try { validateDesign(candidate) } catch (error) {
    const expectedGap = /Resolve pending design decisions|Missing (?:typography|color|layout|component) rules/.test(error.message)
    if (!expectedGap) validation = { valid: false, error: error.message, fatal: true }
    else {
      const probe = structuredClone(candidate)
      probe.pending = []
      const missingCategories = ['typography', 'color', 'layout', 'component'].filter((category) => !probe.rules.some((rule) => rule.category === category))
      for (const category of missingCategories) probe.rules.push({
        id: `__measure_design_validation_${category}`, category, selector: 'body',
        styles: Object.fromEntries(probe.variants.map((variant) => [variant.id, { color: 'black' }]))
      })
      try {
        validateDesign(probe)
        validation = { valid: false, error: error.message, notYetValid: true, pending: candidate.pending, missingCategories }
      } catch (other) {
        validation = { valid: false, error: error.message, additionalError: other.message, fatal: true }
      }
    }
  }
  observations.validation = validation
  writeFileSync(join(out, 'observations.json'), `${JSON.stringify(observations, null, 2)}\n`)
  if (validation.fatal) throw new Error(`candidate failed design-contract validation: ${validation.error}${validation.additionalError ? `; also ${validation.additionalError}` : ''}`)
  return { cases: cases.length, measured: aggregateRules.reduce((n, r) => n + Object.values(r.results).flatMap(Object.values).filter((x) => x.status === 'measured').length, 0), candidateRules: eligible.size, validation }
}

function measuredRuleProperties(rule) {
  return Object.keys(rule.results[Object.keys(rule.results)[0]] ?? {})
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await measure(argumentsOf(process.argv.slice(2)))
    const gaps = [
      ...(result.validation.pending ?? []).map((note) => `pending: ${note}`),
      ...(result.validation.missingCategories ?? []).map((category) => `missing category: ${category}`)
    ]
    const status = result.validation.valid ? 'valid' : `not yet valid: ${gaps.join('; ') || result.validation.error}`
    process.stdout.write(`Measured ${result.measured} rule properties across ${result.cases} page/variant cases; candidate contains ${result.candidateRules} planned rules; validation ${status}.\n`)
  } catch (error) {
    process.stderr.write(`measure-design: ${error.message}\n`)
    process.exitCode = 1
  }
}
