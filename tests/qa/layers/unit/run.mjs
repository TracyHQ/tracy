#!/usr/bin/env node
/**
 * Standalone entry of the unit layer:
 *   node tests/qa/layers/unit/run.mjs [--area <area>] [--target local] [--prove-red] [--out DIR]
 * Exit 0 all PASS, 1 any FAIL, 2 invalid usage/contract, 3 ENV/PENDING only.
 */
import * as mod from './index.mjs'
import { runCli } from '../static/lib/common.mjs'

process.exitCode = await runCli(mod, process.argv.slice(2))
