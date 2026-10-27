/**
 * The tool that measures the baseline of one agent turn — pinned on a prebuilt session, no dsh needed.
 *
 * 🔒 WHY A READ-ONLY TOOL NEEDS A TEST. It produces the "baseline" every before/after comparison of §3
 * relies on, so a counting bug here does not show up as a bug — it shows up as an improvement
 * that seems to work, or a real improvement judged useless. Two things went wrong while it was
 * written and both counted a plausible-looking number: `totalTokens` was read as the cost (in fact
 * 92% of it is `cacheRead`), and refusals counted 0 because a regex escaped one level wrong.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const TOOL = path.join(import.meta.dirname, '..', 'agent-turn-cost.mjs')

/** One event line as dsh writes it. */
const line = (type, time, data, extra = {}) => JSON.stringify({ type, time, data, ...extra })

/**
 * A two-turn session: turn 1 has a prompter and a refusal with a code, turn 2 has nothing to measure.
 * The token counts are set so that `cacheRead` dwarfs `input`+`output` — the real shape.
 */
function fixture(
  dir,
  name,
  { preset, prompter, switchTo = null, switchAt = 'before-turn', endsAt = 1_004_000 }
) {
  const switched =
    switchTo === null ? [] : [line('agent-preset/selected', 999_900, { agentPreset: switchTo })]
  const events = [
    JSON.stringify({
      type: 'session',
      version: 3,
      id: name,
      createdAt: 1_000_000,
      cwd: '/site/x',
      ...(preset === null ? {} : { agentPreset: preset })
    }),
    ...(switchAt === 'before-turn' ? switched : []),
    line('user/message', 1_000_100, {
      turn: 1,
      ...(prompter === null ? {} : { source: { kind: 'user', prompter: { email: prompter } } })
    }),
    line('turn/start', 1_000_000, { turn: 1 }),
    line('step/start', 1_000_100, { turn: 1, step: 1 }),
    line('tool/call', 1_000_200, {
      turn: 1,
      callId: 'c1',
      name: 'tracy_site',
      arguments: '{"action":"content.list"}'
    }),
    line('tool/result', 1_000_300, {
      turn: 1,
      message: {
        source: { callId: 'c1' },
        content: [{ type: 'text', text: '{"ok":false,"code":"NO_VIEWER"}' }]
      }
    }),
    line('assistant/message', 1_000_400, {
      turn: 1,
      step: 1,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5000, totalTokens: 5120 },
      message: { role: 'assistant', content: [] }
    }),
    line('step/start', 1_000_500, { turn: 1, step: 2 }),
    line('tool/call', 1_000_600, { turn: 1, callId: 'c2', name: 'bash', arguments: '{}' }),
    line('tool/result', 1_000_700, {
      turn: 1,
      message: { source: { callId: 'c2' }, content: [{ type: 'text', text: 'twelve chars' }] }
    }),
    line('assistant/message', 1_000_800, {
      turn: 1,
      step: 2,
      usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 6000, totalTokens: 6060 },
      message: { role: 'assistant', content: [] }
    }),
    line('turn/end', endsAt, { turn: 1, reason: { kind: 'completed' } })
  ]
  // A turn that switches preset MIDWAY still belongs to the preset it started with: every earlier step ran on
  // that toolset, so counting it for the new platform charges the cost to a platform that did not produce it.
  if (switchAt === 'mid-turn' && switchTo !== null) {
    events.splice(4, 0, line('agent-preset/selected', 1_000_450, { agentPreset: switchTo }))
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${name}.jsonl`), `${events.join('\n')}\n`)
}

/** @returns {Array<object>} the tool's own JSON, so the test reads what the tool computed. */
function measure(root) {
  return JSON.parse(execFileSync('node', [TOOL, root, '--json'], { encoding: 'utf8' }))
}

test('a turn is measured by wall clock, steps, calls and NEW tokens — cacheRead kept apart', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  fixture(path.join(root, 'lane'), 'session-aaa', { preset: 'designer-wordpress', prompter: 'a@b.c' })
  const [turn, ...rest] = measure(root)
  assert.equal(rest.length, 0, 'a turn with no turn/start must not be counted')
  assert.equal(turn.turn, 1)
  assert.equal(turn.seconds, 4, 'turn/start → turn/end, in seconds')
  assert.equal(turn.steps, 2)
  assert.equal(turn.calls, 2)
  // 🔒 THE WHOLE POINT: 150 new in + 30 out, and the 11,000 cached reads are NOT the cost.
  assert.equal(turn.input, 150)
  assert.equal(turn.output, 30)
  assert.equal(turn.cacheRead, 11_000)
  assert.equal(turn.resultChars, '{"ok":false,"code":"NO_VIEWER"}'.length + 'twelve chars'.length)
})

test('a refusal is counted with its code, and the verb is the tracy_site ACTION', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  fixture(path.join(root, 'lane'), 'session-bbb', { preset: 'designer-joomla', prompter: 'a@b.c' })
  const [turn] = measure(root)
  assert.equal(turn.refused, 1, 'the {"ok":false} result was not counted')
  assert.deepEqual(turn.codes, ['NO_VIEWER'])
  // Folding every action into "tracy_site" makes the verb table say nothing — it is the most-called tool.
  assert.deepEqual(turn.verbs, ['tracy_site:content.list', 'bash'])
})

test('a session that names nobody who typed says so, and a missing preset is not guessed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  // The exact shape of the 18 Joomla sessions of 17/09: no preset, no prompter, and every call
  // NO_VIEWER. Inferring the platform from the lane directory name here records a baseline on the wrong platform.
  fixture(path.join(root, '--site-demojoomla--'), 'session-ccc', { preset: null, prompter: null })
  const [turn] = measure(root)
  assert.equal(turn.preset, null, 'a preset the session never declared must stay null')
  assert.equal(turn.prompter, null, 'the absence of a prompter is the fact that explains NO_VIEWER')

  const printed = execFileSync('node', [TOOL, root], { encoding: 'utf8' })
  assert.match(printed, /preset not declared/, 'a missing preset must be printed as missing')
  assert.match(
    printed,
    /NO_VIEWER\s+session WITHOUT a prompter/,
    'the refusal must be tied to the absent prompter'
  )
})

test('the preset of a turn is the one in force when it started, not the one it booted on', () => {
  // 🔒 EXACTLY THE THREE SHAPES MEASURED ON `--site-demojlnam--` ON 19/09, and they are why this test
  // exists: all three sessions declare `designer-wordpress` in the head — the bundle default for EVERY site
  // — then `presetForSite` changes it with `agent-preset/selected` once the page knows the site runs Joomla.
  // Before the fix, the tool read only the head and two Joomla turns fell into the `wordpress` bucket: a baseline
  // mixing two platforms, with not one line saying so.
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  const lane = path.join(root, '--site-demojlnam--')
  // (1) switches BEFORE the first turn — session 44948cc64b06, switched 18 seconds before `turn/start`.
  fixture(lane, 'session-switched', {
    preset: 'designer-wordpress',
    prompter: 'a@b.c',
    switchTo: 'designer-joomla'
  })
  // (2) does NOT switch — session 6b59999b0b1b, a 19-step / 127.3-second turn running WordPress tools on a
  // Joomla webroot. It MUST still read `designer-wordpress`: the tool measures what the agent holds, not a guess at
  // what it should have held, and that very mismatch is what needs to be visible.
  fixture(lane, 'session-stuck', { preset: 'designer-wordpress', prompter: 'a@b.c' })

  const rows = measure(root)
  const of = (name) => rows.find((row) => row.session.endsWith(name))
  assert.equal(of('session-switched').preset, 'designer-joomla')
  assert.equal(of('session-switched').bootPreset, 'designer-wordpress', 'the boot preset must be kept')
  assert.equal(of('session-stuck').preset, 'designer-wordpress')
  assert.equal(of('session-stuck').bootPreset, 'designer-wordpress')

  const printed = execFileSync('node', [TOOL, root], { encoding: 'utf8' })
  assert.match(printed, /^joomla\s+1\s/m, 'a turn that switched platform must count toward Joomla')
  assert.match(printed, /^wordpress\s+1\s/m, 'a turn that did not switch is still a WordPress turn')
})

test('a preset switch in the middle of a turn does not move that turn to the new platform', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  fixture(path.join(root, 'lane'), 'session-mid', {
    preset: 'designer-wordpress',
    prompter: 'a@b.c',
    switchTo: 'designer-joomla',
    switchAt: 'mid-turn'
  })
  const [turn] = measure(root)
  assert.equal(turn.preset, 'designer-wordpress', 'the turn belongs to the preset it started with')
})

test('the median of an even number of turns is a median, not the upper middle', () => {
  // 🔒 NOT A ROUNDING MATTER. On the §3 sample size (6 WordPress turns: 2.9 · 18 · 66.1 · 122.4 ·
  // 127.3 · 424.3 seconds) the upper-middle element is 122.4 while the median is 94.3 — nearly one and a half times. A
  // before/after table that jumps from 66 to 122 when one turn is added to the sample is measuring how many turns were measured.
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  const lane = path.join(root, 'lane')
  // Two turns, 4 seconds and 8 seconds: the median must be 6, not 8.
  fixture(lane, 'session-short', { preset: 'designer-wordpress', prompter: 'a@b.c' })
  fixture(lane, 'session-long', { preset: 'designer-wordpress', prompter: 'a@b.c', endsAt: 1_008_000 })
  const seconds = measure(root)
    .map((row) => row.seconds)
    .sort((a, b) => a - b)
  assert.deepEqual(seconds, [4, 8], 'the fixture must give exactly two turns of different length')
  const printed = execFileSync('node', [TOOL, root], { encoding: 'utf8' })
  assert.match(printed, /^wordpress\s+2\s+6\s/m, 'the median of 4 and 8 is 6')
})

/**
 * 🔒 CALLS PER STEP IS THE COLUMN THE BATCHING RULE IS JUDGED BY, and nothing else in this table
 * can stand in for it. The bill is per STEP: the whole conversation is re-sent on every one, and
 * `cacheRead` is the integral of that — measured 19/09 on a WordPress lane, context went 6,528 →
 * 81,792 tokens across 18 steps while the tool RESULTS of all 21 turns came to ~39,883. So ten
 * reads spread over ten steps cost ten re-reads of the conversation and the same ten together cost
 * one, and the site context now tells the agent to ask them in one message.
 *
 * It is NOT `steps` and `calls` read side by side: those are medians of different turns, and the
 * median of a ratio is not the ratio of two medians.
 */
function batched(dir, name, { steps }) {
  // `steps` is a list of call counts: `[3, 1]` is one step of three calls, then one of one.
  const events = [
    JSON.stringify({
      type: 'session',
      version: 3,
      id: name,
      createdAt: 1_000_000,
      cwd: '/site/x',
      agentPreset: 'designer-joomla'
    }),
    line('user/message', 1_000_100, { turn: 1, source: { kind: 'user', prompter: { email: 'a@b.c' } } }),
    line('turn/start', 1_000_000, { turn: 1 })
  ]
  let at = 1_000_100
  steps.forEach((calls, i) => {
    events.push(line('step/start', (at += 100), { turn: 1, step: i + 1 }))
    for (let c = 0; c < calls; c += 1) {
      const callId = `s${String(i)}c${String(c)}`
      events.push(
        line('tool/call', (at += 10), {
          turn: 1,
          callId,
          name: 'tracy_site',
          arguments: '{"action":"content.list"}'
        })
      )
      events.push(
        line('tool/result', (at += 10), {
          turn: 1,
          message: { source: { callId }, content: [{ type: 'text', text: 'ok' }] }
        })
      )
    }
    events.push(
      line('assistant/message', (at += 10), {
        turn: 1,
        step: i + 1,
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 1000, totalTokens: 1015 },
        message: { role: 'assistant', content: [] }
      })
    )
  })
  events.push(line('turn/end', 1_004_000, { turn: 1, reason: { kind: 'completed' } }))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${name}.jsonl`), `${events.join('\n')}\n`)
}

