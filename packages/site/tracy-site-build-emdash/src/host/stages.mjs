/**
 * The two stages of an EmDash build, as functions the shared engine runs in order:
 *
 *   check        the new site answers at its public address, and says which template it is.
 *   personalize  the customer's answers into the site, by the template's own tool in its container.
 *   shot    shared — a picture of the home page for the Build card.
 *
 * WHY ONLY TWO. The fleet restores an EmDash site from its quickstart — the packed template, the
 * scrubbed content, the media, every language it ships — so by the time this engine runs the site
 * is finished. There is no theme to install, no look to apply, no copy to write, no pages to lay
 * out; a stage named after any of those would report "done" for work that did not happen.
 *
 * 🔒 `check` DOES NOT GO THROUGH THE APPLY DOOR. The shared `checkStage` asks the site for
 * `core.manifest` through the seat door, which is answered by the Cowork extension installed in a
 * WordPress or Joomla site. EmDash has no such extension — its agent works through EmDash's own
 * API with a token minted at bootstrap — so that call could only fail. What CAN be observed from
 * here is the public site itself (HTTP) and, when the build's folder is the site folder, the
 * template identity the provision copied beside it (`template/artifact.json`).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { shotStage } from '@tracy/site-build-core/stages'
import { readDesign, recordingDesign, sendDesign, withDesignFact } from '@tracy/site-build-core/design-record'
import { detailOf } from '@tracy/site-build-core/host-messages'
import { EMDASH_MESSAGES } from '../messages.mjs'
import { recordTemplateLook } from './template-design.mjs'

/** The stage names, in order — each a key of `words/<lang>.json` and of core's `strings.ts`. */
export const STAGES = Object.freeze(['check', 'personalize', 'shot'])

/** How long `check` keeps asking a site that is still starting: 12 × 5 s, the bootstrap's own budget. */
const TRIES = 12
const PAUSE_MS = 5000

/**
 * What the provision wrote beside the site: the template's own manifest, or null when this build
 * runs somewhere the site folder is not (the creation workspace) or the copy is not there yet.
 * @param {string} root
 * @returns {{ id: string, label: string, version: string } | null}
 */
