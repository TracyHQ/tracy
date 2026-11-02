/**
 * What the business's photos show about it, asked of a text model in one call (`observed-facts-prompt.mjs`): the vision
 * door the photos were labelled with (`picture-vision.js visionDoor`), the same OpenAI-compatible request, but no
 * picture is sent. The model reads the labels the vision call already made and groups them into facts; the answer is
 * held in code (`observed-facts.mjs heldObservedFacts`), never trusted as it comes.
 */
const CALL_MS = 60_000

/**
 * @param {{door: {url: string, key: string, model: string}, prompt: string, fetchImpl?: typeof fetch,
 *   signal?: AbortSignal}} input
 * @returns {Promise<{answer: string, usage: {calls: number, promptTokens: number, completionTokens: number,
 *   requests: any[]}}>} the model's raw JSON text and what the call cost; throws on a failed call
 */
export async function observeWithModel({ door, prompt, fetchImpl = fetch, signal }) {
  const res = await fetchImpl(door.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${door.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: door.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.any([AbortSignal.timeout(CALL_MS), ...(signal ? [signal] : [])])
  })
  if (!res.ok)
    throw Object.assign(new Error(`observation call failed (${res.status})`), { code: 'http_error' })
  const body = await res.json()
  return {
    answer: String(body?.choices?.[0]?.message?.content ?? ''),
    usage: {
      calls: 1,
      promptTokens: Number(body?.usage?.prompt_tokens) || 0,
      completionTokens: Number(body?.usage?.completion_tokens) || 0,
      requests: [
        { requestId: body?.id ?? null, model: body?.model ?? door.model, usage: body?.usage ?? null }
      ]
    }
  }
}
