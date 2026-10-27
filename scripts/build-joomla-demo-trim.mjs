#!/usr/bin/env node
/**
 * Generate `demo-trim-map.json` — the list of a sealed quickstart's own demo rows that a customer
 * site may hide, read by the Claude Cowork plugin's `demoTrim.*` operations (claude-cowork `DemoTrimProfile`).
 *
 * WHY A MACHINE AND NOT A REVIEWER: ja-kinetic ships 241 demo blog posts about a company that does
 * not exist. A hand-kept list of 241 keys goes stale the day the quickstart is captured again, and
 * a post missing from it does not fail anywhere — it just stays on the customer's site. This script
 * derives the list from the contract itself and `--check` compares it byte for byte, so a stale
 * list is a red gate instead of a demo post in front of a customer.
 *
 * 🔒 THE THREE CONTRACT FILES ARE NOT TOUCHED. The map is a fifth file pinned to their bytes by
 * `baseHash` (the multilingual profile's formula). Editing them would change the contract hash, and
 * every site already bound to it would refuse with "Installed content contract changed".
 *
 * THE RULE — what a customer's site keeps is what it is FOR:
 * - an article that a published menu item opens directly (`view=article&id=N`) is a PAGE — kept,
 *   UNLESS it sits in a category a hidden listing showed: that is a demo post the template's "Single
 *   Article" showcase links, and it goes with its menu item. ja-kinetic's `/pages/helixql` kept an
 *   English post about HelixQL, tag chips and all, on a Vietnamese customer's site (23/09/2026);
 * - every other article is demo content — hidden;
 * - a menu item whose only job is to list articles (`category`, `categories`, `archive`,
 *   `author`) would list nothing — hidden, with every alias and child that leads to it;
 * - a module that lists articles has no rule yet, so it fails the gate rather than being guessed at;
 * - a page the design names in `demoTrimKeep` (menu paths of its `tracy_site_pages.json`, the page list
 *   the customer ticks) is kept with the post it opens, blog post or not: ja-kinetic's
 *   `pages/kineticql` ("Single Article") is in the approved demo, and a trimmed article a listed
 *   page opens is TCQR PAGE-2's must-fix, since Apply publishes the page's entry again but never the
 *   article (16/10/2026).
 *
 * Opt-in per design: `designs.<id>.demoTrim: true` in `design-templates.json`, or `demoTrim: true` on
 * a standalone quickstart entry in `quickstarts.json`.
 *
 * A NEW RELEASE BEFORE ITS PIN MOVES: the design stays pinned to the previous contract until Claude
 * Cowork ships the new one, so the new contract is in no list above. `--contract <id>` (repeatable)
 * builds or checks it anyway, with the `demoTrimKeep` of the design whose profile has the same
 * `<slug>/j6/` prefix. ja-kinetic/j6/1.0.10 got a copy of 1.0.9's map instead, naming 1.0.9 and its
 * baseHash, and the plugin refused it ("The demo-trim profile does not belong to this contract").
 *
 * `--check` also holds EVERY `contracts/<slug>/j6/<version>/demo-trim-map.json` on disk, pinned or
 * not, to its own directory: `contract` must be that directory's id and `baseHash` the Claude Cowork
 * plugin's formula over that directory's three files.
 *
 * Run: `node scripts/build-joomla-demo-trim.mjs [--check] [--contract <slug>/j6/<version>]...`
 * `TRACY_JOOMLA_CONTRACTS` points at another contracts tree (tests).
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACTS =
  process.env.TRACY_JOOMLA_CONTRACTS || path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const REGISTRY = path.join(
  ROOT,
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
)
const FILE = 'demo-trim-map.json'
const CHECK_ONLY = process.argv.includes('--check')
const BASE_FILES = ['manifest.json', 'content-map.json', 'presentation-lock.json']
/** `--contract <id>`, repeatable: a contract no design or quickstart pins yet. */
const EXTRA = process.argv.flatMap((arg, i, all) => {
  if (arg !== '--contract') return []
  const id = all[i + 1]
  if (!id || id.startsWith('--')) throw new Error('build-joomla-demo-trim: --contract needs an id')
  return [id]
})

