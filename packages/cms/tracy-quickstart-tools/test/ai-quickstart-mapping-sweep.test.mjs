// Reconciliations of the JA Boxing mapping file (#584), on the template's own demo content as the repo holds it:
//   A. every field place of the block store has exactly one mapping entry (a location, a fact or a derived source),
//      and the totals add up;
//   B. every content map place whose demo value holds a demo business fact (mapping-decisions demoFacts) is a fact
//      place, a field the build writes, a record the build creates, or a place the draft report classes;
//   C. every stored place has one writer unless the block store shares it (the contract check), and every
//      build-sets reference of the draft report is set;
//   D. after the blank site step every place of a kept record is empty and its address still names exactly one node
//      (the demo rows as the contract holds them, through the real step).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkAiQuickstartContract } from '../../../wo/website-opportunities/domain/ai-quickstart-contract.mjs'
import { writersOf } from '../../../wo/website-opportunities/domain/ai-quickstart-mapping-places.mjs'
import { blankRows, mappingLocations, PHP_SKIP, placeKey } from './fixtures/ai-quickstart-ja-boxing-blank.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const DIR = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11')
const CONTRACT = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11')
const read = (dir, file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
const store = read(DIR, 'block-store.json')
const mapping = read(DIR, 'mapping.json')
const report = read(DIR, 'draft-report.json')
const decisions = read(DIR, 'mapping-decisions.json')
const contentMap = read(CONTRACT, 'content-map.json')

/** Every field place of the store: one per slot (nested slots too), one per derived field. */
function storePlaces() {
  let places = 0
  const count = (f) => {
    if (f.type === 'design' || f.slot) places += 1
    else if (Array.isArray(f.slots)) places += f.slots.flat(3).length
    else if (f.derived) places += 1
  }
  const walk = (lists) => {
    for (const l of lists ?? []) {
      l.fields.forEach(count)
      walk(l.lists)
    }
  }
  for (const b of store.blocks) {
    b.fields.forEach(count)
    ;(b.itemFields ?? []).forEach(count)
    walk(b.lists)
    walk(b.itemLists)
  }
  return places
}

/** Every mapping entry of the blocks, by kind. */
function mappingEntries() {
  const tally = { location: 0, fact: 0, derived: 0 }
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (Object.hasOwn(v, 'fact')) tally.fact += 1
    else if (Object.hasOwn(v, 'derived')) tally.derived += 1
    else if (typeof v.entity === 'string') tally.location += 1
    else for (const x of Object.values(v)) walk(x)
  }
  for (const b of Object.values(mapping.blocks))
    for (const key of ['fields', 'itemFields', 'lists', 'itemLists']) if (b[key]) walk(b[key])
  return tally
}

test('A. every field place has exactly one mapping entry, and the totals add up', (t) => {
  const tally = mappingEntries()
  const total = tally.location + tally.fact + tally.derived
  t.diagnostic(JSON.stringify({ ...tally, total, storePlaces: storePlaces() }))
  assert.equal(total, storePlaces(), JSON.stringify(tally))
  assert.ok(tally.fact >= 11, `the fields that show a business fact take it from the fact (${tally.fact})`)
})

