// The picture picker on Gemini Decision 1 (Google's decisions endpoint), when the "Picture picker" door is assigned that
// model: each frame waiting for the picker is one `choice` question among the photos of its shortlist, or "other" for
// none, asked over the same small thumbnails in one call, and the answer is written as the picks the chat picker gives,
// so the round reads, applies and checks it as before (bench-run-round.js).
//
// Why: Decision 1 answers with probabilities and writes no text, so a round is one call of a few seconds. Two local
// picker rounds (Central Padel and BXR London on JA Boxing, 18/11/2026) asked the same questions of both: the chat
// picker (deepseek-flash) took 119 s for 17 frames over 105 photos, Decision 1 13 s (39,297 input tokens), and of the 23
// frames where they differed, a person looking at the photos took Decision 1's choice for about 20, the chat picker's
// for none (three of its picks were the business's logo, several a portrait where the frame asked for training).
//
// A fix round asks again only for the frames its failure list names, without any photo the run picked for them before:
// those were refused by the check. A frame left with no photo is answered "none" (it waits for the drawer, as before).
// The door's key is the Google provider's (the OpenAI-compatible base address with `/openai` taken off). Nothing is
// retried past DECISION_RETRIES; the round then fails with the endpoint's own status, as a chat call that fails does.
import { AgentError } from '../lib/agent-over-door.js'
import { totalsOf } from '../lib/agent-over-door-wire.js'

export const DECISION_MODEL = 'gemini-decision-1'
/** Google's list price for Decision 1 input (USD per million tokens; it writes no output). */
export const DECISION_PRICE_PER_MTOK = 0.1
/** 280 tokens a picture: a round of 105 photos fits the free tier's 50,000 tokens a minute. */
export const DECISION_RESOLUTION = 'low'
/** Attempts after the first on 429 or 5xx, and the wait before each (rate limits are per minute). */
export const DECISION_RETRIES = [5_000, 20_000, 40_000]

const NONE = 'none'
const OTHER = 'other'

export const isDecisionDoor = (door) => door?.model === DECISION_MODEL

/** The decisions address of a door whose base is Google's OpenAI-compatible one. */
export function decisionsUrl(baseUrl) {
  return `${String(baseUrl)
    .replace(/\/+$/, '')
    .replace(/\/openai$/, '')}/decisions`
}

const keyOf = (frame) => frame.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)

