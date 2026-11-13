// A site that stores JSON columns its own way (#599, `draft-revision-site-forms.mjs`): Joomla's Registry re-encodes a
// params, attribs or images column (key order, escaped slashes, spacing) and adds the keys it defaults. The write
// step's read back accepts it, so every later comparison must too: the whole edit matrix, with both writers, gives on
// such a site what it gives on a plain one (the site equals a full build of the revision on a new site of the same
// kind, the restore brings the site before back or stops typed for the same reason), and an owner's edit of a value
// Tracy wrote inside the JSON is still caught.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-forms.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDITS, revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { firstBuild, matrixRow, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { blankFormSite, SITE_FORMS } from './draft-revision-site-forms.mjs'

const NAMES = [...Object.keys(EDITS), ...Object.keys(MORE_EDITS)]
const WRITERS = { plain: {}, cross: { cross: true } }

test('every edit, both writers, on a site that stores JSON its own way: the same outcome as on a plain site', async () => {
  const lines = []
  for (const [writer, options] of Object.entries(WRITERS))
    for (const name of NAMES) {
      const plain = await matrixRow(name, { writer: options })
      const formed = await matrixRow(name, { writer: options, site: () => blankFormSite('all') })
      const at = `${writer}: ${name}`
      lines.push(`${at} | ${formed.stop ?? 'done'} | ${formed.equal ?? ''} | ${formed.restore ?? ''}`)
      assert.equal(formed.stop, plain.stop, at)
      assert.equal(formed.equal, plain.equal, at)
      assert.equal(formed.restore, plain.restore, at)
      assert.deepEqual([formed.model, formed.writes], [plain.model, plain.writes], at)
    }
  console.log(lines.join('\n'))
})

test('each JSON form alone: a revision, then its restore, never stops for the site own form', async () => {
  for (const mode of SITE_FORMS)
    for (const name of ['rename a service', 'change the site name', 'rename a page', 'reorder services']) {
      const first = await firstBuild({ memory: blankFormSite(mode) })
      const rev = await revisionRun(first, revisedBy(name))
      assert.equal(rev.error, undefined, `${mode} ${name}: ${rev.error?.code} ${rev.error?.details?.place}`)
      const done = await restoreOf(first, first.builds.get(rev.run.write.build.ref))
      assert.equal(done.status, 'done', `${mode} ${name}`)
    }
})

/** The first module whose params Tracy wrote, with its id. */
function writtenModule(memory) {
  for (const [id, row] of memory.site.records.module)
    if (typeof row.params === 'string' && row.params.includes('containerClass')) return [id, row]
  throw new Error('no written module')
}

test('an owner edit of a value Tracy wrote inside a JSON column is caught; a key the owner adds is not seen', async () => {
  const edited = await firstBuild({ memory: blankFormSite('all') })
  const [id, row] = writtenModule(edited.memory)
  const params = JSON.parse(row.params)
  params.containerClass = `${params.containerClass} owner-class`
  edited.memory.site.records.module.set(id, { ...row, params: JSON.stringify(params) })
  const stopped = await revisionRun(edited, revisedBy('change the site name'))
  assert.equal(stopped.error?.code, 'site_changed_outside')
  assert.equal(stopped.error?.details?.place, `record:module:${id}:params`)

  const added = await firstBuild({ memory: blankFormSite('all') })
  const [id2, row2] = writtenModule(added.memory)
  added.memory.site.records.module.set(id2, {
    ...row2,
    params: JSON.stringify({ ...JSON.parse(row2.params), owner_key: 'x' })
  })
  const done = await revisionRun(added, revisedBy('change the site name'))
  assert.equal(done.error, undefined, done.error?.code)
})
