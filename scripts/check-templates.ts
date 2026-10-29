/**
 * Design inspiration card gate — **PICTURES in the repo**, and **the card file on the release**.
 *
 * ⚠ THIS GATE'S SUBJECT CHANGED ON 16/09. Before that it checked the `card` block in `quickstarts.json`.
 * That block **was removed from the repo** (decided 16/09): a Design inspiration card lives in exactly ONE
 * place — `tracy_design_inspiration.json` on the GitHub release — because Publish and Unpublish from the
 * operator screen are **one click**, while a copy in the repo would demand a commit and an image build
 * after every click. Every check that read that `card` block lost its subject and went with it.
 *
 * TWO REAL SUBJECTS REMAIN, and both still fail silently:
 *
 * 1. **Pictures in `provision/templates/<id>/`.** They no longer reach customers through the image; they
 *    are the SOURCE an operator imports into each deployment's store (`scripts/template-shots-import.mjs`
 *    → `template_shots`). A name the store refuses does **not** turn the import red — the script REPORTS it
 *    and moves on, on purpose — so the result is a card drawn with three of its four pictures, exactly the
 *    failure that store was built to end. The "which names are allowed" rule is read straight from the
 *    store's code (`shotProblem`), not copied: two spellings of one rule are a sure way for one to go quietly wrong.
 *
 * 2. **The Design inspiration category list in `apps/tracy-web`.** It is a COPY (the tracy-web image does
 *    not carry the vendor catalogue), and when it drifts the operator sheet offers a category no filter
 *    has — a published card then shows up under no filter at all.
 *
 * 3. **The card file on the release itself** (behind `TRACY_CHECK_TEMPLATES_PROBE=1`, needs network and a
 *    token). A release carrying `tracy_design_inspiration.json` is a release **declaring itself on Design
 *    inspiration**; that file must be valid by the very `validateDesignInspiration` the server uses, and
 *    must declare the entry's `template.id`. A broken file there errors nowhere: the server drops the card,
 *    and the Design inspiration screen is simply one card short, exactly like an unpublished release.
 *
 * 🔒 THERE IS NO DEMO MEASUREMENT ANY MORE, and that is a consequence, not a loosening. The demo address
 * used to sit in the repo's `card.demo`, so the gate could read it; now it is **the live demo of the
 * environment serving the card** (`liveDemosByTag`), and `validateDesignInspiration` **forbids** a release
 * file carrying `demo`. No static file in this tree knows that address any more, so there is nothing to measure here.
 *
 * The GitHub lookup needs network; when it cannot be reached it records `skipped` WITH A NAME, never a silent green.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DESIGN_CATEGORIES } from '../apps/tracy-web/src/lib/design-inspiration.js'
import { shotProblem } from '../apps/tracy-web/src/lib/template-shots.js'
import { validateDesignInspiration } from '../apps/tracy-web/src/lib/tracy-setting.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROVISION = 'packages/fleet/tracy-fleet-operation/scripts/provision'
const QUICKSTARTS = `${PROVISION}/quickstarts.json`
const TEMPLATES = `${PROVISION}/templates`
const OD_CATALOG = 'vendor/tracy/od-design-system/catalog.json'
const CATEGORIES_AT = 'apps/tracy-web/src/lib/design-inspiration.js'
/** The repo holding each entry's release: the entry key IS the tag, unless the entry declares another `release`. */
const RELEASES_REPO = 'JoomlArt-Products/joomlart-products'
const DESIGN_INSPIRATION_FILE = 'tracy_design_inspiration.json'

/**
 * Every way a template picture folder is wrong, as sentences. Empty means clean.
 *
 * Pure, and the refusal reasons come from THE STORE'S OWN rule, not a second copy.
 * @param tree one element per folder under `templates/`, with the file names it holds
 */
export function pictureProblems(tree: { id: string; files: string[] }[]): string[] {
  const problems: string[] = []
  for (const entry of tree) {
    const folder = shotProblem({ templateId: entry.id, file: 'home-1440.png' })
    if (folder !== null) {
      problems.push(`${TEMPLATES}/${entry.id}: ${folder}`)
      continue
    }
    if (entry.files.length === 0) {
      problems.push(
        `${TEMPLATES}/${entry.id}: no pictures — this template's card has nothing to use as a thumbnail`
      )
      continue
    }
    for (const file of [...entry.files].sort()) {
      const why = shotProblem({ templateId: entry.id, file })
      if (why !== null) problems.push(`${TEMPLATES}/${entry.id}/${file}: ${why}`)
    }
  }
  return problems
}

/** The folders under `templates/`, each with the file names it holds. Loose files at the root are docs, skipped. */
function readTree(dir: string): { id: string; files: string[] }[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      id: e.name,
      files: readdirSync(join(dir, e.name), { withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => f.name)
    }))
}

/**
 * The category list in `apps/tracy-web` is a COPY of the vendor catalogue — keep them equal.
 *
 * The copy has a reason: the `tracy-web` image carries only `src/` plus four named files, and
 * `vendor/tracy/od-design-system/catalog.json` is not one of them. A copy without a gate drifts — and a
 * drift here errors nowhere: the operator sheet still draws a list, the admin can still pick, the card
 * still publishes, only no Design inspiration filter ever finds it.
 */
