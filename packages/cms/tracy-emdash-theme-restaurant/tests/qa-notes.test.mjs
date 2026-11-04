// F14 — notes are todos: lens notes + machine findings merge into one list with stable ids; a picture
// with a consumer that nobody opened fails the merge; fixes and closes apply by id.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { readTable } from '../tools/qa-notes.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const TOOL = path.join(HERE, '..', 'tools', 'qa-notes.mjs')
const run = (dir, cmd = 'merge') => {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [TOOL, cmd, dir, '--stage', 'light'], { encoding: 'utf8' })
    }
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` }
  }
}
function runDir({ opened = [], notes = '', fix = '', close = '', tiles } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'notes-'))
  mkdirSync(path.join(dir, 'notes'))
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({
      shots: [
        {
          stage: 'light',
          page: 'en-home',
          variant: 'a',
          side: 'site',
          file: '/s/a.png',
          ...(tiles ? { tiles } : {}),
          consumers: ['layout']
        }
      ]
    })
  )
  writeFileSync(
    path.join(dir, 'notes', 'machine.json'),
    JSON.stringify([
      {
        id: 'M1',
        lens: 'machine:scan:contrast',
        page: 'en-home',
        axis: 'a',
        stage: 'light',
        what: '{"ratio":2}',
        fix: 'raise',
        verify: 'gone',
        status: 'open'
      }
    ])
  )
  writeFileSync(
    path.join(dir, 'notes', 'layout.md'),
    `# layout\n## Opened\n${opened.map((f) => `- ${f}`).join('\n')}\n## Notes\n| Page | Axis | What | Where | Fix | Verify | Flag |\n|---|---|---|---|---|---|---|\n${notes}\n`
  )
  if (fix) writeFileSync(path.join(dir, 'notes', 'fix.md'), `| Id | Status | Fix |\n|---|---|---|\n${fix}\n`)
  if (close)
    writeFileSync(
      path.join(dir, 'notes', 'layout-close.md'),
      `| Id | Status | Reason |\n|---|---|---|\n${close}\n`
    )
  return dir
}

describe('F14 — qa-notes', () => {
  it('readTable keeps escaped pipes and reads the table under a heading', () => {
    const rows = readTable('# x\n## Notes\n| A | B |\n|---|---|\n| one \\| two | 3 |\n', '## Notes')
    assert.deepEqual(rows, [{ a: 'one | two', b: '3' }])
  })
  it('merge: machine + lens rows, stable ids, unopened picture fails, fix/close apply by id', () => {
    const note = '| en-home | a | Nav wraps | header | fix css | one line | |'
    const d1 = runDir({ opened: [], notes: note })
    const r1 = run(d1)
    assert.equal(r1.code, 1, 'a picture with a consumer nobody opened')
    const j1 = JSON.parse(readFileSync(path.join(d1, 'NOTES-light.json'), 'utf8'))
    assert.equal(j1.counts.open, 2)
    assert.equal(j1.coverage.missing.length, 1)
    const nId = j1.todos.find((t) => t.id.startsWith('N-')).id
    const d2 = runDir({
      opened: ['/s/a.png'],
      notes: note,
      fix: `| ${nId} | done | used .nav-link |`,
      close: `| ${nId} | closed | looks right |`
    })
    const r2 = run(d2)
    assert.equal(r2.code, 0, r2.out)
    const j2 = JSON.parse(readFileSync(path.join(d2, 'NOTES-light.json'), 'utf8'))
    const same = j2.todos.find((t) => t.id === nId)
    assert.equal(same.status, 'closed', 'same content → same id across runs')
    assert.equal(same.fixNote, 'used .nav-link')
    assert.equal(j2.counts.open, 1, 'the machine row is still open until a clean rerun')
    assert.match(
      readFileSync(path.join(d2, 'NOTES-light.md'), 'utf8'),
      /\| closed \| used \.nav-link \| looks right \|/
    )
    const st = JSON.parse(run(d2, 'status').out)
    assert.equal(st.counts.closed, 1)
  })
  it('a LEE flag counts as blocking until closed', () => {
    const d = runDir({
      opened: ['/s/a.png'],
      notes: '| en-home | a | Drop the stats band? | main | — | — | LEE |'
    })
    run(d)
    const j = JSON.parse(readFileSync(path.join(d, 'NOTES-light.json'), 'utf8'))
    assert.equal(j.counts.leeFlagged, 1)
  })
  it('a picture cut into tiles is opened only when EVERY tile was opened — the full-page file alone proves nothing', () => {
    const tiles = ['/s/a/0.png', '/s/a/1.png', '/s/a/2.png']
    let d = runDir({ opened: ['/s/a.png'], tiles })
    assert.equal(run(d).code, 1)
    let j = JSON.parse(readFileSync(path.join(d, 'NOTES-light.json'), 'utf8'))
    assert.equal(j.coverage.missing.length, 3, 'each tile still to open')
    d = runDir({ opened: tiles.slice(0, 2), tiles })
    assert.equal(run(d).code, 1)
    j = JSON.parse(readFileSync(path.join(d, 'NOTES-light.json'), 'utf8'))
    assert.deepEqual(j.coverage.missing, [{ file: '/s/a/2.png', lens: 'layout' }])
    assert.equal(j.coverage.extra.length, 0, 'a tile of an assigned picture is not "extra"')
    d = runDir({ opened: tiles, tiles })
    assert.equal(run(d).code, 0)
  })
  it('a SOURCE flag (the source has the same defect) is a todo like any other — it is fixed, not waived — and is counted separately', () => {
    const d = runDir({
      opened: ['/s/a.png'],
      notes:
        '| en-home | a | output: unit wraps alone under the figure (source wraps too) | stats | nowrap | one line | SOURCE |'
    })
    run(d)
    const j = JSON.parse(readFileSync(path.join(d, 'NOTES-light.json'), 'utf8'))
    assert.equal(j.counts.open, 2)
    assert.equal(j.counts.leeFlagged, 0, 'not a decision for Lee: the rule is to do better than the source')
    assert.equal(j.counts.sourceFlagged, 1)
    assert.equal(j.todos.find((t) => t.id.startsWith('N-')).flag, 'SOURCE')
  })
})
