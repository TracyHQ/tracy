/**
 * The six stages as the session's standing plan, and the line the agent hears when one settles.
 * Pure against fakes: a session that records appends, an agent that records injections.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { setWordsRoot, wordsFor } from '../src/host/words.mjs'

// The words of a six-stage build, as the WordPress plugin ships them: the fixture is a copy, so
// these tests pin the list's LOGIC against a known table rather than against a plugin.
setWordsRoot(new URL('./fixtures', import.meta.url).pathname)
import {
  BUILD_LINE_KIND,
  injectedMessage,
  planReporter,
  retryQuestion,
  settledLine,
  lineReader,
  progressOf,
  todosOf,
  wantsRetry
} from '../src/host/todos.mjs'

const NAMES = ['check', 'theme', 'style', 'copy', 'seed', 'shot']

/** @param {string[]} statuses @param {Record<string, string>} [detail] */
function jobWith(statuses, detail = {}) {
  return {
    id: 'job-1',
    status: statuses.includes('failed') ? 'failed' : statuses.includes('running') ? 'running' : 'done',
    stages: NAMES.map((name, i) => ({
      name,
      status: statuses[i] ?? 'pending',
      ...(detail[name] ? { detail: detail[name] } : {})
    }))
  }
}

describe('todosOf', () => {
  it('is one item per stage, in build order, imperative and unique', () => {
    const todos = todosOf(jobWith(['done', 'running']))
    assert.equal(todos.length, 6)
    assert.deepEqual(
      todos.map((t) => t.content),
      NAMES.map((n) => wordsFor('en').stages[n])
    )
    assert.equal(new Set(todos.map((t) => t.content)).size, 6)
    for (const t of todos) assert.equal(t.content, t.content.trim())
  })

  it("names the stages in the customer's language", () => {
    const vi = todosOf(jobWith(['done', 'skipped', 'running']), 'vi')
    assert.equal(vi[0].content, 'Kiểm tra site')
    assert.equal(vi[1].content, 'Cài giao diện (bỏ qua)')
    // An unknown language is English, never an empty list.
    assert.equal(todosOf(jobWith(['done']), 'ja')[0].content, 'Check the site')
    // A supported language whose file is missing reads the English file too, not bare stage keys.
    assert.equal(todosOf(jobWith(['done']), 'fr')[0].content, 'Check the site')
  })

  it('maps done and skipped to completed, running and waiting to in_progress, the rest to pending', () => {
    const todos = todosOf(jobWith(['done', 'skipped', 'running', 'waiting', 'failed', 'pending']))
    assert.deepEqual(
      todos.map((t) => t.status),
      ['completed', 'completed', 'in_progress', 'in_progress', 'pending', 'pending']
    )
    // A skipped stage says so in its line, so the plan reads true after the fact.
    assert.equal(todos[1].content, `${wordsFor('en').stages.theme} (skipped)`)
  })
})

describe('settledLine', () => {
  const site = 'wpdemo'
  it('says nothing while a stage runs or waits its turn', () => {
    const job = jobWith(['done', 'running'])
    assert.equal(settledLine(job, job.stages[1], site), null)
    assert.equal(settledLine(job, job.stages[2], site), null)
  })
  it('counts a done stage', () => {
    const job = jobWith(['done', 'done'])
    assert.equal(settledLine(job, job.stages[1], site), 'Build on wpdemo: Theme installed (2 of 6).')
  })
  it('carries the failure detail and points at Retry', () => {
    const job = jobWith(['done', 'done', 'done', 'failed'], {
      copy: 'The model answered without a JSON object.'
    })
    assert.equal(
      settledLine(job, job.stages[3], site),
      'Build on wpdemo: "Write your words" failed: The model answered without a JSON object. The customer sees Retry in the Build tab.'
    )
  })
  it('names the form fields the customer must answer, and the step the agent owes', () => {
    const form = jobWith(['done', 'done', 'done', 'waiting'], { copy: 'form:name,about' })
    assert.equal(
      settledLine(form, form.stages[3], site),
      "Build on wpdemo waits for the customer's answers in the Build tab (name,about)."
    )
    const agent = jobWith(['done', 'done', 'waiting'], { style: 'agent:templateStyle:airbnb' })
    assert.equal(
      settledLine(agent, agent.stages[2], site),
      'Build on wpdemo waits for you: templateStyle:airbnb. Call tracy_site_build status for the next step.'
    )
  })
})

