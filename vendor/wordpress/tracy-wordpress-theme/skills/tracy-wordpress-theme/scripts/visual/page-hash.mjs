// The page hash behind `--reuse`: everything that can change how one page renders, hashed, so a
// rerun after a fix measures only the pages the fix could have touched and points the rest at
// their earlier evidence. WordPress inputs (EmDash hashes view imports and seed slices; here the
// equivalents are):
//   source   the rendered source snapshot of the page (spec/reference/rendered/…html)
//   target   the page's HTML as served (fetched by the runner — content, block markup, inline colours)
//   theme    the template WordPress serves the page (contract page/layout `template`), every part, the patterns of the page's section types,
//            assets/css/*, assets/js/*, theme.json, functions.php, inc/*.php
//   contract the contract slice that decides what is measured for this page, with the key of the
//            source framework's selector profile (lib/framework-selectors.mjs)
//   tool     TOOL_VERSION of the runner — new checks invalidate old evidence
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { patternEntries, patternHits, patternSnapshot, registeredPatterns } from './pattern-registry.mjs'
import { selectorProfileOfContract } from '../lib/framework-selectors.mjs'
import { checkApplicability } from './applicability.mjs'

// 4: the hover check reads x/y as well as w/h, and reads them after the motion settles. Evidence
// taken by version 3 answers a narrower question — a hover that moved an element was not looked
// for at all — so a page whose hash is otherwise unchanged must be measured again, not reused.
// 5: parity pairs a repeat within its own section before its tag, and a link inside a paragraph
// of the same words is one place (JA Vega M4b: six card links paired with a button); the template
// hashed is the one WordPress serves the page. Evidence of version 4 is measured again.
// 6: settle() leaves a picture the scroll loaded lazy (a `sizes="auto"` picture switched to eager was
// chosen again during the shot), a dark stage shoots the source in dark once it is read back dark,
// and the bright-border scan sets apart the borders the source draws itself (JA Vega M4c, #19).
// Evidence of version 5 is measured again.
// 7: words drawn in no ink are no text, a repeated label pairs on its own side of the chrome line,
// motion state classes leave labels, hover and mega walks are measured once more before a finding, and
// the white-surface, dark-on-dark and contrast scans set apart what the source draws itself in dark
// (JA Vega M4d, #27). Evidence of version 6 is measured again.
// 8: the body's text rendering is compared on every axis with a source, and a layout representative's
// narrowest axis measures the container at each of the source's declared breakpoints (JA Vega M6-13,
// M6-14, #37). Evidence of version 7 is measured again.
// 9: on every page run the header menus are captured open on both sides and compared, boxes,
// styles and pictures (#50). Evidence of version 8 never opened one and is measured again.
// 10: the sole drawer toggle of each header pairs by its markup, and a pair the contract declares
// (`design.menus.pairs`) by its selectors (#56). Evidence of version 9 left an icon-only drawer
// toggle unmatched and never opened it; it is measured again.
// 11: the header's triggers are read by the source framework's selector profile (#66: T3's
// off-canvas and Bootstrap 3 collapse toggles, a class-named collapse panel), and the profile is
// part of the hash (`selectors`). Evidence of version 10 never saw a T3 trigger; it is measured again.
// 12: the interaction-parity probe (interaction.json) joins every run, and a contract's exceptions must cite a
// decision that exists (validateContract). Evidence of version 11 has neither and is measured again.
// 13: a source page whose header menus cannot open (no script, or controls that do not react twice) is a
// measured fact of the source (`menu-open-source-static`), not `menu-open-not-measured`, once another page
// of the contract opens the same menu on the source. Evidence of version 12 is measured again.
// 14: dark scan counterparts use the colour/alpha tolerance and retain both values as `sourceShared`.
// Evidence of version 13 has no source-shared measurements and is measured again.
export const TOOL_VERSION = 'visual-qa/14'
const LEGACY_TOOL_VERSION = 'visual-qa/13'

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function filesUnder(dir, pick = () => true) {
  if (!existsSync(dir)) return []
  const out = []
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) out.push(...filesUnder(p, pick))
    else if (pick(p)) out.push(p)
  }
  return out.sort()
}

/**
 * The theme files that draw a page: the template it is served by (`template`, else its layout's),
 * all parts, its sections' patterns (by registered slug), CSS/JS, theme.json, PHP. A template that is not named, or not
 * in the theme, is an Error — skipped, a page hashed no template at all and a template changed
 * before its HTML moved (not yet deployed) was reused as unchanged (JA Vega M4b, 26/09).
 */
