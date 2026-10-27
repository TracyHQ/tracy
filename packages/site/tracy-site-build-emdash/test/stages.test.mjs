/**
 * The two EmDash stages against a fake site — what `check` accepts, what it refuses, and that it
 * never asks the apply door (EmDash has no Cowork extension to answer it).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { SHOWN_LANGUAGE_IDS } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import { inspectSummary, rebuildSite, requests } from '../src/host/requests.mjs'
import { AGENT_TOKEN_PATH } from '../../../tools/tracy-site-tools/src/host/exec.mjs'
import {
  containerAddress,
  makeStages,
  modelEnvFrom,
  PROTECTED_AGENT_TOKEN,
  personalizeCommand,
  readPersonalizeReport,
  STAGES,
  templateBeside
} from '../src/host/stages.mjs'

const EMDASH_PAGE =
  '<!doctype html><html><head><meta name="generator" content="EmDash 0.37.0"></head><body>Northgate</body></html>'

/** A fetch that answers a fixed script of responses, then repeats the last one. */
function scripted(responses) {
  const calls = []
  let i = 0
  const get = async (url) => {
    calls.push(url)
    const r = responses[Math.min(i, responses.length - 1)]
    i += 1
    return { status: r.status, text: async () => r.body ?? '' }
  }
  return { get, calls }
}

const deps = (get, root = mkdtempSync(join(tmpdir(), 'emdash-build-'))) => ({
  root,
  ids: new Set(['artistic']),
  run: async () => ({ code: 0, stdout: '', stderr: '' }),
  copyHome: async () => ({ ok: false, message: 'not here' }),
  seeder: null,
  chrome: null,
  apply: async () => {
    throw new Error('the apply door must never be asked on EmDash')
  },
  get,
  wait: async () => {},
  doorOrigin: 'http://127.0.0.1:0'
})

test('every stage has a name in every interface language, in order', () => {
  // Each stage is a line of the task list: it has a name in every interface language's words, in this order.
  for (const lang of SHOWN_LANGUAGE_IDS) {
    const named = Object.keys(
      JSON.parse(readFileSync(new URL(`../words/${lang}.json`, import.meta.url), 'utf8')).stages
    )
    assert.deepEqual(
      named.filter((id) => STAGES.includes(id)),
      [...STAGES],
      `words/${lang}.json stages`
    )
  }
})

/** A `run` that records what was asked and answers a script. */
function recorder(answer) {
  const calls = []
  const run = async (cmd, args) => {
    calls.push({ cmd, args })
    return typeof answer === 'function' ? answer(cmd, args) : answer
  }
  return { run, calls }
}

test('personalize runs the template tool inside the site container, answers and model key passed, docker host from dsh', async () => {
  const report = {
    written: [
      { entry: 'site/site/en', fields: ['brand_name', 'hotline'] },
      { entry: 'settings', fields: ['title'] }
    ],
    unchanged: [],
    editor: [],
    skipped: [],
    copy: { done: [{ field: 'home.home.hero_text', locale: 'en' }], skipped: [] }
  }
  const { run, calls } = recorder({ code: 0, stdout: `${JSON.stringify(report)}\n`, stderr: '' })
  const stages = makeStages({
    ...deps(scripted([{ status: 200, body: EMDASH_PAGE }]).get),
    run,
    env: { TRACY_DOCKER_HOST: 'tcp://docker-proxy:2375', DEEPSEEK_API_KEY: 'sk-x', OPENROUTER_API_KEY: '' }
  })
  const r = await stages.personalize({
    targetSiteKey: 'granite.localhost',
    answers: { name: 'Granite Works', contact: 'Hà Nội' }
  })
  assert.equal(r.status, 'done')
  assert.match(r.detail, /3 fields on 2 entries · copy 1 written, 0 skipped/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].cmd, 'env')
  const a = calls[0].args
  assert.equal(a[0], 'DOCKER_HOST=tcp://docker-proxy:2375')
  assert.deepEqual(a.slice(1, 4), ['docker', 'exec', '-i'])
  assert.ok(
    a.includes('DEEPSEEK_API_KEY=sk-x') && a[a.indexOf('DEEPSEEK_API_KEY=sk-x') - 1] === '-e',
    'the model key rides as -e'
  )
  assert.ok(!a.some((x) => x.startsWith('OPENROUTER_API_KEY=')), 'an empty key is not passed')
  const c = a.indexOf('granite-web-1')
  assert.ok(c > 0)
  assert.deepEqual(a.slice(c + 1, c + 5), personalizeCommand(), 'the tool runs through the token picker')
  assert.deepEqual(JSON.parse(a[a.indexOf('--answers-json') + 1]), {
    name: 'Granite Works',
    contact: 'Hà Nội'
  })
  assert.ok(a.includes('--json'))
})

test('personalize reads the same protected token path the MCP call reads (#155)', () => {
  assert.equal(PROTECTED_AGENT_TOKEN, AGENT_TOKEN_PATH)
  assert.equal(PROTECTED_AGENT_TOKEN, '/run/tracy-agent.token')
})

