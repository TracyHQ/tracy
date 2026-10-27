/**
 * "Use my location", reduced to one answer the Find step can draw. The browser asks the person; this
 * never waits forever and never throws, so the place field is always the way forward.
 */
export type LocationAnswer =
  | { state: 'found'; lat: number; lon: number }
  | { state: 'approx'; lat: number; lon: number; label: string }
  | { state: 'denied' | 'unavailable' | 'timeout' | 'insecure' }

interface GeolocationLike {
  getCurrentPosition(
    ok: (position: { coords: { latitude: number; longitude: number } }) => void,
    fail: (error: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }
  ): void
}

/** The browser rejects geolocation on a page that is not a secure context (plain http off localhost). */
export function askLocation(env: {
  secure: boolean
  geolocation: GeolocationLike | undefined
  timeoutMs?: number
}): Promise<LocationAnswer> {
  if (!env.secure) return Promise.resolve({ state: 'insecure' })
  const geolocation = env.geolocation
  if (geolocation === undefined || typeof geolocation.getCurrentPosition !== 'function') {
    return Promise.resolve({ state: 'unavailable' })
  }
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) =>
          resolve({ state: 'found', lat: position.coords.latitude, lon: position.coords.longitude }),
        (error) =>
          resolve({ state: error?.code === 1 ? 'denied' : error?.code === 3 ? 'timeout' : 'unavailable' }),
        { enableHighAccuracy: false, timeout: env.timeoutMs ?? 15_000, maximumAge: 300_000 }
      )
    } catch {
      resolve({ state: 'unavailable' })
    }
  })
}

/**
 * The browser's position, or else — like a map does — the city the server places the network in.
 * A failed fallback keeps the browser's reason, so the note still says why and what to do.
 */
export async function findLocation(
  env: Parameters<typeof askLocation>[0],
  approx: () => Promise<{ ok: boolean; body?: { lat?: unknown; lon?: unknown; label?: unknown } }>
): Promise<LocationAnswer> {
  const exact = await askLocation(env)
  if (exact.state === 'found') return exact
  try {
    const answer = await approx()
    const { lat, lon, label } = answer.ok ? (answer.body ?? {}) : {}
    if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon))
      return {
        state: 'approx',
        lat,
        lon,
        label: typeof label === 'string' && label.trim() ? label : `${lat.toFixed(2)}, ${lon.toFixed(2)}`
      }
  } catch {
    // keep the browser's reason
  }
  return exact
}

/** What the Find step holds: nothing asked yet, the browser asking, or its answer. */
export type LocationState = { state: 'idle' } | { state: 'asking' } | LocationAnswer

/**
 * Whether the location note still applies: the approximate place only while the box holds it. The
 * Find step resets the state to idle on the person's own edit or pick, which hides the others.
 */
export function locationNoteShown(location: LocationState, text: string): boolean {
  if (location.state === 'idle') return false
  if (location.state === 'approx') return text.trim() === location.label.trim()
  return true
}

/**
 * The place Find opens on, without a permission prompt: the browser's position only when the person
 * already allowed it, else the city the server places the network in.
 */
export async function quietLocation(
  env: Parameters<typeof askLocation>[0] & { permission: 'granted' | 'prompt' | 'denied' | null },
  approx: Parameters<typeof findLocation>[1]
): Promise<LocationAnswer> {
  if (env.permission === 'granted') return findLocation(env, approx)
  return findLocation({ ...env, geolocation: undefined }, approx)
}

/** The geolocation permission as the Permissions API states it; null where it cannot be read. */
export async function geolocationPermission(): Promise<'granted' | 'prompt' | 'denied' | null> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state === 'granted' || status.state === 'prompt' || status.state === 'denied'
      ? status.state
      : null
  } catch {
    return null
  }
}
