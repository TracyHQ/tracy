import assert from 'node:assert/strict'
import test from 'node:test'
import { addJoomlaLanguage, languageRequestId, removeJoomlaLanguage } from '../src/apply-joomla-language.mjs'

/** A Claude Cowork plugin stand-in that answers the way the real one does, one committed phase per call. */
function cowork({ phases = ['prepare', 'articles', 'finish'], failAt = null, packFails = false } = {}) {
  const calls = []
  let at = 0
  return {
    calls,
    async apply({ params }) {
      calls.push(params.operation)
      if (params.operation === 'multilingual.package')
        return packFails
          ? { ok: false, error: 'install_failed', message: 'could not download the package' }
          : { ok: true, locale: params.locale, installed: true, version: '6.0.1.4' }
      if (params.operation === 'multilingual.apply') {
        if (failAt === at) return { ok: false, error: 'contract_failed', message: 'stopped', problems: [] }
        at += 1
        const done = at >= phases.length
        return {
          ok: true,
          status: done ? 'completed' : 'running',
          phase: done ? 'completed' : phases[at],
          cursor: at,
          created: at * 10,
          applyId: params.apply_id
        }
      }
      if (params.operation === 'multilingual.verify')
        return { ok: true, verified: true, languages: ['zh-CN'] }
      if (params.operation === 'multilingual.revert') return { ok: true, locale: params.locale, reverted: 42 }
      throw new Error(`unexpected operation ${params.operation}`)
    }
  }
}

const base = {
  siteKey: 'qa',
  locale: 'zh-CN',
  translations: { 'zh-CN::module-1.0': '你好' },
  expectedRevision: 'rev-1',
  contract: 'tracy-apple/j6/1.1.0'
}

test('the package is installed before a single row is written', async () => {
  const r = cowork()
  await addJoomlaLanguage({ ...base, apply: r.apply })
  assert.equal(r.calls[0], 'multilingual.package')
  assert.equal(r.calls[1], 'multilingual.apply')
  assert.equal(r.calls.at(-1), 'multilingual.verify')
})

test('it keeps stepping until the Claude Cowork plugin says the language is complete', async () => {
  const r = cowork({ phases: ['prepare', 'articles', 'menu', 'modules', 'relations', 'finish'] })
  const done = await addJoomlaLanguage({ ...base, apply: r.apply })
  assert.equal(done.steps, 6)
  assert.equal(r.calls.filter((c) => c === 'multilingual.apply').length, 6)
  assert.equal(done.verified.verified, true)
})

test('one request id for the whole language, and the apply id is derived from it', async () => {
  const r = cowork()
  const done = await addJoomlaLanguage({ ...base, apply: r.apply })
  assert.match(done.applyId, /^mlang-[a-f0-9]{48}$/)
  assert.equal(done.applyId, `mlang-${done.requestId.slice(0, 48)}`)
})

test('the id is the ASK, so a resume is the same request — the site revision is not in it', () => {
  // A job in flight has already changed the site, so a resumed run reads a different revision.
  // Mixing it in made every resume a NEW id, which the Claude Cowork plugin refused as a second job.
  const one = languageRequestId({ ...base, revision: 'rev-1' })
  const two = languageRequestId({ ...base, revision: 'rev-9' })
  assert.equal(one, two)
  // Different words are a different ask, and must be.
  assert.notEqual(one, languageRequestId({ ...base, translations: { 'zh-CN::module-1.0': '您好' } }))
  assert.notEqual(one, languageRequestId({ ...base, locale: 'zh-TW' }))
  assert.notEqual(one, languageRequestId({ ...base, siteKey: 'other' }))
})

test('a Claude Cowork plugin that stops advancing is stopped, not looped over forever', async () => {
  const stuck = {
    async apply({ params }) {
      if (params.operation === 'multilingual.package') return { ok: true, installed: true }
      return { ok: true, status: 'running', phase: 'articles', cursor: 3, created: 3 }
    }
  }
  await assert.rejects(() => addJoomlaLanguage({ ...base, apply: stuck.apply }), /stalled at phase articles/)
})

test('a ceiling stops a Claude Cowork plugin that advances forever', async () => {
  let n = 0
  const endless = {
    async apply({ params }) {
      if (params.operation === 'multilingual.package') return { ok: true, installed: true }
      n += 1
      return { ok: true, status: 'running', phase: `p${n}`, cursor: n, created: n }
    }
  }
  await assert.rejects(
    () => addJoomlaLanguage({ ...base, apply: endless.apply, maxSteps: 5 }),
    /did not finish within 5 steps/
  )
})

test('a failed package install stops before any row is written', async () => {
  const r = cowork({ packFails: true })
  await assert.rejects(() => addJoomlaLanguage({ ...base, apply: r.apply }), /could not download the package/)
  assert.deepEqual(r.calls, ['multilingual.package'])
})

test('the Claude Cowork plugin’s per-slot complaints travel with the error so they can be acted on', async () => {
  const picky = {
    async apply({ params }) {
      if (params.operation === 'multilingual.package') return { ok: true, installed: true }
      return {
        ok: false,
        error: 'contract_failed',
        message: 'The translation is not usable: …',
        problems: [{ slot: 'zh-CN::module-1.0', problem: 'zh-CN::module-1.0: the figure $29 is missing' }]
      }
    }
  }
  const error = await addJoomlaLanguage({ ...base, apply: picky.apply }).then(
    () => null,
    (e) => e
  )
  assert.equal(error.code, 'contract_failed')
  assert.equal(error.problems.length, 1)
  assert.equal(error.problems[0].slot, 'zh-CN::module-1.0')
})

test('removing a language asks the Claude Cowork plugin, and a refusal is not swallowed', async () => {
  const r = cowork()
  assert.equal((await removeJoomlaLanguage({ apply: r.apply, siteKey: 'qa', locale: 'zh-CN' })).reverted, 42)
  const no = {
    async apply() {
      return { ok: false, message: 'zh-CN is not a language of this site' }
    }
  }
  await assert.rejects(
    () => removeJoomlaLanguage({ apply: no.apply, siteKey: 'qa', locale: 'zh-CN' }),
    /not a language of this site/
  )
})