/**
 * Views that exist only to list articles; with every demo article hidden they would list nothing.
 * `com_tags` too: a tag page lists the tagged items, and every demo tag tags demo posts — measured
 * 23/09/2026 on j-yo65dx (ja-kinetic): /pages/tags/* still offered 240 hidden posts, 205 dead links.
 */
const LISTING_VIEWS = {
  com_content: new Set(['category', 'categories', 'archive', 'author']),
  com_tags: new Set(['tag', 'tags'])
}
/** Module types that list articles on their own; the rule has no answer for them yet. */
const LISTING_MODULE = /^mod_(articles|related_items)/

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** `index.php?option=com_content&view=article&id=90` → { option, view, id, Itemid } */
function linkParams(link) {
  const query = String(link ?? '').split('?')[1] ?? ''
  return Object.fromEntries(new URLSearchParams(query))
}

/** The Claude Cowork plugin's formula (`DemoTrimProfile`): sha256 of `<name>:<sha256>\n` per base file. */
const baseHashOf = (baseFiles) => sha256(BASE_FILES.map((name) => `${name}:${baseFiles[name]}\n`).join(''))

function generate(id, keep = new Set()) {
  const dir = path.join(CONTRACTS, id)
  const bytes = Object.fromEntries(BASE_FILES.map((name) => [name, readFileSync(path.join(dir, name))]))
  const map = JSON.parse(bytes['content-map.json'].toString('utf8'))
  const lock = JSON.parse(bytes['presentation-lock.json'].toString('utf8'))
  const entities = map.entities
  const bySource = (kind) =>
    new Map(entities.filter((e) => e.kind === kind).map((e) => [String(e.sourceId), e.key]))
  const articleBySource = bySource('article')
  const menuBySource = bySource('menuItem')
  const row = (key) => lock.entities[key]

  const menus = entities.filter((e) => e.kind === 'menuItem' && String(row(e.key).published) === '1')

  const hidden = new Map()
  for (const m of menus) {
    const q = linkParams(row(m.key).link)
    if (LISTING_VIEWS[q.option]?.has(q.view))
      hidden.set(
        m.key,
        `lists articles (view=${q.view}${q.layout ? `, layout=${q.layout}` : ''}); every one it lists is hidden`
      )
  }
  // The categories those listings showed, with every category under them: the blog's own tree.
  const blog = new Set()
  for (const key of hidden.keys()) {
    const q = linkParams(row(key).link)
    if (q.option === 'com_content' && (q.view === 'category' || q.view === 'categories') && q.id)
      blog.add(String(q.id))
  }
  const categories = entities.filter((e) => e.kind === 'category')
  for (let grew = blog.size > 0; grew; ) {
    grew = false
    for (const c of categories)
      if (!blog.has(String(c.sourceId)) && blog.has(String(row(c.key)?.parent_id))) {
        blog.add(String(c.sourceId))
        grew = true
      }
  }

  const pages = new Map()
  /** @type {Map<string, string>} the kept pages the design names, by menu item */
  const keepReason = new Map()
  for (const m of menus) {
    const q = linkParams(row(m.key).link)
    if (q.option !== 'com_content' || q.view !== 'article' || !articleBySource.has(q.id)) continue
    const article = articleBySource.get(q.id)
    if (blog.has(String(row(article)?.catid)) && !keep.has(String(m.identity?.path)))
      hidden.set(m.key, `opens ${article}, a post of the hidden blog (category ${row(article).catid})`)
    else {
      pages.set(article, m.key)
      if (blog.has(String(row(article)?.catid)))
        keepReason.set(m.key, `page: ${m.key} opens it, a listed page the design keeps (demoTrimKeep)`)
    }
  }
  // Aliases and children follow what they lead to, until nothing new joins.
  for (let grew = true; grew; ) {
    grew = false
    for (const m of menus) {
      if (hidden.has(m.key)) continue
      const r = row(m.key)
      const target = r.type === 'alias' ? menuBySource.get(linkParams(r.link).Itemid) : undefined
      const parent = menuBySource.get(String(r.parent_id))
      const reason =
        target && hidden.has(target)
          ? `alias of ${target}, which is hidden`
          : parent && hidden.has(parent)
            ? `child of ${parent}, which is hidden`
            : null
      if (reason) {
        hidden.set(m.key, reason)
        grew = true
      }
    }
  }

  // A module that lists articles has one safe case: it is shown ONLY on pages this map hides (include
  // mode, every menu hidden) — tracy-business's news sidebar, on the two news listings. Anywhere else it
  // would list hidden posts or an empty box, and the rule still has no answer, so the gate stays red.
  const problems = []
  for (const e of entities) {
    if (e.kind !== 'module' || !LISTING_MODULE.test(String(row(e.key)?.module ?? ''))) continue
    const menus = (lock.assignments ?? [])
      .filter((a) => Number(a.moduleid) === Number(e.sourceId))
      .map((a) => Number(a.menuid))
    const onlyHidden =
      menus.length > 0 && menus.every((m) => m > 0 && hidden.has(menuBySource.get(String(m))))
    if (!onlyHidden)
      problems.push(`${e.key} (${row(e.key).module}) lists articles, and this rule has no answer for it yet`)
  }
  if (problems.length) throw new Error(`${id}: ${problems.join('; ')}`)

  const hide = []
  for (const e of entities) {
    if (e.kind === 'article' && String(row(e.key).state) === '1' && !pages.has(e.key))
      hide.push({
        key: e.key,
        kind: 'article',
        field: 'state',
        from: '1',
        to: '0',
        reason: 'demo content: no menu item opens it as a page'
      })
    if (e.kind === 'menuItem' && hidden.has(e.key))
      hide.push({
        key: e.key,
        kind: 'menuItem',
        field: 'published',
        from: '1',
        to: '0',
        reason: hidden.get(e.key)
      })
  }
  const order = { menuItem: 0, article: 1 }
  const sourceOf = new Map(entities.map((e) => [e.key, Number(e.sourceId)]))
  hide.sort((a, b) => order[a.kind] - order[b.kind] || sourceOf.get(a.key) - sourceOf.get(b.key))

  const baseFiles = Object.fromEntries(Object.entries(bytes).map(([name, b]) => [name, sha256(b)]))
  const counts = {}
  for (const h of hide) counts[h.kind] = (counts[h.kind] ?? 0) + 1
  return {
    schemaVersion: 'tracy-quickstart-demo-trim/v1',
    extensionVersion: '1.0.0',
    contract: id,
    baseHash: baseHashOf(baseFiles),
    baseFiles,
    kept: [...pages].map(([article, menu]) => ({
      key: article,
      reason: keepReason.get(menu) ?? `page: ${menu} opens it`
    })),
    hide,
    counts
  }
}

