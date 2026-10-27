/**
 * Read the twelve artifacts as a visitor's browser renders them, from inside the samples page.
 *
 * The samples page embeds each artifact in a sandboxed iframe, so the document under audit is not
 * the one the top frame owns: this drives Chrome over CDP, switches tab and appearance the way a
 * person does, then evaluates the shared extractor in the *iframe's* execution context. Reading
 * the built files instead would prove the files are fine and say nothing about the page.
 *
 * Usage: node observe-marketing-samples.mjs <page-url> <out-directory>
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ARTIFACTS, THEMES, surfaceId } from './marketing-plan.mjs'
import { EXTRACT_SOURCE } from './marketing-observe.mjs'

const [pageUrl, outDir] = process.argv.slice(2)
if (!pageUrl || !outDir) throw new Error('Usage: node observe-marketing-samples.mjs <page-url> <out-dir>')
mkdirSync(outDir, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? 9351)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    // Chrome clones its app bundle per launch and only clears it on a clean exit; we kill it.
    '--disable-features=MacAppCodeSignClone',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1440,1000',
    `--user-data-dir=${path.join(outDir, '.chrome')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const stop = (code) => {
  chrome.kill('SIGKILL')
  process.exit(code)
}
const timer = setTimeout(() => {
  console.error('TIMEOUT')
  stop(1)
}, 240_000)

let targets
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
    if (targets.some((t) => t.type === 'page')) break
  } catch {
    /* Chrome is still starting. */
  }
  await sleep(500)
}
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => (socket.onopen = resolve))

let nextId = 0
const pending = new Map()
const events = []
socket.onmessage = (message) => {
  const frame = JSON.parse(message.data)
  if (frame.id && pending.has(frame.id)) {
    const { resolve, reject } = pending.get(frame.id)
    pending.delete(frame.id)
    frame.error ? reject(new Error(frame.error.message)) : resolve(frame.result)
  } else if (frame.method) events.push(frame)
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })

/**
 * The sample iframe's execution context. `sandbox` without `allow-same-origin` gives the preview
 * an opaque origin, so Chrome puts it in its own target and it never appears in this page's frame
 * tree — the auto-attached session is the only way in, and that is exactly the isolation a visitor
 * gets too.
 */
async function iframeEvaluate(expression, documentFile) {
  const detached = new Set(
    events
      .filter((event) => event.method === 'Target.detachedFromTarget')
      .map((event) => event.params.sessionId)
  )
  const attached = events
    .filter((event) => event.method === 'Target.attachedToTarget')
    .map((event) => event.params)
    .filter((candidate) => !detached.has(candidate.sessionId))
    .reverse()
  const frameTree = (await send('Page.getFrameTree')).frameTree
  const child = (frameTree.childFrames ?? [])[0]
  if (child) {
    const context = events
      .filter((event) => event.method === 'Runtime.executionContextCreated')
      .map((event) => event.params.context)
      .reverse()
      .find((candidate) => candidate.auxData?.frameId === child.frame.id)
    if (context && child.frame.url.endsWith(documentFile))
      return send('Runtime.evaluate', { expression, returnByValue: true, contextId: context.id })
  }
  for (const candidate of attached) {
    if (candidate.targetInfo.type !== 'iframe') continue
    const url = await send(
      'Runtime.evaluate',
      { expression: 'location.href', returnByValue: true },
      candidate.sessionId
    )
      .then((result) => result.result?.value)
      .catch(() => null)
    if (typeof url === 'string' && url.endsWith(documentFile))
      return send('Runtime.evaluate', { expression, returnByValue: true }, candidate.sessionId)
  }
  return { result: { value: null } }
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

const surfaces = []
const evidence = []
for (const artifact of ARTIFACTS) {
  for (const theme of THEMES) {
    const url = `${pageUrl}#${artifact.kind}`
    await send('Page.navigate', { url })
    // The page selects a document from the hash and the appearance control, exactly as a visitor does.
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = await evaluate(
        `(function(){var s=document.querySelector('[data-sample-theme]');if(!s)return false;` +
          `if(s.value!==${JSON.stringify(theme)}){s.value=${JSON.stringify(theme)};` +
          `s.dispatchEvent(new Event('change'));}` +
          `var f=document.querySelector('.tracy-marketing__preview');` +
          `return !!f && f.src.indexOf(${JSON.stringify(`${artifact.kind}-${theme}.html`)})>-1;})()`
      )
      if (ready) break
      await sleep(250)
    }
    let fields
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await iframeEvaluate(
        `(function(){if(document.readyState!=='complete')return null;` +
          `if(!location.href.endsWith(${JSON.stringify(`${artifact.kind}-${theme}.html`)}))return null;` +
          `return JSON.stringify({url:location.href,fields:${EXTRACT_SOURCE}(document),` +
          `title:document.title,images:[].slice.call(document.images).map(function(i){` +
          `return {src:i.getAttribute('src'),alt:i.alt,loaded:i.complete&&i.naturalWidth>0};}),` +
          `links:[].slice.call(document.querySelectorAll('a')).map(function(a){return a.getAttribute('href');}),` +
          `forms:[].slice.call(document.querySelectorAll('form')).map(function(f){` +
          `return {action:f.getAttribute('action'),method:f.getAttribute('method')};}),` +
          `bg:getComputedStyle(document.body).backgroundColor,` +
          `fg:getComputedStyle(document.body).color,` +
          `chars:document.body.innerText.replace(/\\s+/g,' ').trim().length});})()`,
        `${artifact.kind}-${theme}.html`
      )
      if (result.result?.value) {
        const payload = JSON.parse(result.result.value)
        fields = payload
        break
      }
      await sleep(250)
    }
    if (!fields) throw new Error(`Could not read ${artifact.kind}-${theme} inside the iframe`)
    const id = surfaceId(artifact.kind, theme)
    surfaces.push({ id, fields: fields.fields })
    evidence.push({
      id,
      pageUrl: url,
      appearance: theme,
      documentUrl: fields.url,
      documentTitle: fields.title,
      selector: '.tracy-marketing__preview → [data-field], [data-field-href|src|alt]',
      capturedAt: new Date().toISOString(),
      bodyBackground: fields.bg,
      bodyColor: fields.fg,
      visibleCharacters: fields.chars,
      images: fields.images,
      linkTargets: [...new Set(fields.links)],
      forms: fields.forms
    })
    console.log(`read ${id}: ${Object.keys(fields.fields).length} fields, ${fields.chars} visible characters`)
  }
}

const manifest = await (await fetch(new URL('/media/tracy-marketing/manifest.json', pageUrl))).json()
writeFileSync(
  path.join(outDir, 'observed-content.json'),
  JSON.stringify(
    { contractId: manifest.contractId, contractHash: manifest.contractHash, surfaces },
    null,
    2
  ) + '\n'
)
writeFileSync(
  path.join(outDir, 'observed-evidence.json'),
  JSON.stringify({ pageUrl, contractHash: manifest.contractHash, surfaces: evidence }, null, 2) + '\n'
)
// The evidence is committed beside the plan, so it has to leave here in the repo's own format;
// otherwise the next `pnpm build:check` goes red on a file this script wrote.
spawnSync(
  'node',
  [
    new URL('../../../node_modules/@biomejs/biome/bin/biome', import.meta.url).pathname,
    'format',
    '--write',
    path.join(outDir, 'observed-content.json'),
    path.join(outDir, 'observed-evidence.json')
  ],
  { stdio: 'ignore' }
)
clearTimeout(timer)
console.log(
  `Wrote observed-content.json and observed-evidence.json for ${surfaces.length} surfaces in ${outDir}`
)
stop(0)
