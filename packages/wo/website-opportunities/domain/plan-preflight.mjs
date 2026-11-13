// What the plan composer checks before it calls the model (ticket #593). Everything the model does not produce is
// checked here, so a problem the model cannot fix is never sent back to it: the block store and the page recipes
// (Contract A, which also keeps demo text out of what the model reads, and gives a design field no data kind), the
// Tracy library blocks, a name the site may show (`site_name_missing` while the business name is held with no neutral
// identity), the look (template, accent colour, logo), the site language, the pictures inputs, and a needs
// profile with at least one usable fact. Each failure has its own code and `noRerun`: running the step again on the
// same inputs cannot change it.
import { blockProblems, checkAiQuickstartContract, formatProblem } from './ai-quickstart-contract.mjs'
import { lookProblems } from './build-contract-plan-parts.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import { picturesOf } from './plan-look-pictures.mjs'
import { siteNameMissingError } from './plan-site-name.mjs'
import { siteNameMissing } from './plan-withheld.mjs'

const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z]{2})?$/
const fail = (code, message, problems) => {
  throw new PlanComposerError(code, message, { problems }, { noRerun: true })
}

/** The declarations the model reads: the block store with its recipes (Contract A) and the library blocks. */
export function preflightDeclarations({ blockStore, pageRecipes, library = [] }) {
  const contract = checkAiQuickstartContract({ blockStore, pageRecipes, mappingPending: true })
  if (!contract.ok)
    fail(
      'block_store_invalid',
      `the block store or the page recipes break Contract A: ${contract.problems.map(formatProblem).join('; ')}`,
      contract.problems
    )
  const problems = []
  if (!Array.isArray(library)) problems.push({ at: 'library', message: 'the library is a list of blocks' })
  else
    library.forEach((block, i) => {
      blockProblems(block, `library[${i}]`, (at, message) => problems.push({ at, message }), {
        library: true
      })
      if (block?.source !== 'library')
        problems.push({ at: `library[${i}].source`, message: 'a library block has the source "library"' })
    })
  if (problems.length > 0)
    fail('library_invalid', problems.map((p) => `${p.at}: ${p.message}`).join('; '), problems)
}

/** The inputs of the plan the model does not produce, once the context is built (`composerContextOf`). */
export function preflightContext(context) {
  // The site name question is still open (`details.question`): the chat asks it, then the plan is composed again.
  if (siteNameMissing(context.profile?.withheld)) throw siteNameMissingError(context.profile)
  const look = []
  lookProblems(context.look, (at, message) => look.push({ at, message }))
  if (look.length > 0)
    fail(
      'look_incomplete',
      `the look cannot be completed: ${look.map((p) => `${p.at}: ${p.message}`).join('; ')}`,
      look
    )
  if (!LANGUAGE_TAG.test(context.language))
    fail(
      'language_invalid',
      `${JSON.stringify(context.language)} is not a site language tag like "en" or "pt-BR"`,
      []
    )
  const facts = context.data.facts.filter((f) => !context.data.byId.get(f.id).itemField)
  if (facts.length === 0)
    fail(
      'profile_empty',
      context.data.items.length === 0
        ? 'the needs profile holds no fact and no item with a source'
        : 'the needs profile holds no business fact with a source: a plan lists at least one',
      []
    )
  try {
    picturesOf([], context.blocks, context.data)
  } catch (error) {
    fail(
      'pictures_invalid',
      `the pictures of the needs profile cannot be counted: ${error?.message ?? error}`,
      []
    )
  }
}