// The picker is run for real here, with a stand-in `node` that prints what it was handed: the
// protected mount first, the legacy `data/` file when the mount is absent or still empty (the
// state provision prepares before the mint), and the customer's words through unchanged.
test('the token picker hands personalize.mjs the protected mount, or the data/ file of an older site', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emdash-token-pick-'))
  mkdirSync(join(dir, 'bin'))
  mkdirSync(join(dir, 'run'))
  writeFileSync(join(dir, 'bin/node'), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n')
  chmodSync(join(dir, 'bin/node'), 0o755)
  const mount = join(dir, 'run/tracy-agent.token')
  const answers = JSON.stringify({ name: 'Xe "Nội" $(whoami); rm -rf / #', about: "it's `ok`" })
  const pick = () => {
    const [cmd, ...args] = personalizeCommand(mount)
    const r = spawnSync(cmd, [...args, '--answers-json', answers, '--json'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` }
    })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trimEnd().split('\n')
  }

  // A site made before #155: no mount, the token still in data/.
  assert.deepEqual(pick(), [
    'tools/personalize.mjs',
    '--token-file',
    'data/tracy-agent.token',
    '--answers-json',
    answers,
    '--json'
  ])
  // Prepared but not minted yet: an empty mount is not a token.
  writeFileSync(mount, '')
  assert.equal(pick()[2], 'data/tracy-agent.token')
  // A site made since #155: the mount carries the token, and it wins.
  writeFileSync(mount, 'ec_pat_0123456789abcdefghij\n')
  assert.deepEqual(pick(), [
    'tools/personalize.mjs',
    '--token-file',
    mount,
    '--answers-json',
    answers,
    '--json'
  ])
})

test('personalize says which languages the site serves and how many it hides', async () => {
  const report = (language, skipped = []) => ({
    written: [{ entry: 'site/site/en', fields: ['brand_name'] }],
    unchanged: [],
    editor: [],
    skipped,
    copy: { done: [], skipped: [] },
    ...(language ? { language } : {})
  })
  const detail = async (r) => {
    const { run } = recorder({ code: 0, stdout: `${JSON.stringify(r)}\n`, stderr: '' })
    const stages = makeStages({ ...deps(scripted([{ status: 200, body: EMDASH_PAGE }]).get), run, env: {} })
    return (await stages.personalize({ targetSiteKey: 'granite.localhost', answers: { name: 'G' } })).detail
  }
  const hidden = Array.from({ length: 38 }, (_, i) => `x${String(i)}`)
  assert.match(
    await detail(report({ write: ['en', 'vi'], hidden, unpublished: 1900 })),
    /languages en, vi · 38 other language\(s\) hidden/
  )
  assert.match(await detail(report({ write: ['en'], hidden: [], unpublished: 0 })), /languages en(?! ·)/)
  assert.match(
    await detail(
      report({ write: ['en'], hidden: ['ru'] }, [
        { rule: 'language', why: 'this template ships en, ru, not vi' }
      ])
    ),
    /this template ships en, ru, not vi/
  )
  assert.doesNotMatch(await detail(report(null)), /languages/, 'an older template tool: nothing invented')
})

test('personalize: no docker host → plain docker; exit 3 is done and says why; failures and absences are named', async () => {
  const skippedCopy = {
    written: [{ entry: 'site/site/en', fields: ['brand_name'] }],
    unchanged: [],
    editor: ['home/home/en'],
    skipped: [],
    copy: {
      done: [],
      skipped: [
        { why: 'no model key (OPENROUTER_API_KEY, DEEPSEEK_API_KEY or TRACY_MODEL_URL): the demo copy stays' }
      ]
    }
  }
  const plain = recorder({ code: 3, stdout: JSON.stringify(skippedCopy), stderr: '' })
  const s1 = makeStages({ ...deps(scripted([]).get), run: plain.run, env: {} })
  const r1 = await s1.personalize({ targetSiteKey: 'granite.localhost', answers: { name: 'G' } })
  assert.equal(r1.status, 'done')
  assert.equal(plain.calls[0].cmd, 'docker')
  assert.match(
    r1.detail,
    /1 fields on 1 entries · 1 left to an editor · copy 0 written, 1 skipped \(no model key/
  )

  const noTool = recorder({
    code: 1,
    stdout: '',
    stderr: "Error: Cannot find module '/app/tools/personalize.mjs'"
  })
  const r2 = await makeStages({ ...deps(scripted([]).get), run: noTool.run, env: {} }).personalize({
    targetSiteKey: 'granite.localhost',
    answers: { name: 'G' }
  })
  assert.equal(r2.status, 'skipped')
  assert.match(r2.detail, /ships no personalize tool/)
  // The half that matters: a template without the tool hands the work to the agent in the chat,
  // and says so in a code the notification can key on. Before 19/09 this stage ended with "the
  // demo words stay" and the customer's answers were thrown away in silence.
  assert.equal(r2.code, 'PERSONALIZE_BY_AGENT')
  assert.match(r2.detail, /tracy_emdash/)
  assert.doesNotMatch(r2.detail, /demo words stay/)

  const noDocker = recorder({ code: 127, stdout: '', stderr: 'docker: not found' })
  const r3 = await makeStages({ ...deps(scripted([]).get), run: noDocker.run, env: {} }).personalize({
    targetSiteKey: 'granite.localhost',
    answers: { name: 'G' }
  })
  assert.equal(r3.status, 'failed')
  assert.match(r3.detail, /docker is not available/)

  const broke = recorder({
    code: 1,
    stdout: '',
    stderr: 'GET /_emdash/api/content/site/site -> 401 UNAUTHORIZED'
  })
  const r4 = await makeStages({ ...deps(scripted([]).get), run: broke.run, env: {} }).personalize({
    targetSiteKey: 'granite.localhost',
    answers: { name: 'G' }
  })
  assert.equal(r4.status, 'failed')
  assert.match(r4.detail, /exit 1.*401/)

  const idle = recorder({ code: 0, stdout: '', stderr: '' })
  const s5 = makeStages({ ...deps(scripted([]).get), run: idle.run, env: {} })
  assert.equal((await s5.personalize({ targetSiteKey: 'granite.localhost' })).status, 'skipped')
  assert.equal((await s5.personalize({ answers: { name: 'G' } })).status, 'skipped')
  assert.equal(idle.calls.length, 0, 'nothing runs without a site and answers')
})

test('check passes a site that answers 200 as EmDash, and names the template beside the build', async () => {
  const root = mkdtempSync(join(tmpdir(), 'emdash-build-'))
  mkdirSync(join(root, 'template'))
  writeFileSync(
    join(root, 'template', 'artifact.json'),
    JSON.stringify({ templateId: 'tracy-business', label: 'Tracy Business', version: '1.0.0' })
  )
  const { get, calls } = scripted([{ status: 200, body: EMDASH_PAGE }])
  const stages = makeStages(deps(get, root))
  const result = await stages.check({ targetUrl: 'http://emdashqs.localhost:8080', inspiration: 'artistic' })
  assert.equal(result.status, 'done')
  assert.match(result.detail, /Tracy Business 1\.0\.0/)
  assert.deepEqual(calls, ['http://emdashqs.localhost:8080'])
})

test('check keeps asking while the site is still starting, then passes', async () => {
  const { get, calls } = scripted([{ status: 502 }, { status: 503 }, { status: 200, body: EMDASH_PAGE }])
  const stages = makeStages(deps(get))
  const result = await stages.check({ targetUrl: 'http://x.localhost', inspiration: 'artistic' })
  assert.equal(result.status, 'done')
  assert.equal(calls.length, 3)
  assert.match(result.detail, /template manifest is not beside this build/)
})

test('check asks the site container itself when the public address says the draft is private', async () => {
  const calls = []
  const get = async (url) => {
    calls.push(url)
    return url.startsWith('http://granite-web-1:4321/')
      ? { status: 200, text: async () => EMDASH_PAGE }
      : { status: 403, text: async () => '<html>Private copy</html>' }
  }
  const stages = makeStages(deps(get))
  const result = await stages.check({
    targetUrl: 'http://granite.localhost:8080/',
    targetSiteKey: 'granite.localhost',
    inspiration: 'artistic'
  })
  assert.equal(result.status, 'done')
  assert.deepEqual(calls, ['http://granite.localhost:8080/', 'http://granite-web-1:4321/'])
  assert.match(
    result.detail,
    /^http:\/\/granite\.localhost:8080\//,
    'the detail names the address the customer opens'
  )
  assert.equal(containerAddress('granite.localhost'), 'http://granite-web-1:4321/')
  assert.equal(containerAddress('Bad Key'), null)
  assert.equal(containerAddress(undefined), null)
  // Without a site key there is nothing else to ask: the 403 is the answer.
  const alone = makeStages(deps(get))
  const r = await alone.check({ targetUrl: 'http://granite.localhost:8080/', inspiration: 'artistic' })
  assert.equal(r.status, 'failed')
  assert.match(r.detail, /HTTP 403/)
})

test('check asks the container when the public address refuses the connection, not only on a 403', async () => {
  // Measured 20/09 on the local stand: the address a customer opens carries the port their BROWSER
  // reaches Tracy on (51710, published on the host), and that port does not exist inside the Docker
  // network this stage runs in — ECONNREFUSED in 39ms, while the site's own container answered 200.
  // The build failed at check, `personalize` never ran, and the customer opened a site still wearing
  // the template's demo brand. A refused connection to the public address says nothing about the site.
  const calls = []
  const get = async (url) => {
    calls.push(url)
    if (url.startsWith('http://granite-web-1:4321/')) return { status: 200, text: async () => EMDASH_PAGE }
    const refused = new Error('fetch failed')
    refused.cause = { code: 'ECONNREFUSED' }
    throw refused
  }
  const result = await makeStages(deps(get)).check({
    targetUrl: 'http://granite.localhost:51710/',
    targetSiteKey: 'granite.localhost',
    inspiration: 'artistic'
  })
  assert.equal(result.status, 'done')
  assert.deepEqual(calls, ['http://granite.localhost:51710/', 'http://granite-web-1:4321/'])
  assert.match(result.detail, /^http:\/\/granite\.localhost:51710\//)

  // A site that is genuinely unreachable both ways still fails, and the detail carries the reason.
  const dead = async () => {
    const refused = new Error('fetch failed')
    refused.cause = { code: 'ECONNREFUSED' }
    throw refused
  }
  const gone = await makeStages({ ...deps(dead), wait: async () => {} }).check({
    targetUrl: 'http://granite.localhost:51710/',
    targetSiteKey: 'granite.localhost',
    inspiration: 'artistic'
  })
  assert.equal(gone.status, 'failed')
  assert.match(gone.detail, /did not answer as a site in time \(fetch failed\)/)
})

test('check fails a 200 that is not an EmDash page, and a site that never answers', async () => {
  const notEmdash = makeStages(deps(scripted([{ status: 200, body: '<html>Coming soon</html>' }]).get))
  const r1 = await notEmdash.check({ targetUrl: 'http://x.localhost', inspiration: 'artistic' })
  assert.equal(r1.status, 'failed')
  assert.match(r1.detail, /not as an EmDash site/)

  const never = makeStages(deps(scripted([{ status: 502 }]).get))
  const r2 = await never.check({ targetUrl: 'http://x.localhost', inspiration: 'artistic' })
  assert.equal(r2.status, 'failed')
  assert.match(r2.detail, /did not answer as a site in time \(HTTP 502\)/)

  const noAddress = await never.check({ inspiration: 'artistic' })
  assert.equal(noAddress.status, 'failed')
  assert.match(noAddress.detail, /names no site address/)
})

test('templateBeside reads only a manifest that names a template, and tolerates a broken one', () => {
  const root = mkdtempSync(join(tmpdir(), 'emdash-build-'))
  assert.equal(templateBeside(root), null)
  mkdirSync(join(root, 'template'))
  writeFileSync(join(root, 'template', 'artifact.json'), '{ not json')
  assert.equal(templateBeside(root), null)
  writeFileSync(join(root, 'template', 'artifact.json'), JSON.stringify({ version: '1.0.0' }))
  assert.equal(templateBeside(root), null, 'no templateId is no template')
})

test('shot is the shared stage, and skips without a browser rather than failing the build', async () => {
  const stages = makeStages(deps(scripted([{ status: 200, body: EMDASH_PAGE }]).get))
  const result = await stages.shot({ targetUrl: 'http://x.localhost', inspiration: 'artistic' })
  assert.equal(result.status, 'skipped')
  assert.equal(result.detail, 'no-browser')
})

test('picture.redraw: one sentence from the chat becomes one picture, and a name nobody has is refused', () => {
  const redraw = requests['picture.redraw']
  const change = redraw.change({ pictures: { 'home.hero_image': 'loaves fresh from the oven' } })
  assert.equal(change.stage, 'personalize', 'the same stage, rerun with the picture asked for')
  assert.deepEqual(change.answers, { pictures: { 'home.hero_image': 'loaves fresh from the oven' } })
  assert.deepEqual(
    redraw.change({ pictures: { 'projects/elektra-lipetsk.image': 'a tray of pastries' } }).answers.pictures,
    { 'projects/elektra-lipetsk.image': 'a tray of pastries' },
    'one entry of a collection can be named too'
  )
  assert.throws(() => redraw.change({}), /needs pictures/)
  assert.throws(() => redraw.change({ pictures: {} }), /at least one/)
  assert.throws(() => redraw.change({ pictures: { 'rm -rf /': 'x' } }), /does not name a picture/)
  assert.throws(
    () => redraw.change({ pictures: { 'home.hero_image': '' } }),
    /what home\.hero_image should show/
  )
  // The hint is where the agent decides what to promise: it must name the spots and the limit.
  assert.match(redraw.hint, /home\.hero_image/)
  assert.match(redraw.hint, /every other picture and all the words\s+are left as they are/)
  assert.match(redraw.hint, /without one the build\s+says so/)
})

test('content.revise reruns the same stage with the customer’s new details, and draws nothing', () => {
  const change = requests['content.revise'].change({ answers: { name: 'Tiem Banh Sen 2' } })
  assert.equal(change.stage, 'personalize')
  // `pictures: null` on purpose: a picture.redraw before this left `pictures` in the job's
  // answers, and a revise that kept it would only draw.
  assert.deepEqual(change.answers, { name: 'Tiem Banh Sen 2', pictures: null })
  assert.throws(() => requests['content.revise'].change({}), /needs answers/)
})

// 🔒 The first renders of a restarted server are its slowest (dswalkem02, 11/10/2026: 8.4 s and 5.5 s
// against ~0.1 s warm, paid by the customer's next presses). The restart finishes the render of the look
// that found the site up and renders the home page once more before it answers.
test('site.restart warms the restarted site: the first answer read to its end, then the home page once more', async () => {
  const run = async () => ({ code: 0, stdout: '', stderr: '' })
  const looks = []
  let read = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    looks.push([String(url), init?.redirect])
    return { status: 200, text: async () => (read += 1) }
  }
  try {
    const done = await requests['site.restart'].perform(
      {},
      { targetSiteKey: 'site-abc.tracy.test' },
      { run, env: {}, onLine: () => {} }
    )
    assert.equal(done.ok, true, done.detail)
    assert.deepEqual(looks, [
      ['http://site-abc-web-1:4321/', 'manual'],
      ['http://site-abc-web-1:4321/', 'manual']
    ])
    assert.equal(read, 2, 'both answers read to their end')
  } finally {
    globalThis.fetch = realFetch
  }
  // a warm-up that fails changes nothing: the site answered
  let n = 0
  globalThis.fetch = async () => {
    n += 1
    if (n > 1) throw new Error('timed out')
    return { status: 403 }
  }
  try {
    const done = await requests['site.restart'].perform(
      {},
      { targetSiteKey: 'site-abc.tracy.test' },
      { run, env: {}, onLine: () => {} }
    )
    assert.equal(done.ok, true)
    assert.match(done.detail, /answers again \(HTTP 403\)/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('site.restart restarts the site’s own container through docker and waits for it to answer', async () => {
  const calls = []
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '))
    return { code: 0, stdout: '', stderr: '' }
  }
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ status: 403 })
  try {
    const done = await requests['site.restart'].perform(
      {},
      { targetSiteKey: 'site-abc.tracy.test' },
      {
        run,
        env: { TRACY_DOCKER_HOST: 'tcp://docker-proxy:2375' },
        onLine: () => {}
      }
    )
    assert.equal(done.ok, true, done.detail)
    assert.deepEqual(calls, ['env DOCKER_HOST=tcp://docker-proxy:2375 docker restart -t 10 site-abc-web-1'])
    assert.match(done.detail, /answers again/)
  } finally {
    globalThis.fetch = realFetch
  }
})

// Lee, 26/09/2026: a quickstart site locks nothing but direct database writes. A Tracy Business image
// still carries the old `io.tracy.content-only` label; the rebuild no longer reads it.
test('site.rebuild builds every EmDash site, a quickstart one included, and reads no image label', async () => {
  const calls = []
  const run = async (cmd, args) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    // the build fails so the test stops before the restart's fetch
    return { code: 1, stdout: '', stderr: 'boom' }
  }
  const done = await requests['site.rebuild'].perform(
    {},
    { targetSiteKey: 'site-abc.tracy.test' },
    { run, env: {}, onLine: () => {} }
  )
  assert.equal(done.ok, false)
  assert.match(done.detail, /the build failed/)
  // first the design-system slot's pins, read while dist is still the last build (`slot-pins.mjs`)
  assert.equal(calls.length, 3)
  assert.match(calls[0], /^docker exec -u www-data site-abc-web-1 node -e /)
  assert.match(
    calls[2],
    /exec -u www-data -w \/app -e HOME=\/tmp site-abc-web-1 node_modules\/.bin\/astro build/
  )
  assert.ok(!calls.some((c) => /content-only/.test(c)))
  assert.doesNotMatch(requests['site.rebuild'].hint, /REFUSED/)
})

// 10/10/2026: the hint sent every colour to tokens.css, and on a site wearing a design-system slot the
// slot's `data/ds-slot.css` wins over it — an edit there changes nothing the customer sees, and the
// agent then pinned the system's values by hand. The hint names the exception and where the rule is.
test('site.rebuild: the hint sends a colour to tokens.css unless the design-system slot sets it', () => {
  assert.match(
    requests['site.rebuild'].hint,
    /a colour is a token in src\/styles\/tokens\.css, unless the site's design-system slot sets it: then the context's Design system line says how/
  )
})

// Stand, 10/10/2026 (em-I5): an edit made relative to the slot kept a literal `!rounded-full` the element
// already carried, so the next system never reached its corners. The hint says the element's leftover
// literals go too.
test('site.rebuild: the hint says an element’s leftover literal pins are replaced as well', () => {
  assert.match(requests['site.rebuild'].hint, /says how, the element's leftover literals included\)/)
})

test('rebuildSite builds as the site user inside the container; a failed build restarts nothing', async () => {
  const calls = []
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '))
    return args.includes('build')
      ? { code: 1, stdout: '', stderr: 'error TS2322 somewhere' }
      : { code: 0, stdout: '', stderr: '' }
  }
  const done = await rebuildSite({ targetSiteKey: 'site-abc.tracy.test' }, { run, env: {} })
  assert.equal(done.ok, false)
  assert.match(done.detail, /build failed \(exit 1\): error TS2322/)
  assert.match(
    calls[0],
    /^docker exec -u www-data site-abc-web-1 node -e .* \/app$/s,
    'the slot pins, read first'
  )
  assert.deepEqual(calls.slice(1), [
    'docker inspect --format {{ index .Config.Labels "io.tracy.content-api.scalars" }} site-abc-web-1',
    'docker exec -u www-data -w /app -e HOME=/tmp site-abc-web-1 node_modules/.bin/astro build'
  ])
})

// Measured 26/09/2026: an in-container rebuild without the image's switch dropped /content.json.
test('rebuildSite carries the image content api switch into the build when the label says 1', async () => {
  const calls = []
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '))
    if (args[0] === 'inspect') return { code: 0, stdout: '1\n', stderr: '' }
    return args.includes('build')
      ? { code: 1, stdout: '', stderr: 'stop here' }
      : { code: 0, stdout: '', stderr: '' }
  }
  await rebuildSite({ targetSiteKey: 'site-abc.tracy.test' }, { run, env: {} })
  assert.equal(
    calls[2],
    'docker exec -u www-data -w /app -e HOME=/tmp -e TRACY_CONTENT_API_SCALARS=1 site-abc-web-1 node_modules/.bin/astro build'
  )
})

// ── site.inspect · site.revert: the template tool's journal, read and undone from the chat ───────

const INSPECT = {
  applyIds: ['pers-1', 'pers-2'],
  latest: 'pers-2',
  fields: [
    {
      target: 'site/site/en.brand_name',
      origin: 'customer',
      before: 'Northgate',
      after: 'Granite Works',
      rev: 7,
      live: 'same'
    },
    {
      target: 'home/home/en.hero_text',
      origin: 'generated',
      evidence: 'Invented by Tracy…',
      before: 'x',
      after: 'y',
      rev: 3,
      live: 'edited'
    }
  ]
}

test('site.inspect runs personalize.mjs --inspect inside the container through the token picker, no model key, and hands the document back', async () => {
  const calls = []
  const run = async (cmd, args) => {
    calls.push({ cmd, args })
    return { code: 0, stdout: `pictures 0 of 0\n${JSON.stringify(INSPECT)}\n`, stderr: '' }
  }
  const done = await requests['site.inspect'].perform(
    {},
    { targetSiteKey: 'granite.localhost' },
    {
      run,
      env: { TRACY_DOCKER_HOST: 'tcp://docker-proxy:2375', OPENROUTER_API_KEY: 'sk-or' },
      onLine: () => {}
    }
  )
  assert.equal(done.ok, true, done.detail)
  assert.deepEqual(done.result, inspectSummary(INSPECT), 'the parsed JSON, summarized for the agent')
  assert.match(done.detail, /2 field\(s\) across 2 pass\(es\); latest pers-2; 1 edited by hand since/)
  assert.equal(calls.length, 1)
  const a = calls[0].args
  assert.deepEqual(a.slice(0, 4), ['DOCKER_HOST=tcp://docker-proxy:2375', 'docker', 'exec', '-i'])
  assert.equal(a[4], 'granite-web-1')
  assert.deepEqual(a.slice(5, 9), personalizeCommand(), 'the same token picker the personalize stage uses')
  assert.deepEqual(a.slice(9), ['--inspect', '--json'])
  assert.ok(!a.some((x) => x === '-e' || x.startsWith('OPENROUTER_API_KEY=')), 'no model key travels')
})

test("site.revert passes the tool's own refusal through, refuses a malformed id before any exec, and reports a revert", async () => {
  const calls = []
  const answer = { current: { code: 0, stdout: '', stderr: '' } }
  const run = async (cmd, args) => {
    calls.push(args.join(' '))
    return answer.current
  }
  const deps = { run, env: {}, onLine: () => {} }
  const job = { targetSiteKey: 'granite.localhost' }

  for (const bad of [{}, { applyId: '' }, { applyId: '../x' }, { applyId: 'pers 3' }]) {
    const r = await requests['site.revert'].perform(bad, job, deps)
    assert.equal(r.ok, false)
    assert.match(r.detail, /needs applyId/)
  }
  assert.deepEqual(calls, [], 'a bad id never reaches a command line')

  answer.current = {
    code: 4,
    stdout: `${JSON.stringify({ ok: false, why: 'home/home/en.hero_text was edited by hand after pers-2' })}\n`,
    stderr: ''
  }
  const refused = await requests['site.revert'].perform({ applyId: 'pers-2' }, job, deps)
  assert.equal(refused.ok, false)
  assert.equal(refused.detail, 'home/home/en.hero_text was edited by hand after pers-2')
  assert.equal(refused.result.ok, false)
  assert.match(calls[0], /exec -i granite-web-1 .* --revert pers-2 --json$/)

  answer.current = {
    code: 0,
    stdout: `${JSON.stringify({ ok: true, reverted: ['site/site/en.brand_name', 'settings.title'] })}\n`,
    stderr: ''
  }
  const ok = await requests['site.revert'].perform({ applyId: 'pers-2' }, job, deps)
  assert.equal(ok.ok, true)
  assert.equal(ok.detail, 'pers-2 reverted: 2 change(s) put back')

  // A tool that prints no document is a failure with the tool's own words, not a guess.
  answer.current = { code: 1, stdout: '', stderr: 'no agent token at data/tracy-agent.token' }
  const mute = await requests['site.revert'].perform({ applyId: 'pers-2' }, job, deps)
  assert.equal(mute.ok, false)
  assert.match(mute.detail, /--revert answered no report \(exit 1\): no agent token/)
})

// ── Model keys reach the site container even when dsh's own environment is empty ──────────────
//
// Measured 22/09: `personalize.mjs` runs inside the CUSTOMER's container and only ever sees what
// this file passes with `-e`. That list was read from dsh's `process.env` alone — so the moment a
// deployment stops baking `MODEL_API_KEY` into the container (which is what makes the key
// rotatable from /ops at all), this stage went silently key-less and the customer's site got its
// words from nowhere. The credential file is the same one the agent and the seeder already read.

test('modelEnvFrom prefers dsh’s own environment', () => {
  const keys = modelEnvFrom(
    { OPENROUTER_API_KEY: 'sk-or-env' },
    () => 'refs:\n  OPENROUTER_API_KEY: sk-or-file\n'
  )
  assert.equal(keys.OPENROUTER_API_KEY, 'sk-or-env')
})

test('modelEnvFrom falls back to the credential file when the environment is empty', () => {
  const keys = modelEnvFrom(
    { OPENROUTER_API_KEY: '', DSH_HOME: '/desk-home' },
    () =>
      'version: 1\nrefs:\n  OPENROUTER_API_KEY: sk-or-file\n  DEEPSEEK_API_KEY: sk-ds-file\nrecords:\n  a/b:\n    kind: grant\n'
  )
  assert.equal(keys.OPENROUTER_API_KEY, 'sk-or-file')
  assert.equal(keys.DEEPSEEK_API_KEY, 'sk-ds-file')
})

test('modelEnvFrom reads nothing when there is no file and no environment', () => {
  const keys = modelEnvFrom({}, () => {
    throw new Error('ENOENT')
  })
  assert.deepEqual(keys, {})
})

test('modelEnvFrom never returns an empty value — an empty -e would look configured', () => {
  const keys = modelEnvFrom({ DEEPSEEK_API_KEY: '' }, () => 'refs:\n  DEEPSEEK_API_KEY: ""\n')
  assert.ok(!('DEEPSEEK_API_KEY' in keys))
})

// ── The report contract of 25/09: errors · unanswered · skipped kept apart, model named ──────────
//
// Until then `report.skipped` mixed three meanings (a refused write, a fact the customer never
// gave, a legitimate skip) and the stage read only its `language` row, so a build whose every
// write was refused ended `done · 0 fields`. The tool now exits 4 when `errors` is non-empty and
// the stage has to read that as failed — even when some fields were written.

const CONTRACT_REPORT = (extra = {}) => ({
  written: [{ entry: 'site/site/en', fields: ['brand_name'] }],
  unchanged: [],
  editor: [],
  skipped: [],
  errors: [],
  unanswered: [],
  generated: [],
  model: { provider: 'openrouter', text: 'openai/gpt-5-mini', image: 'google/gemini-3.1-flash-image' },
  copy: { done: [], skipped: [] },
  applyId: 'pers-3',
  requestId: 'a'.repeat(16),
  ...extra
})

const runReport = async (code, report, env = {}) => {
  const { run, calls } = recorder({ code, stdout: `${JSON.stringify(report)}\n`, stderr: '' })
  const stages = makeStages({ ...deps(scripted([]).get), run, env })
  const r = await stages.personalize({ targetSiteKey: 'granite.localhost', answers: { name: 'G' } })
  return { r, calls }
}

test('personalize lends the tool all five model names /ops pushes, as -e flags', async () => {
  const { r, calls } = await runReport(0, CONTRACT_REPORT(), {
    OPENROUTER_API_KEY: 'sk-or',
    DEEPSEEK_API_KEY: 'sk-ds',
    TRACY_SEED_TEXT_PROVIDER: 'openrouter',
    TRACY_SEED_TEXT_MODEL: 'openai/gpt-5-mini',
    TRACY_SEED_IMAGE_MODEL: 'google/gemini-3.1-flash-image'
  })
  assert.equal(r.status, 'done')
  const a = calls[0].args
  for (const pair of [
    'OPENROUTER_API_KEY=sk-or',
    'DEEPSEEK_API_KEY=sk-ds',
    'TRACY_SEED_TEXT_PROVIDER=openrouter',
    'TRACY_SEED_TEXT_MODEL=openai/gpt-5-mini',
    'TRACY_SEED_IMAGE_MODEL=google/gemini-3.1-flash-image'
  ]) {
    const at = a.indexOf(pair)
    assert.ok(at > 0 && a[at - 1] === '-e', `${pair} rides as -e`)
  }
  // The model the report says wrote the words is in the sentence: the /ops choice, verified.
  assert.match(r.detail, /by openrouter\/openai\/gpt-5-mini/)
})

test('personalize: a report with errors is FAILED and names the rules, even when fields were written', async () => {
  const report = CONTRACT_REPORT({
    errors: [
      { rule: 'identity.hotline', why: 'PUT site/site/en → 409 (rev moved)', code: 409 },
      { rule: 'identity.brand_name', why: 'PUT site/site/vi → 409 (rev moved)', code: 409 }
    ]
  })
  const { r } = await runReport(4, report)
  assert.equal(r.status, 'failed')
  assert.match(
    r.detail,
    /^failed 2 write\(s\): identity\.hotline: PUT site\/site\/en → 409 \(rev moved\); identity\.brand_name: /
  )
  assert.match(r.detail, /1 fields on 1 entries/, 'what was written is still said')
  // The report decides, not the exit code: a tool that exits 0 with errors is still failed.
  assert.equal((await runReport(0, report)).r.status, 'failed')
  // Exit 4 is not a crash of the tool: the report is read, not the stderr excerpt.
  assert.doesNotMatch(r.detail, /personalize failed \(exit 4\)/)
  // Exit 4 with nothing to read is a failure with no witness, said as such.
  const mute = recorder({ code: 4, stdout: '', stderr: 'boom' })
  const r2 = await makeStages({ ...deps(scripted([]).get), run: mute.run, env: {} }).personalize({
    targetSiteKey: 'granite.localhost',
    answers: { name: 'G' }
  })
  assert.equal(r2.status, 'failed')
  assert.match(r2.detail, /exit 4.*printed no report.*boom/)
})

test('personalize: unanswered facts keep the stage done and say how many slots wait', async () => {
  const report = CONTRACT_REPORT({
    unanswered: [
      { rule: 'identity.hq_address_1', why: 'no address in the brief' },
      { rule: 'identity.sales_email', why: 'no email in the brief' }
    ],
    generated: [{ entry: 'home/home/en', fields: ['hero_text', 'why_eyebrow'] }],
    skipped: [{ rule: 'pictures', why: 'redraw-only run' }]
  })
  const { r } = await runReport(0, report)
  assert.equal(r.status, 'done')
  assert.match(r.detail, /2 slot\(s\) wait for an answer \(identity\.hq_address_1, identity\.sales_email\)/)
  // Counted in fields, the unit the card shows the customer: two values on one entry.
  assert.match(r.detail, /2 value\(s\) written by Tracy, replace with yours/)
  assert.equal(r.facts?.generated, 2)
  assert.doesNotMatch(r.detail, /failed/)
})

test('readPersonalizeReport on an older report (no errors/unanswered/model) says nothing invented', () => {
  const r = readPersonalizeReport({
    written: [],
    unchanged: [],
    editor: [],
    skipped: [],
    copy: { done: [], skipped: [] }
  })
  assert.equal(r.status, 'done')
  assert.equal(r.detail, '0 fields on 0 entries · copy 0 written, 0 skipped')
})

test('readPersonalizeReport names the demo rows taken off, so a short news list reads as intended', () => {
  const r = readPersonalizeReport({
    written: [{ entry: 'site/site/en', fields: ['brand_name'] }],
    trimmed: [{ entry: 'posts/a/en' }, { entry: 'posts/b/en' }],
    copy: { done: [], skipped: [] }
  })
  assert.equal(r.status, 'done')
  assert.match(r.detail, /2 demo row\(s\) taken off the site/)
})

test('inspectSummary counts every journal row and lists only what a customer would ask about', async () => {
  const { inspectSummary } = await import('../src/host/requests.mjs')
  const fields = [
    {
      applyId: 'pers-1',
      target: { kind: 'entry', collection: 'site', slug: 'site', locale: 'en', field: 'brand_name' },
      origin: 'customer',
      before: 'NORTHGATE',
      after: 'GRANITE',
      live: 'same'
    },
    {
      applyId: 'pers-1',
      target: { kind: 'entry', collection: 'home', slug: 'home', locale: 'en', field: 'hero_image' },
      origin: 'generated',
      evidence: 'Invented…',
      before: { id: 'M0', src: 'x' },
      after: { id: 'M1', src: 'y' },
      live: 'same'
    },
    {
      applyId: 'pers-1',
      target: { kind: 'entry', collection: 'home', slug: 'home', locale: 'en', field: 'title' },
      origin: 'replaced',
      before: 'a',
      after: 'b',
      live: 'superseded'
    },
    ...Array.from({ length: 40 }, (_, i) => ({
      applyId: 'pers-1',
      target: { kind: 'unpublish', collection: 'site', slug: 'site', locale: `l${String(i)}` },
      origin: null,
      before: { status: 'published' },
      after: { status: 'draft' },
      live: 'same'
    }))
  ]
  const s = inspectSummary({ applyIds: ['pers-1'], latest: 'pers-1', fields })
  assert.equal(s.counts.kind.unpublish, 40)
  assert.equal(s.counts.live.superseded, 1)
  assert.equal(s.fields.length, 2)
  assert.deepEqual(s.fields[1].after, { media: 'M1' })
  assert.equal(s.fields[1].evidence, 'Invented…')
  assert.equal(inspectSummary({ fields: [...fields, ...fields, ...fields] }, 3).more, 3)
})

test('inspectSummary gives the value before the PASS, from the first write of a field', async () => {
  const { inspectSummary } = await import('../src/host/requests.mjs')
  const t = { kind: 'entry', collection: 'site', slug: 'site', locale: 'en', field: 'brand_name' }
  const s = inspectSummary({
    fields: [
      {
        applyId: 'pers-1',
        target: t,
        origin: 'customer',
        before: 'NORTHGATE',
        after: 'GRANITE',
        live: 'superseded'
      },
      { applyId: 'pers-1', target: t, origin: 'customer', before: 'GRANITE', after: 'GRANITE', live: 'same' }
    ]
  })
  assert.equal(s.fields.length, 1)
  assert.equal(s.fields[0].before, 'NORTHGATE')
})

test('site.revert reads the count the tool answers, and does not hand the agent every step', async () => {
  const run = async () => ({
    code: 0,
    stdout: `${JSON.stringify({ ok: true, applyId: 'pers-1', reverted: 2149, done: [{}, {}] })}\n`,
    stderr: ''
  })
  const r = await requests['site.revert'].perform(
    { applyId: 'pers-1' },
    { targetSiteKey: 'site-abc.tracy.test' },
    { run, env: {}, onLine: () => {} }
  )
  assert.equal(r.detail, 'pers-1 reverted: 2149 change(s) put back')
  assert.equal(r.result.done, undefined)
})

test('readPersonalizeReport says a repeat is a repeat, not "0 fields"', () => {
  const r = readPersonalizeReport({ repeatOf: 'pers-2', written: [], copy: { done: [], skipped: [] } })
  assert.equal(r.status, 'done')
  assert.match(r.detail, /nothing new to write: the same answers and model as pers-2/)
})

// ADR 0023, "Addendum 29/09 (afternoon)": an edited token reaches tracy-web's record too, not only the
// folder's copy — the copy is refreshed FROM tracy-web before every check, so a folder-only update
// was undone at the next pull.
test('rebuildSite sends the look it read after the restart to tracy-web', async () => {
  const { readFileSync } = await import('node:fs')
  const { writeDesign } = await import('@tracy/site-build-core/design-record')
  const cms = new URL('../../../cms/tracy-emdash-theme-business/', import.meta.url)
  const css = readFileSync(new URL('src/styles/tokens.css', cms), 'utf8')
  const root = mkdtempSync(join(tmpdir(), 'emdash-rebuild-'))
  mkdirSync(join(root, 'template'))
  writeFileSync(
    join(root, 'template', 'artifact.json'),
    JSON.stringify({ templateId: 'tracy-business', label: 'Tracy Business', version: '1.5.1' })
  )
  writeDesign(root, {
    schemaVersion: 'tracy-site-design/v1',
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    bound: true,
    platform: 'emdash',
    manifestDesign: null,
    tokens: { '--color-forest': '#000000' },
    tokensFrom: 'site:/app/src/styles/tokens.css',
    writtenAt: 'x',
    wroteBy: 'build:j1'
  })
  const run = async (_cmd, args) => {
    if (args[0] === 'exec' && args.at(-1) === '/app/src/styles/tokens.css')
      return { code: 0, stdout: css, stderr: '' }
    if (args[0] === 'exec' && args.at(-1) === '/app/src/fonts.json')
      return { code: 0, stdout: '[]', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 200 })
  try {
    const done = await rebuildSite(
      { targetSiteKey: 'granite.localhost' },
      { root, run, env: {}, putDesign: async (siteKey, record) => sent.push({ siteKey, record }) }
    )
    assert.equal(done.ok, true, done.detail)
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(sent.length, 1)
  assert.equal(sent[0].siteKey, 'granite.localhost')
  assert.equal(sent[0].record.source, 'quickstart')
  assert.equal(sent[0].record.tokens['--color-forest'], '#14483a')
})