test('B. every content map place that holds a demo business fact is mapped or classed', (t) => {
  const factOf = new Map()
  for (const [fact, places] of Object.entries(mapping.facts))
    for (const p of places) if (p.slot) factOf.set(p.slot, fact)
  const fieldSlots = new Set(
    writersOf(mapping)
      .filter((w) => w.writer === 'field')
      .map((w) => w.loc.slot)
  )
  const classed = new Map([...report.outsideStore, ...report.unlisted].map((e) => [e.slot, e.as]))
  const created = (entity) => {
    const kind = (contentMap.entities ?? []).find((e) => e.key === entity)?.kind
    return kind in (read(DIR, 'draft-decisions.json').removedWithPage ?? {}) && entity !== 'category-2'
  }
  const counts = {}
  const unclassed = []
  for (const slot of contentMap.slots) {
    const value = String(slot.sample ?? '').toLowerCase()
    for (const [fact, demo] of Object.entries(decisions.demoFacts)) {
      if (!Array.isArray(demo) || !demo.some((d) => value.includes(d.toLowerCase()))) continue
      const as = factOf.has(slot.key)
        ? `fact ${factOf.get(slot.key)}`
        : fieldSlots.has(slot.key)
          ? 'a field the build writes'
          : created(slot.entity)
            ? 'a record the blank site removes'
            : classed.has(slot.key)
              ? `classed ${classed.get(slot.key)}`
              : null
      if (!as) unclassed.push(`${slot.key} (${fact})`)
      counts[fact] = { ...counts[fact], [as]: (counts[fact]?.[as] ?? 0) + 1 }
    }
  }
  assert.deepEqual(unclassed, [])
  assert.equal(counts.phone['fact phone'], 4)
  assert.equal(counts.address['fact address'], 2)
  assert.equal(counts.email['fact email'], 4)
  assert.equal(counts.logo['fact logoLight'] + counts.logo['fact logoDark'], 3)
  t.diagnostic(JSON.stringify(counts))
})

test('C. the mapping passes the contract check with the draft report: one writer per place, build-sets set', () => {
  const res = checkAiQuickstartContract({
    blockStore: store,
    pageRecipes: read(DIR, 'page-recipes.json'),
    mapping,
    draftReport: report
  })
  assert.deepEqual(res.problems, [])
  const buildSets = report.references.classed.filter((r) => r.as === 'build-sets').map((r) => r.at)
  assert.deepEqual(Object.keys(mapping.buildSets).sort(), buildSets.sort())
})

// The address of a location resolved the way the plugin loads a stored value (`ContentSlots::html`), marker notation
// read as the HTML it stands for: [nodes found, their text trimmed].
const RESOLVE = `
$in = json_decode(stream_get_contents(STDIN), true); $out = [];
foreach ($in as $e) {
  $h = $e['html'];
  if (strpos($h, '<') === false && strpos($h, '((') !== false) $h = preg_replace('/\\(\\((\\/?[a-zA-Z][^()]*?)\\)\\)/', '<$1>', $h);
  $d = new DOMDocument('1.0', 'UTF-8'); libxml_use_internal_errors(true);
  $d->loadHTML('<?xml encoding="UTF-8"><html><body><div id="contract-root">' . $h . '</div></body></html>', LIBXML_NONET);
  $n = (new DOMXPath($d))->query($e['xpath']);
  $out[] = [$n === false ? -1 : $n->length, $n && $n->length ? trim($n->item(0)->textContent) : null];
}
echo json_encode($out);`

test('D. after the blank site step every place of a kept record is empty and still names exactly one node', {
  skip: PHP_SKIP
}, (t) => {
  const rows = blankRows(mapping)
  const html = []
  const bad = []
  let plain = 0
  for (const { at, loc } of mappingLocations(mapping)) {
    const row = rows.after.get(loc.entity)
    if (!row) continue
    let value = row[loc.column]
    if (loc.jsonPath) {
      let doc = JSON.parse(value)
      if (loc.nestedJson) doc = JSON.parse(doc[loc.nestedJson])
      for (const step of loc.jsonPath) doc = doc?.[step]
      value = doc
    }
    const emptied = rows.emptied.has(placeKey(loc))
    if (!loc.xpath) {
      plain += 1
      if (typeof value !== 'string' || (emptied && value.trim() !== ''))
        bad.push(`${at}: ${JSON.stringify(value)}`)
    } else html.push({ at, emptied, html: value, xpath: loc.xpath })
  }
  const found = JSON.parse(execFileSync('php', ['-r', RESOLVE], { input: JSON.stringify(html) }))
  found.forEach(([count, text], i) => {
    const e = html[i]
    if (count !== 1 || (e.emptied && text !== ''))
      bad.push(`${e.at} ${e.xpath}: ${count} node(s), ${JSON.stringify(text)}`)
  })
  t.diagnostic(
    JSON.stringify({ plain, html: html.length, emptiedHtml: html.filter((e) => e.emptied).length })
  )
  assert.deepEqual(bad, [])
  assert.ok(html.length > 250, `${html.length} HTML addresses`)
})
