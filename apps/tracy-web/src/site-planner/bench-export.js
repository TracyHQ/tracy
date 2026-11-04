// What the site planner bench CLI shows and downloads of one run (ADR 0041, #301): the shared bench export
// (lib/bench-export.js, #327) for the planner, whose round document is the plan (plan-v1.json is round 0's plan).
import { benchExport } from '../lib/bench-export.js'
import { MAX_FIX_ROUNDS } from './bench-worker.js'

export { briefLabel, compactTurn, listLines, standingLines } from '../lib/bench-export.js'

export const { statusLines, runFiles } = benchExport({ doc: 'plan', maxFixRounds: MAX_FIX_ROUNDS })
