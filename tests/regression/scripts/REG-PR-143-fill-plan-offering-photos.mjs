/**
 * REG-PR-143-fill-plan-offering-photos: the fill plan places each brief photo by the v3 slot role and the offering it
 * shows. S1 runs the fill plan seam (a fictional racket club brief on a trimmed template map); S2 runs the Joomla
 * picture phase and the hand-off on a version 3 map.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const domain = nodeTest(['packages/wo/website-opportunities/test/domain-fill-plan.test.mjs'])
c.tapClean('S1 (fill plan seam)', domain)
for (const name of [
  'padel photos only reach the padel group; unsure photos only reach general slots',
  'a keep slot and every slot of a demo-only entity are never filled',
  'every slot gets one decision, and every decision carries a reason code a report can name'
])
  c.passes('S1', domain, name, undefined, true)
const web = nodeTest(['apps/tracy-web/test/brief-fill-plan-pictures.test.mjs'])
c.tapClean('S2 (Joomla picture phase and hand-off)', web)
for (const name of [
  'a Joomla v3 build: a card takes its own offering photo, the gallery a general one, the style page nothing',
  'the hand-off lists every picture decision of the build with its reason code'
])
  c.passes('S2', web, name, undefined, true)
c.done()
