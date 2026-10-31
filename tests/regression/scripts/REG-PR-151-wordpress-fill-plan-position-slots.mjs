/**
 * REG-PR-151-wordpress-fill-plan-position-slots: WordPress builds place brief photos through the fill plan (#138), and the
 * WordPress writer reaches slots found by position and the header and footer, which the sweep then leaves to the contract
 * (#139). S1 runs the WordPress picture phase and the sweep; S2 runs the shared block walker and the seeder writer.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const web = nodeTest([
  'apps/tracy-web/test/brief-wp-fill-plan.test.mjs',
  'apps/tracy-web/test/brief-wp-parts-in-map.test.mjs'
])
c.tapClean('S1 (WordPress picture phase and sweep)', web)
for (const name of [
  'a WordPress v3 build: each card takes its own offering photo, the gallery a general one, the style page nothing',
  'a WordPress build says each picture decision with the reason codes a Joomla build uses',
  'a released WordPress map with no v3 roles keeps the placement planner it was built with',
  'the sweep rewrites the words of the header the map does not cover, and leaves the footer it covers'
])
  c.passes('S1', web, name, undefined, true)
const seeder = nodeTest(['packages/cms/tracy-seeder/test/wordpress-block-address.test.mjs'])
c.tapClean('S2 (position slots and template parts)', seeder)
for (const name of [
  'every slot the capture makes reads back its own sample from the markup it was captured from',
  'a slot found by position is written, reads back equal, and leaves every other slot as it was',
  'a position past the last block of that type is refused, never written somewhere else',
  'the contract writer writes a position slot of a page and the slots of the header part, each in one read and one write'
])
  c.passes('S2', seeder, name, undefined, true)
c.done()
