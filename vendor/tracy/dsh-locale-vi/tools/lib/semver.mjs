/**
 * Compare two semantic versions, enough of the specification for package
 * selection: numeric release precedence, then prerelease precedence, where a
 * prerelease sorts below its own release and identifiers compare numerically
 * when both are numeric and lexically otherwise.
 *
 * Written out rather than depending on `semver`, so the workflow runs with no
 * install step in a checkout that has no `node_modules`.
 *
 * @module tools/lib/semver
 */

const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/**
 * Parse a version string.
 * @param value - the raw version.
 * @returns release numbers plus prerelease identifiers, or undefined when invalid.
 */
export function parse(value) {
  if (typeof value !== 'string') return undefined
  const m = PATTERN.exec(value.trim())
  if (m === null) return undefined
  return {
    release: [Number(m[1]), Number(m[2]), Number(m[3])],
    prerelease: m[4] === undefined ? [] : m[4].split('.'),
  }
}

/** Whether a string is a version this comparator understands. */
export function valid(value) {
  return parse(value) !== undefined
}

/** Compare two prerelease identifier lists per the specification's rules. */
function comparePrerelease(a, b) {
  // No prerelease outranks any prerelease: 1.0.0 > 1.0.0-alpha.
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i]
    const right = b[i]
    // A shorter list of equal identifiers has lower precedence.
    if (left === undefined) return -1
    if (right === undefined) return 1
    const leftNumeric = /^\d+$/.test(left)
    const rightNumeric = /^\d+$/.test(right)
    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right)
      if (diff !== 0) return diff < 0 ? -1 : 1
      continue
    }
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    if (left !== right) return left < right ? -1 : 1
  }
  return 0
}

/**
 * Compare two versions.
 * @returns -1, 0 or 1; undefined when either version is unparsable.
 */
export function compare(a, b) {
  const left = parse(a)
  const right = parse(b)
  if (left === undefined || right === undefined) return undefined
  for (let i = 0; i < 3; i++) {
    if (left.release[i] !== right.release[i]) return left.release[i] < right.release[i] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}
