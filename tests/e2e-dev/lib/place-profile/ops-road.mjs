// `/ops` › Templates › Road to live, read by a Tracy staff seat (an accepted seat in the `tracy_admin` workspace).
// No run account holds one, and this suite never grants one: the staff session is handed in, read-only, through
// `E2E_OPS_COOKIE` (the `tracy_sess` value) or `E2E_OPS_COOKIE_FILE` (a file holding it, chmod 600), the way
// tests/regression/common-dev.md hands its `lee` cookie to `/ops` cases. Only GET doors are called with it.

import { existsSync, readFileSync } from 'node:fs'
import { Client } from '../api.mjs'
import { Blocked } from '../journey.mjs'

/** The staff client, or BLOCKED when none was handed in or it is not staff. */
export async function opsStaff() {
  const file = process.env.E2E_OPS_COOKIE_FILE
  const token =
    process.env.E2E_OPS_COOKIE ??
    (file && existsSync(file)
      ? readFileSync(file, 'utf8')
          .trim()
          .replace(/^tracy_sess=/, '')
      : null)
  if (!token)
    throw new Blocked('no staff session for /ops (set E2E_OPS_COOKIE or E2E_OPS_COOKIE_FILE)', 'environment')
  const staff = new Client({ name: 'ops', token })
  const list = await staff.get('/api/ops/quickstarts', { timeoutMs: 120_000 })
  if (list.status !== 200)
    throw new Blocked(`the staff session reads /api/ops/quickstarts as ${list.status}`, 'environment')
  return { staff, releases: list.json.releases ?? [] }
}

/** The Slot roles step of a release's road, and what Publish would refuse. */
export function slotRolesOfRow(row) {
  const road = Array.isArray(row?.road) ? row.road : []
  const step = road.find((s) => s.step === 'slot-roles') ?? null
  const published = road.find((s) => s.step === 'published') ?? null
  return { step, publishBlockedBy: published?.blockedBy ?? null, steps: road.map((s) => s.step) }
}

/** A release row by its tag fragment and version, e.g. (`tracy-base/j6`, `1.0.5`). */
export const releaseRow = (releases, tagPart, version) =>
  releases.find(
    (r) =>
      String(r.tag ?? '').includes(tagPart) &&
      (!version || r.setting?.version === version || r.version === version)
  ) ?? null
