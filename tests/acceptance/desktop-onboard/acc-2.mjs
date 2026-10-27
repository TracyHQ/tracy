/**
 * ACC-2 — the vendor catalogue follows /ops. `GET /api/desktop/config` (public) answers `catalogue`:
 * 4 vendors, no Antigravity; `/ops/ui` › AI accounts shows one switch per vendor (5) with Antigravity
 * off; switching Antigravity on (`PUT /api/ops/desktop` from an owner/admin seat of `tracy_admin`,
 * same Origin) makes `catalogue` 5; switching it off again makes it 4. Read back by GET each time.
 *
 * The press needs an admin seat: on dev pass `--admin-cookie-file`; on a stand the minted session
 * is used. A 403/404 on the admin doors is BLOCKED (no seat), not FAIL. The operator's list is put
 * back as it was found, whatever happens.
 */
import { api, Blocked, browserPage, runCase, session, standalone, sleep, until } from './lib.mjs'

const ALL = ['claude', 'codex', 'copilot', 'grok', 'antigravity']
const DEFAULT = ['claude', 'codex', 'copilot', 'grok']
const ids = (doc) => (Array.isArray(doc?.catalogue) ? doc.catalogue.map((v) => v.id) : null)

export async function run(opts) {
  return runCase('ACC-2', opts, async (c) => {
    // 1. Public config, no session.
    const first = await api(opts, null, '/api/desktop/config')
    c.save('config-initial.json', first.json ?? first.text.slice(0, 2000))
    c.eq('GET /api/desktop/config status', first.status, 200)
    const initial = ids(first.json)
    c.check('config has a catalogue of {id,name,homepage}', Array.isArray(first.json?.catalogue), first.json)
    if (!initial) return
    c.check(
      `initial catalogue = ${DEFAULT.join(',')} (4, no antigravity)`,
      JSON.stringify(initial) === JSON.stringify(DEFAULT),
      initial
    )

    // 2. The admin doors.
    const s = await session(opts, { cookieFile: opts.adminCookieFile })
    c.log(`admin session: ${s.via} ${s.email ?? ''}`)
    const doc = await api(opts, s, '/api/ops/desktop')
    c.save('ops-desktop-initial.json', doc.json ?? { status: doc.status })
    if (doc.status !== 200)
      throw new Blocked(
        `GET /api/ops/desktop answers ${doc.status} for ${s.email ?? 'the given cookie'}: not a seat of the tracy_admin workspace`
      )
    if (!doc.json?.writable)
      throw new Blocked(
        `${s.email ?? 'the given cookie'} may read /ops but not press (role is not owner/admin)`
      )
    const before = doc.json.llm.providers
    c.check(
      '/api/ops/desktop lists the 5 vendors',
      JSON.stringify(doc.json.providers.map((p) => p.id)) === JSON.stringify(ALL),
      doc.json.providers
    )

    // 3. The /ops/ui screen: one switch per vendor, Antigravity off (read in chrome-watch).
    try {
      const page = await browserPage(opts, `${opts.base}/ops/ui`, { s })
      const switches = await until(
        page,
        (names) => {
          const out = {}
          for (const el of document.querySelectorAll('[role="switch"][aria-label]')) {
            const label = el.getAttribute('aria-label')
            if (names.includes(label))
              out[label] = el.getAttribute('aria-checked') ?? el.getAttribute('data-state')
          }
          return Object.keys(out).length === names.length ? out : null
        },
        doc.json.providers.map((p) => p.name),
        45_000
      )
      c.save('ops-ui-switches.json', switches)
      await c.shot(page, 'ops-ui.png')
      c.check(
        '/ops/ui › AI accounts: one switch per vendor (5)',
        switches !== null && Object.keys(switches).length === 5,
        switches
      )
      const agName = doc.json.providers.find((p) => p.id === 'antigravity')?.name
      const offAtStart = !before.includes('antigravity')
      c.check(
        `/ops/ui: the ${agName} switch matches the stored list (${offAtStart ? 'off' : 'on'})`,
        switches !== null && ['false', 'unchecked'].includes(String(switches[agName])) === offAtStart,
        switches?.[agName]
      )
      c.check(
        '/ops/ui: Antigravity is off (the default)',
        switches !== null && ['false', 'unchecked'].includes(String(switches[agName])),
        switches?.[agName]
      )
    } catch (error) {
      if (error instanceof Blocked) throw error
      c.check('/ops/ui rendered its switches', false, String(error?.message ?? error))
    }

    // 4. Press on, read back; press off, read back; restore what was found.
    const others = before.filter((id) => id !== 'antigravity')
    try {
      const on = await api(opts, s, '/api/ops/desktop', {
        method: 'PUT',
        json: { llm: { providers: [...others, 'antigravity'] } }
      })
      if (on.status === 403) throw new Blocked('PUT /api/ops/desktop answers 403 (seat role or Origin)')
      c.eq('PUT antigravity on: status', on.status, 200)
      await sleep(300)
      const afterOn = ids((await api(opts, null, '/api/desktop/config')).json)
      c.save('config-after-on.json', afterOn)
      c.check(
        'after switching Antigravity on: catalogue holds antigravity',
        afterOn?.includes('antigravity'),
        afterOn
      )
      c.eq('after switching Antigravity on: catalogue size', afterOn?.length, others.length + 1)

      const off = await api(opts, s, '/api/ops/desktop', {
        method: 'PUT',
        json: { llm: { providers: others } }
      })
      c.eq('PUT antigravity off: status', off.status, 200)
      await sleep(300)
      const afterOff = ids((await api(opts, null, '/api/desktop/config')).json)
      c.save('config-after-off.json', afterOff)
      c.check(
        'after switching it off: no antigravity',
        afterOff !== null && !afterOff.includes('antigravity'),
        afterOff
      )
      c.eq('after switching it off: catalogue size', afterOff?.length, others.length)
    } finally {
      const back = await api(opts, s, '/api/ops/desktop', {
        method: 'PUT',
        json: { llm: { providers: before } }
      })
      c.log(`restored providers ${JSON.stringify(before)}: ${back.status}`)
    }
  })
}

await standalone(import.meta.url, 'ACC-2', run)