/**
 * Session format V4's source admission, copied from dsh `dsh-v0.1.7-rc.2`
 * `packages/session/session-format-v3-to-v4/src/message-sources.ts:9`: the codec runs it when an
 * event is WRITTEN (`src/codec.ts:51,68`), so a source it refuses makes `agent.inject` throw.
 */
const v4AdmitsSource = (source) =>
  source !== null &&
  typeof source === 'object' &&
  !Array.isArray(source) &&
  typeof source.kind === 'string' &&
  source.kind.length > 0 &&
  source.kind !== 'plugin'

describe('injectedMessage', () => {
  it('is an identified user-role message whose source is the Build line kind, naming the producer', () => {
    const m = injectedMessage('hello', 'tracy-site-build')
    assert.equal(m.role, 'user')
    assert.match(m.id, /^[0-9a-f-]{36}$/)
    assert.deepEqual(m.content, [{ type: 'text', text: 'hello' }])
    assert.deepEqual(m.source, { kind: BUILD_LINE_KIND, producer: 'tracy-site-build' })
    assert.equal(BUILD_LINE_KIND, 'tracy-build')
    assert.ok(Object.isFrozen(m))
  })

  it('🔒 carries a source session format V4 admits — never the retired `plugin` kind', () => {
    assert.equal(v4AdmitsSource(injectedMessage('x', 'tracy-site-build-wordpress').source), true)
    // The predicate is the real rule, not a tautology: the V3 shape this used to write is refused.
    assert.equal(v4AdmitsSource({ kind: 'plugin', plugin: 'tracy-site-build' }), false)
  })
})

