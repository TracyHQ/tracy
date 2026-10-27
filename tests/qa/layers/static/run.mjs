#!/usr/bin/env node
/**
 * Standalone entry of the static layer:
 *   node tests/qa/layers/static/run.mjs [--area <gate>] [--target local] [--prove-red] [--out DIR]
 * Exit 0 all PASS, 1 any FAIL, 2 invalid usage/contract, 3 ENV/PENDING only.
 */
import * as mod from './index.mjs'
import { runCli } from './lib/common.mjs'

process.exitCode = await runCli(mod, process.argv.slice(2))
