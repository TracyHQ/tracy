#!/usr/bin/env node
/**
 * Stop hook: an agent's reply may not use a coined word (docs/references/vocabulary.md §4, second
 * tier). The `vocabulary` gate reads files; people read the reply, and the word kept coming back
 * there — three times after it was banned — because the agent copies what it has just read. A rule
 * on paper did not stop it; a regex on the reply does.
 *
 * Reads the hook input on stdin ({transcript_path, stop_hook_active}), takes the assistant text
 * written since the last message a person typed, ignores code spans and fenced blocks (a legacy
 * key may be quoted as data), and blocks the stop once with the replacement to use.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COINED } from '../lib/coined-words.mjs'

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Coined words in prose; code spans and fenced blocks are data, not prose. */
export function coinedIn(text) {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
  return COINED.filter((entry) => new RegExp(escape(entry.word), 'iu').test(prose))
}

/** The assistant text since the last message a person typed (tool results are not a person). */
export function lastReply(transcript) {
  const entries = transcript
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  const typed = (e) =>
    e.type === 'user' &&
    (typeof e.message?.content === 'string' ||
      (Array.isArray(e.message?.content) && e.message.content.some((c) => c.type === 'text')))
  let start = 0
  entries.forEach((e, i) => {
    if (typed(e)) start = i + 1
  })
  return entries
    .slice(start)
    .filter((e) => e.type === 'assistant' && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content.filter((c) => c.type === 'text').map((c) => c.text))
    .join('\n')
}

/** The hook's answer: block once with what to write instead, or null to let the stop through. */
export function verdict(transcript, stopHookActive) {
  if (stopHookActive) return null
  const hits = coinedIn(lastReply(transcript))
  if (hits.length === 0) return null
  return {
    decision: 'block',
    reason:
      'Your reply uses a coined word the team banned (docs/references/vocabulary.md §4): ' +
      hits.map((h) => `"${h.word}" → ${h.instead}`).join('; ') +
      '. Rewrite the reply with the product name. Quote a legacy data key only inside backticks.'
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
    const v = input.transcript_path
      ? verdict(readFileSync(input.transcript_path, 'utf8'), !!input.stop_hook_active)
      : null
    if (v) process.stdout.write(JSON.stringify(v))
  } catch {
    // A broken hook must never trap the session: fail open, the file gate still runs in CI.
  }
}