describe('planReporter', () => {
  function bench({ refuse = false, agent = true } = {}) {
    /** @type {{ type: string, data: any }[]} */
    const appended = []
    /** @type {any[]} */
    const injected = []
    /** @type {string[]} */
    const warnings = []
    const session = {
      id: 's1',
      header: { cwd: '/site/wpdemo' },
      append(type, data) {
        if (refuse) throw new Error('outside any open turn')
        appended.push({ type, data })
      }
    }
    const report = planReporter({
      sessionsFor: () => [session],
      agentFor: (id) => (agent && id === 's1' ? { inject: (m) => injected.push(m) } : undefined),
      site: 'wpdemo',
      warn: (line) => warnings.push(line)
    })
    return { report, appended, injected, warnings }
  }

  it('writes the plan in the language it reads off the job (the page that pressed)', () => {
    /** @type {any[]} */
    const appended = []
    const report = planReporter({
      sessionsFor: () => [{ id: 's1', append: (type, data) => appended.push(data) }],
      agentFor: () => undefined,
      site: 'wpdemo',
      langOf: (job) => /** @type {any} */ (job).uiLang ?? 'en'
    })
    report({ ...jobWith(['running']), uiLang: 'vi' })
    assert.equal(appended[0].todos[0].content, 'Kiểm tra site')
  })

  it('rewrites the whole plan on every change', () => {
    const b = bench()
    b.report(jobWith(['running']))
    b.report(jobWith(['done', 'running']))
    assert.equal(b.appended.length, 2)
    assert.equal(b.appended[0].type, 'todo/write')
    assert.deepEqual(
      b.appended[1].data.todos.map((t) => t.status),
      ['completed', 'in_progress', 'pending', 'pending', 'pending', 'pending']
    )
  })

  it('tells the agent each settled stage once, not on every later change', () => {
    const b = bench()
    b.report(jobWith(['running']))
    assert.equal(b.injected.length, 0)
    b.report(jobWith(['done', 'running']))
    b.report(jobWith(['done', 'running']))
    b.report(jobWith(['done', 'done', 'running']))
    assert.deepEqual(
      b.injected.map((m) => m.content[0].text),
      ['Build on wpdemo: Site checked (1 of 6).', 'Build on wpdemo: Theme installed (2 of 6).']
    )
    assert.deepEqual(b.injected[0].source, { kind: 'tracy-build', producer: 'tracy-site-build' })
  })

  it('tells a failure with its detail, and tells it again only if the detail changes', () => {
    const b = bench()
    b.report(jobWith(['done', 'failed'], { theme: 'no zip' }))
    b.report(jobWith(['done', 'failed'], { theme: 'no zip' }))
    b.report(jobWith(['done', 'failed'], { theme: 'still no zip' }))
    assert.deepEqual(
      b.injected.map((m) => m.content[0].text).filter((t) => t.includes('failed')),
      [
        'Build on wpdemo: "Install the theme" failed: no zip. The customer sees Retry in the Build tab.',
        'Build on wpdemo: "Install the theme" failed: still no zip. The customer sees Retry in the Build tab.'
      ]
    )
  })

  it('never lets a refused append or a missing agent reach the build, and warns once', () => {
    const refused = bench({ refuse: true })
    assert.doesNotThrow(() => refused.report(jobWith(['done', 'running'])))
    assert.doesNotThrow(() => refused.report(jobWith(['done', 'done'])))
    assert.equal(refused.warnings.length, 1)
    assert.match(refused.warnings[0], /todo\/write refused by session s1: outside any open turn/)
    const noAgent = bench({ agent: false })
    assert.doesNotThrow(() => noAgent.report(jobWith(['done', 'running'])))
    assert.equal(noAgent.injected.length, 0)
    assert.equal(noAgent.appended.length, 1)
  })
})

