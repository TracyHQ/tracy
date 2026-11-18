#!/usr/bin/env node
// Content coverage audit for an EmDash theme: does the theme's content map (emdash-content-map.mjs) declare every piece
// of text and every picture a visitor sees? Measured on a running site built from the theme, through the provenance
// stamps the template prints for a request with `X-Tracy-Preview: pick` (lib/emdash-bind.mjs). Read-only on the site.
// Writes the evidence to --out (findings.json: never commit it) and, with --write, content-coverage.json beside the
// content map, which /ops reads (Road to live, step Content coverage).
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/emdash-audit.mjs \
//     --site <url of a site seeded from the theme> --theme <theme folder> --out <dir> [--fit] [--write] [--max-pages 150] --token-file <agent token>
//
//   --token-file  the site's agent token (data/tracy-agent.token): the REST read then says which entry field holds each
//            media file, which binds a picture the template prints without a stamp. It is required: a stamp names the entry, not the file.
//   --fit    Slot fit (ADR 0039): measure a `fit` on every text and image slot of this run and, with --write, merge it
//            into content-map.json BEFORE the coverage file is built (the file names the map with its fit).
//
// Exit: 0 the policy passes · 1 holes, page problems or an incomplete run hold Publish · 2 usage or run error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { COVERAGE_POLICY, judgeCoverage } from '../../../../apps/tracy-web/src/lib/content-coverage/judge.js'
import {
  buildEmdashCoverageFile,
  fitFindingsOf,
  mediaIndexOf,
  runEmdashAudit,
  sha256Of
} from './lib/emdash-audit.mjs'
import { asciiJson, emdashContentMapOfTheme, serializeMap } from './lib/emdash-content-map.mjs'
import { measureSlotFit } from './lib/slot-fit.mjs'

const USAGE =
  'usage: emdash-audit.mjs --site <url> --theme <theme folder> --out <dir> [--fit] [--write] [--max-pages 150] [--viewports desktop,phone] --token-file f'
const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i > 0 ? process.argv[i + 1] : undefined
}
const flag = (n) => process.argv.includes(n)

async function main() {
  const siteUrl = arg('--site')
  const theme = arg('--theme')
  const out = arg('--out')
  if (!siteUrl || !theme || !out) {
    console.error(USAGE)
    return 2
  }
  const themeDir = resolve(theme)
  const outDir = resolve(out)
  mkdirSync(outDir, { recursive: true })
  const { version, template } = emdashContentMapOfTheme(themeDir)
  const contractDir = join(themeDir, 'contracts', version)
  const mapFile = join(contractDir, 'content-map.json')
  if (!existsSync(mapFile)) {
    console.error(`no content map at ${mapFile}: run emdash-content-map.mjs --theme ${theme} --write first`)
    return 2
  }
  let map = JSON.parse(readFileSync(mapFile, 'utf8'))
  const mod = await import(process.env.PLAYWRIGHT_MODULE ?? '@playwright/test')
  const chromium = mod.chromium ?? mod.default?.chromium
  const tokenFile = arg('--token-file')
  if (!tokenFile) {
    // A picture is bound by the site's own record of which field holds the file; without it every picture would be a guess.
    console.error(`--token-file is required\n${USAGE}`)
    return 2
  }
  const media = await mediaIndexOf({ siteUrl, token: readFileSync(tokenFile, 'utf8').trim(), map })
  const t0 = Date.now()
  const result = await runEmdashAudit({
    chromium,
    siteUrl,
    map,
    themeDir,
    media,
    viewports: String(arg('--viewports') ?? 'desktop,phone').split(','),
    cap: Number(arg('--max-pages') ?? 150),
    onPage: (url) => console.error(`[audit] ${url}`)
  })
  writeFileSync(
    join(outDir, 'findings.json'),
    JSON.stringify({ site: siteUrl, seconds: Math.round((Date.now() - t0) / 1000), ...result }, null, 1)
  )

  let slotFit = null
  if (flag('--fit')) {
    const measured = measureSlotFit({ map, findings: fitFindingsOf(result, map) })
    slotFit = measured.summary
    map = measured.map
    writeFileSync(flag('--write') ? mapFile : join(outDir, 'content-map.fit.json'), serializeMap(map))
  }
  const mapSha256 = sha256Of(
    readFileSync(flag('--write') || !slotFit ? mapFile : join(outDir, 'content-map.fit.json'))
  )
  const target = join(contractDir, 'content-coverage.json')
  const previous = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null
  const doc = buildEmdashCoverageFile({
    result,
    map,
    contractId: `${template}/emdash-0.x/${version}`,
    mapSha256,
    previous
  })
  writeFileSync(join(outDir, 'content-coverage.json'), asciiJson(doc))
  if (flag('--write')) writeFileSync(target, asciiJson(doc))
  const verdict = judgeCoverage(doc, COVERAGE_POLICY)
  console.log(
    JSON.stringify(
      {
        contract: doc.contract.id,
        pages: doc.pages,
        coverage: doc.coverage,
        bound: doc.bound,
        holds: verdict.holds,
        holes: verdict.blocking.length,
        byClass: verdict.byClass,
        accepted: verdict.accepted,
        hygiene: verdict.hygiene.length,
        incomplete: verdict.incomplete,
        slotFit,
        labelRulesApply: doc.labelRules.applies,
        written: flag('--write') ? target : null
      },
      null,
      1
    )
  )
  return verdict.holds ? 1 : 0
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e)
    process.exit(2)
  }
)
