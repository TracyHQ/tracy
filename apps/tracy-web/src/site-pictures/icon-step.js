// The icon step of a picture run (#345), as the bench worker hands it to fillFrames: the icon filler
// (icons/fill-icons.js) with its text model door and the kit's demo icons, and what the run records of it.
//
// The ranking model is reached through its own door `pictureIconRanker` (by default openai/gpt-6-luna through
// OpenRouter, icons/icon-ranker.js ICON_RANKER_MODEL). Like the ranking itself, the door never stops a run: an unset,
// disabled or unreadable door means the icons follow the shortlist order, and the manifest says why. The call's cost
// (as the provider reports it) and time are recorded in the manifest's `cost` and `timing` under `iconRanking`.
//
// A run is prepared again on every claim (a redeploy) and before its fix rounds; the ranking is asked once per run and
// its answer kept in the bench's file store (runs/<run id>/icon-ranking.json), so a resumed run gets the same icons
// and pays once.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { lookupDoor } from '../lib/llm-store.js'
import { readReleases } from '../lib/quickstart-releases.js'
import { releaseKitZip } from '../lib/template-kit-images.js'
import { demoIconReader } from './demo-icons.js'
import { createIconFiller } from './icons/fill-icons.js'
import { seederTextDoor } from './icons/icon-ranker.js'

export const ICON_RANKER_DOOR = 'pictureIconRanker'

/** A release's webroot tar.gz asset name. */
const WEBROOT = /(^|[-_.])webroot\.tar\.gz$/

/**
 * The chat call seederTextDoor expects, over an OpenAI-compatible /chat/completions endpoint (OpenRouter): one answer,
 * its text, the model that answered and the usage with the provider's own cost.
 */
export const chatOver =
  (fetchImpl) =>
  async (door, req, doFetch = fetchImpl) => {
    const res = await doFetch(door.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${door.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        usage: { include: true }
      })
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body || body.error)
      throw new Error(
        `the ranking model answered ${res.status}: ${String(body?.error?.message ?? '').slice(0, 200)}`
      )
    return {
      text: body.choices?.[0]?.message?.content ?? '',
      model: body.model ?? req.model,
      usage: body.usage ?? null
    }
  }

/** The ranking door as icon-ranker.js takes it, or null with the reason the shortlist order decides. */
export async function iconRankerDoor({ pool, secret, fetchImpl = fetch }) {
  const found = secret ? await lookupDoor(pool, ICON_RANKER_DOOR, secret) : { state: 'unassigned' }
  if (found.state !== 'ok' || !found.credential?.model)
    return {
      door: null,
      note: `the "Picture icon ranker" door is ${found.state === 'ok' ? 'without a model' : found.state}`
    }
  return {
    door: seederTextDoor({ credential: found.credential, chat: chatOver(fetchImpl), fetchImpl }),
    note: null
  }
}

/** The webroot tar.gz of a published release, through the releases credential (lib/template-kit-images.js). */
export function releaseWebroot({ pool, config, fetchImpl = fetch }) {
  const fetchAsset = releaseKitZip({ pool, config, fetchImpl })
  return async (release) => {
    const row = (await readReleases(pool, { includeArchived: true })).find((r) => r.tag === release)
    const name = (row?.assets ?? []).map((a) => a?.name).find((n) => WEBROOT.test(String(n)))
    if (!name) return { ok: false, reason: `the release ${release} has no webroot tar.gz` }
    return fetchAsset({ release, name })
  }
}

/**
 * The icon step for one run: `icons` for fillFrames, and `report()` for the manifest once fillFrames is done.
 * @param {{ pool: import('pg').Pool, secret?: string, fetchImpl?: typeof fetch, storeDir: string, runId: string,
 *   webroot?: ((release: string) => Promise<object>) | null, kit: object, business?: string | null }} input
 */
export async function iconStepFor({
  pool,
  secret,
  fetchImpl = fetch,
  storeDir,
  runId,
  webroot = null,
  kit,
  business = null
}) {
  const kept = path.join(storeDir, 'runs', String(runId), 'icon-ranking.json')
  const ranker = await iconRankerDoor({ pool, secret, fetchImpl })
  const demos = webroot
    ? await demoIconReader({ dir: storeDir, webroot }).forKit(kit)
    : { readDemo: async () => null, note: 'no release reader: the demo icons are not measured' }
  let ms = 0
  let usage = null
  const door = ranker.door
    ? async (question) => {
        const before = await readFile(kept, 'utf8')
          .then(JSON.parse)
          .catch(() => null)
        if (before) {
          ;({ ms, usage } = before)
          return before.said
        }
        const started = Date.now()
        const said = await ranker.door(question)
        ms = Date.now() - started
        usage = said?.usage ?? null
        await mkdir(path.dirname(kept), { recursive: true })
        await writeFile(kept, JSON.stringify({ said, ms, usage }))
        return said
      }
    : null
  const icons = createIconFiller({ door, readDemo: demos.readDemo, business })
  return {
    icons,
    report() {
      const ranking = icons.ranking()
      const cost = Number(usage?.cost)
      return {
        cost: Number.isFinite(cost) ? cost : 0,
        timing: ms,
        ranking: {
          model: ranking.model,
          notes: [ranker.note, demos.note, ranking.note].filter(Boolean)
        }
      }
    }
  }
}
