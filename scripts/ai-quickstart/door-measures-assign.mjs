/**
 * `door-measures.mjs` part A, continued: the module assignments that mean "no page" (of a copy and of an in-place store
 * record), and uploading, overwriting and deleting a media file.
 */
import { createHash } from 'node:crypto'
import { shows, warningsOf, wordsCopy } from './door-measures-hide.mjs'

export async function measureAssignments(ctx) {
  const { door, fact, pages } = ctx
  // A2. Module assignments: which values mean "no page", what is stored and read back.
  const assignWords = 'Measure Assigned Module'
  const assigned = await wordsCopy(ctx, assignWords, null)
  // The copy prints in a position only the landing layout has: two landing pages and an inner one.
  const landing2 = await ctx.page('Measure Landing Two', ctx.styles.LANDING)
  const where = async () => ({
    home: (await shows(ctx, pages.home, assignWords)).shows,
    inner: (await shows(ctx, pages.inner, assignWords)).shows,
    landing2: (await shows(ctx, landing2, assignWords)).shows
  })
  const tries = [
    { menuids: '[0]' },
    { menuids: '[]' },
    { menuids: '' },
    {},
    { menuids: JSON.stringify([-pages.home]) },
    { menuids: JSON.stringify([pages.inner]) },
    { menuids: 'null' },
    { menuids: '[0]' }
  ]
  const neverAssigned = {
    readBack: (await door.get('moduleAssignment', assigned))?.menuids,
    pages: await where()
  }
  const assignments = []
  for (const fields of tries) {
    const answer = await door.update('moduleAssignment', assigned, fields)
    assignments.push({
      fields,
      answer,
      readBack: (await door.get('moduleAssignment', assigned))?.menuids,
      pages: await where()
    })
  }
  fact('A2 module assignment of a copy', { module: assigned, neverAssigned, assignments })
  // An in-place store record (the header button, module 176): assigned and then assigned to no page again.
  const store = (await door.get('moduleAssignment', 176))?.menuids
  const inPlace = []
  for (const menuids of ['[0]', '[]']) {
    const answer = await door.update('moduleAssignment', 176, { menuids })
    inPlace.push({
      menuids,
      answer,
      readBack: (await door.get('moduleAssignment', 176))?.menuids,
      warnings: await warningsOf(ctx)
    })
  }
  const unpublish = await door.update('module', 176, { published: 0 })
  const warningsUnpublished = await warningsOf(ctx)
  const republish = await door.update('module', 176, { published: 1 })
  fact('A2 module assignment of an in-place store record', {
    module: 176,
    storeReadBack: store,
    inPlace,
    unpublish: {
      answer: unpublish,
      warnings: warningsUnpublished,
      publishAgain: republish,
      warnings2: await warningsOf(ctx)
    }
  })

  // A3. Media: upload, overwrite, list, delete.
  // Two different one-pixel pictures.
  const PNG = [
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  ]
  const file = `images/measure/${ctx.alias('pic')}.png`
  const upload = (bytes) =>
    door.call('media.upload', { apply_id: door.applyId('media'), path: file, content_b64: bytes })
  const sha = async () => {
    const r = await fetch(`${ctx.base}/${file}`)
    return {
      status: r.status,
      sha256: r.ok
        ? createHash('sha256')
            .update(Buffer.from(await r.arrayBuffer()))
            .digest('hex')
        : null
    }
  }
  const one = await upload(PNG[0])
  const afterOne = await sha()
  const two = await upload(PNG[1])
  const afterTwo = await sha()
  const dry = await door.call('media.delete', { apply_id: door.applyId('mdel'), path: file, dry_run: true })
  const deleted = await door.call('media.delete', { apply_id: door.applyId('mdel'), path: file })
  const afterDelete = await sha()
  const outside = await door.call('media.delete', {
    apply_id: door.applyId('mdel'),
    path: 'media/t4/author/default.jpg'
  })
  fact('A3 media', {
    file,
    upload: one,
    afterUpload: afterOne,
    overwrite: two,
    afterOverwrite: afterTwo,
    deleteDryRun: dry,
    delete: deleted,
    afterDelete,
    deleteOutsideImages: outside,
    warnings: await warningsOf(ctx)
  })
}
