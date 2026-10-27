/**
 * What the model reads of a long `bash` output: a line over 2,000 characters keeps its start and its
 * length, an output over 12,000 keeps its head and tail, the status markers stay last, and the whole
 * output is saved through dsh's spill store and named — or, when it cannot be saved, nothing is cut.
 * Outputs within both caps, other tools, program sub-calls and value replacements pass untouched.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/output-bound.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DockerSandbox } from '@tracy/dsh-sandbox-docker'

import { DockerSubprocessRuntime } from '../index.js'
import {
  BASH_LINE_MAX_CHARS,
  BASH_OUTPUT_MAX_CHARS,
  boundBashOutput,
  boundBashResult,
  renderBounded
} from '../src/output-bound.mjs'

const REF = {
  locator: '/tmp/dsh-spill-abc/session-0123456789ab/42-bash.txt',
  retrievalHint: 'Use read with offset/limit, or grep this path to search within it.'
}

/** A store that records what it was asked to keep. */
function recordingStore() {
  /** @type {any[]} */
  const saved = []
  return {
    saved,
    async saveText(/** @type {any} */ input) {
      saved.push(input)
      return { ...REF, bytes: Buffer.byteLength(input.content) }
    }
  }
}

const EXEC = {
  name: 'bash',
  callId: 'call_00_x',
  agent: { session: { id: 'session-1', header: { id: 'session-1' } } }
}

const accept = (/** @type {string} */ text) => ({ kind: 'accept', content: [{ type: 'text', text }] })

test('an output within both caps is left as it is', () => {
  const typical = Array.from(
    { length: 60 },
    (_, i) => `./wp-content/themes/x/style.css:${i}: color: #123456;`
  ).join('\n')
  assert.equal(boundBashOutput(typical), null)
  assert.equal(boundBashOutput('x'.repeat(BASH_LINE_MAX_CHARS)), null)
  assert.equal(boundBashOutput(`${'y'.repeat(1999)}\n`.repeat(6)), null)
})

test('a minified line keeps its start and its length, and the lines around it stay whole', () => {
  const css = `.a{color:red}${'.b{margin:0}'.repeat(4000)}`
  const text = `=== app.css ===\n${css}\n=== done ===\n`
  const bounded = boundBashOutput(text)
  assert.ok(bounded)
  assert.equal(bounded.cutLines, 1)
  assert.equal(bounded.omittedLines, 0)
  const lines = bounded.body.split('\n')
  assert.equal(lines[0], '=== app.css ===')
  assert.ok(lines[1].startsWith('.a{color:red}.b{margin:0}'))
  assert.ok(lines[1].endsWith(` … [line cut: ${css.length} characters]`))
  assert.ok(lines[1].length < BASH_LINE_MAX_CHARS + 50)
  assert.equal(lines[2], '=== done ===')
})

test('a cut never splits a surrogate pair', () => {
  const line = `${'a'.repeat(BASH_LINE_MAX_CHARS - 1)}😀${'b'.repeat(500)}`
  const bounded = boundBashOutput(line)
  assert.ok(bounded)
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(bounded.body), 'no lone high surrogate')
})

test('a long output keeps its head and its tail by whole lines, and counts what it left out', () => {
  const lines = Array.from({ length: 400 }, (_, i) => `line ${String(i).padStart(3, '0')} ${'-'.repeat(60)}`)
  const text = lines.join('\n')
  const bounded = boundBashOutput(text)
  assert.ok(bounded)
  assert.equal(bounded.cutLines, 0)
  assert.ok(bounded.omittedLines > 0)
  assert.ok(bounded.body.length <= BASH_OUTPUT_MAX_CHARS + 100, `${bounded.body.length}`)
  const shown = bounded.body.split('\n')
  assert.ok(shown[0].startsWith('line 000'))
  assert.ok(/** @type {string} */ (shown.at(-1)).startsWith('line 399'))
  const gap = shown.find((l) => l.startsWith('[… '))
  assert.equal(gap, `[… ${bounded.omittedLines} lines (${bounded.omittedChars} characters) left out here …]`)
  // Every line shown is a whole line of the output.
  for (const l of shown) if (l !== gap) assert.ok(lines.includes(l), l)
  assert.equal(shown.length - 1 + bounded.omittedLines, lines.length)
})

test('the status markers stay the last lines, after the notice', () => {
  const text = `${'z'.repeat(5000)}\n[stderr]\nboom\n[timed out after 60000ms]\n[exit code: 2]`
  const bounded = boundBashOutput(text)
  assert.ok(bounded)
  assert.deepEqual(bounded.markers, ['[timed out after 60000ms]', '[exit code: 2]'])
  const out = renderBounded(bounded, REF).split('\n')
  assert.deepEqual(out.slice(-2), ['[timed out after 60000ms]', '[exit code: 2]'])
  assert.ok(
    out.at(-3)?.startsWith('(Output shortened: 1 line over 2000 characters cut. Full output stored at: ')
  )
  assert.ok(out.includes('[stderr]') && out.includes('boom'))
})

