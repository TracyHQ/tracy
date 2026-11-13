// Prints the edit matrix of the revision run (#599): per plan edit, the pages the writer wrote again and kept, the model
// calls, the write operations kept, written again and added, the door writes, whether the site equals a full build of
// the new revision, and whether the restore brings the previous site back.
//
//   node apps/tracy-web/test/draft-revision-matrix-print.mjs
import { EDITS } from './draft-revision-edits.mjs'
import { matrixRow } from './draft-revision-run.mjs'

const rows = []
for (const name of Object.keys(EDITS)) rows.push(await matrixRow(name))
const cols = [
  'edit',
  'written',
  'reused',
  'blocks',
  'model',
  'same',
  'rewrite',
  'added',
  'writes',
  'equal',
  'restore',
  'stop'
]
console.log(cols.join(' | '))
for (const row of rows) console.log(cols.map((c) => String(row[c] ?? '')).join(' | '))
for (const row of rows) console.log(`${row.edit}: writer calls per page ${JSON.stringify(row.pages)}`)