/** The human-readable table, which is where the `c/s` column lives. */
const table = (root) => execFileSync('node', [TOOL, root], { encoding: 'utf8' })

test('the table reports calls per step, the figure the batching rule moves', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  // Six calls the agent could have asked for in one message, spread over six steps.
  batched(path.join(root, 'lane'), 'session-spread', { steps: [1, 1, 1, 1, 1, 1] })
  const spread = table(root)
  assert.match(spread, /platform.*c\/s/, 'the column must be in the header')
  assert.match(spread, /joomla\s+1\s+\d+\s+6\s+6\s+1\.0/, spread)

  // The same six calls, asked together. Same work, one sixth of the conversation re-reads.
  const root2 = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  batched(path.join(root2, 'lane'), 'session-batched', { steps: [6] })
  assert.match(table(root2), /joomla\s+1\s+\d+\s+1\s+6\s+6\.0/, table(root2))
})

/** A turn refused before its first step must not read as "did not batch" — it has no ratio at all. */
test('a turn that never ran a step is left out of the density, not counted as zero', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-'))
  batched(path.join(root, 'lane'), 'session-none', { steps: [] })
  assert.match(table(root), /joomla\s+1\s+\d+\s+0\s+0\s+-/, table(root))
})

// #1403 item 14: where a turn's time goes — the model's part of each step, the tools' (their waits included),
// and the tail after the last step — in the order dsh really logs a step (measured on the stand 16/10/2026:
// step/start, assistant/message, tool/call, tool/result, step/end).
test('a turn is split into model, tools (calls side by side counted once) and the tail after the last step', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'turn-split-'))
  const events = [
    JSON.stringify({
      type: 'session',
      version: 4,
      id: 's',
      createdAt: 0,
      cwd: '/site/x',
      agentPreset: 'designer-joomla'
    }),
    line('turn/start', 0, { turn: 1 }),
    line('step/start', 100, { turn: 1, step: 1 }),
    line('assistant/message', 2_100, { turn: 1, step: 1, message: { role: 'assistant', content: [] } }),
    line('tool/call', 2_105, { turn: 1, step: 1, callId: 'a', name: 'bash', arguments: '{}' }),
    line('tool/call', 2_106, { turn: 1, step: 1, callId: 'b', name: 'bash', arguments: '{}' }),
    line('tool/result', 4_106, { turn: 1, step: 1, message: { toolCallId: 'b', content: [] } }),
    line('tool/result', 5_106, { turn: 1, step: 1, message: { toolCallId: 'a', content: [] } }),
    line('step/end', 5_107, { turn: 1, step: 1 }),
    line('step/start', 5_200, { turn: 1, step: 2 }),
    line('assistant/message', 6_200, { turn: 1, step: 2, message: { role: 'assistant', content: [] } }),
    line('step/end', 6_201, { turn: 1, step: 2 }),
    line('turn/end', 9_201, { turn: 1, reason: { kind: 'completed' } })
  ]
  writeFileSync(path.join(dir, 's.jsonl'), `${events.join('\n')}\n`)
  const [row] = measure(dir)
  assert.equal(row.seconds, 9.2)
  assert.equal(row.modelSeconds, 3, 'two steps: 2 s and 1 s')
  assert.equal(row.toolSeconds, 3, 'two calls side by side, 3 s and 2 s, held the turn 3 s')
  assert.equal(row.tailSeconds, 3, 'after the last step: the check and the close')
  const table = execFileSync('node', [TOOL, dir], { encoding: 'utf8' })
  assert.match(table, /time \(sec, p50 \/ p90\)/)
  assert.match(table, /joomla\s+1\s+9 \/ 9\s+3 \/ 3\s+3 \/ 3\s+3 \/ 3/)
})
