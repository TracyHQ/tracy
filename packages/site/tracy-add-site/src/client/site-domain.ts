/**
 * The fleet's own zone — what a site born here answers under (`<label>.<zone>`), and the zone
 * `forkUrlRefusal`/`importAddressRefusal` refuse as "this is a Tracy lane, not a site to
 * fork/import from".
 *
 * Read from `GET /api/config` (Task 11), not the `FLEET_ZONE = 'tracy.ai'` module constant this
 * replaced: `tracy.ai` is production's value, and a dev deployment carries a different one — the
 * same reasoning `useAddressPrefix` in `wizard.tsx` already documents for the address PREFIX.
 *
 * Fail-soft the same way: a broken read shows PRODUCTION's zone, never a guess.
 * `tracyConfig()` already resolves to that default when the door fails, so this hook only needs
 * to keep it while the real read is still in flight.
 */
import { tracyConfig } from '@tracy/core/config'
import { useEffect, useState } from 'react'

/** Production's zone — the same value `tracyConfig()` itself falls back to. */
export const DEFAULT_ZONE = 'tracy.ai'

/**
 * The suffix a person should read in the Address field: the zone, plus the port when the
 * deployment actually serves sites on one.
 *
 * 🔒 THE PORT IS PART OF THE ADDRESS, NOT A DETAIL. On a laptop a site answers at
 * `<label>.localhost:8080`; showing a bare `.localhost` — or worse, production's `.tracy.ai` —
 * tells somebody the wrong link for the site they just made, and `.tracy.ai` on a local build
 * reads as though the wizard is about to publish to production. Measured 10/09: the field
 * displayed `.tracy.ai` while the real address was `<label>.localhost:8080`.
 *
 * In production `sitePort` is '' (https on its default port) and this is just the zone, exactly
 * as before.
 */
export function addressSuffix(zone: string, port: string): string {
  return port === '' ? zone : `${zone}:${port}`
}

export function useSiteDomain(): string {
  const [zone, setZone] = useState(DEFAULT_ZONE)
  useEffect(() => {
    let cancelled = false
    void tracyConfig().then((config) => {
      if (!cancelled && config.siteDomain) setZone(addressSuffix(config.siteDomain, config.sitePort ?? ''))
    })
    return () => {
      cancelled = true
    }
  }, [])
  return zone
}
