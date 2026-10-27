#!/usr/bin/env node
// The seeder's entry: one line on stderr and a non-zero exit is all tracy-site-build's seed stage reads on failure.
import { main } from '../src/cli.mjs'

main(process.argv.slice(2)).then(
  () => process.exit(0),
  (error) => {
    console.error(`seed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
)
