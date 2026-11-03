#!/usr/bin/env node
/**
 * The brand bench from a shell (brand step trial bench, #320): the bench has no screen, so its runs are started, read and
 * cancelled here, and the worker inside the running tracy-web process picks each run up. Run it where tracy-web runs:
 * it needs that container's DATABASE_URL and SESSION_SECRET (the key that opens the brand doors' providers) and reads
 * the rest of its configuration from the same place the server does:
 *
 *   docker exec <tracy-web> node scripts/brand-bench.mjs kits
 *   docker exec <tracy-web> node scripts/brand-bench.mjs run --kit ja-boxing/j6/1.0.10 --brief-file brief.json
 *   docker exec <tracy-web> node scripts/brand-bench.mjs status <runId>
 *
 * Every command and its options: `node scripts/brand-bench.mjs` with no command (src/brand-step/brand-cli.js).
 * Nothing it prints or writes carries a key.
 */
import { placeMediaObjectsFor } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { createPool } from '../src/db/index.js'
import { runCli } from '../src/brand-step/brand-cli.js'
import { brandRunDir, productionWiring } from '../src/brand-step/brand-wiring.js'
import { kitImagesFor } from '../src/site-planner/kit-images.js'

export async function main(argv, env = process.env) {
  if (!env.DATABASE_URL || !env.SESSION_SECRET) {
    process.stderr.write('brand-bench: DATABASE_URL and SESSION_SECRET must be set (run it in tracy-web)\n')
    return 1
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    const config = readConfig(env)
    const kitImages = kitImagesFor({ pool, config })
    return await runCli(argv, {
      pool,
      secret: env.SESSION_SECRET,
      kitImages,
      wiring: productionWiring(config, { objects: placeMediaObjectsFor(config, fetch) }),
      runDir: (runId) => brandRunDir(config, runId)
    })
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    }
  )
}
