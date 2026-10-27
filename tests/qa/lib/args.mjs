// Strict argument parsing: unknown, duplicate, missing-value and malformed arguments are errors.

export const KNOWN_LAYERS = [
  'static',
  'unit',
  'api',
  'infra',
  'ui',
  'flows',
  'harness',
  'cms',
  'mail',
  'related'
]
export const TARGETS = ['local', 'dev', 'prod']
export const LAYER_NAME = /^[a-z][a-z0-9-]{0,31}$/
export const STAND_ID = /^[a-z0-9][a-z0-9-]{0,23}$/
const REF = /^[A-Za-z0-9_][A-Za-z0-9._/@^~{}:+-]{0,255}$/

export class UsageError extends Error {}

const LAYER_FLAGS = {
  '--area': 'value',
  '--target': 'value',
  '--prove-red': 'bool',
  '--out': 'value',
  '--timeout-ms': 'value'
}
const FLAGS = {
  layer: LAYER_FLAGS,
  all: LAYER_FLAGS,
  affected: { ...LAYER_FLAGS, '--base': 'value', '--head': 'value', '--run': 'bool' },
  coverage: { '--layer': 'value', '--runs': 'value', '--require-complete': 'bool', '--json': 'bool' },
  stand: { '--id': 'value', '--project': 'value', '-v': 'bool', '--dry-run': 'bool', '--out': 'value' },
  inventory: null
}

export function parseArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) throw new UsageError('missing command')
  const [first, ...rest] = argv
  if (first.startsWith('-')) throw new UsageError(`unexpected option "${first}" before a command`)
  let command
  let layer = null
  let action = null
  let tail = rest
  if (first === 'all' || first === 'affected' || first === 'coverage' || first === 'inventory') {
    command = first
  } else if (first === 'stand') {
    command = 'stand'
    action = rest[0]
    if (!['up', 'reuse', 'down'].includes(action)) throw new UsageError('stand needs one of: up, reuse, down')
    tail = rest.slice(1)
  } else {
    if (!LAYER_NAME.test(first)) throw new UsageError(`invalid command or layer name "${first}"`)
    command = 'layer'
    layer = first
  }
  if (command === 'inventory') return { command, layer, action, rest: tail, options: {} }
  const spec = FLAGS[command]
  const options = {}
  for (let i = 0; i < tail.length; i += 1) {
    let token = tail[i]
    let inline
    const eq = token.startsWith('--') ? token.indexOf('=') : -1
    if (eq > 0) {
      inline = token.slice(eq + 1)
      token = token.slice(0, eq)
    }
    const kind = spec[token]
    if (!kind) throw new UsageError(`unknown or unexpected argument "${token}" for "${command}"`)
    if (Object.hasOwn(options, token)) throw new UsageError(`duplicate option ${token}`)
    if (kind === 'bool') {
      if (inline !== undefined) throw new UsageError(`${token} does not take a value`)
      options[token] = true
    } else {
      const value = inline ?? tail[++i]
      if (value === undefined || value === '' || (inline === undefined && value.startsWith('-'))) {
        throw new UsageError(`${token} needs a value`)
      }
      options[token] = value
    }
  }
  const out = {
    command,
    layer,
    action,
    options: {
      area: options['--area'],
      target: options['--target'] ?? 'local',
      proveRed: options['--prove-red'] === true,
      out: options['--out'],
      timeoutMs: options['--timeout-ms'],
      base: options['--base'],
      head: options['--head'],
      run: options['--run'] === true,
      coverageLayer: options['--layer'],
      runs: options['--runs'],
      requireComplete: options['--require-complete'] === true,
      json: options['--json'] === true,
      id: options['--id'],
      project: options['--project'],
      verbose: options['-v'] === true,
      dryRun: options['--dry-run'] === true
    }
  }
  const o = out.options
  if (!TARGETS.includes(o.target)) throw new UsageError(`invalid --target "${o.target}" (local|dev|prod)`)
  if (o.timeoutMs !== undefined && !/^[1-9]\d{0,9}$/.test(o.timeoutMs))
    throw new UsageError('--timeout-ms must be a positive integer')
  if (o.area !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(o.area))
    throw new UsageError(`invalid --area "${o.area}"`)
  if (o.coverageLayer !== undefined && !LAYER_NAME.test(o.coverageLayer))
    throw new UsageError(`invalid --layer "${o.coverageLayer}"`)
  if (command === 'affected') {
    for (const key of ['base', 'head']) {
      if (o[key] === undefined) throw new UsageError(`affected needs --${key}`)
      if (!REF.test(o[key])) throw new UsageError(`invalid git ref for --${key}: ${JSON.stringify(o[key])}`)
    }
  }
  if (command === 'stand') {
    if (o.id === undefined) throw new UsageError('stand needs --id')
    if (!STAND_ID.test(o.id))
      throw new UsageError(`invalid stand id "${o.id}" (lowercase letters, digits, "-", max 24)`)
    if (o.project !== undefined && o.project !== `tchqa-${o.id}`) {
      throw new UsageError(`refusing project "${o.project}": only tchqa-${o.id} may be touched`)
    }
  }
  return out
}
