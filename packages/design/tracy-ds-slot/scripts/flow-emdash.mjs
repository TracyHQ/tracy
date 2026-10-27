#!/usr/bin/env node
// The EmDash action flow — `flow.mjs --cms emdash` (kept so existing calls and REG-PR-1058 keep working).
process.argv.push('--cms', 'emdash')
await import('./flow.mjs')
