// REG-PR-1176-onboard-v2-followups: the four fences of the desktop first-run follow-ups, read from
// the tests that pin them. Prints one `ok -` / `not ok -` line per fence; exits 0 only when all pass.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Names of the tests that answered `ok` in one file's TAP output. */
function passed(cwd, file) {
  const out = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    cwd: path.join(repo, cwd),
    encoding: 'utf8',
    env: { ...process.env, TEST_DATABASE_URL: '' }
  }).stdout
  return new Set([...out.matchAll(/^\s*ok \d+ - (.+?)(?: #.*)?$/gm)].map((m) => m[1].trim()))
}

const fences = [
  {
    name: 'refused exchange shows the reason',
    files: [
      [
        'apps/tracy-web',
        'test/login-onboard.test.mjs',
        [
          'a refused desktop sign-in lands on the onboard page with the waitlist wording',
          'an expired, denied or failed round says the sign-in did not finish',
          'an unknown or empty reason draws nothing and is never echoed'
        ]
      ],
      [
        'packages/desktop/tracy-desktop',
        'test/signin-handoff.test.mjs',
        ['a redeem refused because the address is not admitted says so in the result']
      ],
      [
        'packages/desktop/tracy-desktop',
        'test/signin-doors.test.mjs',
        [
          'a round that ended without a session sends the window to /login with the reason word',
          'a first run still marks the reason page with onboard=1, keeping the reason'
        ]
      ]
    ]
  },
  {
    name: 'cancel flips the round and a later approve cannot be redeemed',
    files: [
      [
        'apps/tracy-web',
        'test/desktop-signin.test.mjs',
        [
          'the app cancels its pending round: it reads denied and a later approve cannot be redeemed',
          'cancel is idempotent: a second cancel answers the same and changes nothing',
          'cancel with a wrong secret, or on a lane round, leaves the round pending',
          'cancel keeps the session door rules: exact Origin, JSON only, well-formed secret and nonce'
        ]
      ],
      [
        'packages/desktop/tracy-desktop',
        'test/signin-handoff.test.mjs',
        [
          'cancelling a started round tells the server, with the secret in the body only',
          'a round that ended by itself, or never started, sends no cancel'
        ]
      ]
    ]
  },
  {
    name: 'not-installed card hidden when the picked vendor is connected',
    files: [
      [
        'packages/ui/tracy-onboard',
        'test/flow.test.mjs',
        ['a picked vendor already connected through the server raises no "not on this computer" warning']
      ]
    ]
  },
  {
    name: 'a connected account is preselected, in the main grid, with its connected panel',
    files: [
      [
        'packages/ui/tracy-onboard',
        'test/flow.test.mjs',
        [
          'an account already connected is preselected over the scan, never over a pick by hand',
          'a connected vendor sits in the main grid whatever the scan found'
        ]
      ],
      [
        'packages/ui/tracy-onboard',
        'test/connect-panel.test.mjs',
        ['offerWithStatus: the connection in use (`next`) leads the connected list, then the route order']
      ],
      [
        'packages/ui/tracy-onboard',
        'test/mount.test.mjs',
        [
          'an account already connected is the pick, in the main grid, with its connected panel and no warning'
        ]
      ]
    ]
  }
]

const cache = new Map()
let failed = 0
for (const fence of fences) {
  const missing = []
  for (const [cwd, file, names] of fence.files) {
    const key = `${cwd}/${file}`
    if (!cache.has(key)) cache.set(key, passed(cwd, file))
    for (const name of names) if (!cache.get(key).has(name)) missing.push(`${key}: ${name}`)
  }
  if (missing.length === 0) console.log(`ok - ${fence.name}`)
  else {
    failed += 1
    console.log(`not ok - ${fence.name} (not ok: ${missing.join('; ')})`)
  }
}
process.exit(failed === 0 ? 0 : 1)
