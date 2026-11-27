// A social link of an EmDash template (Tracy Diner's contact) finds its address slot through its label's row: the
// inspect reading carries the content map's row group, as Joomla's does (link-doors.js `byItsLabel`). Before (dev
// arabian-tea-em8, 27/11/2026), every social link matched the one demo address all four share, and the page kept it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { emdashContractCall } from '../src/sites/emdash-contract.js'
import { linkDoors } from '../src/write-step/link-doors.js'
import { DINER_CONTRACT, dinerContentMap, emdashMcpSite } from './_emdash-mcp-site.mjs'

const KIT = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-emdash-theme-diner/contracts/0.1.4/template-kit.json',
      import.meta.url
    ),
    'utf8'
  )
)

test('each social link of the Diner contact goes to the address slot of its own row', async () => {
  const contentMap = dinerContentMap()
  const site = emdashMcpSite()
  const reading = (
    await emdashContractCall({
      siteKey: 'emd-links.sites.example',
      params: { operation: 'inspect' },
      contract: DINER_CONTRACT,
      contentMap,
      calls: site.calls
    })
  ).body
  const label = reading.slots.find((s) => s.key === 'contact.contact.social_links[0].label')
  assert.equal(label.group?.id, 'contact.contact.social_links.0')
  const doorOf = linkDoors({ kit: KIT, reading, rows: [], contentMap })
  for (const n of [0, 1, 2, 3]) {
    const door = doorOf(`block-contact-contact.link-${n + 1}`)
    assert.equal(door.via, 'slot', `link-${n + 1}`)
    assert.deepEqual(door.keys, [`contact.contact.social_links[${n}].url`], `link-${n + 1}`)
  }
})
