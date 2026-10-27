/**
 * The translations a quickstart ships for its own demo copy, keyed the way the translation planner
 * looks them up.
 *
 * A package like `tracy-business/j6` ships one file per language holding every slot of its English
 * edition already translated — 778 strings each, reviewed by the gates that built them. When a
 * customer asks for five languages, most of those slots still hold the package's own words: the
 * build keeps unbacked demo copy (`--keep-demo`) rather than inventing facts. Paying a model to
 * translate a sentence the package already translated is waste, and worse, it produces a DIFFERENT
 * sentence than the one the demo site was verified with.
 *
 * The planner's cache key is `${locale}:${maxCharacters}:${source}`. That key does the whole job of
 * telling the two cases apart, with no extra condition anywhere: a slot the customer never touched
 * still holds the package's source string, so it hits; a slot they rewrote holds their words, so it
 * misses and the model is asked. Nothing here needs to know which is which.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {string} dataDir  where the seeder keeps its shipped data (`dist/data`)
 * @param {string} contractId  e.g. `tracy-business/j6/1.1.0`
 * @param {string} locale  e.g. `de-DE`
 * @returns {Map<string, string>} cache key → translated text; empty when the package ships none
 */
export function loadShippedTranslations(dataDir, contractId, locale) {
  const out = new Map()
  if (!dataDir || !contractId || !locale) return out
  const translations = path.join(dataDir, 'quickstart-translations', contractId, `${locale}.json`)
  const contentMap = path.join(dataDir, 'quickstart-contracts', contractId, 'content-map.json')
  // Both halves are required and neither is an error when missing: a quickstart may ship no
  // translations at all, and the seeder must behave exactly as it did before this existed.
  if (!existsSync(translations) || !existsSync(contentMap)) return out

  let byKey
  let slots
  try {
    byKey = JSON.parse(readFileSync(translations, 'utf8'))
    slots = JSON.parse(readFileSync(contentMap, 'utf8')).slots
  } catch {
    return out
  }
  if (!byKey || !Array.isArray(slots)) return out

  // The shipped file is keyed by SLOT; the planner's cache is keyed by the source text. The content
  // map is the only thing that holds both, which is why it is read here rather than trusted from
  // the plan — the plan describes the site as it is now, this describes the package as it shipped.
  for (const slot of slots) {
    if (slot.type !== 'text') continue
    const text = byKey[slot.key]
    if (typeof text !== 'string' || text === '') continue
    out.set(`${locale}:${slot.maxCharacters}:${slot.sample}`, text)
  }
  return out
}
