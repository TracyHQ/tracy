/**
 * REG-PR-926-look-set-one-call: look.set changes one look in one call on WordPress, Joomla and
 * EmDash, and only modes with a shell are told about it. Runs both commands of the case from
 * packages/tools/tracy-site-tools: S1 the look.set suite, S2 the filtered context and surface
 * suites; each exits 0 with 0 failed, 0 skipped, 0 cancelled, and every named test passes.
 */
import { join } from 'node:path'
import { ROOT, checks, nodeTest } from './lib.mjs'

const c = checks()
const cwd = join(ROOT, 'packages/tools/tracy-site-tools')

// S1. Since PR #1089 a WordPress look goes to the site's Additional CSS, never the theme's files:
// the names below are the ones that say so, and the winner-after-every-sheet refusal is Joomla's.
const s1 = nodeTest(['test/look-set.test.mjs'], { cwd })
c.tapClean('S1', s1)
for (const name of [
  'WordPress, scope element: ONE rule for that button on that page, after the rule that wins, as specific — undo kept, read again',
  'WordPress, hide on phones',
  'WordPress, scope site: the theme.json token set again in Additional CSS on the selector global styles sets it on — theme.json untouched',
  'Joomla, scope page',
  'Joomla, scope site',
  'EmDash, scope site',
  'a write that changed nothing is put back, byte for byte, and said',
  'refused, nothing written: a page no class names, EmDash sections',
  'Joomla, refused, nothing written: a winner after every template sheet',
  '🔒 the built tracy_site: look.set reads with set:true in the site’s browser, writes Additional CSS through wp-cli in the site’s container'
])
  c.passes('S1', s1, name)

// S2
const s2 = nodeTest(['test/site-context.test.mjs', 'test/surface.test.mjs'], {
  cwd,
  pattern:
    'modes: per platform|a description names its own actions|an EmDash site is told only the page tools'
})
c.tapClean('S2', s2)
for (const cms of ['joomla', 'wordpress', 'emdash'])
  c.passes(
    'S2',
    s2,
    `modes: per platform, a mode with a shell gets the shell roads; one without gets the road it has; an unknown mode gets none: "${cms}"`
  )
c.passes('S2', s2, '🔒 a description names its own actions and no other')
c.passes('S2', s2, 'an EmDash site is told only the page tools')
c.done()
