import { createHash } from 'node:crypto'

/**
 * Add one language version to a bound Joomla quickstart, end to end.
 *
 * The Claude Cowork plugin owns identity, transactions, the derivation rules and the undo log; this module owns
 * the ORDER and the loop — install the package, hand over the words once, then keep asking the
 * Claude Cowork plugin to take the next committed step until it says the language is complete, and finish by
 * asking it to verify what it built.
 *
 * 🔒 IT LOOPS, IT DOES NOT WAIT. Each `multilingual.apply` call returns after one committed phase,
 * which is what makes a language survive a request being killed: the next call reads how far the
 * last one got. A caller that fired one request and waited would be a caller that cannot finish on
 * a host with an execution limit, and cannot say what landed when it fails.
 *
 * 🔒 ONE REQUEST ID FOR THE WHOLE LANGUAGE. Repeating it continues the job; repeating it with
 * different words is refused. That is what makes a retry safe: a lost reply costs one more call,
 * never a second Chinese edition of the site.
 */

/**
 * A request id derived from what is being ASKED, so an identical ask is identically named.
 *
 * 🔒 THE SITE'S REVISION IS DELIBERATELY NOT IN IT. A job in flight has already changed the site,
 * so a resumed run reads a different revision than the one it started from — and with the revision
 * mixed in, every resume minted a NEW id and the Claude Cowork plugin correctly refused it as a second job for
 * the same language. The revision still travels, as `expected_revision`, and is still checked, but
 * only where it means something: at the moment a job is started.
 */
export function languageRequestId({ siteKey, contract, locale, translations }) {
  return createHash('sha256')
    .update(JSON.stringify({ siteKey, contract, locale, translations }))
    .digest('hex')
}

/**
 * @param {object} input
 * @param {(call: {siteKey: string, action: string, params: object}) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {string} input.locale                Already normalised to a Joomla tag.
 * @param {Record<string,string>} input.translations
 * @param {string} input.expectedRevision      From the plan this translation was made against.
 * @param {string} input.contract
 * @param {(step: {phase: string, created: number, status: string}) => void} [input.onPhase]
 * @param {(line: string) => void} [input.log]
 * @param {number} [input.maxSteps]            A ceiling, so a Claude Cowork plugin that never advances stops.
 */
export async function addJoomlaLanguage({
  apply,
  siteKey,
  locale,
  translations,
  expectedRevision,
  contract,
  onPhase = () => {},
  log = () => {},
  maxSteps = 200
}) {
  const call = async (params) => {
    const result = await apply({ siteKey, action: 'content.contract', params })
    if (!result || typeof result !== 'object') throw new Error('The content contract door did not answer')
    return result
  }
  const must = async (params, what) => {
    const result = await call(params)
    if (!result.ok) {
      const error = new Error(result.message || result.error || `${what} failed`)
      error.code = result.error
      error.problems = result.problems
      throw error
    }
    return result
  }

  // Files first and on their own: an installer is not part of any database transaction, so it is
  // the one step that must be finished and re-checked before a single row is written.
  const pack = await must({ operation: 'multilingual.package', locale }, 'installing the language pack')
  log(
    pack.source
      ? `language: ${locale} is the source language; no pack to install`
      : `language: ${locale} pack ${pack.alreadyPresent ? 'already present' : `installed (${pack.version})`}`
  )

  const requestId = languageRequestId({ siteKey, contract, locale, translations })
  const applyId = `mlang-${requestId.slice(0, 48)}`
  let steps = 0
  let last = null
  for (;;) {
    if (steps >= maxSteps) throw new Error(`The ${locale} job did not finish within ${maxSteps} steps`)
    steps += 1
    const result = await must(
      {
        operation: 'multilingual.apply',
        locale,
        translations,
        expected_revision: expectedRevision,
        apply_id: applyId,
        request_id: requestId
      },
      `applying ${locale}`
    )
    // A phase that does not move is a Claude Cowork plugin that would loop forever; stopping here keeps the
    // failure legible instead of burning the caller's budget on identical calls.
    if (last && last.phase === result.phase && last.cursor === result.cursor && result.status !== 'completed')
      throw new Error(`The ${locale} job stalled at phase ${result.phase}`)
    last = result
    onPhase(result)
    log(`language: ${locale} ${result.phase} (${result.created} entities so far)`)
    if (result.status === 'completed') break
  }

  const verified = await must({ operation: 'multilingual.verify', locale }, `verifying ${locale}`)
  return { locale, applyId, requestId, steps, verified }
}

/**
 * Take one language back out, restoring the source to what it was before it was added.
 * Scope comes from the receipt the apply recorded, so a pack that was already installed and any
 * later hand edit under a different receipt are left alone.
 */
export async function removeJoomlaLanguage({ apply, siteKey, locale, expectedRevision }) {
  const result = await apply({
    siteKey,
    action: 'content.contract',
    params: {
      operation: 'multilingual.revert',
      locale,
      ...(expectedRevision ? { expected_revision: expectedRevision } : {})
    }
  })
  if (!result?.ok) throw new Error(result?.message || result?.error || `removing ${locale} failed`)
  return result
}