describe('retryQuestion', () => {
  const job = jobWith(['done', 'done', 'done', 'failed'], { copy: 'the model answered nothing' })
  const asked = retryQuestion(job, job.stages[3], 'wpdemo')
  const RETRY_LABEL = asked.retryLabel

  it('is one question naming the stage, its place, and the site', () => {
    assert.equal(asked.questions.length, 1)
    const q = asked.questions[0]
    assert.equal(q.id, 'retry:copy')
    assert.equal(q.question, '"Write your words" failed at step 4 of 6. Try that step again?')
    assert.equal(q.header, 'Build on wpdemo')
  })

  it('carries the failure as detail, not as an option', () => {
    const q = asked.questions[0]
    assert.equal(q.detail, 'the model answered nothing')
    assert.ok(!q.options.some((o) => o.label.includes('the model')))
  })

  it('offers exactly two ways out, and names the retry one', () => {
    const q = asked.questions[0]
    assert.equal(q.options.length, 2)
    assert.equal(q.options[0].label, RETRY_LABEL)
    for (const o of q.options) assert.ok(typeof o.description === 'string' && o.description.length > 0)
  })

  it('leaves detail out when the stage gave none', () => {
    const bare = jobWith(['failed'])
    assert.equal('detail' in retryQuestion(bare, bare.stages[0], 'wpdemo').questions[0], false)
  })

  it('offers the sign-in first when the step was refused for WHO it acted as', () => {
    // Measured 17/09 on the dev machine: a build stopped at step 2 of 7 with NOT_SIGNED_IN, and the
    // only thing the panel offered was to run the identical call again. It cannot succeed until
    // somebody is behind it, so the label says the step that has to come first.
    const refused = jobWith(['failed'])
    refused.stages[0].code = 'NOT_SIGNED_IN'
    const q = retryQuestion(refused, refused.stages[0], 'wpdemo')
    assert.equal(q.questions[0].options[0].label, 'Sign in again, then retry')
    assert.equal(q.retryLabel, 'Sign in again, then retry', 'and choosing it still runs the step')
    assert.match(q.questions[0].options[0].description, /nobody was signed in/)
    assert.equal(q.questions[0].options.length, 2, 'still two ways out, never three')
    assert.equal(q.questions[0].options[1].label, 'Leave it for now')

    // In the customer's own language, like every other word on this panel.
    const vi = retryQuestion(refused, refused.stages[0], 'wpdemo', 'vi')
    assert.equal(vi.retryLabel, 'Đăng nhập lại rồi thử lại')
    assert.equal(vi.questions[0].options[0].label, vi.retryLabel)
  })

  it('offers the ordinary retry for everything that is about the site rather than the person', () => {
    for (const code of ['COMPONENT_UNREACHABLE', 'INVALID_REQUEST', 'ACTION_NOT_ALLOWED']) {
      const other = jobWith(['failed'])
      other.stages[0].code = code
      assert.equal(retryQuestion(other, other.stages[0], 'wpdemo').retryLabel, RETRY_LABEL, code)
    }
    // A stage that stopped without a code at all keeps the retry: no idea is not a reason to
    // tell somebody to sign in.
    assert.equal(retryQuestion(job, job.stages[3], 'wpdemo').retryLabel, RETRY_LABEL)
  })

  it("asks in the customer's language, and hands back the label that means yes there", () => {
    const vi = retryQuestion(job, job.stages[3], 'wpdemo', 'vi')
    assert.equal(vi.retryLabel, 'Thử lại bước này')
    assert.equal(vi.questions[0].options[0].label, 'Thử lại bước này')
    assert.equal(vi.questions[0].header, 'Dựng trên wpdemo')
    assert.match(vi.questions[0].question, /hỏng ở bước 4 trên 6/)
    // The failure text is the site's own words, never translated.
    assert.equal(vi.questions[0].detail, 'the model answered nothing')
    // An unknown language is English, not a crash and not an empty panel.
    assert.equal(retryQuestion(job, job.stages[3], 'wpdemo', 'fr').retryLabel, RETRY_LABEL)
  })
})

describe('wantsRetry', () => {
  const EN = retryQuestion(jobWith(['failed']), jobWith(['failed']).stages[0], 'wpdemo').retryLabel
  const VI = retryQuestion(jobWith(['failed']), jobWith(['failed']).stages[0], 'wpdemo', 'vi').retryLabel

  it('reads the answer by the label the request carried', () => {
    assert.equal(wantsRetry({ answers: [{ id: 'retry:check', selected: [EN] }] }, EN), true)
    assert.equal(wantsRetry({ answers: [{ id: 'retry:check', selected: ['Leave it for now'] }] }, EN), false)
  })

  it('works in the language the question was asked in', () => {
    assert.equal(wantsRetry({ answers: [{ id: 'retry:check', selected: [VI] }] }, VI), true)
    // A Vietnamese yes is not the English label, which is why the label travels with the request.
    assert.equal(wantsRetry({ answers: [{ id: 'retry:check', selected: [VI] }] }, EN), false)
  })

  it('is false for anything that is not that choice', () => {
    // Typed prose lands in `custom`, and a skipped question keeps an empty selection. Neither is a yes.
    assert.equal(
      wantsRetry({ answers: [{ id: 'retry:check', selected: [], custom: 'yes please' }] }, EN),
      false
    )
    assert.equal(wantsRetry({ answers: [] }, EN), false)
    assert.equal(wantsRetry(null, EN), false)
    assert.equal(wantsRetry(undefined, EN), false)
    assert.equal(wantsRetry({}, EN), false)
    // No label to match is not a yes either.
    assert.equal(wantsRetry({ answers: [{ selected: [EN] }] }, ''), false)
  })
})

