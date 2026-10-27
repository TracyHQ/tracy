#!/usr/bin/env node
// A wp-cli stand-in for the prune-audit tests of #41: `node fake-wp.mjs <state.json> <wp args…>`.
// It answers the calls prune-audit makes (quickstart/prune-audit.mjs collectFacts, applyPrune) from
// a state file and writes `post delete … --force` back to it, so the cycle's two prune steps — the
// apply and the re-audit — run as processes against one stand. Every call is appended to
// `<state>.calls` (one JSON line each). A call it does not know exits 3: nothing is answered by guess.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const [statePath, ...args] = process.argv.slice(2)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
appendFileSync(`${statePath}.calls`, JSON.stringify(args) + '\n')
const json = args.includes('--format=json')
const count = args.includes('--format=count')
const out = (v) => {
  process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v))
  process.exit(0)
}
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [a0, a1] = args

if (a0 === 'user' && a1 === 'list' && json) out(state.users)
if (a0 === 'user' && a1 === 'session' && args[2] === 'list' && count) out('0')
if (a0 === 'option' && a1 === 'get') {
  if (args[2] === 'siteurl' || args[2] === 'home') out(state.siteUrl)
  const o = state.options.find((x) => x.option_name === args[2])
  if (o) out(o.option_value)
  process.exit(1)
}
if (a0 === 'option' && a1 === 'list' && json) out([])
if (a0 === 'post' && a1 === 'list' && json) {
  const status = flag('post_status')
  const type = flag('post_type')
  if (type === 'revision') out(state.revisions)
  out([...state.content, ...state.revisions].filter((p) => p.post_status === status && (type === 'any' || p.post_type === type)).map(({ ID, post_title, post_type, post_status }) => ({ ID, post_title, post_type, post_status })))
}
if (a0 === 'eval') {
  const php = args[1] ?? ''
  if (php.includes('__TRACY_OWNERS__')) {
    const ids = [...(php.match(/WHERE ID IN \(([\d,]+)\)/)?.[1] ?? '').split(',')].filter(Boolean).map(Number)
    const posts = [...state.content, ...state.revisions].filter((p) => ids.includes(Number(p.ID))).map(({ ID, post_type, post_status }) => ({ ID: String(ID), post_type, post_status }))
    out(`\n__TRACY_OWNERS__${JSON.stringify({ posts, users: state.users.map((u) => ({ ID: String(u.ID), user_login: u.user_login, seeded: '0' })) })}`)
  }
  if (php.includes('__TRACY_REFS__')) out(`\n__TRACY_REFS__${JSON.stringify({ attachments: [], content: state.content, meta: state.meta, termmeta: [], options: state.options })}`)
}
if (a0 === 'post' && a1 === 'delete' && args.includes('--force')) {
  const ids = new Set(args.slice(2).filter((a) => /^\d+$/.test(a)).map(Number))
  state.content = state.content.filter((p) => !ids.has(Number(p.ID)))
  state.revisions = state.revisions.filter((p) => !ids.has(Number(p.ID)))
  writeFileSync(statePath, JSON.stringify(state))
  out(`Success: deleted ${[...ids].join(', ')}`)
}
process.stderr.write(`fake-wp: no answer for ${JSON.stringify(args)}\n`)
process.exit(3)
