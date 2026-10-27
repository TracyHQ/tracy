// `--env <name>` becomes `E2E_ENV` before `env.mjs` is evaluated: a module's imports run in the
// order they are written, so `run.mjs` imports this one first. Every journey process inherits it.
// Without the flag, an `E2E_ENV` already in the shell stands, and `env.mjs` defaults to `dev`.

const args = process.argv.slice(2)
const at = args.findIndex((a) => a === '--env' || a.startsWith('--env='))
if (at >= 0) process.env.E2E_ENV = args[at].startsWith('--env=') ? args[at].slice(6) : (args[at + 1] ?? '')