describe('planReporter onFailed', () => {
  function bench() {
    const asked = []
    const warnings = []
    const session = { id: 's1', header: { cwd: '/site/wpdemo' }, append() {} }
    const report = planReporter({
      sessionsFor: () => [session],
      agentFor: () => ({ inject: () => {} }),
      site: 'wpdemo',
      warn: (line) => warnings.push(line),
      onFailed: (job, stage) => asked.push(stage.name)
    })
    return { report, asked, warnings }
  }

  it('asks once per failure, not on every later change', () => {
    const b = bench()
    b.report(jobWith(['done', 'failed'], { theme: 'no zip' }))
    b.report(jobWith(['done', 'failed'], { theme: 'no zip' }))
    assert.deepEqual(b.asked, ['theme'])
  })

  it('does not ask about a stage that merely waits or is skipped', () => {
    const b = bench()
    b.report(jobWith(['done', 'skipped', 'waiting'], { style: 'agent:templateStyle:airbnb' }))
    assert.deepEqual(b.asked, [])
  })

  it('never lets a throwing question reach the build', () => {
    const warnings = []
    const report = planReporter({
      sessionsFor: () => [],
      agentFor: () => undefined,
      site: 'wpdemo',
      warn: (line) => warnings.push(line),
      onFailed: () => {
        throw new Error('no answerer')
      }
    })
    assert.doesNotThrow(() => report(jobWith(['failed'])))
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /asking about check failed: no answerer/)
  })
})

/**
 * The plan follows the ANSWERS, not a fixed six.
 *
 * A build does different work for different customers: a second language adds a plugin install and
 * a writing pass, a page list says how many pages get laid out, and Joomla on this lane hands the
 * look to the agent instead of doing it. A list that reads the same either way is telling the
 * customer about a build that is not theirs (Lee, 09/09).
 */
