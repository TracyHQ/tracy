// Which models a door refuses, whatever the provider says (#320). The brand step's two doors never take an Anthropic
// model; /ops refuses the assignment (ops/llm.js) and a run refuses it again at start (brand-step/brand-doors.js).

/** The doors of the brand step. */
export const BRAND_DOORS = new Set(['brandAgent', 'brandReviewer'])

/** True for any Anthropic model: Opus and Sonnet are never used for the brand step (the cost has to be multipliable). */
export const isAnthropicModel = (providerId, model) =>
  providerId === 'anthropic' || /claude|anthropic|\b(opus|sonnet)\b/i.test(String(model ?? ''))

/** True when this door must not use this model: a brand door and an Anthropic model. */
export const doorRefusesModel = (doorId, providerId, model) =>
  BRAND_DOORS.has(doorId) && isAnthropicModel(providerId, model)
