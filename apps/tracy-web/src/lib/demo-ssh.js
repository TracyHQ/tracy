/**
 * The one way this process reaches JoomlArt's demo server, and it can ask exactly two questions.
 *
 * ⚠ WHY A THIRD DEPENDENCY IS HERE AT ALL. `apps/tracy-web` ships with `hono`, `@hono/node-server`
 * and `pg` — three, deliberately — and its image is `node:24-slim` with no `ssh` binary. `ssh2` is
 * the fourth, and it buys one thing: a deployment can ask `demo.joomlart.com` what it actually
 * serves, instead of drawing 70 addresses it has never checked. Keep the surface this small; if a
 * future need wants a shell, the answer is a new verb in the forced command, not a wider client.
 *
 * 🔒 THE FAR SIDE IS A FORCED COMMAND, AND THAT IS THE WHOLE SECURITY MODEL. The key Tracy holds
 * carries `command="/usr/local/bin/tracy-demo-provision"` with no pty and no forwarding, so the
 * string sent here is an ARGUMENT to that script and never a command on that machine. Nothing in
 * this file may be allowed to imply otherwise: the commands below are literals, and the only
 * variable part is a demo name the script checks again on arrival.
 *
 * ⚠ IT IS SLOW, AND THE SCREEN MUST NOT WAIT FOR IT. Measured 16/09 against the live machine: a
 * `list` is ~3.3s and a `status` ~4.6s (its `du` walks a 224 MB tree). Seventy rows asked one at a
 * time would be five minutes, so the listing asks `list` ONCE for the whole page — and even that
 * is a door of its own, called after the table is already drawn.
 */
import { Client } from 'ssh2'

/** A demo name, checked here as well as on arrival — a caller is not a reason to skip a check. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

/** Long enough for `status` on the biggest demo measured (1.2 GB), short enough to fail a page. */
const TIMEOUT_MS = 20_000

/**
 * Run one of the forced command's verbs and hand back its lines.
 *
 * Refusals from the far side arrive on stderr with a non-zero code; they are ANSWERS, not
 * transport failures, and are returned as such — a screen that cannot tell "this key may not do
 * that" from "the machine is unreachable" will report the wrong thing to the wrong person.
 *
 * @param {{host: string, port: number, user: string, privateKey: string}} ssh
 * @param {string} command one of `list`, `status <slug>`
 * @returns {Promise<{ok: true, lines: string[]} | {ok: false, refused: boolean, error: string}>}
 */
export function askDemoServer(ssh, command) {
  return new Promise((resolve) => {
    const client = new Client()
    let out = ''
    let err = ''
    let settled = false
    const finish = (answer) => {
      if (settled) return
      settled = true
      client.end()
      resolve(answer)
    }
    const timer = setTimeout(
      () => finish({ ok: false, refused: false, error: `no answer in ${TIMEOUT_MS / 1000}s` }),
      TIMEOUT_MS
    )
    client
      .on('ready', () => {
        client.exec(command, (error, stream) => {
          if (error) return finish({ ok: false, refused: false, error: error.message })
          stream
            .on('close', (code) => {
              clearTimeout(timer)
              if (code === 0)
                return finish({
                  ok: true,
                  lines: out
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                })
              finish({ ok: false, refused: true, error: err.trim() || `exited ${String(code)}` })
            })
            .on('data', (chunk) => {
              out += String(chunk)
            })
            .stderr.on('data', (chunk) => {
              err += String(chunk)
            })
        })
      })
      .on('error', (error) => {
        clearTimeout(timer)
        finish({ ok: false, refused: false, error: error.message })
      })
      .connect({
        host: ssh.host,
        port: ssh.port,
        username: ssh.user,
        privateKey: ssh.privateKey,
        readyTimeout: TIMEOUT_MS
      })
  })
}

/**
 * Every demo name that server actually serves, as a Set.
 *
 * One round trip for a whole page. A failure is `null` rather than an empty Set: "this machine did
 * not answer" and "this machine serves nothing" would draw the same 70 rows as missing, and only
 * one of those two is a reason to go and look at the server.
 */
export async function demoNamesOn(ssh) {
  const answer = await askDemoServer(ssh, 'list')
  if (!answer.ok) return { names: null, error: answer.error }
  return { names: new Set(answer.lines.filter((l) => SLUG.test(l))), error: null }
}