export function templateBeside(root) {
  const file = path.join(root, 'template', 'artifact.json')
  if (!existsSync(file)) return null
  try {
    return artifactIdentity(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * The identity an EmDash template's `artifact.json` states, or null.
 * @param {string} text
 * @returns {{ id: string, label: string, version: string } | null}
 */
export function artifactIdentity(text) {
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed?.templateId !== 'string') return null
    return {
      id: parsed.templateId,
      label: typeof parsed.label === 'string' ? parsed.label : parsed.templateId,
      version: typeof parsed.version === 'string' ? parsed.version : ''
    }
  } catch {
    return null
  }
}

/**
 * The template a site was made from: the copy the provision put beside the folder, else the one the
 * template's own code carries in the container (`/app/artifact.json`). A site created straight from
 * a quickstart has no copy beside it (Tracy SaaS, whose card is hidden, measured 30/09/2026).
 * @param {string} root
 * @param {(file: string) => Promise<string>} read a reader of the site container's files
 */
export async function templateOf(root, read) {
  const beside = templateBeside(root)
  if (beside !== null) return beside
  try {
    return artifactIdentity(await read('/app/artifact.json'))
  } catch {
    return null
  }
}

/**
 * The address a site's own container answers on the host's network, or null when the key does not
 * name one. The label is the first part of the site key (`granite.localhost` → `granite-web-1`).
 * @param {unknown} siteKey
 */
/** @param {unknown} siteKey */
export function containerAddress(siteKey) {
  const name = containerName(siteKey)
  return name === null ? null : `http://${name}:4321/`
}

/** The site's web container on this host, or null when the key does not name one.
 * @param {unknown} siteKey */
export function containerName(siteKey) {
  if (typeof siteKey !== 'string') return null
  const label = siteKey.split('.')[0]
  return /^[a-z0-9][a-z0-9-]*$/.test(label) ? `${label}-web-1` : null
}

/**
 * Model credentials and choices dsh may lend the tool for the copy — the seeder's own names, and
 * exactly the three `TRACY_SEED_*` names `/ops` pushes (`apps/tracy-web/src/lib/llm-push.js`).
 *
 * 🔒 THE PROVIDER AND THE PICTURE MODEL TRAVEL TOO. Until 25/09/2026 only the text model name did,
 * so a deployment that chose OpenRouter at `/ops` still had its EmDash copy written by whichever
 * key the tool found first — and the picture model chosen there never reached the tool at all.
 */
const MODEL_KEYS = [
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
  'TRACY_SEED_TEXT_PROVIDER',
  'TRACY_SEED_TEXT_MODEL',
  'TRACY_SEED_IMAGE_MODEL'
]

/**
 * Where a site provisioned since #155 keeps its agent token: a root-owned 0600 file bind-mounted
 * READ-ONLY at this path (`render-compose.sh`), outside the agent-writable `/app` and `/app/data`.
 * The same path `tracy-site-tools` reads for its MCP call (`AGENT_TOKEN_PATH` in its
 * `src/host/exec.mjs`; a test pins the two equal).
 */
export const PROTECTED_AGENT_TOKEN = '/run/tracy-agent.token'

/**
 * The command the personalize stage runs in the site's container: pick the agent token there, then
 * hand over to the template's own `tools/personalize.mjs` with every argument unchanged.
 *
 * 🔒 SINCE #155 THE TOKEN IS NOT WHERE personalize.mjs LOOKS BY DEFAULT, AND EVERY BUILD DIED ON IT.
 * The tool reads `data/tracy-agent.token` unless told otherwise — the file `bootstrap-site.sh`
 * writes. Provision now collects that file into the protected mount above and DELETES the `data/`
 * copy, so the agent's own www-data shell holds no readable PAT. The stage kept calling the tool
 * with its default, and every EmDash Business build on dev stopped at "Putting your details in"
 * with `no agent token at data/tracy-agent.token` (measured 24/09/2026, `ed-y1c5s1`). A site made
 * before #155 still has only the `data/` file until it is migrated, so the choice is made in the
 * container, by what is there — the protected mount first.
 *
 * `--token-file` is honoured by every personalize.mjs that has shipped (the flag is as old as the
 * tool), so this needs no template release. The script is a constant: the answers and every other
 * argument arrive as `"$@"`, never inside the shell text. It runs as the exec's default user, which
 * on the EmDash image is root — the only user that can read the 0600 mount, and the same user the
 * MCP call runs as.
 * @param {string} [protectedToken] only a test passes another path
 */
export function personalizeCommand(protectedToken = PROTECTED_AGENT_TOKEN) {
  return [
    'sh',
    '-c',
    `f=${protectedToken}; [ -s "$f" ] || f=data/tracy-agent.token; exec node tools/personalize.mjs --token-file "$f" "$@"`,
    'personalize'
  ]
}

/**
 * The model credentials to lend the tool: dsh's own environment first, then dsh's credential file.
 *
 * 🔒 THE FALLBACK IS WHY A KEY CAN BE ROTATED WITHOUT A DEPLOY. `personalize.mjs` runs inside the
 * CUSTOMER's container and sees only what this file passes with `-e`. Reading dsh's `process.env`
 * alone was fine while `MODEL_API_KEY` was baked into the container — but that is exactly the
 * value a deployment must stop setting for `/ops` to be able to change the key at all
 * (`credentials-local` treats an inherited non-empty value as authoritative AND read-only). Without
 * this fallback, turning that env var off would leave this stage silently key-less and a
 * customer's site would get its words from nowhere.
 *
 * Same file, same `refs:` block, same names the seeder's own `keysFromCredentials` reads — one
 * place a key is written (`/_host/model-keys`), three readers.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(path: string) => string} readText - injected so this is testable without a filesystem.
 * @returns {Record<string, string>}
 */
export function modelEnvFrom(env, readText) {
  const out = {}
  for (const key of MODEL_KEYS) {
    const value = env[key]
    if (typeof value === 'string' && value !== '') out[key] = value
  }
  if (MODEL_KEYS.every((key) => key in out)) return out
  let fromFile = {}
  try {
    const home = env.DSH_HOME ?? (env.HOME ? `${env.HOME}/.dsh` : null)
    if (!home) return out
    const refs = /^refs:\s*\n((?:[ \t]+\S.*\n?)*)/m.exec(readText(`${home}/.credentials.yaml`))
    if (refs) {
      for (const line of refs[1].split('\n')) {
        const m = /^[ \t]+([A-Z][A-Z0-9_]*):[ \t]*(.+?)[ \t]*$/.exec(line)
        if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // No file, unreadable, or malformed: the environment's answer stands. A missing credential
    // store is the ordinary case on a developer's machine.
    fromFile = {}
  }
  for (const key of MODEL_KEYS) {
    // An empty value must never become an `-e KEY=`: the tool would read it as configured and send
    // an empty bearer token instead of falling through to its own next door.
    if (!(key in out) && typeof fromFile[key] === 'string' && fromFile[key] !== '') out[key] = fromFile[key]
  }
  return out
}

/**
 * The docker command as dsh runs it: through the proxy `TRACY_DOCKER_HOST` names when there is
 * one (the fleet), straight at the socket otherwise (a developer's machine).
 * @param {Record<string, string | undefined>} env @param {string[]} argv
 * @returns {[string, string[]]}
 */
export function dockerCommand(env, argv) {
  const dockerHost = env.TRACY_DOCKER_HOST
  return dockerHost ? ['env', [`DOCKER_HOST=${dockerHost}`, 'docker', ...argv]] : ['docker', argv]
}

/**
 * @param {import('@tracy/site-build-core/host').StageDeps} deps
 * @returns {Record<string, import('@tracy/site-build-core/host').StageFn>}
 */
export function makeStages(deps) {
  const { root, run, chrome } = deps
  const get = /** @type {typeof fetch} */ (deps.get ?? fetch)
  const env = /** @type {Record<string, string | undefined>} */ (deps.env ?? process.env)
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  /** @type {import('@tracy/site-build-core/host').StageFn} */
  const check = async (job) => {
    const url = job.targetUrl
    if (typeof url !== 'string' || url === '')
      return {
        status: 'failed',
        ...detailOf('E_NO_ADDRESS', {}, EMDASH_MESSAGES)
      }
    // 🔒 A DRAFT SITE IS PRIVATE, AND THIS STAGE ASKS AS NOBODY. tracy-web answers a stranger's
    // GET on an unpublished site with 403 "Private copy" (`bar/route.js`, the guest gate), and
    // that is right — but it made every fresh EmDash build sit at `check` for the whole budget
    // and fail on "HTTP 403" while the site stood fine (measured 15/09 on the local stand). On a
    // 403 the site itself is asked on the host's own network, by the name every site container
    // carries there (`<label>-web-1`, EmDash on 4321 — the same address `siteTarget` uses); the
    // detail still names the public address, which is what the customer opens.
    const inside = containerAddress(job.targetSiteKey)
    let last = 'no answer'
    for (let attempt = 1; attempt <= TRIES; attempt += 1) {
      /** @type {Response | null} */
      let response = null
      try {
        response = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
      } catch (error) {
        last = error instanceof Error ? error.message : String(error)
      }
      // 🔒 REACHABLE FROM A BROWSER IS NOT REACHABLE FROM HERE, AND THE PUBLIC ADDRESS REFUSING
      // THE CONNECTION IS NOT THE SITE BEING DOWN. The address a customer opens carries the port
      // their browser reaches Tracy on; on a local stand that is a port published on the host
      // (51710), which does not exist inside the Docker network this runs in. Measured 20/09 on
      // site-h330yd: `http://<label>.tracy.test:51710/` answered ECONNREFUSED in 39ms from dsh
      // while `http://<label>-web-1:4321/` answered 200 in 63ms — the site was serving the whole
      // time. The stage failed anyway, so `personalize` never ran and the customer opened a site
      // still wearing the template's demo brand. Same shape as the 403 below (a private draft),
      // so it takes the same road: ask the site's own container, by the name every site carries
      // on the host's network. The detail still names the public address, which is what the
      // customer opens.
      if ((response === null || response.status === 403) && inside !== null) {
        try {
          response = await get(inside, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
        } catch (error) {
          last = error instanceof Error ? error.message : String(error)
        }
      }
      if (response !== null) {
        const body = await response.text()
        if (response.status === 200) {
          // EmDash tags every page it serves; a 200 from something else (a placeholder, a proxy
          // page) is not the site.
          const emdash =
            /<meta[^>]+name="generator"[^>]+content="EmDash/i.test(body) || /_emdash\//.test(body)
          if (!emdash) return { status: 'failed', ...detailOf('E_NOT_EMDASH', { url }, EMDASH_MESSAGES) }
          const template = templateBeside(root)
          return {
            status: 'done',
            detail: template
              ? `${url} · ${template.label} ${template.version}`.trim()
              : `${url} · EmDash answers; the template manifest is not beside this build`
          }
        }
        // A site that is still starting answers 502/503 from the proxy, or redirects to setup.
        last = `HTTP ${response.status}`
      }
      if (attempt < TRIES) await wait(PAUSE_MS)
    }
    return { status: 'failed', ...detailOf('E_NO_ANSWER', { url, reason: last }, EMDASH_MESSAGES) }
  }

  /**
   * The customer's answers into the site: `tools/personalize.mjs`, which the template ships and
   * runs INSIDE the site's own container (ADR 0014: a site is worked on from its container) — it
   * holds the map, the seed and the agent token; dsh holds the docker socket and the model key,
   * which travel as `-e` flags the way tracy-subprocess-docker passes them. Exit 3 is "done, some
   * copy skipped" (no model, or a line the model could not write): the stage is done and says so.
   * Exit 4 is "some writes FAILED" — the tool wrote what it could and lists the rest in
   * `report.errors` — and the stage is failed and says which, even when other fields were written.
   * @type {import('@tracy/site-build-core/host').StageFn}
   */
  const personalize = async (job) => {
    const container = containerName(job.targetSiteKey)
    if (container === null) return { status: 'skipped', detail: 'This build names no site.' }
    const answers = job.answers && typeof job.answers === 'object' ? job.answers : {}
    if (Object.keys(answers).length === 0) return { status: 'skipped', detail: 'no answers to put in' }
    // dsh's environment first, then dsh's credential file — see `modelEnvFrom`.
    const lent = modelEnvFrom(env, (path) => readFileSync(path, 'utf8'))
    const pass = Object.entries(lent).flatMap(([k, v]) => ['-e', `${k}=${v}`])
    const argv = [
      'exec',
      '-i',
      ...pass,
      container,
      ...personalizeCommand(),
      '--answers-json',
      JSON.stringify(answers),
      '--json'
    ]
    const r = await run(...dockerCommand(env, argv))
    if (r.stderr.trim().endsWith('not found') && r.code === 127)
      return {
        status: 'failed',
        ...detailOf('E_NO_DOCKER', {}, EMDASH_MESSAGES)
      }
    // 🔒 A TEMPLATE WITHOUT THE TOOL IS NOT A CUSTOMER WITHOUT THEIR WORDS. Two lines of EmDash
    // template reach the fleet: the ones written in this repo (`tracy-base`, `tracy-business`)
    // ship `tools/personalize.mjs`, and the ones packed by the EmDash template skill do not —
    // its kit has no such tool and its guide never asks for one (measured 19/09 on the released
    // `tracy-saas` quickstart: zero files matching `personalize`). The customer answered the
    // questionnaire either way, because a release with no `tracy_site_question.json` falls back
    // to the Build plugin's own set. So this used to end with the answers thrown away and the
    // agent reading "this template ships no personalize tool" back to someone who had just typed
    // their business name.
    //
    // It is not the end of the road: every EmDash site publishes its own MCP server, and the
    // agent in the chat holds it (`tracy_emdash`, 59 tools on 0.37). The stage hands the work
    // over instead of dropping it — `code` is what the build notification keys on to say so, and
    // the sentence is the next step for whoever reads the stage.
    if (/Cannot find module .*personalize\.mjs/.test(r.stderr))
      return {
        status: 'skipped',
        code: 'PERSONALIZE_BY_AGENT',
        detail:
          "this template ships no personalize tool; the agent writes the customer's words in with tracy_emdash, from this build's answers"
      }
    let report = null
    try {
      report = JSON.parse(r.stdout.trim().split('\n').pop() ?? '')
    } catch {
      // no report: the code decides
    }
    // 🔒 THE REPORT DECIDES, NOT THE EXIT CODE ALONE. 0 · 3 · 4 all come with a report on the last
    // stdout line (since the kit's 25/09 report contract); anything else is the tool itself
    // dying, and the excerpt is the only thing that says why.
    if (r.code !== 0 && r.code !== 3 && r.code !== 4) {
      // The tool narrates its progress on stderr (`pictures 3 of 6`); the failure excerpt wants
      // the error, not the count that preceded it.
      const said = r.stderr
        .split('\n')
        .filter((line) => !/^(words|entries|pictures) \d+ of \d+$/.test(line.trim()))
        .join('\n')
      return {
        status: 'failed',
        detail: `personalize failed (exit ${String(r.code)}): ${(said || r.stdout).trim().slice(-300)}`
      }
    }
    if (!report) {
      // Exit 4 with no report to read is a failure with no witness: say so rather than "done".
      if (r.code === 4)
        return {
          status: 'failed',
          detail: `personalize reported failed writes (exit 4) but printed no report: ${r.stderr.trim().slice(-300)}`
        }
      return { status: 'done', detail: `personalize exit ${String(r.code)}` }
    }
    return readPersonalizeReport(report)
  }

  return {
    // A done check leaves `docs/agents/design.json` behind (ADR 0023): on EmDash the template's
    // own look, named and with the values its `src/styles/tokens.css` holds, read from the site.
    // Only `lookRecording` sends it to tracy-web — the named look, once: sending the unnamed
    // `template` record first would let a site that cannot be read overwrite the original.
    check: lookRecording(deps, recordingDesign({ ...deps, putDesign: undefined }, check)),
    personalize,
    shot: shotStage({ root, run, chrome, get })
  }
}

/**
 * A reader of the site's own files, through its container: `docker exec <label>-web-1 cat <file>`.
 * @param {string | undefined} siteKey
 * @param {Pick<import('@tracy/site-build-core/host').StageDeps, 'run' | 'env'>} deps
 * @returns {(file: string) => Promise<string>}
 */
export function siteFileReader(siteKey, deps) {
  const env = /** @type {Record<string, string | undefined>} */ (deps.env ?? process.env)
  return async (file) => {
    const container = containerName(siteKey)
    if (container === null) throw new Error('This build names no site.')
    const r = await deps.run(...dockerCommand(env, ['exec', container, 'cat', file]))
    if (r.code !== 0) throw new Error(`cat ${file}: exit ${String(r.code)}`)
    return r.stdout
  }
}

/**
 * The site's home page as its own process serves it, read inside its container (the address the
 * public sees may be a private draft or a port that does not exist here — see `check`).
 * @param {string | undefined} siteKey
 * @param {Pick<import('@tracy/site-build-core/host').StageDeps, 'run' | 'env'>} deps
 * @returns {() => Promise<string>}
 */
export function siteHomeReader(siteKey, deps) {
  const env = /** @type {Record<string, string | undefined>} */ (deps.env ?? process.env)
  return async () => {
    const container = containerName(siteKey)
    if (container === null) throw new Error('This build names no site.')
    const script =
      "fetch('http://127.0.0.1:4321/').then((r) => r.text()).then((t) => process.stdout.write(t.slice(0, 20000)))"
    const r = await deps.run(...dockerCommand(env, ['exec', container, 'node', '-e', script]))
    if (r.code !== 0) throw new Error(`home page: exit ${String(r.code)}`)
    return r.stdout
  }
}

/**
 * Wraps a stage that records the design: once it is done, the template's own look is named and
 * given its values from the site (`recordTemplateLook`), and that record goes to tracy-web
 * (`sendDesign`), which keeps a quickstart's tokens as sent: it has no other copy of them (ADR 0023,
 * "Addendum 29/09 (afternoon)"). When a template is beside the build but its look cannot be read, the
 * folder's unnamed `template` record is not sent: it would replace the one tracy-web holds from an
 * earlier build with nothing. With no template beside it, that record is the answer and is sent.
 * Never changes the stage's answer.
 * @param {import('@tracy/site-build-core/host').StageDeps} deps
 * @param {import('@tracy/site-build-core/host').StageFn} stage
 * @returns {import('@tracy/site-build-core/host').StageFn}
 */
export function lookRecording(deps, stage) {
  return async (job) => {
    const answer = await stage(job)
    if (answer.status !== 'done') return answer
    const warn = deps.warn ?? console.warn
    const template = await templateOf(deps.root, siteFileReader(job.targetSiteKey, deps))
    let named = null
    try {
      named = await recordTemplateLook(deps.root, {
        template,
        read: siteFileReader(job.targetSiteKey, deps),
        home: siteHomeReader(job.targetSiteKey, deps),
        wroteBy: `build:${job.job ?? '?'}`
      })
    } catch (error) {
      // `recordTemplateLook` catches its own I/O, so what lands here is a wiring fault: say so.
      warn(
        `[site-design] template look not recorded: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    const folder = readDesign(deps.root)
    // No template beside the build: the folder's record (the template's look, unnamed) is the whole
    // answer and is sent. A template that is there but whose look could not be read is a failed read,
    // not an answer: its unnamed record is kept local.
    const record = named ?? (template === null || folder?.source !== 'template' ? folder : null)
    if (record === null) {
      warn(
        `[site-design] template look not read; the unnamed record was not sent ${String(job.targetSiteKey ?? '')}`
      )
      return answer
    }
    const notSent = await sendDesign(deps.putDesign, job.targetSiteKey, record, deps.warn)
    return notSent === null ? answer : withDesignFact(answer, notSent)
  }
}

/** @param {unknown} x */
const list = (x) => (Array.isArray(x) ? x : [])
/** A `rule: why` pair as the report lists one, for the stage's sentence. */
const named = (/** @type {{rule?: unknown, why?: unknown}} */ x) =>
  `${typeof x?.rule === 'string' ? x.rule : '?'}${typeof x?.why === 'string' && x.why !== '' ? `: ${x.why}` : ''}`

/**
 * The stage's verdict on the tool's report — the three things the report keeps apart, kept apart
 * here too (the kit's report contract, 25/09/2026):
 *
 *   errors      writes that FAILED (409, 5xx, network) → the stage is `failed`, naming the first
 *               three, even when other fields were written. Before this the stage read only the
 *               `language` row of a `skipped` list that mixed all three meanings, and a build whose
 *               every write was refused ended `done · 0 fields`.
 *   unanswered  facts the customer did not give → still `done`; the sentence says how many slots
 *               wait for an answer, so the customer is asked rather than the demo value kept quietly.
 *   skipped     legitimate skips (a redraw-only run, a slot an editor changed by hand) → `done`.
 *
 * `generated` are values the model invented to fit the customer; the sentence counts them so the
 * customer knows which words to replace. `model` names what actually wrote the copy and drew the
 * pictures — the `/ops` choice, verified rather than assumed.
 * @param {Record<string, any>} report
 * @returns {{ status: 'done' | 'failed', detail: string, facts?: { generated: number, model?: string } }}
 */
export function readPersonalizeReport(report) {
  // The same answers, map, template and model as the pass the site holds: nothing was written, on
  // purpose. Said as such — "0 fields on 0 entries" read as a pass that failed quietly.
  if (typeof report.repeatOf === 'string' && report.repeatOf !== '')
    return {
      status: 'done',
      detail: `nothing new to write: the same answers and model as ${report.repeatOf}, which the site already holds`
    }
  const written = list(report.written)
  const fields = written.reduce(
    (/** @type {number} */ n, /** @type {{fields?: unknown[]}} */ w) => n + (w.fields?.length ?? 0),
    0
  )
  const parts = [`${String(fields)} fields on ${String(written.length)} entries`]
  const model = report.model && typeof report.model === 'object' ? report.model : null
  if (model && typeof model.text === 'string' && model.text !== '')
    parts.push(
      `by ${typeof model.provider === 'string' && model.provider !== '' ? `${model.provider}/` : ''}${model.text}`
    )
  if (report.editor?.length) parts.push(`${String(report.editor.length)} left to an editor`)
  if (report.copy)
    parts.push(
      `copy ${String(list(report.copy.done).length)} written, ${String(list(report.copy.skipped).length)} skipped`
    )
  if (report.pictures) {
    // The report carries `done` as a count and `skipped` as a list (measured 15/09: a length
    // read on the count said 0 pictures on a site whose hero had just been drawn).
    const count = (/** @type {unknown} */ x) => (typeof x === 'number' ? x : Array.isArray(x) ? x.length : 0)
    const drawn = count(report.pictures.done)
    const missed = count(report.pictures.skipped)
    if (drawn > 0 || missed > 0)
      parts.push(`${String(drawn)} pictures drawn${missed > 0 ? `, ${String(missed)} not` : ''}`)
  }
  // Demo rows taken off the site (`trim`): the customer should know the news list is short on
  // purpose, not broken.
  const trimmed = list(report.trimmed)
  if (trimmed.length > 0) parts.push(`${String(trimmed.length)} demo row(s) taken off the site`)
  const generated = list(report.generated)
  const generatedCount = generated.reduce(
    (/** @type {number} */ n, /** @type {{fields?: unknown[]}} */ g) => n + (g.fields?.length ?? 0),
    0
  )
  if (generatedCount > 0)
    parts.push(`${String(generatedCount)} value(s) written by Tracy, replace with yours`)
  // The languages the site now serves and how many it hides — the Joomla language stage says
  // "N other language(s) hidden" the same way (PR #267). A template tool older than the report's
  // `language` block says nothing here rather than something invented.
  const language = report.language
  if (Array.isArray(language?.write) && language.write.length > 0) {
    const hidden = Array.isArray(language.hidden) ? language.hidden.length : 0
    parts.push(
      `languages ${language.write.join(', ')}${hidden > 0 ? ` · ${String(hidden)} other language(s) hidden` : ''}`
    )
  }
  const languageWhy = list(report.skipped).find(
    (/** @type {{rule?: string}} */ x) => x?.rule === 'language'
  )?.why
  if (typeof languageWhy === 'string' && languageWhy !== '') parts.push(languageWhy)
  const unanswered = list(report.unanswered)
  if (unanswered.length > 0)
    parts.push(
      `${String(unanswered.length)} slot(s) wait for an answer (${unanswered
        .slice(0, 3)
        .map((/** @type {{rule?: unknown}} */ x) => (typeof x?.rule === 'string' ? x.rule : '?'))
        .join(', ')}${unanswered.length > 3 ? ', …' : ''})`
    )
  const why = report.copy?.skipped?.[0]?.why
  const done = `${parts.join(' · ')}${why && list(report.copy?.done).length === 0 ? ` (${why})` : ''}`
  const errors = list(report.errors)
  if (errors.length > 0)
    return {
      status: 'failed',
      detail: `failed ${String(errors.length)} write(s): ${errors.slice(0, 3).map(named).join('; ')}${errors.length > 3 ? '; …' : ''} · ${done}`
    }
  // What the card says in the customer's language: how many values Tracy invented, and which model.
  const facts = {
    generated: generatedCount,
    ...(model && typeof model.text === 'string' && model.text !== ''
      ? {
          model: `${typeof model.provider === 'string' && model.provider !== '' ? `${model.provider}/` : ''}${model.text}`
        }
      : {})
  }
  return { status: 'done', detail: done, facts }
}
