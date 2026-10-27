import { readFileSync } from 'node:fs'
import { normaliseName } from './dedupe.mjs'

// Brands whose outlets are never a website opportunity. The operator adds or removes names in `chain-brands.json`
// (brand names are third-party data, kept verbatim in a data file).
export const CHAIN_BRANDS = Object.freeze(
  JSON.parse(readFileSync(new URL('./chain-brands.json', import.meta.url), 'utf8'))
)

const BRANDS = CHAIN_BRANDS.map(normaliseName)
// "Phở 77 - Chi nhánh 2", "Highlands Coffee (CN 3)": the marker and everything after it name the outlet, not the brand.
const BRANCH_MARKER = /\b(chi nhanh|co so|cn|branch|outlet|store)\b.*$/
const TRAILING_NUMBER = /^(\S+ \S+.*?) \d+$/

/** The name two outlets of one business share; apostrophes already became spaces, so "domino s" is one key. */
function chainKey(name) {
  const base = normaliseName(name).replace(BRANCH_MARKER, '').trim()
  return (TRAILING_NUMBER.exec(base)?.[1] ?? base).trim()
}

/**
 * Same list, each candidate with two booleans: `chain` = a listed brand (exact or as a prefix);
 * `chainSuspect` = the same name seen twice or more in this set, weaker evidence that never sets `chain` by itself.
 */
export function markChains(candidates) {
  const list = Array.isArray(candidates) ? candidates : []
  const keys = list.map((c) => chainKey(c?.name))
  const seen = new Map()
  for (const k of keys) if (k) seen.set(k, (seen.get(k) ?? 0) + 1)
  return list.map((c, i) => {
    const key = keys[i]
    const chain = Boolean(key) && BRANDS.some((b) => key === b || key.startsWith(`${b} `))
    const chainSuspect = Boolean(key) && seen.get(key) >= 2
    return { ...c, chain, chainSuspect }
  })
}
