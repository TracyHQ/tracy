// Shared by the JA Boxing mapping tests (#584): the template's demo rows as its released contract holds them
// (`presentation-lock.json`), passed through the real blank site step, and the Claude Cowork plugin release the
// quickstart pins, whose own functions write a site (`ContentSlots::htmlPatch`, `jsonPatch`, the contract's
// `changeRow`). Test support only: nothing here is shipped.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  emptyDeclaredFieldsStep,
  placesToEmpty
} from '../../../tracy-joomla-quickstart/scripts/blank-site-empty-fields.mjs'
import { coworkLib as pinnedCoworkLib } from '../../../tracy-joomla-quickstart/scripts/cowork-lib.mjs'
import { produceBlankSite } from '../../../tracy-joomla-quickstart/scripts/blank-site.mjs'
import { parseDump, records, sqlQuote } from '../../../tracy-joomla-quickstart/scripts/joomla-sql-dump.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const REL = 'ja-boxing/j6/1.0.11'
const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
export const MAPPING = readJson(`packages/cms/tracy-joomla-quickstart/ai-quickstarts/${REL}/mapping.json`)
export const CONTENT_MAP = readJson(`packages/cms/tracy-joomla-quickstart/contracts/${REL}/content-map.json`)
const LOCK = readJson(`packages/cms/tracy-joomla-quickstart/contracts/${REL}/presentation-lock.json`)
const TABLES = { module: 'modules', field: 'fields' }

/** Skip option for a test that runs php: fail on CI, skip with the reason on a laptop. */
const HAS_PHP = spawnSync('php', ['-v']).status === 0
if (!HAS_PHP && process.env.CI) throw new Error('these tests run php, and this CI host has none on PATH')
export const PHP_SKIP = HAS_PHP ? false : 'these tests run php, and this host has none on PATH'

/** The identity of a location: entity, column, nested JSON key, JSON path, xpath. */
export const placeKey = (l) =>
  JSON.stringify([l.entity, l.column, l.nestedJson ?? '', l.jsonPath ?? [], l.xpath ?? ''])

/** Every location of the blocks and facts of the mapping file, with where it sits (`at`). keyAt is not a place. */
export function mappingLocations(mapping = MAPPING) {
  const out = []
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`))
    else if (v && typeof v === 'object') {
      if (typeof v.entity === 'string' && typeof v.column === 'string') out.push({ at, loc: v })
      for (const [k, x] of Object.entries(v)) if (k !== 'keyAt') walk(x, `${at}.${k}`)
    }
  }
  walk({ blocks: mapping.blocks, facts: mapping.facts }, '')
  return out
}

/**
 * The module and field rows of the records the blank site keeps, before and after the blank site step empties the
 * places of `mapping`: `Map(entity key -> row)`. The step runs on a dump made of the demo rows of the contract.
 */
export function blankRows(mapping = MAPPING) {
  const kept = Object.entries(mapping.entities).filter(([, e]) => TABLES[e.kind] && !e.created)
  const statements = kept.map(([key, e]) => {
    const row = { id: e.sourceId, ...LOCK.entities[key] }
    const cols = Object.keys(row)
    const values = cols.map((c) => (row[c] === null ? 'NULL' : sqlQuote(String(row[c]))))
    return `INSERT INTO \`#__${TABLES[e.kind]}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${values.join(',')});`
  })
  const acym = Object.values(mapping.entities)
    .filter((e) => e.kind === 'acymConfiguration')
    .map((e) => `(${sqlQuote(e.identity.name)},'')`)
  const sql = `${statements.join('\n')}\nINSERT INTO \`#__acym_configuration\` (\`name\`, \`value\`) VALUES ${acym.join(',')};\n`
  const step = emptyDeclaredFieldsStep({ mapping, readFile: () => Buffer.from('{}') })
  const dump = parseDump(produceBlankSite(sql, { steps: [step] }).sql)
  const before = new Map()
  const after = new Map()
  for (const [key, e] of kept) {
    before.set(key, { id: String(e.sourceId), ...LOCK.entities[key] })
    after.set(
      key,
      records(dump, TABLES[e.kind]).find((r) => r.id === String(e.sourceId))
    )
  }
  return { before, after, emptied: new Set(placesToEmpty(mapping).map(placeKey)) }
}

/** The pinned Claude Cowork plugin's `lib` folder (`cowork-lib.mjs`). */
export const coworkLib = () => pinnedCoworkLib('quickstart/ja-boxing/j6')
