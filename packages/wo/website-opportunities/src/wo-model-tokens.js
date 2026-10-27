/**
 * The tokens a model provider reported for one ledger charge (`wo_cost_ledger.tokens`, migration 167), from the raw
 * OpenAI-compatible `usage` of each call it covered. NULL when no call reported usage: never zero-filled. A field no
 * measured call reported stays null; `reasoning` is part of `completion`, never added to it.
 */
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null)

/** @param {Array<Record<string, any> | null | undefined>} usages one entry per call, null when it reported none */
export function modelTokensOf(usages) {
  const list = Array.isArray(usages) ? usages : []
  const measured = list.filter(
    (u) => u && [u.prompt_tokens, u.completion_tokens, u.total_tokens].some((v) => count(v) !== null)
  )
  if (measured.length === 0) return null
  const sum = (pick) => {
    const values = measured.map(pick).filter((v) => v !== null)
    return values.length ? values.reduce((a, b) => a + b, 0) : null
  }
  const prompt = sum((u) => count(u.prompt_tokens))
  const completion = sum((u) => count(u.completion_tokens))
  return {
    version: 1,
    calls: list.length,
    measured: measured.length,
    prompt,
    completion,
    reasoning: sum((u) => count(u.completion_tokens_details?.reasoning_tokens)),
    // A total the provider did not send is prompt + completion only when it sent both; never half a sum.
    total: sum(
      (u) =>
        count(u.total_tokens) ??
        (count(u.prompt_tokens) !== null && count(u.completion_tokens) !== null
          ? u.prompt_tokens + u.completion_tokens
          : null)
    )
  }
}