describe('todosOf follows the answers', () => {
  const answered = (answers, statuses = ['running']) => ({
    ...jobWith(statuses),
    answers
  })

  it('adds the translation plugin only when a second language was asked for', () => {
    const one = todosOf(answered({ languages: ['en'] })).map((t) => t.content)
    const two = todosOf(answered({ languages: ['en', 'vi'] })).map((t) => t.content)
    assert.equal(one.includes('Install the translation plugin'), false)
    assert.ok(two.includes('Install the translation plugin'))
    // It belongs to the theme step, so it stands right after it.
    assert.equal(two[two.indexOf('Install the theme') + 1], 'Install the translation plugin')
  })

  it('writes one line per language asked for, naming each', () => {
    const items = todosOf(answered({ languages: ['en', 'vi'] })).map((t) => t.content)
    assert.equal(items.includes('Write your words'), false)
    assert.ok(items.includes('Write your words in English'))
    assert.ok(items.includes('Write your words in Vietnamese'))
    // One language keeps the plain line: nothing to distinguish.
    assert.ok(
      todosOf(answered({ languages: ['en'] }))
        .map((t) => t.content)
        .includes('Write your words')
    )
  })

  it('says how many pages it is laying out when the customer chose them', () => {
    const three = todosOf(answered({ pages: ['home', 'about', 'contact'] })).map((t) => t.content)
    assert.ok(three.includes('Lay out 3 pages'))
    // No page list means the site decides; the plain line is the honest one.
    assert.ok(
      todosOf(answered({}))
        .map((t) => t.content)
        .includes('Lay out the pages')
    )
  })

  it("says the look is Tracy's to do when Joomla is built on this lane", () => {
    const job = { ...answered({}), platform: 'joomla' }
    job.stages[2] = { name: 'style', status: 'waiting', detail: 'agent:templateStyle:airbnb' }
    const items = todosOf(job).map((t) => t.content)
    assert.ok(items.includes('Apply the look (Tracy does this one)'))
    assert.equal(items.includes('Apply the look'), false)
  })

  it('keeps every line distinct, which the durable list requires', () => {
    // `todo/write` refuses a repeated `content`, so two languages must not both read the same.
    for (const answers of [
      {},
      { languages: ['en'] },
      { languages: ['en', 'vi', 'zh'] },
      { pages: ['home'] }
    ]) {
      const items = todosOf(answered(answers)).map((t) => t.content)
      assert.equal(new Set(items).size, items.length, JSON.stringify(answers))
      for (const one of items) assert.equal(one, one.trim())
    }
  })

  it("carries the added lines in the customer's language too", () => {
    const vi = todosOf(answered({ languages: ['en', 'vi'], pages: ['home', 'about'] }), 'vi').map(
      (t) => t.content
    )
    assert.ok(vi.includes('Cài plugin dịch'))
    assert.ok(vi.includes('Viết chữ bằng tiếng Anh'))
    assert.ok(vi.includes('Viết chữ bằng tiếng Việt'))
    assert.ok(vi.includes('Dựng 2 trang'))
  })

  it('gives the added lines the status of the step they belong to', () => {
    const answers = { languages: ['en', 'vi'] }
    // The theme step says the plugin went on, which is what a WordPress build with two languages
    // always says one way or the other; what is under test here is the status, not that word.
    const withPlugin = (statuses) => {
      const job = answered(answers, statuses)
      job.stages[1].detail = 'tracy installed · polylang on'
      return job
    }
    // theme running: its plugin line runs with it; the copy lines wait.
    const early = todosOf(withPlugin(['done', 'running']))
    const at = (content) => early.find((t) => t.content === content)?.status
    assert.equal(at('Install the theme'), 'in_progress')
    assert.equal(at('Install the translation plugin'), 'in_progress')
    assert.equal(at('Write your words in English'), 'pending')

    // copy done: every language line is done with it.
    const later = todosOf(withPlugin(['done', 'done', 'done', 'done', 'running']))
    const then = (content) => later.find((t) => t.content === content)?.status
    assert.equal(then('Install the translation plugin'), 'completed')
    assert.equal(then('Write your words in Vietnamese'), 'completed')
  })

  it('says the plugin was skipped when the theme step says it did not go on', () => {
    // `withPolylang` never fails the stage — it appends to the detail. The list must not claim a
    // plugin is installed when that line says otherwise.
    const job = answered({ languages: ['en', 'vi'] }, ['done', 'done'])
    job.stages[1].detail = 'tracy installed · polylang not installed: the site refused'
    const items = todosOf(job)
    const plugin = items.find((t) => t.content.startsWith('Install the translation plugin'))
    assert.equal(plugin.content, 'Install the translation plugin (skipped)')
    assert.equal(plugin.status, 'completed')
  })

  it('marks the plugin skipped whatever words the site refused it in', () => {
    // `polylangIfNeeded` answers in half a dozen shapes and only one of them is a plugin that went
    // on: the wp-CLI road says "polylang did not install", or hands over the tool's own first line.
    // Naming the failures left those roads reading as done (measured 09/09).
    for (const detail of [
      'tracy installed \u00b7 polylang did not install',
      'tracy installed \u00b7 Error: Could not download the plugin.',
      'tracy already on'
    ]) {
      const job = answered({ languages: ['en', 'vi'] }, ['done', 'done'])
      job.stages[1].detail = detail
      const line = todosOf(job).find((t) => t.content.startsWith('Install the translation plugin'))
      assert.equal(line.content, 'Install the translation plugin (skipped)', detail)
    }
    const on = answered({ languages: ['en', 'vi'] }, ['done', 'done'])
    on.stages[1].detail = 'tracy installed \u00b7 polylang on'
    assert.ok(todosOf(on).some((t) => t.content === 'Install the translation plugin'))
  })

  it('does not call the plugin skipped before the theme step has run', () => {
    const job = answered({ languages: ['en', 'vi'] }, ['done', 'running'])
    assert.ok(todosOf(job).some((t) => t.content === 'Install the translation plugin'))
  })

  it('names a language the interface does not itself speak', () => {
    // The picker offers seventy languages; the interface speaks three. A line reading "Write your
    // words in fr" is the list showing the customer a tag they never typed.
    const items = todosOf(answered({ languages: ['fr', 'de'] })).map((t) => t.content)
    assert.ok(items.includes('Write your words in French'))
    assert.ok(items.includes('Write your words in German'))
    const vi = todosOf(answered({ languages: ['fr', 'de'] }), 'vi').map((t) => t.content)
    assert.ok(vi.includes('Vi\u1ebft ch\u1eef b\u1eb1ng ti\u1ebfng Ph\u00e1p'), vi.join(' | '))
  })

  it('counts a language once, whatever tag it arrives under', () => {
    // Two tags of one language carry one name between them, and a repeated line loses the whole
    // list rather than the second line.
    const items = todosOf(answered({ languages: ['zh-CN', 'zh-TW'] })).map((t) => t.content)
    assert.equal(new Set(items).size, items.length)
    assert.ok(items.includes('Write your words'))
    assert.equal(items.includes('Install the translation plugin'), false)
  })

  it('marks every language line skipped when the writing step was', () => {
    const job = answered({ languages: ['en', 'vi'] }, ['done', 'done', 'done', 'skipped'])
    const lines = todosOf(job).filter((t) => t.content.startsWith('Write your words'))
    assert.deepEqual(
      lines.map((t) => t.content),
      ['Write your words in English (skipped)', 'Write your words in Vietnamese (skipped)']
    )
  })
})

