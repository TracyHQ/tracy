/**
 * The variables /ops pushes to the machine the agent and the seeder run on (`/_host/model-keys`,
 * written into dsh's credential store as `refs:`).
 *
 * ⚠ THE NAMES ARE THE ONES dsh AND THE SEEDER ALREADY READ, not the provider ids: `model.mjs`'s
 * `providerOf` looks for exactly `OPENROUTER_API_KEY` and `DEEPSEEK_API_KEY`. A third vendor has no
 * name to be pushed under yet — it can still serve `web`, which tracy-web spends itself.
 *
 * 🔒 AND THE CHOICES TRAVEL WITH THE KEYS. The push used to carry keys only, so the seeder picked a
 * provider by the order of its environment: measured 23/09/2026 on the dev host, `seedText` assigned
 * to openrouter / openai/gpt-5.4-mini wrote with DeepSeek, and `seedImage` drew nothing. An
 * assignment is sent only when the key it needs is sent too — a seeder told to use a provider it
 * cannot reach would fail every build instead of falling back to one it can.
 */

const ENV_NAME_OF = { deepseek: 'DEEPSEEK_API_KEY', openrouter: 'OPENROUTER_API_KEY' }

/**
 * @param {{ providers: { providerId: string, apiKey?: string | null }[],
 *   seedText?: { providerId: string, model?: string | null } | null,
 *   seedImage?: { providerId: string, model?: string | null } | null,
 *   agent?: { providerId: string } | null }} input
 * @returns {Record<string, string>}
 */
export function modelKeysFor({ providers, seedText = null, seedImage = null, agent = null }) {
  const keys = {}
  // 🔒 AN ASSIGNED `agent` DOOR NARROWS THE PUSH. dsh picks a provider by the order of the keys it
  // finds, so pushing every enabled provider made "agent → openrouter" decoration whenever DeepSeek
  // was enabled too. With the door assigned, only the providers a door on this machine uses go
  // down (agent, seedText, seedImage); unassigned keeps the old behaviour of sending every enabled one.
  const wanted = agent
    ? new Set([agent, seedText, seedImage].filter(Boolean).map((door) => door.providerId))
    : null
  for (const provider of providers) {
    if (wanted && !wanted.has(provider.providerId)) continue
    const name = ENV_NAME_OF[provider.providerId]
    if (name && provider.apiKey) keys[name] = provider.apiKey
  }
  const reachable = (door) => door && ENV_NAME_OF[door.providerId] && keys[ENV_NAME_OF[door.providerId]]
  if (reachable(seedText)) {
    keys.TRACY_SEED_TEXT_PROVIDER = seedText.providerId
    if (seedText.model) keys.TRACY_SEED_TEXT_MODEL = seedText.model
  }
  // Only OpenRouter draws among the providers this machine can name.
  if (reachable(seedImage) && seedImage.providerId === 'openrouter' && seedImage.model)
    keys.TRACY_SEED_IMAGE_MODEL = seedImage.model
  return keys
}

/**
 * Send what the provider book holds to EVERY host that runs a dsh, and take back what it no longer
 * holds.
 *
 * 🔒 NOTHING TO PUSH IS NOT "DO NOTHING". The host rewrites the whole `refs:` block, so a key that is
 * no longer sent is a key removed — but only if the call is made. Returning early when the book had
 * nothing left (the last provider switched off, a key that leaked and was disabled) left the old key
 * sitting on the machine for good. An empty set is sent as an explicit `clear`, which the host
 * accepts only in that form.
 *
 * @param {object} input
 * @param {import('pg').Pool} input.pool
 * @param {string} input.secret
 * @param {{ hosts: Map<string, { dshOrigin: string | null }>, defaultHost: string }} input.config
 * @param {(config: object, host: string, path: string, body: object, opts: object) => Promise<{ ok: boolean, body?: any }>} input.hostCall
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function pushModelKeys({ pool, secret, config, hostCall, fetchImpl = fetch }) {
  const { readAssignments, resolveAll } = await import('./llm-store.js')
  const doors = await readAssignments(pool)
  const keys = modelKeysFor({
    providers: await resolveAll(pool, secret),
    seedText: doors.seedText,
    seedImage: doors.seedImage,
    agent: doors.agent
  })
  const body = Object.keys(keys).length === 0 ? { keys: {}, clear: true } : { keys }
  const targets = [...config.hosts].filter(([, h]) => h.dshOrigin).map(([name]) => name)
  if (targets.length === 0) targets.push(config.defaultHost)
  const results = []
  for (const host of targets) {
    const answer = await hostCall(config, host, '/model-keys', body, { fetchImpl })
    results.push(
      answer.ok
        ? { host, ok: true, wrote: answer.body?.wrote ?? [] }
        : { host, ok: false, code: answer.body?.code ?? 'HOST_REFUSED', detail: answer.body?.detail ?? null }
    )
  }
  const failed = results.find((r) => !r.ok)
  if (failed) return { ok: false, code: failed.code, detail: failed.detail, hosts: results }
  return {
    ok: true,
    cleared: 'clear' in body,
    wrote: results[0]?.wrote ?? [],
    host: results[0]?.host ?? config.defaultHost,
    hosts: results
  }
}
