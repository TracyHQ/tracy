// Test-only: the add-site host half's hold door (`packages/site/tracy-add-site/src/host/hold-door.ts`)
// as an idle host answers it — no read running, nothing in the store — for tests whose subject is
// another door that now removes an unfinished import through `src/sites/import-remove.js`.
// `src/lib/add-site-host.js` is the caller; `test/import-remove.test.mjs` covers the protocol itself.

/** The hold door's answer to a request, or null when the request is not for it. */
export function answerAddSiteHold(input, init = {}) {
  if (new URL(String(input)).pathname !== '/new/api/tracy-add-site/hold') return null
  const { op } = JSON.parse(String(init.body ?? '{}'))
  if (op === 'hold') return Response.json({ held: true, lastActivityAt: null, upload: null, archives: [] })
  if (op === 'forget') return Response.json({ forgotten: true })
  if (op === 'release') return Response.json({ released: true })
  return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 })
}

/** The seat door's session mint, enough for `add-site-host.js` to carry its call. */
export const laneSeatDoor = { mintSeatSession: async () => 'lane-token' }
