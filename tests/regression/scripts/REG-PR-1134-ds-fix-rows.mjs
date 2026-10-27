/**
 * REG-PR-1134-ds-fix-rows: what the Design system walkthrough on the stand found in Site changes and
 * in tracy-web itself (11/10/2026, `tasks/evidence/ds-walkthrough-2026-10-11/`, bugs 3–5):
 *   S1 (bug 3) one press is ONE Site changes row: on WordPress the two files the apply's job writes
 *      under `uploads/tracy/` were sealed into a second row "Files changed; source unknown · 2 files".
 *      The job now names the files it wrote, the door keeps them on the write, and a seal of only
 *      those files (inside its window, by a landed press) folds into the press's row.
 *   S2 (bug 4) a press reads Type "Design system", By "Applied by <the person>" (no "Applied by
 *      Tracy"), and apply, switch and undo each read their own sentence — in all eight languages.
 *   S3 (bug 5) a failure inside the WebSocket `upgrade` handshake (a passing `EAI_AGAIN postgres`)
 *      closes that socket and is logged in one line; it no longer ends tracy-web.
 * Needs Postgres (`TEST_DATABASE_URL`) for S1/S2's Site changes reads; no model, no stand.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT, testDatabaseUrl } from './lib.mjs'

const c = checks()
testDatabaseUrl()

const plain = nodeTest([
  'apps/tracy-host/test/ds-slot.test.mjs',
  'apps/tracy-web/test/design-system-door.test.mjs',
  'apps/tracy-web/test/upgrade-listener.test.mjs',
  'packages/core/tracy-core/test/activity-v2.test.mjs'
])
c.tapClean('host job, door, upgrade listener, Site changes words', plain)
c.passes('S1', plain, 'an apply answers the webroot files it wrote (WordPress)')
c.passes('S1', plain, 'EmDash: the slot sheet is outside the webroot history, so an apply names no file')
for (const cms of ['emdash', 'wordpress', 'joomla'])
  c.passes(
    'S1/S2',
    plain,
    `${cms}: a press records itself as the button's, with the look before it and the files its job wrote`
  )
c.passes('S2', plain, 'the chat route’s apply is recorded as the chat’s, and stays Chat in Site changes')
c.passes('S2', plain, 'designSystemDescription: the same system again is an apply')
c.passes('S2', plain, 'a Design system row: apply, switch and undo read apart')
c.passes(
  'S3',
  plain,
  'a database failure in the handshake closes that socket, logs one line, and rejects nothing'
)
c.passes('S3', plain, 'a browser that resets the socket while the checks await is no uncaught error')

const db = nodeTest(['apps/tracy-web/test/site-activity-v2.test.mjs'], {
  extra: ['--test-concurrency=1'],
  pattern: 'Design system|chat route’s apply stays Chat|replay of the stand'
})
c.tapClean('Site changes V2 on Postgres', db)
c.passes('S1/S2', db, 'a Design system press is ONE row')
c.passes('S1', db, 'a Design system fold needs every file named by a landed press')
c.passes('S1', db, 'replay of the stand (dswalkwp01, 11/10/2026)')
c.passes('S2', db, 'the chat route’s apply stays Chat')
c.passes('S2', db, 'the badge counts a colleague’s Design system press, never the presser’s own')

// S2: every language says the new Type and the three sentences, and the committed bundles carry them.
const LANGS = {
  vi: 'packages/locale/tracy-locale-vi/vi/tracy-site-tabs.json',
  ...Object.fromEntries(
    ['de', 'it', 'fr', 'nl', 'zh', 'es'].map((l) => [
      l,
      `packages/locale/tracy-locales/${l}/tracy-site-tabs.json`
    ])
  )
}
const KEYS = [
  'event.source.design-system',
  'event.desc.dsApplied',
  'event.desc.dsSwitched',
  'event.desc.dsUndone',
  'event.desc.dsUnsure'
]
for (const [lang, file] of Object.entries(LANGS)) {
  const words = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  c.check(
    `S2 ${lang} has every new key`,
    KEYS.every((k) => typeof words[k] === 'string' && words[k].length > 0)
  )
  c.check(
    `S2 ${lang} names the system in each sentence`,
    KEYS.slice(1).every((k) => words[k].includes('{name}'))
  )
  c.check(`S2 ${lang} names the look before in a switch`, words['event.desc.dsSwitched'].includes('{from}'))
}
const tabs = readFileSync(join(ROOT, 'packages/site/tracy-site-tabs/lib/client.js'), 'utf8')
c.check(
  'S2 the committed Site changes bundle carries the new sentences',
  tabs.includes('Switched the design system from')
)
c.check(
  "S2 the committed Site changes bundle knows the 'design-system' Type",
  tabs.includes('design-system.switch')
)
const vi = readFileSync(join(ROOT, 'packages/locale/tracy-locale-vi/lib/client.js'), 'utf8')
c.check('S2 the committed vi bundle carries the Type', vi.includes('Hệ thiết kế'))
c.check('S2 the committed vi bundle carries the switch sentence', vi.includes('Đã đổi hệ thiết kế từ'))
const others = readFileSync(join(ROOT, 'packages/locale/tracy-locales/lib/client.js'), 'utf8')
c.check(
  'S2 the committed locales bundle carries the de switch sentence',
  others.includes('Designsystem von „{from}“ auf „{name}“ gewechselt')
)

// S3: tracy-web's server mounts the listener that never throws.
const server = readFileSync(join(ROOT, 'apps/tracy-web/src/server.js'), 'utf8')
// develop (12/10/2026) wraps the call in the app's session revocation book; the handler still only
// calls the listener upgradeListener built, which never throws out of itself.
const handler =
  /server\.on\('upgrade',\s*\(req, socket, head\) =>[^\n]*\n?[^\n]*upgrade\(req, socket, head\)\)/
c.check(
  "S3 server.js hands 'upgrade' to upgradeListener",
  server.includes("server.on('upgrade', upgradeListener(") ||
    (/const upgrade = upgradeListener\(/.test(server) && handler.test(server))
)
c.check('S3 server.js has no async upgrade body of its own', !server.includes("server.on('upgrade', async"))

c.done()
