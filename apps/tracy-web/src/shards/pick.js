/**
 * Which shard a new person is adopted into (docs/sre/2026-10-15-shard-beta-design.md §4.1). Filter:
 * accepting (here and in its own last heartbeat), not degraded (`degraded_until` past), a heartbeat
 * younger than three minutes that could read its counts, under its own site limit, more than 2 GB
 * free, its catalogue read, and a secret this process can sign with. Rank: the smallest share of its
 * own limit; on a tie the region of the visitor's CF-IPCountry, then free memory.
 */
export const SILENT_AFTER_MS = 3 * 60_000
export const MIN_MEMORY_MB = 2048

const AREAS = {
  asia: new Set([
    'VN',
    'SG',
    'MY',
    'TH',
    'ID',
    'PH',
    'KH',
    'LA',
    'MM',
    'JP',
    'KR',
    'CN',
    'HK',
    'TW',
    'MO',
    'IN',
    'BD',
    'PK',
    'LK',
    'NP',
    'AU',
    'NZ'
  ]),
  america: new Set([
    'US',
    'CA',
    'MX',
    'BR',
    'AR',
    'CL',
    'CO',
    'PE',
    'VE',
    'EC',
    'UY',
    'PY',
    'BO',
    'CR',
    'PA',
    'GT',
    'DO',
    'PR'
  ]),
  europe: new Set([
    'GB',
    'IE',
    'FR',
    'DE',
    'NL',
    'BE',
    'LU',
    'ES',
    'PT',
    'IT',
    'CH',
    'AT',
    'DK',
    'SE',
    'NO',
    'FI',
    'IS',
    'PL',
    'CZ',
    'SK',
    'HU',
    'RO',
    'BG',
    'GR',
    'HR',
    'SI',
    'EE',
    'LV',
    'LT',
    'UA',
    'TR'
  ])
}

/** @param {string | null | undefined} country - CF-IPCountry */
export function areaOf(country) {
  const code = typeof country === 'string' ? country.trim().toUpperCase() : ''
  for (const [area, codes] of Object.entries(AREAS)) if (codes.has(code)) return area
  return null
}

/**
 * Whether a shard takes new people: /ops has it open and its own last heartbeat does not say
 * `accepting: false` (docs/sre/hop-dong-cua-shard.md §7, §12). A heartbeat that does not say is not a no.
 */
export function accepts(shard) {
  return Boolean(shard?.accepting && shard.heartbeat?.accepting !== false)
}

export function eligible(shard, now) {
  const beat = shard.heartbeat ?? {}
  const heard = shard.heartbeatAt ? new Date(shard.heartbeatAt).getTime() : Number.NaN
  const degraded = shard.degradedUntil ? new Date(shard.degradedUntil).getTime() > now : false
  return Boolean(
    shard.secret &&
      accepts(shard) &&
      !degraded &&
      now - heard < SILENT_AFTER_MS &&
      Number.isSafeInteger(beat.sites) &&
      beat.sites < shard.maxSites &&
      Number(beat.mem_available_mb) > MIN_MEMORY_MB &&
      typeof beat.releases_read_at === 'string' &&
      beat.releases_read_at !== ''
  )
}

const fill = (shard) => shard.heartbeat.sites / shard.maxSites
const memory = (shard) => Number(shard.heartbeat.mem_available_mb)

/** The shard a new person goes to, or null when none may take anybody now. */
export function pickShard(shards, { now, country = null, exclude = [] }) {
  const area = areaOf(country)
  const near = (shard) => (area !== null && shard.region === area ? 1 : 0)
  const ranked = [...shards]
    .filter((shard) => !exclude.includes(shard.name) && eligible(shard, now))
    .sort(
      (a, b) =>
        fill(a) - fill(b) || near(b) - near(a) || memory(b) - memory(a) || a.name.localeCompare(b.name)
    )
  return ranked[0] ?? null
}
