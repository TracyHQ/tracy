/**
 * REG-PR-1134-ds-panel-library: the Design system panel's library on a real site (walkthrough
 * 11/10/2026, `tasks/evidence/ds-walkthrough-2026-10-11/`):
 *   S1 the panel lists the design systems while the gallery's "Design systems on Design inspiration"
 *      switch is off — the state of every server where no operator pressed it, production included.
 *      Before: the panel of a fresh WordPress Tracy Business site said "No design inspiration matches."
 *      and nothing could be applied.
 *      Then (PR 1134): the panel read the gallery's catalog door with `?systems=all`.
 *      Since feat/design-system-ui (12/10/2026, Refero-only library): the panel reads tracy-web's
 *      `GET /api/design-system/library`, which offers every gate-passing Refero system to any
 *      signed-in seat and reads no gallery switch at all.
 *   S2 the gallery itself still hides the systems while that switch is off (the catalog door without
 *      the query is unchanged), and only the one value `all` opens the `?systems=all` read.
 *   S3 the panel's cards are not drawn dimmed under "Coming soon": a library row carries no
 *      `platforms` (an empty list means "no site can be made from it" in the gallery). Then:
 *      `libraryOf` dropped it; now `systemOf` builds each row from a fixed set of keys.
 * No model, no stand, no database: the doors run on fakes, the client half is pure.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const pkg = 'packages/design/tracy-design-inspiration'

// S1: the library door of tracy-web, and the panel reading it.
const door = nodeTest(['apps/tracy-web/test/design-system-library-door.test.mjs'])
c.tapClean('tracy-web library door tests', door)
c.passes('S1', door, 'library: every Refero system that passes the gate, nothing else, in one shape')
c.passes('S1', door, 'library and support: a person who is not signed in reads nothing')
const doorSrc = readFileSync(join(ROOT, 'apps/tracy-web/src/sites/design-system-library-doors.js'), 'utf8')
c.check(
  'S1 the library door reads no gallery switch',
  !/design-systems|uiSetting|ui_setting|isShown|shown/.test(doorSrc.replace(/\/\*[\s\S]*?\*\//g, ''))
)
const sources = readFileSync(join(ROOT, pkg, 'src/client/useDesignSystemSources.ts'), 'utf8')
c.check('S1 the panel asks the library door', sources.includes('await fetchLibrary()'))
const tab = readFileSync(join(ROOT, pkg, 'src/client/DesignSystemTab.tsx'), 'utf8')
c.check('S1 the Design system tab lists that library', tab.includes('useSystemLibrary()'))
c.check('S1 the tab no longer reads the gallery catalog', !tab.includes('fetchCatalog('))
const bundle = readFileSync(join(ROOT, pkg, 'lib/client.js'), 'utf8')
c.check(
  'S1 the committed client bundle carries the library read',
  bundle.includes('/api/design-system/library')
)

// S2 (and the panel's client tests): the gallery door is unchanged.
const di = nodeTest(
  ['test/gallery.test.mjs', 'test/routes.test.mjs', 'test/design-system-library.test.mjs'],
  {
    cwd: pkg
  }
)
c.tapClean('design-inspiration tests', di)
c.passes('S2', di, 'the lane offers its design systems only when Tracy says so, and a silent Tracy says no')
c.passes('S2', di, 'parseRoute: the four doors, and nothing else')
c.passes('S1', di, 'the library door is asked root-absolute with the cookie; only Refero rows are kept')

// S3: a library row carries no `platforms`, so no card is dimmed under Coming soon.
const { systemOf } = await import(pathToFileURL(join(ROOT, pkg, 'src/client/design-system-library.mjs')).href)
const row = systemOf({ id: 'refero:a1', name: 'Stripe', group: 'Fintech', platforms: [], ok: true })
c.check('S3 a library row is kept', row?.id === 'refero:a1')
c.check("S3 the row has no 'platforms' key", row !== null && !('platforms' in row), JSON.stringify(row))
const grid = readFileSync(join(ROOT, pkg, 'src/client/DesignSystemGrid.tsx'), 'utf8')
c.check('S3 the panel grid draws no Coming soon badge', !/comingSoon|ComingSoon/.test(grid))

c.done()
