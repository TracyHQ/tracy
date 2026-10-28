#!/usr/bin/env node
// Content map verify viewer: one block per component (Joomla module, article, ...) with a screenshot whose
// content-map slots are outlined and numbered, next to a table of those slots' values (sample, role, fit, box).
// Slots the audit could not locate or that no page shows are listed apart, with the reason; four mechanical rules
// mark suspicious slots. It never guesses a position and writes nothing to the site (the audit is read-only).
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/verify-viewer.mjs \
//     --site <url of a site built from the quickstart> --template <slug>/<cms, e.g. ja-boxing/j6> --version <x.y.z> \
//     --out <empty folder outside the repo> [--max-pages 80] [--reuse]
//   or give the contract folder itself: --contract <dir> [--version <label>]
//
// --reuse keeps the audit findings and module boxes already in <out>/.audit (no browser run for them).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isFactRole } from '../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { runAudit } from './lib/audit.mjs'
import { loadContract } from './lib/contract.mjs'
import { openContext } from './lib/render.mjs'
import { renderCrops } from './lib/verify/crops.mjs'
import { locate } from './lib/verify/locate.mjs'
import { moduleBoxes } from './lib/verify/module-boxes.mjs'
import { buildHtml } from './lib/verify/page-html.mjs'

const USAGE =
  'usage: verify-viewer.mjs --site <url> --out <dir> (--template <slug/j6> --version <x.y.z> | --contract <dir> [--version <label>]) [--max-pages 80] [--reuse]'
const CONTRACTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../tracy-joomla-quickstart/contracts')

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const k = argv[i].slice(2)
    o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

/** Playwright from the workspace root (`@playwright/test` is a root dev dependency), or an override. */
async function chromiumOf() {
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
  return mod.chromium ?? mod.default?.chromium
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const contractDir = o.contract
    ? resolve(o.contract)
    : o.template && o.version
      ? join(CONTRACTS, o.template, o.version)
      : null
  if (!o.site || !o.out || !contractDir) {
    console.error(USAGE)
    return 2
  }
  if (!existsSync(join(contractDir, 'content-map.json'))) {
    console.error(`no content-map.json in ${contractDir}`)
    return 2
  }
  const site = new URL(String(o.site).replace(/\/?$/, '/')).href
  const label = String(o.version ?? basename(contractDir))
  const out = resolve(o.out)
  const auditDir = join(out, '.audit')
  mkdirSync(auditDir, { recursive: true })
  const chromium = await chromiumOf()
  const contract = loadContract(contractDir, site)

  const findingsFile = join(auditDir, 'findings.json')
  let findings
  if (o.reuse && existsSync(findingsFile)) findings = readJson(findingsFile)
  else {
    console.error(
      `[verify] audit ${site}: ${contract.map.slots.length} slots, ${contract.pages.length} pages`
    )
    const run = await runAudit({
      chromium,
      siteUrl: site,
      contract,
      dbIndex: null,
      sourceIndex: null,
      outDir: auditDir,
      cap: Number(o['max-pages'] ?? 80),
      viewports: ['desktop', 'phone']
    })
    findings = { site, generatedAt: new Date().toISOString(), ...run }
    writeFileSync(findingsFile, JSON.stringify(findings))
  }

  const modFile = join(auditDir, 'module-boxes.json')
  let mods
  if (o.reuse && existsSync(modFile)) mods = readJson(modFile)
  else {
    console.error('[verify] measuring module wrappers on every audited page')
    mods = await moduleBoxes({ chromium, openContext, findings })
    writeFileSync(modFile, JSON.stringify(mods))
  }

  const model = locate({ map: contract.map, findings, isFactRole, mods })
  await renderCrops({ chromium, model, auditDir, outDir: out })
  writeFileSync(
    join(out, 'index.html'),
    buildHtml({ model, label, site, generatedAt: findings.generatedAt, isFactRole })
  )
  console.log(join(out, 'index.html'))
  const c = model.counts
  console.error(
    `[verify] components ${c.components} · located ${c.located} · not located ${c.notLocated} · not shown ${c.notShown} · suspicious ${c.suspicious}`
  )
  return 0
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error)
    process.exit(2)
  }
)
