// The finisher's own apply ids (spec #418): every repair it writes, of words or of style, carries an apply id of its own, made
// from what it writes, so the same repair asked twice is the same apply and `apply.revert` takes back exactly that repair.
import { createHash } from 'node:crypto'

/** The SHA-256 of a value's JSON, in hex: a repair's request id. */
export const hashOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** A finisher apply id: `<prefix>-` and the first `chars` hex characters of the hash of what it writes. */
export const finisherApplyId = (prefix, what, chars = 48) => `${prefix}-${hashOf(what).slice(0, chars)}`
