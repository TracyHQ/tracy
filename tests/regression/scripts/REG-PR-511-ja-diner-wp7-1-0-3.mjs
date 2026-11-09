/**
 * REG-PR-<N>-ja-diner-wp7-1-0-3: JA Diner WordPress 7 1.0.3 carries a contract with no demo business words in a
 * writable place. S1: the content map has a role on every slot, a group on every fact slot and no fact sample on an
 * editorial role. S2: the footer part names no prose block. S3: the pin names 1.0.3 and a plugin version.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks } from './lib.mjs'
import { isFactRole } from '../../../packages/wo/website-opportunities/domain/place-content-roles.mjs'
import { namedLeafTexts } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/wordpress-named-blocks.js'
import { isProse } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/joomla-row-text.js'
import { factKindsOf } from '../../../packages/cms/tracy-quickstart-tools/content-coverage/lib/fact-samples.mjs'

const c = checks()
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const map = JSON.parse(
  read('packages/cms/tracy-wordpress-quickstart/contracts/ja-diner/wp7/1.0.3/content-map.json')
)
const slots = map.slots
c.eq('S1: slots without a role', slots.filter((s) => !s.role).length, 0)
c.eq('S1: fact slots without a group', slots.filter((s) => isFactRole(s.role) && !s.group).length, 0)
c.eq(
  'S1: editorial text slots with a fact sample',
  slots.filter(
    (s) =>
      (s.type === 'text' || s.type === 'html') &&
      String(s.role).startsWith('editorial.') &&
      factKindsOf(s.sample).length > 0
  ).length,
  0
)
const targets = new Set(slots.map((s) => s.target?.block).filter(Boolean))
const kept = new Set(
  JSON.parse(read('packages/cms/tracy-wordpress-quickstart/contracts/ja-diner/wp7/1.0.3.copy.json')).keptText
)
const footer = read('packages/cms/tracy-wordpress-theme/overlays/wp-ja-diner/parts/footer.html')
c.eq(
  'S2: footer part named blocks with prose and no slot',
  namedLeafTexts(footer).filter(
    (b) => isProse(b.text) && !targets.has(b.name) && !kept.has(`part-footer.${b.name}`)
  ).length,
  0
)
const pin = JSON.parse(read('apps/tracy-web/src/quickstarts.json'))
const find = (o) => {
  if (o && typeof o === 'object') {
    if (o['quickstart/ja-diner/wp7']) return o['quickstart/ja-diner/wp7']
    for (const v of Object.values(o)) {
      const r = find(v)
      if (r) return r
    }
  }
  return null
}
const row = find(pin)
c.eq('S3: pinned version', row?.version, '1.0.3')
c.eq('S3: plugin pinned', typeof row?.cowork?.version === 'string' && row.cowork.version.length > 0, true)
c.done()