test('the notice names the saved file, how to read it, and how to print one part of a long line', () => {
  const bounded = boundBashOutput(`${'q'.repeat(3000)}\n`)
  assert.ok(bounded)
  const notice = /** @type {string} */ (renderBounded(bounded, REF).split('\n').at(-1))
  assert.ok(notice.includes(REF.locator))
  assert.ok(notice.includes(REF.retrievalHint))
  assert.ok(notice.includes("grep -o '.{0,200}WORD.{0,200}' FILE"))
})

test('boundBashResult saves the WHOLE output under the session and hands the model the bounded copy', async () => {
  const store = recordingStore()
  const text = `${'.x{a:b}'.repeat(3000)}\n[exit code: 0]`
  const decision = await boundBashResult({
    exec: EXEC,
    result: undefined,
    decision: accept(text),
    spillStore: store
  })
  assert.equal(store.saved.length, 1)
  assert.equal(store.saved[0].content, text)
  assert.deepEqual(store.saved[0].owner, { sessionId: 'session-1' })
  assert.deepEqual(store.saved[0].source, {
    kind: 'tool',
    toolName: 'bash',
    callId: 'call_00_x',
    label: 'result'
  })
  assert.equal(decision.kind, 'accept')
  const shown = /** @type {any} */ (decision).content
  assert.equal(shown.length, 1)
  assert.ok(shown[0].text.length < 2500, `${shown[0].text.length}`)
  assert.ok(shown[0].text.includes(REF.locator))
  assert.ok(shown[0].text.endsWith('[exit code: 0]'))
})

test('the content dsh accepted is read when the decision carries none of its own', async () => {
  const store = recordingStore()
  const text = 'w'.repeat(4000)
  const decision = await boundBashResult({
    exec: EXEC,
    result: { content: [{ type: 'text', text }] },
    decision: { kind: 'accept' },
    spillStore: store
  })
  assert.equal(store.saved.length, 1)
  assert.ok(/** @type {any} */ (decision).content[0].text.includes('[line cut: 4000 characters]'))
})

test('no store, a failing store, or no session: nothing is cut', async () => {
  const text = 'v'.repeat(5000)
  const warnings = /** @type {string[]} */ ([])
  const warn = (/** @type {string} */ m) => warnings.push(m)
  const original = accept(text)
  assert.equal(
    await boundBashResult({ exec: EXEC, result: undefined, decision: original, spillStore: undefined, warn }),
    original
  )
  const failing = { saveText: async () => Promise.reject(new Error('disk full')) }
  assert.equal(
    await boundBashResult({ exec: EXEC, result: undefined, decision: original, spillStore: failing, warn }),
    original
  )
  const noSession = { ...EXEC, agent: {} }
  assert.equal(
    await boundBashResult({
      exec: noSession,
      result: undefined,
      decision: original,
      spillStore: recordingStore(),
      warn
    }),
    original
  )
  assert.equal(warnings.length, 3)
})

test('other tools, program sub-calls, value replacements, blocks and images pass untouched', async () => {
  const store = recordingStore()
  const long = 'u'.repeat(5000)
  const cases = [
    { exec: { ...EXEC, name: 'grep' }, decision: accept(long) },
    { exec: { ...EXEC, name: 'read' }, decision: accept(long) },
    { exec: { ...EXEC, parent: 'call_parent' }, decision: accept(long) },
    {
      exec: EXEC,
      decision: { kind: 'accept', content: [{ type: 'text', text: long }], value: { stdout: long } }
    },
    { exec: EXEC, decision: { kind: 'block', feedback: [{ type: 'text', text: long }] } },
    { exec: EXEC, decision: { kind: 'accept', content: [{ type: 'text', text: long }, { type: 'image' }] } }
  ]
  for (const c of cases) {
    const out = await boundBashResult({
      exec: c.exec,
      result: undefined,
      decision: c.decision,
      spillStore: store
    })
    assert.equal(out, c.decision)
  }
  assert.equal(store.saved.length, 0)
})

test('the provider registers the bound on tools/post-execute and reads the store from its context', async () => {
  const store = recordingStore()
  /** @type {{ event: string, listener: Function }[]} */
  const listeners = []
  const ctx = {
    sandbox: Object.create(DockerSandbox.prototype),
    on(/** @type {string} */ event, /** @type {Function} */ listener) {
      listeners.push({ event, listener })
      return () => {}
    },
    get: (/** @type {string} */ name) => (name === 'spillStore' ? store : undefined),
    logger: { warn() {} }
  }
  const p = Object.create(DockerSubprocessRuntime.prototype)
  DockerSubprocessRuntime.prototype.registerOutputBound.call(p, ctx)
  const entry = listeners.find((l) => l.event === 'tools/post-execute')
  assert.ok(entry, 'the provider must register a tools/post-execute listener')
  const text = 't'.repeat(2500)
  const decision = await entry.listener(EXEC, undefined, async () => accept(text))
  assert.equal(store.saved.length, 1)
  assert.ok(decision.content[0].text.includes('[line cut: 2500 characters]'))
})
