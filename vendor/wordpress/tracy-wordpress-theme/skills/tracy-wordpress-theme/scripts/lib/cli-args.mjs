// Strict argument lists for the visual CLIs. The whole list is checked before any measurement:
// an unknown option, a repeated option, an option without a value, or a stray positional is a usage
// error (exit 2), never "the first one wins".

export class UsageError extends Error {}

/**
 * @param {string[]} argv
 * @param {{values: string[], flags?: string[], positionals?: number}} spec
 *   `positionals` is the number of bare arguments allowed (they are collected in `positional`).
 * @returns {{opt: (name: string, fallback?: any) => any, flag: (name: string) => boolean, has: (name: string) => boolean, positional: string[]}}
 */
export function parseStrict(argv, { values, flags = [], positionals = 0 }) {
  const valued = new Set(values)
  const bare = new Set(flags)
  const seen = new Map()
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      positional.push(a)
      if (positional.length > positionals) throw new UsageError(`unexpected argument ${a}`)
      continue
    }
    if (!valued.has(a) && !bare.has(a)) throw new UsageError(`unknown option ${a}`)
    if (seen.has(a)) throw new UsageError(`${a} is given more than once`)
    if (bare.has(a)) {
      seen.set(a, true)
      continue
    }
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value`)
    seen.set(a, v)
    i++
  }
  return {
    opt: (name, fallback = null) => (seen.has(name) ? seen.get(name) : fallback),
    flag: (name) => seen.has(name),
    has: (name) => seen.has(name),
    positional
  }
}
