/** One vision resolution for research photos and logos. Prices and expiring quality proofs do not select credentials. */
import { requireHost } from './host.js'

/** A ready assignment accepts missing catalog metadata, just like the photograph labeller. */
export function menuVisionDoorOf(found, host) {
  if (!found || found.state === 'unassigned')
    return { state: 'not_configured', reason: 'No vision model is assigned.' }
  if (found.state !== 'ok')
    return { state: 'unavailable', reason: `The assigned vision provider is ${found.state}.` }
  const { apiKey, baseUrl, model } = found.credential
  const metadata = found.snapshot?.metadata
  if (metadata?.vision === false)
    return { state: 'unavailable', reason: 'The assigned model does not read pictures.' }
  const { effortOptions } = requireHost(host, ['effortOptions'])
  const options = effortOptions({ presetId: found.snapshot?.presetId, baseUrl, metadata })
  return {
    state: 'ready',
    door: {
      url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
      key: apiKey,
      model,
      effort:
        options.parameter !== 'reasoning_effort'
          ? null
          : found.snapshot?.effort === 'off'
            ? 'off'
            : options.choices.includes('low')
              ? 'low'
              : null
    }
  }
}

/** Research uses an available assignment first, otherwise the same environment model as the photograph labeller. */
export async function menuVisionDoorFor(pool, secret, host) {
  const { lookupDoor } = requireHost(host, ['lookupDoor', 'effortOptions'])
  let assigned
  let found
  try {
    found = pool ? await lookupDoor(pool, 'vision', secret) : null
    assigned = menuVisionDoorOf(found, host)
  } catch {
    assigned = { state: 'unavailable', reason: 'The assigned vision provider could not be read.' }
  }
  if (assigned.state === 'ready') {
    // Keep assignment changes in the research cache key, without asking for a paid proof.
    if (found.snapshot && host.visionFingerprint)
      assigned.door.fingerprint = host.visionFingerprint({
        snapshot: { ...found.snapshot, metadata: found.snapshot.metadata ?? null },
        baseUrl: found.credential.baseUrl,
        model: found.credential.model
      })
    return assigned
  }
  const fallback = host.visionFallback?.()
  if (fallback?.key && fallback.url && fallback.model)
    return {
      state: 'ready',
      source: 'environment',
      reason: `${assigned.reason} Using the environment vision model.`,
      door: { ...fallback, effort: null }
    }
  return { state: 'not_configured', reason: `${assigned.reason} No environment vision model is configured.` }
}
