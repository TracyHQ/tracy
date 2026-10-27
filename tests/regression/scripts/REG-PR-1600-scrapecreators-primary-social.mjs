import { spawnSync } from 'node:child_process'

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required: quota tests must execute against PostgreSQL')
}

const checks = [
  {
    file: 'apps/tracy-web/test/ops-wo.test.mjs',
    names: ['ScrapeCreators provider key is sealed']
  },
  {
    file: 'apps/tracy-web/test/website-opportunities-social-stats.test.mjs',
    names: ['ScrapeCreators reserves calls']
  },
  {
    file: 'packages/wo/website-opportunities/test/domain-social-stats-chain.test.mjs',
    names: [
      'ScrapeCreators is the first social tier',
      'ScrapeCreators TikTok adapter',
      'ScrapeCreators Facebook adapter'
    ]
  }
]
let failed = false

for (const check of checks) {
  const result = spawnSync('node', ['--test', '--test-reporter=tap', check.file], { encoding: 'utf8' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const failedNames = check.names.filter((name) => {
    const matchingLines = output.split('\n').filter((line) => line.includes(name))
    return (
      !matchingLines.some(
        (line) => line.startsWith('ok ') && !line.includes('# SKIP') && !line.includes('# TODO')
      ) || matchingLines.some((line) => line.startsWith('not ok '))
    )
  })
  const passed = result.status === 0 && failedNames.length === 0
  console.log(`${passed ? 'ok' : 'not ok'} - ${check.file}: ${check.names.join(', ')}`)
  if (!passed) {
    failed = true
    console.log(output)
  }
}

if (failed) process.exitCode = 1