export function themeFilesFor({ themeDir, layout, template = null, patternSlugs = [] }) {
  const files = new Set()
  const add = (p) => {
    if (existsSync(p)) files.add(p)
  }
  // The page and its layout name one template (contract.mjs validates it); two names would hash one
  // file here while Fast Gate selects by the other.
  if (template && layout?.template && template !== layout.template) throw new Error(`page template ${template} is not its layout ${layout.id ?? '?'}'s ${layout.template} — regenerate the contract`)
  const tpl = template ?? layout?.template ?? null
  if (!tpl) throw new Error(`layout ${layout?.id ?? '?'} has no template — the contract does not know what WordPress serves this page`)
  if (!existsSync(path.join(themeDir, tpl))) throw new Error(`${tpl} (layout ${layout?.id ?? '?'}) is not in the theme ${themeDir}`)
  files.add(path.join(themeDir, tpl))
  for (const f of filesUnder(path.join(themeDir, 'parts'))) files.add(f)
  // A pattern is the file that REGISTERS the slug (`acm-hero.php` registers `section-hero`); one that no
  // file registers, or two that do, cannot be hashed — a skipped file would leave an edit unseen.
  if (patternSlugs.length) {
    const registered = registeredPatterns(themeDir)
    for (const slug of patternSlugs) {
      const hits = patternHits(registered, slug)
      if (hits.length !== 1) throw new Error(`pattern ${slug} is ${hits.length ? `registered by ${hits.join(', ')}` : 'not registered by any file in patterns/'} of ${themeDir} — the page hash cannot cover it`)
      files.add(path.join(themeDir, 'patterns', hits[0]))
    }
  }
  for (const f of filesUnder(path.join(themeDir, 'assets'), (p) => /\.(css|js)$/.test(p))) files.add(f)
  add(path.join(themeDir, 'theme.json'))
  add(path.join(themeDir, 'functions.php'))
  for (const f of filesUnder(path.join(themeDir, 'inc'), (p) => p.endsWith('.php'))) files.add(f)
  return [...files].sort()
}

/**
 * @param {object} a
 * @param {object} a.contract
 * @param {object} a.page              a contract page
 * @param {string|null} a.themeDir     built theme dir (src/<slug>) — null hashes no theme files
 * @param {string|null} a.specDir      spec-pack dir (for the rendered source)
 * @param {string} [a.targetHtml]      the served HTML of the page
 * @param {string[]} [a.patternSlugs]  pattern files the page's sections use (from patterns.map + sections)
 */
export function pageHash({ contract, page, themeDir = null, specDir = null, targetHtml = '', patternSlugs = [] }) {
  const h = createHash('sha256')
  const parts = { source: null, target: null, themeFiles: 0, contract: null, tool: TOOL_VERSION }
  const add = (label, text) => h.update(`${label}\n${text}\n`)
  if (specDir && page.sourceRendered && existsSync(path.join(specDir, page.sourceRendered))) {
    parts.source = sha(readFileSync(path.join(specDir, page.sourceRendered)))
    add('source', parts.source)
  }
  parts.target = sha(targetHtml)
  add('target', parts.target)
  if (themeDir) {
    const layout = contract.layouts?.find((l) => l.id === page.layout) ?? null
    const entries = []
    const patternsDir = path.join(themeDir, 'patterns') + path.sep
    for (const f of themeFilesFor({ themeDir, layout, template: page.template ?? null, patternSlugs }))
      if (!f.startsWith(patternsDir)) entries.push([`theme ${path.relative(themeDir, f)}`, readFileSync(f)])
    // The registration and the hashed bytes are one read: the file that registers a slug is the content hashed.
    if (patternSlugs.length) {
      const snapshot = patternSnapshot(themeDir)
      const named = new Set()
      for (const slug of patternSlugs) {
        const hits = patternEntries(snapshot, slug)
        if (hits.length !== 1 || !hits[0].bytes) throw new Error(`pattern ${slug} is ${hits.length > 1 ? `registered by ${hits.map((h) => h.name).join(', ')}` : hits.length ? `${hits[0].name}, too large to read whole` : 'not registered by any file in patterns/'} of ${themeDir} — the page hash cannot cover it`)
        if (named.has(hits[0].name)) continue
        named.add(hits[0].name)
        entries.push([`theme patterns/${hits[0].name}`, hits[0].bytes])
      }
    }
    for (const [label, bytes] of entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      add(label, sha(bytes))
      parts.themeFiles++
    }
  }
  const slice = {
    variants: contract.variants,
    stages: contract.visual?.stages,
    theme: contract.design?.theme,
    rules: contract.design?.rules,
    coverage: contract.design?.coverage,
    parity: contract.design?.parity,
    images: contract.design?.images,
    exceptions: contract.design?.exceptions,
    containers: contract.design?.containers,
    menus: contract.design?.menus,
    interactions: contract.interactions,
    // the source framework's selector profile: another framework, or a profile whose lists changed,
    // reads other elements on the same HTML (#66)
    selectors: selectorProfileOfContract(contract).profile.key,
    page: {
      path: page.path, status: page.status, identity: page.identity, states: page.states, variants: page.variants, template: page.template ?? null,
      // Preserve the legacy hash for html/url/image pages. Only `none` changes whether source checks
      // can be reused, so only that non-default applicability changes the page's contract slice.
      ...(checkApplicability(page.referenceKind, 'content-parity') === 'not-applicable' ? { referenceKind: 'none' } : {})
    }
  }
  parts.contract = sha(JSON.stringify(slice))
  add('contract', parts.contract)
  // Applicability is a contract change only for a no-reference page. Keep the legacy default for
  // all source-backed (and legacy-kind) pages so identical html/url inputs retain their hash.
  add('tool', checkApplicability(page.referenceKind, 'content-parity') === 'not-applicable' ? TOOL_VERSION : LEGACY_TOOL_VERSION)
  return { hash: `sha256:${h.digest('hex')}`, parts }
}
