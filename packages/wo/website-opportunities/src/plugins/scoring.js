/**
 * Scoring rules. The engine and the built-in rules live in `domain/` (`opportunity-score.mjs`, `scoring/`), which the
 * browser client bundles and which imports nothing outside itself; this module adds what only a server does: rule
 * files from a folder.
 */
import { BUILT_IN_SCORING_RULES, scoringRules } from '../../domain/opportunity-score.mjs'
import { loadPluginFiles } from './load.js'

export {
  BUILT_IN_SCORING_RULES,
  defineScoringRule,
  scoreWithRules,
  scoringRules
} from '../../domain/opportunity-score.mjs'

/** The built-in rules followed by each rule file of `dir`, checked as one set. */
export async function loadScoringRules(dir) {
  const extra = (await loadPluginFiles(dir)).map(({ plugin }) => plugin)
  return scoringRules([...BUILT_IN_SCORING_RULES, ...extra])
}
