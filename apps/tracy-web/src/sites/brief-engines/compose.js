import { createQuickstartFirstEngine } from './quickstart-first.js'

/** The production engine composition, shared with wiring tests for every CMS. */
export function composeBriefEngines(engines, quickstartOptions) {
  return Object.fromEntries(
    Object.entries(engines).map(([platform, engine]) => [
      platform,
      createQuickstartFirstEngine({ ...quickstartOptions, legacy: engine })
    ])
  )
}