/**
 * A stage that is still running, saying how far it has got.
 *
 * The seed stage is the longest of the six and the one that fails most: eight model calls and
 * sixty writes into the CMS behind one line that says nothing until it ends. The seeder itself
 * has always narrated its work to stderr — `blog: 6 posts`, `cover 3 of 6 (slug)` — and the stage
 * threw every line away, keeping only the first one if the run failed. So the customer watched
 * "Lay out the pages" for two minutes with no way to tell a slow build from a stuck one.
 */
describe('progressOf — reading the seeder out loud', () => {
  it('reads a cover line as a count, which is the one thing worth showing', () => {
    assert.deepEqual(progressOf('cover 3 of 6 (our-daily-bread)'), { kind: 'covers', done: 3, total: 6 })
    assert.deepEqual(progressOf('cover 1 of 1 (only)'), { kind: 'covers', done: 1, total: 1 })
  })
  it("reads EmDash's personalize the same way: words, entries and pictures counted", () => {
    assert.deepEqual(progressOf('words 57 of 114'), { kind: 'words', done: 57, total: 114 })
    assert.deepEqual(progressOf('entries 3 of 12'), { kind: 'entries', done: 3, total: 12 })
    assert.deepEqual(progressOf('pictures 0 of 6\n'), { kind: 'pictures', done: 0, total: 6 })
    assert.equal(progressOf('picture 1 of 6'), null)
  })

  it('reads the two turns that have no count', () => {
    assert.deepEqual(progressOf('blog: 6 posts (deepseek/deepseek-chat-v3.1)'), { kind: 'posts' })
    assert.deepEqual(progressOf('sections: 13 sections written, 0 slots left as drawn (x)'), {
      kind: 'sections'
    })
  })

  it('ignores every other line, including warnings and the seeder prefix', () => {
    for (const line of [
      '',
      'seeded 7 pages, 6 posts on wordpress (airbnb)',
      'cover of post-3: 429 rate limited',
      'no copy written in vi, so the site is built without it',
      'model: reusing 6 posts and 6 covers from docs/agents/seed/model.json (--fresh to ask again)'
    ]) {
      assert.equal(progressOf(line), null, line)
    }
  })
})

