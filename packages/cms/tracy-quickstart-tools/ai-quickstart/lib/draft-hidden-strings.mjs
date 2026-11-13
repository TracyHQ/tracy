// The template strings a build hides (ticket #584). Pure. Called by `draftAiQuickstart` (`draft.mjs`).
//
// The template kit says, for every fixed text a page draws, whether it can be hidden and how (`site.fixedTexts[]`,
// `canHide`, `hiddenBy`: a CMS language override of its constant with an empty value). The reviewed decisions say
// which of them the build hides (`decisions.hiddenStrings`, by constant, with why). The draft report lists each with
// the kit's way of hiding it, so the mapping file check can ask for the override (`overrides.language[]` with that
// key and value) and refuse an override value no hidden string accounts for.

const constantsOf = (hiddenBy) => [hiddenBy?.constant].flat().filter((c) => typeof c === 'string')

/**
 * `[{constant, block, file, value, why}]`, one per decided hidden string, sorted by constant.
 * Throws when a decided constant has no kit fixed text that can be hidden by a language override.
 */
export function hiddenStringsOf({ kit, decisions }) {
  const decided = decisions.hiddenStrings ?? {}
  const texts = kit?.site?.fixedTexts ?? []
  return Object.keys(decided)
    .sort()
    .map((constant) => {
      const text = texts.find(
        (t) =>
          t?.canHide === true &&
          t.hiddenBy?.setting === 'cms language override' &&
          constantsOf(t.hiddenBy).includes(constant)
      )
      if (!text)
        throw new Error(
          `hiddenStrings.${constant}: no fixed text of the template kit is hidden by a language override of it`
        )
      if (typeof decided[constant]?.why !== 'string' || !decided[constant].why.trim())
        throw new Error(`hiddenStrings.${constant}: say why the build hides it`)
      return {
        constant,
        block: text.block,
        file: text.hiddenBy.file,
        value: text.hiddenBy.value,
        why: decided[constant].why
      }
    })
}