const registry = readJson(REGISTRY)
/**
 * A quickstart that stands on its own (`tracy-business/j6`) pins its `contract` in `quickstarts.json`
 * and never appears in the design registry — the same second road `build-joomla-multilingual.mjs`
 * reads. It opts in the same way, with `demoTrim: true` on its entry.
 */
const quickstarts = readJson(
  path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json')
)
const standalone = Object.values(quickstarts).filter(
  (q) => q?.platform === 'joomla' && q.contract && q.demoTrim === true
)
/** The pages each contract keeps whatever they open (`demoTrimKeep` of its design). */
const keepOf = new Map()
for (const d of Object.values(registry.designs))
  if (d.contractProfile && Array.isArray(d.demoTrimKeep))
    keepOf.set(d.contractProfile, new Set(d.demoTrimKeep.map(String)))
/** `ja-kinetic/j6/1.0.10` → `ja-kinetic/j6/` */
const prefixOf = (id) => id.split('/').slice(0, 2).join('/') + '/'
// A `--contract` takes the keep set of the design on the same `<slug>/j6/` line.
for (const id of EXTRA) {
  if (!existsSync(path.join(CONTRACTS, id, 'manifest.json')))
    throw new Error(`build-joomla-demo-trim: --contract ${id}: no contract at ${id}`)
  if (keepOf.has(id)) continue
  const design = Object.values(registry.designs).find(
    (d) => d.contractProfile && prefixOf(d.contractProfile) === prefixOf(id)
  )
  if (Array.isArray(design?.demoTrimKeep)) keepOf.set(id, new Set(design.demoTrimKeep.map(String)))
}
const ids = [
  ...new Set([
    ...Object.values(registry.designs)
      .filter((d) => d.state === 'served' && d.demoTrim === true && d.contractProfile)
      .map((d) => d.contractProfile),
    ...standalone.map((q) => q.contract),
    ...EXTRA
  ])
]