describe('todosOf with a stage that is reporting', () => {
  const running = (note) => ({
    id: 'j',
    status: 'running',
    answers: {},
    stages: [
      { name: 'check', status: 'done' },
      { name: 'theme', status: 'done' },
      { name: 'style', status: 'done' },
      { name: 'copy', status: 'done' },
      { name: 'seed', status: 'running', ...(note ? { note } : {}) },
      { name: 'shot', status: 'pending' }
    ]
  })

  it('says how many covers are drawn while the stage runs', () => {
    const items = todosOf(running({ kind: 'covers', done: 3, total: 6 })).map((t) => t.content)
    assert.ok(items.includes('Lay out the pages — 3 of 6 pictures'))
    assert.equal(items.includes('Lay out the pages'), false)
  })

  it('names the turn when there is no count to give', () => {
    const posts = todosOf(running({ kind: 'posts' })).map((t) => t.content)
    assert.ok(posts.includes('Lay out the pages — writing the blog'))
    const sections = todosOf(running({ kind: 'sections' })).map((t) => t.content)
    assert.ok(sections.includes('Lay out the pages — writing the page'))
  })

  it('says it in the language of the conversation', () => {
    const vi = todosOf(running({ kind: 'covers', done: 2, total: 6 }), 'vi').map((t) => t.content)
    assert.ok(vi.includes('Dựng các trang — 2 trên 6 tấm ảnh'))
  })

  it('drops the note the moment the stage settles, so a finished line reads plainly', () => {
    const job = running({ kind: 'covers', done: 6, total: 6 })
    job.stages[4].status = 'done'
    assert.ok(
      todosOf(job)
        .map((t) => t.content)
        .includes('Lay out the pages')
    )
  })

  it('carries the count on the page line the answers shaped, which is every real build', () => {
    // `BuildForm` starts with every page ON, so `answers.pages` is there in every build a customer
    // ever runs. A note that only reached the plain line was a note nobody saw (measured 09/09).
    const job = running({ kind: 'covers', done: 3, total: 6 })
    job.answers = { pages: ['home', 'about', 'blog'] }
    assert.ok(
      todosOf(job)
        .map((t) => t.content)
        .includes('Lay out 3 pages \u2014 3 of 6 pictures')
    )
    assert.ok(
      todosOf(job, 'vi')
        .map((t) => t.content)
        .includes('D\u1ef1ng 3 trang \u2014 3 tr\u00ean 6 t\u1ea5m \u1ea3nh')
    )
  })

  it('leaves a stage with no note exactly as it was', () => {
    assert.ok(
      todosOf(running(null))
        .map((t) => t.content)
        .includes('Lay out the pages')
    )
  })

  it('keeps the line distinct, which the durable list requires', () => {
    const items = todosOf(running({ kind: 'covers', done: 3, total: 6 })).map((t) => t.content)
    assert.equal(new Set(items).size, items.length)
  })
})

describe('lineReader', () => {
  const read = () => {
    const lines = []
    return { push: lineReader((l) => lines.push(l)), lines }
  }

  it('keeps a line that straddles two chunks', () => {
    const r = read()
    r.push('cover 3 o')
    assert.deepEqual(r.lines, [], 'nothing may be said before the newline')
    r.push('f 6 (slug)\n')
    assert.deepEqual(r.lines, ['cover 3 of 6 (slug)'])
  })

  it('reads several lines out of one chunk', () => {
    const r = read()
    r.push('seed: blog: 6 posts\nseed: cover 1 of 6 (a)\ncover 2 of 6 (b)\n')
    assert.deepEqual(r.lines, ['blog: 6 posts', 'cover 1 of 6 (a)', 'cover 2 of 6 (b)'])
  })

  it('strips the seeder prefix and blank lines, and handles CRLF', () => {
    const r = read()
    r.push('\n  \nseed:   cover 1 of 2 (a)\r\n')
    assert.deepEqual(r.lines, ['cover 1 of 2 (a)'])
  })

  it('holds an unterminated tail rather than guessing', () => {
    const r = read()
    r.push('cover 6 of 6 (last)')
    assert.deepEqual(r.lines, [])
  })
})
