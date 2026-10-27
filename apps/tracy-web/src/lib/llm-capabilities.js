/** Normalize provider-declared model metadata; missing or malformed declarations remain unknown. */
export function capabilitiesOf(model, presetId) {
  if (presetId === 'deepseek') {
    // https://api-docs.deepseek.com/api/list-models/
    return {
      draws: includes(model?.output_modalities, 'image'),
      vision: includes(model?.input_modalities, 'image'),
      reasoning: stringList(model?.effort?.supported_levels)
        ? model.effort.supported_levels.length > 0
        : null,
      reasoningEfforts: stringList(model?.effort?.supported_levels) ? model.effort.supported_levels : null,
      tools: null,
      json: null,
      context:
        Number.isSafeInteger(model?.context_window) && model.context_window > 0 ? model.context_window : null
    }
  }
  const params = model?.supported_parameters
  return {
    draws: includes(model?.architecture?.output_modalities, 'image'),
    vision: includes(model?.architecture?.input_modalities, 'image'),
    reasoning: includes(params, 'reasoning'),
    reasoningEfforts: null,
    tools: includes(params, 'tools'),
    json: includes(params, 'structured_outputs'),
    context: Number.isFinite(model?.context_length) ? model.context_length : null
  }
}

function stringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
}

function includes(value, member) {
  return stringList(value) ? value.includes(member) : null
}
