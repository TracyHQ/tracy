#!/usr/bin/env node
/** Natural-agent acceptance over streaming inference and the real authenticated product relay. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { authenticatedToolRelay } from './lib/authenticated-tool-relay.mjs'
import { changesSite } from '../../packages/tools/tracy-site-tools/src/host/site-context.mjs'
import { EMDASH_READ_TOOLS } from '../../packages/tools/tracy-site-tools/src/host/emdash.mjs'
import { streamingAgentProvider } from './lib/streaming-agent-provider.mjs'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
const args = process.argv.slice(2),
  arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const platform = arg('--platform', ''),
  fixture = JSON.parse(readFileSync(arg('--config', ''))),
  repeats = Number(arg('--repeats', '2'))
assert(['wordpress', 'joomla', 'emdash'].includes(platform))
assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
assert(
  platform === 'wordpress'
    ? /^toolbench-\d+-wp$/.test(fixture.wp)
    : fixture.name === `toolbench-crosscms-${platform}`
)
const env = JSON.parse(
  execFileSync('docker', ['inspect', 'tracy-dsh', '--format', '{{json .Config.Env}}'], { encoding: 'utf8' })
)
const key = env.find((v) => v.startsWith('DEEPSEEK_API_KEY='))?.slice('DEEPSEEK_API_KEY='.length)
assert(key, 'Provider credential unavailable')
const http = globalThis.fetch,
  out = resolve(arg('--out', '/tmp/tracy-agent-reader-acceptance'))
mkdirSync(out, { recursive: true })
const relay = await authenticatedToolRelay({ platform, fixture }),
  rows = []
const persist = () =>
  writeFileSync(
    join(out, `${platform}-streaming.json`),
    JSON.stringify(
      {
        platform,
        producer:
          'real streamed DeepSeek inference, shipped Tracy tools, vendored AgentLoop, authenticated product relay, isolated database, actual CMS HTTP',
        rows
      },
      null,
      2
    ) + '\n'
  )
try {
  const filter = platform === 'emdash' ? { locale: 'en' } : {}
  const inventory = await relay.send('content.read', { view: 'pages', ...filter })
  assert.equal(inventory.status, 200)
  const target = inventory.body.pages.filter((p) => p.title && p.path).at(-1),
    prefix = platform === 'emdash' ? 'Use the English edition unless another edition is named. ' : ''
  const tasks = [
    {
      id: 'exact-title',
      text: `Find the page whose exact title is ${JSON.stringify(target.title)}. Return its exact Content API ID and path.`,
      idRequired: true
    },
    {
      id: 'known-url',
      text: `Find ${JSON.stringify(target.url)}. Return its exact Content API ID and path.`,
      idRequired: true
    },
    {
      id: 'missing',
      text: 'Find the page titled NoSuchPage_91ec3c42. If absent, say so. Do not invent a record.'
    },
    {
      id: 'ambiguity',
      text:
        platform === 'emdash'
          ? 'Find pages whose title contains News. Show the matching choices with IDs and paths; do not choose or edit one.'
          : 'Find pages whose title contains Inventory. Show a few matching choices with IDs and paths; do not choose or edit one.'
    },
    {
      id: 'continuation',
      text:
        platform === 'emdash'
          ? 'List the first two English pages, then call the tool again for the following two. Return four distinct exact IDs and paths.'
          : 'Find Inventory pages. Read only two matches in the first call, then call the tool again for the following two. Return four distinct exact IDs and paths.'
    },
    {
      id: 'details',
      text: `Read the fields and content of the page ${JSON.stringify(target.title)}. Find its Content API ID first, then request that exact ID.`,
      idRequired: true
    },
    {
      id: 'id-recovery',
      text: `An earlier call tried the native numeric ID 99999999 as a Content API ID. Recover from that error by finding the exact page ${JSON.stringify(target.title)} and reading its actual Content API ID. Return that actual ID.`,
      idRequired: true,
      seed: { action: 'content.read', params: { id: '99999999' } }
    },
    {
      id: 'refusal-recovery',
      text: `The previous read used an invalid type. Fix the request and find the exact page ${JSON.stringify(target.title)}. Return its Content API ID and path.`,
      idRequired: true,
      seed: { action: 'content.read', params: { type: 'not-a-content-type' } }
    },
    {
      id: 'language',
      text:
        platform === 'emdash'
          ? `Find the Vietnamese edition at /vi/about. Return the exact ID, locale and path, without editing anything.`
          : 'Check whether this site has a Vietnamese edition. If it has none, say so using the site evidence. Do not invent a page or translate anything.'
    }
  ]
  const onlyTask = arg('--task', null)
  for (let repeat = 0; repeat < repeats; repeat++)
    for (const task of tasks.filter((t) => onlyTask === null || t.id === onlyTask)) {
      const calls = [],
        provider = []
      let failure = null,
        run = null
      relay.reads.length = 0
      const start = performance.now()
      const natural = streamingAgentProvider({ http, key, calls, requests: provider })
      const streamRespond = async function* (options, step) {
        if (task.seed && step === 1) {
          const block = {
            type: 'tool-call',
            id: 'seed-refusal',
            name: 'tracy_site',
            arguments: JSON.stringify(task.seed)
          }
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'block-end', index: 0, block }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
          return
        }
        try {
          yield* natural(options, step)
        } catch (error) {
          failure = error.message
          throw error
        }
      }
      try {
        run = await runPageSearchHarness([], {
          platform,
          transport: relay.transport,
          actorMint: relay.actorMint,
          streamRespond,
          userText: prefix + task.text
        })
      } catch (e) {
        failure = e.message
      }
      if (provider.some((request) => request.ms === null)) failure ??= 'INCOMPLETE_PROVIDER_ATTEMPT'
      const results = JSON.stringify(
        run?.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')) ?? []
      )
      const final =
        provider.filter((r) => r.finalText !== null && r.finalText !== undefined).at(-1)?.finalText ?? ''
      const noWrites = calls.every((c) =>
        c.name === 'tracy_site'
          ? !changesSite({ name: c.name, arguments: c.arguments })
          : c.name === 'tracy_emdash' && EMDASH_READ_TOOLS.has(c.arguments.tool)
      )
      const idValid = !task.idRequired || (results.includes(target.id) && final.includes(target.id))
      const continuation =
        task.id !== 'continuation' || calls.some((c) => (c.arguments.params?.offset ?? 0) >= 2)
      const recovery =
        !task.seed ||
        results.includes('CONTENT_BAD_QUERY') ||
        results.includes('NOT_FOUND') ||
        results.includes('INVALID_CONTENT_ID')
      const language =
        task.id !== 'language' ||
        platform !== 'emdash' ||
        (results.includes('/vi/about') && final.includes('vi'))
      const verified =
        !failure &&
        idValid &&
        noWrites &&
        continuation &&
        recovery &&
        language &&
        provider.length > 0 &&
        relay.reads.length > 0
      rows.push({
        repeat,
        task: task.id,
        verified,
        failure,
        ms: performance.now() - start,
        idValid,
        noWrites,
        continuation,
        recovery,
        language,
        seededRefusal: task.seed ?? null,
        calls,
        provider,
        final,
        toolResults: results,
        backendReads: relay.reads.length,
        nativeSourceCalls: relay.reads.reduce((n, r) => n + r.sourceCalls, 0)
      })
      persist()
      console.log(
        JSON.stringify({
          platform,
          repeat,
          task: task.id,
          verified,
          failure,
          steps: provider.length,
          ms: rows.at(-1).ms
        })
      )
    }
  persist()
} finally {
  await relay.close()
}
