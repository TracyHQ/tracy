// The marker build writes the logo places (ticket #586, slice B gate fault G11): a marker profile with a text logo
// makes the write step skip every logo place (`text_logo_prints_site_name`), so no logo place is ever measured. The
// marker build gives an own logo, so a logo place the kit maps is written. Real JA Boxing kit through the marker build
// on a memory site.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { accountFor } from '../ai-quickstart/gate/accounting.mjs'
import { kitOf } from '../ai-quickstart/gate/gate-inputs.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'

const FOLDER = new URL(
  '../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
  import.meta.url
).pathname

test('G11: no logo place is skipped for a text logo, and the footer logo place is written', async () => {
  const kit = kitOf(FOLDER)
  const built = await markerBuild(kit, {
    iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
    tryWrite: memoryTryWrite(kit)
  })
  const places = accountFor(kit, built).places
  const textLogo = places.filter((p) => String(p.why ?? '').includes('text_logo_prints_site_name'))
  assert.deepEqual(
    textLogo.map((p) => p.key),
    []
  )
  const footer = places.find((p) => p.key === 'slot:module-170.1||/html/body/div/a/img/@src')
  assert.equal(footer?.account, 'written', JSON.stringify(footer))
})