/**
 * What that server says about one demo: `present <slug> <url> <size>MB <touched> joomla=<version>`
 * or `absent <slug>`. Parsed positionally because the script writes it positionally — the two are
 * one contract, and the script is in this repo (`packages/fleet/.../joomlart-demo/`).
 */
export async function demoStatusOn(ssh, slug) {
  if (!SLUG.test(slug)) return { error: 'INVALID_LABEL' }
  const answer = await askDemoServer(ssh, `status ${slug}`)
  if (!answer.ok) return { error: answer.refused ? answer.error : `unreachable: ${answer.error}` }
  const [state, name, url, size, touched, joomla] = (answer.lines[0] ?? '').split(/\s+/)
  if (state === 'absent') return { present: false, slug: name ?? slug }
  if (state !== 'present') return { error: `unreadable answer: ${answer.lines[0] ?? '(nothing)'}` }
  return {
    present: true,
    slug: name,
    url: url ?? null,
    megabytes: Number.parseInt(size ?? '', 10) || null,
    touchedAt: touched ?? null,
    cms: joomla?.startsWith('joomla=') ? joomla.slice('joomla='.length) : null
  }
}

/**
 * Build a demo on that server from a quickstart package.
 *
 * 🔒 THE PACKAGE GOES UP STDIN, AND THAT IS THE POINT. Tracy holds the App key that reads
 * `ja-products`; that machine holds none and gains none. The forced command takes a NAME and a
 * byte stream — never a URL, never a token. A verb that fetched a URL would turn this key into a
 * way to make somebody else's production server dial anywhere.
 *
 * ⚠ MINUTES, NOT SECONDS. Measured 16/09 building `ja-kinetic` there: 77 MB up, unzip, a database,
 * Joomla's own CLI installer, an nginx block. No HTTP request should be held open for it — the
 * caller runs this behind a job and polls.
 *
 * Progress arrives as `step …` lines the script prints as it goes; they are handed to `onStep` so
 * the screen can say which of the six things is happening rather than spinning on "installing".
 *
 * @param {{host: string, port: number, user: string, privateKey: string}} ssh
 * @param {{slug: string, bannerUrl?: string|null, zip: Buffer, onStep?: (step: string) => void}} what
 */
export function installDemoOn(ssh, { slug, bannerUrl = null, zip, replace = false, onStep = () => {} }) {
  if (!SLUG.test(slug)) return Promise.resolve({ ok: false, error: 'INVALID_LABEL' })
  // 🔒 TWO WORDS, NOT A FLAG. The far side spells replacing differently from installing, so no
  // malformed argument can turn one into the other — and the destructive one is the one a person
  // had to ask for by name. `replace` keeps the old webroot and its database on that server.
  const verb = replace ? 'replace' : 'install'
  const command = bannerUrl ? `${verb} ${slug} ${bannerUrl}` : `${verb} ${slug}`
  return new Promise((resolve) => {
    const client = new Client()
    let out = ''
    let err = ''
    let settled = false
    const finish = (answer) => {
      if (settled) return
      settled = true
      client.end()
      resolve(answer)
    }
    client
      .on('ready', () => {
        client.exec(command, (error, stream) => {
          if (error) return finish({ ok: false, error: error.message })
          stream
            .on('close', (code) => {
              if (code === 0) {
                const line = out.split('\n').find((l) => l.startsWith('installed ')) ?? ''
                return finish({ ok: true, line: line.trim(), steps: out })
              }
              finish({
                ok: false,
                error: (err.trim() || out.trim() || `exited ${String(code)}`).slice(0, 2000)
              })
            })
            .on('data', (chunk) => {
              out += String(chunk)
              // Lines arrive whole from a shell writing with `echo`; a partial one simply reports
              // on the next chunk, which is harmless for a progress label.
              for (const line of String(chunk).split('\n'))
                if (line.startsWith('step ')) onStep(line.slice('step '.length).trim())
            })
            .stderr.on('data', (chunk) => {
              err += String(chunk)
            })
          stream.end(zip)
        })
      })
      .on('error', (error) => finish({ ok: false, error: `unreachable: ${error.message}` }))
      .connect({
        host: ssh.host,
        port: ssh.port,
        username: ssh.user,
        privateKey: ssh.privateKey,
        readyTimeout: TIMEOUT_MS
      })
  })
}
