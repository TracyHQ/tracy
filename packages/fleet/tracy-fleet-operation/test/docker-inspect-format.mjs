/**
 * A `docker inspect --format` stand-in for the fleet-operation fakes: it RENDERS the format the
 * script actually sent against an inspect object, instead of returning canned lines whatever the
 * format says. That is what lets a test catch a template Docker itself would refuse.
 *
 * It models the STRICTEST client the scripts meet: the Docker CLI 27.5.1 inside tracy-host, which is
 * where `--via-host` runs the EmDash inventory/migration and where the DNS-alias migration runs
 * (server 29.8.0). Measured on dev (24/09/2026) for a container with no healthcheck — `.State` then
 * has no `Health` key — with that 27.5.1 client:
 *   {{json .State.Health}}                                          → fails
 *   {{if .State.Health}}{{json .State.Health}}{{else}}null{{end}}   → fails too (the #306 template)
 *     template parsing error: ... at <.State.Health>: map has no entry for key "Health"
 *   {{json (index .State "Health")}}                                → null
 * and with a healthcheck, the `index` form prints the Health object. The host's own CLI 29.8 also
 * prints null for the `index` form; it tolerates the `if` form, which is why #306 looked fixed there.
 *
 * So here a FIELD access to a missing map key fails the whole inspect, wherever it appears (inside
 * `if`/`with` included), and `index` of a missing key yields null. Only the small subset of Go
 * template syntax the scripts use is understood: `{{PIPE}}`, `{{if PIPE}}`, `{{with PIPE}}`,
 * `{{else}}`, `{{end}}`, where PIPE is `json ARG` or ARG, and ARG is `.`, a field chain `.A.B`
 * (relative to dot), or `(index ARG "Key")`. Anything else throws a plain Error — a new template
 * shape has to be taught here rather than silently passing.
 */

class DockerTemplateError extends Error {}

const ACTION = /\{\{(.*?)\}\}/gs

/** Split a format into literal text and `{{…}}` actions. */
function tokenize(format) {
  const tokens = []
  let last = 0
  for (const m of format.matchAll(ACTION)) {
    if (m.index > last) tokens.push({ text: format.slice(last, m.index) })
    tokens.push({ action: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < format.length) tokens.push({ text: format.slice(last) })
  return tokens
}

/** Parse tokens into a tree of text, output, if and with nodes. */
function parse(tokens) {
  let i = 0
  const block = (terminators) => {
    const nodes = []
    while (i < tokens.length) {
      const t = tokens[i]
      if (t.text !== undefined) {
        nodes.push({ text: t.text })
        i += 1
        continue
      }
      if (terminators.includes(t.action)) return nodes
      i += 1
      const control = /^(if|with) (.+)$/.exec(t.action)
      if (control) {
        const body = block(['else', 'end'])
        let otherwise = []
        if (tokens[i]?.action === 'else') {
          i += 1
          otherwise = block(['end'])
        }
        if (tokens[i]?.action !== 'end') throw new Error(`unterminated {{${control[1]}}}`)
        i += 1
        nodes.push({ kind: control[1], pipe: control[2], body, otherwise })
        continue
      }
      if (t.action === 'else' || t.action === 'end') throw new Error(`unexpected {{${t.action}}}`)
      nodes.push({ pipe: t.action })
    }
    if (terminators.length) throw new Error(`missing {{${terminators.at(-1)}}}`)
    return nodes
  }
  return block([])
}

/** Resolve a field chain like `.State.Health` against `dot`, failing on a missing key like Docker 27.x. */
function field(dot, chain) {
  if (chain === '.') return dot
  let cur = dot
  for (const key of chain.slice(1).split('.')) {
    if (cur === null || cur === undefined)
      throw new DockerTemplateError(`at <${chain}>: nil pointer evaluating interface {}.${key}`)
    if (typeof cur !== 'object' || !Object.hasOwn(cur, key))
      throw new DockerTemplateError(`at <${chain}>: map has no entry for key "${key}"`)
    cur = cur[key]
  }
  return cur
}

function evalArg(arg, dot) {
  const s = arg.trim()
  const index = /^\(index (\S+) "([A-Za-z]+)"\)$/.exec(s)
  if (index) {
    const base = evalArg(index[1], dot)
    if (base === null || base === undefined || typeof base !== 'object')
      throw new DockerTemplateError(`error calling index: index of untyped nil`)
    return Object.hasOwn(base, index[2]) ? base[index[2]] : null
  }
  if (/^\.(?:[A-Za-z]+(?:\.[A-Za-z]+)*)?$/.test(s)) return field(dot, s)
  throw new Error(`unsupported template argument: ${s}`)
}

/** Evaluate a pipeline: `json ARG` returns JSON text; a bare ARG returns the value itself. */
function evalPipe(pipe, dot) {
  const json = /^json (.+)$/.exec(pipe)
  if (json) return { json: JSON.stringify(evalArg(json[1], dot) ?? null) }
  return { value: evalArg(pipe, dot) }
}

const truthy = (v) =>
  !(
    v === null ||
    v === undefined ||
    v === false ||
    v === 0 ||
    v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  )

function print(r) {
  if (r.json !== undefined) return r.json
  const v = r.value
  if (v === null || v === undefined) return '<no value>'
  if (typeof v === 'object') throw new Error('printing a map without json is not modelled')
  return String(v)
}

function render(nodes, dot) {
  let out = ''
  for (const n of nodes) {
    if (n.text !== undefined) out += n.text
    else if (n.kind === 'if' || n.kind === 'with') {
      const r = evalPipe(n.pipe, dot)
      const v = r.json !== undefined ? r.json : r.value
      if (truthy(v)) out += render(n.body, n.kind === 'with' ? v : dot)
      else out += render(n.otherwise, dot)
    } else out += print(evalPipe(n.pipe, dot))
  }
  return out
}

/**
 * Render `format` against `inspect`, the object shape `docker inspect` prints. Returns the docker
 * CLI result: stdout on success, exit 1 + the template error on stderr.
 */
export function renderInspectFormat(format, inspect) {
  const tree = parse(tokenize(String(format)))
  try {
    return { code: 0, stdout: render(tree, inspect) + '\n', stderr: '', timedOut: false }
  } catch (e) {
    if (!(e instanceof DockerTemplateError)) throw e
    return {
      code: 1,
      stdout: '',
      stderr: `template parsing error: template: :1: executing "" ${e.message}\n`,
      timedOut: false
    }
  }
}
