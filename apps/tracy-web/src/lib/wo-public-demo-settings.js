/**
 * The Tracy-side numbers of `POST /v1/demos` (tasks/todo-wo-public-demos.md "decided"), set on /ops/wo › Settings.
 * Tracy's, not the open package's (`website-opportunities/src/wo-settings.js`): another host of that package has
 * neither Tracy's hosting nor Tracy's model to give away.
 *
 *   liveDemosPerAccount           demo sites one account may have alive at once through the door (hosting cap)
 *   sponsoredDemoMaxCents         what one demo built on Tracy's model is reserved at against the month
 *   sponsoredMonthlyBudgetCents   what demos built on Tracy's model may reserve in one UTC month (0 = none)
 */

export const DEFAULT_PUBLIC_DEMO_SETTINGS = Object.freeze({
  liveDemosPerAccount: 20,
  sponsoredDemoMaxCents: 200,
  sponsoredMonthlyBudgetCents: 30_000
})

export const PUBLIC_DEMO_RANGES = Object.freeze({
  liveDemosPerAccount: [0, 10_000],
  sponsoredDemoMaxCents: [1, 100_000],
  sponsoredMonthlyBudgetCents: [0, 100_000_000]
})

/** The saved numbers over the defaults; a key never saved reads its default. */
export async function readPublicDemoSettings(db) {
  const { rows } = await db.query('select settings, updated_by, updated_at from wo_sponsor_setting where id')
  const saved = rows[0]?.settings ?? {}
  const settings = { ...DEFAULT_PUBLIC_DEMO_SETTINGS }
  for (const key of Object.keys(PUBLIC_DEMO_RANGES))
    if (Number.isInteger(saved[key])) settings[key] = saved[key]
  return { settings, updatedBy: rows[0]?.updated_by ?? null, updatedAt: rows[0]?.updated_at ?? null }
}

/**
 * Keys sent are checked against their range; keys left out keep their saved value.
 * @returns {{ ok: true, settings: object } | { ok: false, code: string, message: string }}
 */
export function parsePublicDemoSettings(sent, current) {
  if (!sent || typeof sent !== 'object' || Array.isArray(sent))
    return { ok: false, code: 'INVALID_BODY', message: 'Send {"settings": {…}}.' }
  const next = { ...current }
  for (const [key, value] of Object.entries(sent)) {
    const range = PUBLIC_DEMO_RANGES[key]
    if (!range) return { ok: false, code: 'UNKNOWN_SETTING', message: `Unknown setting ${key}.` }
    if (!Number.isInteger(value) || value < range[0] || value > range[1])
      return {
        ok: false,
        code: 'INVALID_PUBLIC_DEMO_SETTING',
        message: `${key}: a whole number from ${range[0]} to ${range[1]}.`
      }
    next[key] = value
  }
  return { ok: true, settings: next }
}

export async function savePublicDemoSettings(db, settings, updatedBy) {
  await db.query(
    `insert into wo_sponsor_setting (id, settings, updated_by, updated_at) values (true, $1::jsonb, $2, now())
     on conflict (id) do update set settings = excluded.settings, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(settings), updatedBy]
  )
}