function checkCategories(problems: string[], skipped: string[]): void {
  const catalogPath = join(ROOT, OD_CATALOG)
  if (!existsSync(catalogPath)) {
    skipped.push(`category list: ${OD_CATALOG} is not in this tree`)
    return
  }
  const systems = (JSON.parse(readFileSync(catalogPath, 'utf8')) as { systems?: { category?: string }[] })
    .systems
  const fromVendor = [
    ...new Set((systems ?? []).map((s) => s.category).filter((c): c is string => typeof c === 'string'))
  ].sort()
  const declared = [...DESIGN_CATEGORIES].sort()
  const onlyVendor = fromVendor.filter((c) => !declared.includes(c))
  const onlyHere = declared.filter((c) => !fromVendor.includes(c))
  if (onlyVendor.length > 0)
    problems.push(`${CATEGORIES_AT}: missing categories present in ${OD_CATALOG} — ${onlyVendor.join(', ')}`)
  if (onlyHere.length > 0)
    problems.push(`${CATEGORIES_AT}: declares categories absent from ${OD_CATALOG} — ${onlyHere.join(', ')}`)
}

/**
 * Whether this release declares itself on Design inspiration, and if so whether its card file is valid.
 *
 * Not carrying that file is **not an error** — it is a release not yet Published, a valid state.
 * It is said with a `skipped` line so the reader knows what was NOT measured.
 */
async function checkRelease(
  entryId: string,
  templateId: string,
  tag: string,
  token: string,
  problems: string[],
  skipped: string[]
): Promise<void> {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'tch-check-templates',
    'x-github-api-version': '2022-11-28'
  }
  let release: any
  try {
    const response = await fetch(
      `https://api.github.com/repos/${RELEASES_REPO}/releases/tags/${encodeURIComponent(tag)}`,
      { headers, signal: AbortSignal.timeout(8000) }
    )
    if (response.status === 404) {
      skipped.push(`${entryId}: ${RELEASES_REPO} has no release ${tag} — card not read`)
      return
    }
    if (!response.ok) {
      skipped.push(`${entryId}: GitHub returned ${String(response.status)} for ${tag} — card not read`)
      return
    }
    release = await response.json()
  } catch (error) {
    skipped.push(`${entryId}: could not reach GitHub (${(error as Error).message})`)
    return
  }

  const asset = (release.assets ?? []).find((a: any) => a.name === DESIGN_INSPIRATION_FILE)
  if (!asset) {
    skipped.push(`${entryId}: release ${tag} does not carry ${DESIGN_INSPIRATION_FILE} yet (not Published)`)
    return
  }
  let card: unknown
  try {
    const response = await fetch(asset.url, {
      headers: { ...headers, accept: 'application/octet-stream' },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) {
      skipped.push(`${entryId}: GitHub returned ${String(response.status)} for ${DESIGN_INSPIRATION_FILE}`)
      return
    }
    card = JSON.parse(await response.text())
  } catch (error) {
    skipped.push(`${entryId}: reading ${DESIGN_INSPIRATION_FILE} failed (${(error as Error).message})`)
    return
  }

  const at = `${entryId} (${tag}) → ${DESIGN_INSPIRATION_FILE}`
  // The same `validateDesignInspiration` the server runs before serving a card: a card the server drops
  // must turn this gate red, rather than the Design inspiration screen quietly missing a card.
  for (const problem of validateDesignInspiration(card)) problems.push(`${at}: ${problem}`)
  const declared = (card as { template?: unknown } | null)?.template
  if (typeof declared === 'string' && declared !== templateId)
    problems.push(
      `${at}: declares template ${JSON.stringify(declared)}, the entry is ${JSON.stringify(templateId)}`
    )
}

async function main(): Promise<void> {
  const problems: string[] = []
  const skipped: string[] = []

  const templatesDir = join(ROOT, TEMPLATES)
  const tree = existsSync(templatesDir) ? readTree(templatesDir) : []
  if (tree.length === 0) skipped.push(`card pictures: ${TEMPLATES} has no template folders`)
  problems.push(...pictureProblems(tree))

  checkCategories(problems, skipped)

  const catalog = JSON.parse(readFileSync(join(ROOT, QUICKSTARTS), 'utf8')) as Record<string, any>
  const releases = Object.entries(catalog)
    .filter(([, entry]) => typeof entry?.template?.id === 'string')
    .map(([id, entry]) => ({
      id,
      templateId: entry.template.id as string,
      tag: (entry.release as string | undefined) ?? id
    }))

  // 🔒 THE RELEASE LOOKUP SITS BEHIND A FLAG, and also needs a token that can read a private repo. Two
  // conditions, two different skipped lines: "not enabled" and "enabled but no token" are different
  // states, and merging them is exactly the fail-open this repo refuses everywhere else.
  const token = process.env.TRACY_RELEASES_GITHUB_TOKEN ?? null
  if (process.env.TRACY_CHECK_TEMPLATES_PROBE !== '1')
    skipped.push(
      `${DESIGN_INSPIRATION_FILE} on ${String(releases.length)} releases: not enabled — run with TRACY_CHECK_TEMPLATES_PROBE=1`
    )
  else if (token === null)
    skipped.push(
      `${DESIGN_INSPIRATION_FILE} on releases: enabled but TRACY_RELEASES_GITHUB_TOKEN is missing — ${RELEASES_REPO} is a private repo`
    )
  else for (const r of releases) await checkRelease(r.id, r.templateId, r.tag, token, problems, skipped)

  if (problems.length > 0) {
    console.error(`Design templates card gate: ${String(problems.length)} error(s)\n`)
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  for (const s of skipped) console.log(`  · skipped — ${s}`)
  console.log(
    `Design templates card gate: ${String(tree.length)} picture folders clean, ${String(releases.length)} releases carry a template${skipped.length > 0 ? `, ${String(skipped.length)} measurements skipped (named)` : ''}.`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main()
