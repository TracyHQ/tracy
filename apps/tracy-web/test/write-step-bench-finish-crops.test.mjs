// The checker's crops of a style repair (spec #418): a real run cropped every style repair as the whole viewport tile, never
// the block, because a fault with no slot gave no words to find the block by, and the host reads a glued heading's text
// without the space the slot's words have ("Strengthnow" for "Strength now"). The block of a style repair is found by the
// words of its own slots, compared without spaces, and the log says which crop was used. Driven through the step 9 bench's
// `finish`; only what comes out is asserted.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { visibleText } from '../src/lib/site-copy/emphasis-markup.js'
import { heldAtStart } from './_write-step-finisher.mjs'
import { cleanUp, everyRepairChecker, finishOn, scriptedDoor } from './_write-step-finish-run.mjs'

after(cleanUp)

const held = { ...heldAtStart(), 'module-2.1': 'Strength((br/))((span))now((/span))' }

/** The text the host reads off an element: its text content, where a hidden line break leaves no space. */
const textContent = (words) => visibleText(String(words).replace(/\(\(\s*br\b[^()]*\)\)/gi, ''))

const served = (site) => (page) =>
  page === '/'
    ? `<div id="Mod2"><span class="h2 main-title">${site['module-2.1']}</span></div><div id="Mod3"><p>x</p></div>`
    : '<html></html>'

test('a style repair of a fault with no slot is cropped by its block, found by its words without spaces', async () => {
  const run = await finishOn({
    finder: scriptedDoor('Finisher finder', [
      {
        faults: [
          {
            page: '/',
            viewport: 'phone',
            tile: 0,
            slot: null,
            kind: 'unreadable-text',
            seen: 'the heading "STRENGTHNOW" is hard to read on its picture'
          }
        ]
      },
      { faults: [] }
    ]),
    fixer: scriptedDoor('Finisher fixer', [
      {
        kind: 'style-block',
        block: 'block-2',
        target: 'span.h2.main-title',
        styles: { 'text-shadow': '0 1px 2px #000' }
      }
    ]),
    checker: everyRepairChecker('better'),
    served,
    held,
    head: true,
    boxText: textContent
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  const [record] = run.log.records
  assert.equal(record.outcome, 'kept', record.reason)
  assert.equal(record.crops.by, 'block')
  assert.equal(record.crops.before.length, 2, 'desktop and phone')
  assert.deepEqual(run.log.cropModes, { block: 1, tile: 0 })
  assert.ok(
    run.out.some((l) => /crops: 1 by block, 0 by tile/.test(l)),
    run.out.join('\n')
  )
})
