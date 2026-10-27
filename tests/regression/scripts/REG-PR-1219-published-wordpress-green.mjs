#!/usr/bin/env node
/**
 * REG-PR-1219: the eight Published WordPress quickstarts cut by PR #1219 keep what made them pass the
 * Template Customization Question Readiness check, read off the tree with the check's own readers:
 *   S1 each theme's block templates and the parts its demo does not override write no interface word outside a
 *      translation (LANG-2),
 *   S2 no date block or PHP date call in the theme writes an English-order format (LANG-6),
 *   S3 each new contract version declares its demo company names, its own blogname among them (ABOUT-3),
 *   S4 template-profiles.json has a row for each new quickstart version (REL-3, FAV-1, LOGO-*, STAB-1).
 * Exit 1 with the first broken step; prints one line per step.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hardCodedWords } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/hard-coded-words.js'
import {
  blockDateFormats,
  dateFormatsIn
} from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/english-date-formats.js'
import { blocksOf } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/site-pages/wordpress-blocks.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const THEMES = path.join(ROOT, 'packages/cms/tracy-wordpress-theme/src')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
const RELEASES = [
  ['quickstart/ja-essence/wp7', 'ja-essence', '1.0.17', 'wp-ja-essence', 'JA Essence'],
  ['quickstart/ja-impact/wp7', 'ja-impact', '1.0.8', 'wp-ja-impact', 'JA Impact'],
  ['quickstart/ja-kinetic/wp7', 'ja-kinetic', '1.0.8', 'wp-ja-kinetic', 'Kinetic'],
  ['quickstart/ja-morgan/wp7', 'ja-morgan', '1.1.13', 'wp-ja-morgan', 'JA Morgan'],
  ['quickstart/ja-nova/wp7', 'ja-nova', '1.1.11', 'wp-ja-nova', 'ja_nova'],
  ['quickstart/ja-vega/wp7', 'ja-vega', '1.1.13', 'wp-ja-vega', 'JA Vega'],
  ['tracy-base/wp7', 'tracy-base', '1.1.3', 'tracy-base', 'Tracy Base'],
  ['tracy-business/wp7', 'tracy-business', '1.3.5', 'wp-tracy-business', 'Northgate']
]

/** Every file under a directory, relative paths. */
function filesOf(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) out.push(...filesOf(full, base))
    else out.push(path.relative(base, full))
  }
  return out
}

const problems = { S1: [], S2: [], S3: [], S4: [] }
const profiles = JSON.parse(
  readFileSync(path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
)
for (const [tag, template, version, theme, blogname] of RELEASES) {
  const dir = path.join(THEMES, theme)
  // The demo database overrides these parts (the presentation lock pins them), so the theme file is not drawn.
  const lock = JSON.parse(
    readFileSync(path.join(CONTRACTS, template, 'wp7', version, 'presentation-lock.json'), 'utf8')
  )
  const overridden = new Set(Object.keys(lock.templateParts ?? {}).map((slug) => `parts/${slug}.html`))
  for (const file of filesOf(dir)) {
    const text = readFileSync(path.join(dir, file), 'utf8')
    if (/^(templates|parts)\/[^/]+\.html$/.test(file) && !overridden.has(file))
      for (const w of hardCodedWords(file, text))
        problems.S1.push(`${theme}/${file}:${w.line} '${w.text.slice(0, 30)}'`)
    if (file.endsWith('.php'))
      for (const d of dateFormatsIn('php', text)) problems.S2.push(`${theme}/${file}:${d.line} ${d.format}`)
    if (/\.(html|php)$/.test(file))
      for (const d of blockDateFormats(text, blocksOf))
        problems.S2.push(`${theme}/${file}:${d.line} ${d.format}`)
  }
  const copyFile = path.join(CONTRACTS, template, 'wp7', `${version}.copy.json`)
  const names = existsSync(copyFile)
    ? (JSON.parse(readFileSync(copyFile, 'utf8')).demoCompanyNames ?? [])
    : []
  if (!names.some((n) => blogname.toLowerCase().includes(String(n).toLowerCase())))
    problems.S3.push(
      `${template}/wp7/${version}: demoCompanyNames ${JSON.stringify(names)} does not rename "${blogname}"`
    )
  if (!profiles.releases?.[tag]?.[version])
    problems.S4.push(`${tag} ${version}: no template-profiles.json row`)
}
let failed = false
for (const [step, list] of Object.entries(problems)) {
  console.log(`${step}: ${list.length ? `FAIL ${list.length}: ${list.slice(0, 5).join('; ')}` : 'ok'}`)
  if (list.length) failed = true
}
process.exit(failed ? 1 : 0)
