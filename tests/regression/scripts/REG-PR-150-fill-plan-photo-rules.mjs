/**
 * REG-PR-150-fill-plan-photo-rules: the fill plan's photo rules (#134, #135, #136). S1 runs the fill plan seam (a
 * fictional boxing studio brief on a trimmed template map); S2 runs the initials avatar, the subject cut and the Joomla
 * picture phase on a version 3 map.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const domain = nodeTest(['packages/wo/website-opportunities/test/domain-fill-plan-photo-rules.test.mjs'])
c.tapClean('S1 (fill plan seam)', domain)
for (const name of [
  '#134 a brief with a portrait of a named coach puts that portrait in the coach slot',
  '#134 a named person with no portrait gets an initials avatar in the frame of the slot',
  '#134 a photo whose face is not linked to the named person is refused with its reason',
  '#135 with an owner photo and a map photo both qualifying, the owner photo wins',
  '#135 a map photo posted by someone else is refused for the hero and about slots with its reason',
  '#135 a brief with only map photos leaves every identity slot to the neutral rule, never the map photo',
  '#136 a crop keeps every face box whole, and a photo whose faces no crop can keep whole is refused',
  "#136 a matching photo that today's crop limit refuses is accepted; a photo that does not match is still refused",
  '#136 a photo below the slot minimum after its crop is refused with the reason too-small-after-crop',
  '#136 no frame changes shape: every photo is cut and written at the aspect of its slot'
])
  c.passes('S1', domain, name, undefined, true)
const web = nodeTest([
  'apps/tracy-web/test/picture-avatar.test.mjs',
  'apps/tracy-web/test/picture-cut.test.mjs',
  'apps/tracy-web/test/brief-fill-plan-pictures.test.mjs'
])
c.tapClean('S2 (avatar, subject cut, Joomla picture phase)', web)
for (const name of [
  'an initials avatar keeps the frame of the slot and draws the letters in the middle on the brand colour',
  'a subject crop is cut where the plan placed it, also from a smaller copy of the photo (#136)',
  'a coach card with no portrait of the coach it names is drawn as her initials, in the frame of the slot'
])
  c.passes('S2', web, name, undefined, true)
c.done()
