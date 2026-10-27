import { sha256Hex } from './hmac.js'

/** Six digits from a CSPRNG, zero-padded — a code is a string, never a number. */
export function generateCode(rng = (arr) => crypto.getRandomValues(arr)) {
  const [n] = rng(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}

export async function hashCode(code, email, pepper) {
  return sha256Hex(`${pepper}\n${email.toLowerCase()}\n${code}`)
}
