// The brand run's lease fence: the shared bench SQL (lib/bench-sql.js) bound to the brand_run table.
import { fenced as fencedOn } from '../lib/bench-sql.js'

/** SQL that is true when no lease token is given, or the run holds the given one. */
export const fenced = (runParam, tokenParam) => fencedOn('brand_run', runParam, tokenParam)