let failed = false
for (const id of ids) {
  const file = path.join(CONTRACTS, id, FILE)
  const text = `${JSON.stringify(generate(id, keepOf.get(id)), null, 2)}\n`
  if (CHECK_ONLY) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(
        `build-joomla-demo-trim: ${id}/${FILE} is stale or missing — run node scripts/build-joomla-demo-trim.mjs`
      )
      failed = true
    }
  } else {
    writeFileSync(file, text)
  }
  const out = JSON.parse(text)
  console.log(
    `${id}  hides ${Object.entries(out.counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')} · keeps ${out.kept.length} page(s)`
  )
}
// A map left behind by a design or quickstart that no longer opts in is a file nobody regenerates.
const optedIn = new Set(ids)
for (const design of Object.values(registry.designs))
  if (
    design.contractProfile &&
    !optedIn.has(design.contractProfile) &&
    existsSync(path.join(CONTRACTS, design.contractProfile, FILE))
  ) {
    console.error(
      `build-joomla-demo-trim: ${design.contractProfile}/${FILE} exists but its design does not declare demoTrim: true`
    )
    failed = true
  }
// Every map on disk belongs to its own directory, pinned or not: a map copied from the previous
// release names that release and its baseHash, and the plugin refuses it on every site.
if (CHECK_ONLY)
  for (const slug of readdirSync(CONTRACTS)) {
    const line = path.join(CONTRACTS, slug, 'j6')
    if (!existsSync(line)) continue
    for (const version of readdirSync(line)) {
      const id = `${slug}/j6/${version}`
      const file = path.join(line, version, FILE)
      if (!existsSync(file)) continue
      const problems = []
      let map
      try {
        map = readJson(file)
      } catch (error) {
        problems.push(`is not JSON (${error.message})`)
      }
      if (map !== undefined && (map === null || typeof map !== 'object' || Array.isArray(map)))
        problems.push('is not a demo-trim map object')
      else if (map) {
        if (map.contract !== id) problems.push(`names contract ${map.contract}, not ${id}`)
        const missing = BASE_FILES.filter((name) => !existsSync(path.join(line, version, name)))
        if (missing.length) problems.push(`its contract lacks ${missing.join(', ')}`)
        else {
          const want = baseHashOf(
            Object.fromEntries(
              BASE_FILES.map((name) => [name, sha256(readFileSync(path.join(line, version, name)))])
            )
          )
          if (map.baseHash !== want)
            problems.push(`baseHash ${map.baseHash} is not ${want}, the hash of this contract's files`)
        }
      }
      if (problems.length) {
        console.error(
          `build-joomla-demo-trim: ${id}/${FILE} ${problems.join('; ')} — run node scripts/build-joomla-demo-trim.mjs --contract ${id}`
        )
        failed = true
      }
    }
  }
if (failed) process.exit(1)
