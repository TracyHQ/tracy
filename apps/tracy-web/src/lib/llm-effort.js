/** Supported request profiles are explicit: metadata from another protocol is not interchangeable. */
export function effortOptions({ presetId, baseUrl, metadata }) {
  const endpoint = baseUrl?.replace(/\/+$/, '')
  if (
    presetId !== 'deepseek' ||
    !['https://api.deepseek.com', 'https://api.deepseek.com/v1'].includes(endpoint)
  )
    return { mode: 'unsupported', choices: [], parameter: null }
  if (metadata?.reasoning !== true || !Array.isArray(metadata.reasoningEfforts))
    return { mode: 'unknown', choices: [], parameter: null }
  // https://api-docs.deepseek.com/guides/thinking_mode/ — use canonical levels, not mapped aliases.
  const choices = ['low', 'high', 'max'].filter((level) => metadata.reasoningEfforts.includes(level))
  return {
    mode: choices.length ? 'selectable' : 'unsupported',
    choices,
    parameter: 'reasoning_effort',
    profile: 'deepseek-chat-thinking/1',
    source: 'https://api-docs.deepseek.com/guides/thinking_mode/'
  }
}
