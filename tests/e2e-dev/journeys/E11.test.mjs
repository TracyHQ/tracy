// E11 — input from outside the host. A `verified` the sender declares itself, an evidence ref that points nowhere,
// two facts with one id, more offerings than the limit, a body over 512 KiB: each is refused with the path and code
// it breaks, and nothing is created. The same bodies are first checked against the contract's own validator (no
// network), so a host that answers otherwise is the host's fault, not the fixture's.

import { test } from 'node:test'
import { validateDemoRequest } from 'website-opportunities/domain/demo-request.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, hostAccepts } from '../lib/place-profile/demo-case.mjs'
import { badInputs } from '../lib/place-profile/fixtures.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { connectDemosToken, demosApi, revokeDemosToken } from '../lib/public-demos.mjs'

/** The local half: what the contract says about each bad body. */
function localVerdicts() {
  return badInputs().map(({ name, body, path, code }) => {
    const r = validateDemoRequest(body)
    const hit = r.ok
      ? null
      : r.errors.find((e) => e.code === code && (path === '' || e.path.startsWith(path)))
    return { name, path, code, refused: !r.ok, named: Boolean(hit), errors: r.ok ? [] : r.errors.slice(0, 3) }
  })
}

test('E11 bad input is refused by name, nothing created', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E11' }, async ({ details }) => {
    details.local = localVerdicts()
    const unnamed = details.local.filter((v) => !v.named)
    check(
      unnamed.length === 0,
      `the contract does not name: ${unnamed.map((v) => `${v.name} → ${JSON.stringify(v.errors)}`).join(' | ')}`
    )

    const { owner } = await actor(run)
    requireLine(details, 'T2a/T2b v2 validator on the host', await hostAccepts(owner))
    const token = await connectDemosToken(owner)
    try {
      const api = demosApi(token.accessToken)
      details.host = []
      for (const { name, body, path, code } of badInputs()) {
        const res = await api.create(body)
        const errors = res.json?.error?.errors ?? res.json?.errors ?? []
        details.host.push({
          name,
          status: res.status,
          code: res.json?.error?.code ?? null,
          errors: errors.slice(0, 3)
        })
        check(res.status === 400 || res.status === 413, `${name}: the host answered ${res.status}`)
        if (res.status === 400)
          check(
            errors.some((e) => e.code === code && (path === '' || String(e.path).startsWith(path))),
            `${name}: ${code} at ${path} not named`
          )
      }
      const list = await api.list()
      details.demosAfter = list.json?.data?.length ?? null
      check(details.demosAfter === 0, `bad input created ${details.demosAfter} demo(s)`)
    } finally {
      await revokeDemosToken(token.refreshToken)
    }
  })
})