/** What the frame asks for, in words: the same wish the chat picker reads (picker-input.js `words`). */
function askOf(f) {
  const w = f.words ?? {}
  const list = (v) => (Array.isArray(v) && v.length ? v.join(', ') : null)
  return [
    `Frame ${f.frame}${w.size ? `, ${w.size}` : ''}.`,
    w.shows ? `It should show: ${w.shows}.` : null,
    list(w.mustInclude) ? `It must include: ${list(w.mustInclude)}.` : null,
    list(w.avoid) ? `Avoid: ${list(w.avoid)}.` : null,
    w.mood ? `Mood: ${w.mood}.` : null,
    'Which listed photo shows this best, or "other" when none of them does?'
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The request for some frames, and what each question offers.
 * @param {{ frames: object[], thumbnails: Map<string, { base64: string, mediaType: string }>,
 *   exclude?: Map<string, Set<string>> }} input `frames` picker-input.js frames (`candidates` keyed by photo code);
 *   `exclude` the photos a frame may no longer take
 */
export function decisionRequest({ frames, thumbnails, exclude = new Map() }) {
  const asked = []
  for (const f of frames) {
    const options = [...f.candidates.keys()].filter((code) => !exclude.get(f.frame)?.has(code))
    asked.push({ frame: f.frame, key: keyOf(f.frame), options })
  }
  const shown = [...new Set(asked.flatMap((a) => a.options))].filter((code) => thumbnails.has(code))
  const input = [
    {
      type: 'text',
      text: "A website for this business is being built. Each question names one place on a page (a frame), what the site plan asks it to show, and the owner's photos it may take. The photos follow, each after its code.\n"
    }
  ]
  for (const code of shown) {
    const t = thumbnails.get(code)
    input.push({ type: 'text', text: `\nPhoto ${code}:\n` })
    input.push({ type: 'image', data: t.base64, mime_type: t.mediaType, resolution: DECISION_RESOLUTION })
  }
  const questions = {}
  const byFrame = new Map(frames.map((f) => [f.frame, f]))
  for (const a of asked) {
    if (!a.options.length) continue
    questions[a.key] = {
      type: 'choice',
      instructions: askOf(byFrame.get(a.frame)),
      criteria: {
        ...Object.fromEntries(a.options.map((code) => [code, `photo ${code}`])),
        [OTHER]: 'none of the listed photos shows what this frame asks for'
      }
    }
  }
  return { body: { model: DECISION_MODEL, input, questions }, asked }
}

/** The picks the chat picker would write, from the endpoint's answers. */
export function picksFrom(asked, answers) {
  return {
    picks: asked.map((a) => {
      const got = answers?.[a.key]
      if (!a.options.length || !got || got.choice === OTHER || !a.options.includes(got.choice))
        return {
          frame: a.frame,
          photo: NONE,
          reason: a.options.length
            ? `Decision 1: none of the listed photos fits (other ${Number(got?.probabilities?.[OTHER] ?? 0).toFixed(2)}).`
            : 'Every photo of this frame was refused before.'
        }
      return {
        frame: a.frame,
        photo: got.choice,
        reason: `Decision 1 chose ${got.choice} (${Number(got.confidence ?? 0).toFixed(2)}).`
      }
    })
  }
}

/** Picks the run already gave a frame, read from its answered turns: a fix round never offers them again. */
function pickedBefore(turns) {
  const out = new Map()
  for (const t of turns) {
    if (t.state !== 'answered' || typeof t.message?.content !== 'string') continue
    let value = null
    try {
      value = JSON.parse(t.message.content)
    } catch {
      continue
    }
    for (const p of Array.isArray(value?.picks) ? value.picks : []) {
      if (typeof p?.frame !== 'string' || typeof p?.photo !== 'string' || p.photo === NONE) continue
      if (!out.has(p.frame)) out.set(p.frame, new Set())
      out.get(p.frame).add(p.photo)
    }
  }
  return out
}

/**
 * A runAgent stand-in for the picker on Decision 1 (bench-run-loop.js `step.runAgentFor`): the same arguments, the
 * same result (`{ answer, turns, totals }`), each call saved as a turn through `onTurn`.
 * @param {{ frames: object[], thumbnails: Map<string, object> }} picker picker-input.js's input
 */
export function decisionAgent(picker, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  return async function runDecision({
    door,
    history = [],
    followUp,
    onTurn = async () => {},
    fetchImpl = fetch,
    signal,
    clock = () => new Date()
  }) {
    const turns = history.map((t) => structuredClone(t))
    const last = turns.at(-1)
    const answered = last?.state === 'answered' ? last.message?.content : undefined
    // A resumed round whose call was answered and recorded: its answer stands.
    if (answered !== undefined && !followUp) return { answer: answered, turns, totals: totalsOf(turns) }
    const named = followUp ? picker.frames.filter((f) => followUp.includes(f.frame)) : []
    const frames = followUp && named.length ? named : picker.frames
    const { body, asked } = decisionRequest({
      frames,
      thumbnails: picker.thumbnails,
      exclude: followUp ? pickedBefore(turns) : new Map()
    })
    const turn = {
      n: turns.length,
      state: 'dispatched',
      sent: [{ role: 'user', content: followUp ?? `Decision 1: ${asked.length} frames` }],
      request: {
        model: door.model,
        wire: 'google-decisions',
        frames: asked.length,
        photos: body.input.filter((p) => p.type === 'image').length,
        resolution: DECISION_RESOLUTION
      },
      dispatchedAt: clock().toISOString()
    }
    turns.push(turn)
    await onTurn(structuredClone(turn))
    const retries = []
    let answer = null
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new AgentError('AGENT_ABORTED', { turn: turn.n })
      const res = await fetchImpl(decisionsUrl(door.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': door.apiKey },
        body: JSON.stringify(body),
        signal
      }).catch((error) => ({ ok: false, status: 0, error }))
      if (res.ok) {
        answer = await res.json()
        break
      }
      const status = res.status ?? 0
      const transient = status === 0 || status === 429 || status >= 500
      if (!transient || attempt >= DECISION_RETRIES.length) {
        const detail = res.text ? (await res.text().catch(() => '')).slice(0, 300) : String(res.error ?? '')
        Object.assign(turn, { state: 'failed', retries, answeredAt: clock().toISOString() })
        await onTurn(structuredClone(turn))
        throw new AgentError('AGENT_CALL_FAILED', {
          turn: turn.n,
          reason: `the decisions endpoint answered ${status}: ${detail}`
        })
      }
      retries.push({ status, at: clock().toISOString() })
      await sleep(DECISION_RETRIES[attempt])
    }
    const tokens = Number(answer?.usage?.total_input_tokens ?? answer?.usage?.total_tokens ?? 0)
    const content = JSON.stringify(picksFrom(asked, answer?.answers))
    Object.assign(turn, {
      state: 'answered',
      message: { role: 'assistant', content },
      finishReason: 'stop',
      providerModel: DECISION_MODEL,
      usage: { promptTokens: tokens, completionTokens: 0 },
      cost: (tokens * DECISION_PRICE_PER_MTOK) / 1e6,
      costSource: 'price-table',
      retries,
      answeredAt: clock().toISOString()
    })
    await onTurn(structuredClone(turn))
    return { answer: content, turns, totals: totalsOf(turns) }
  }
}
