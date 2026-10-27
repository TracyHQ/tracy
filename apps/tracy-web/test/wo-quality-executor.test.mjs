import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import {
  executeQualityPlan,
  qualityReviewSnapshotRow,
  restoreQualityOperation
} from '../src/opportunities-build/quality-executor.js'

/** Protocol simulation only: these tests do not certify the installed EmDash API's CAS. */
function scenario() {
  let version = 1,
    live = { title: 'Before' },
    draft = null,
    status = 'published',
    slug = 'home',
    auditCalls = 0,
    allowed = true,
    dropResponse = false,
    publishFails = false
  const rows = new Map()
  const read = () => ({
    id: 'record',
    slug,
    revision: `r${version}`,
    data: structuredClone(live),
    draft: draft ? { data: structuredClone(draft) } : null,
    status,
    publishedAt: '2026-10-20T00:00:00Z',
    scheduledAt: null
  })
  const check = (expected) => {
    if (expected !== `r${version}`)
      throw Object.assign(new Error('conflict'), { code: 'QUALITY_CONTENT_CONFLICT' })
  }
  const cms = {
    capabilities: {
      conditionalContentWrite: true,
      conditionalPublish: true,
      conditionalUnpublish: true,
      conditionalDiscardDraft: true,
      conditionalSlugRename: true,
      evidenceHash: 'synthetic-protocol'
    },
    read: async () => read(),
    rename: async (_op, newSlug, { expectedRevision }) => {
      check(expectedRevision)
      slug = newSlug
      version++
      return { revision: `r${version}` }
    },
    write: async (_op, fields, { expectedRevision }) => {
      check(expectedRevision)
      draft = { ...live, ...draft, ...structuredClone(fields) }
      version++
      return { revision: `r${version}` }
    },
    publish: async (_op, { expectedRevision }) => {
      check(expectedRevision)
      if (publishFails) throw new Error('publish failed')
      live = draft
      draft = null
      status = 'published'
      version++
      if (dropResponse) throw new Error('response lost')
      return { revision: `r${version}` }
    },
    unpublish: async (_op, { expectedRevision }) => {
      check(expectedRevision)
      status = 'draft'
      draft ??= structuredClone(live)
      version++
      return { revision: `r${version}` }
    },
    discardDraft: async (_op, { expectedRevision }) => {
      check(expectedRevision)
      draft = null
      version++
      return { revision: `r${version}` }
    },
    restore: async (_op, before, { expectedRevision }) => {
      check(expectedRevision)
      live = structuredClone(before.data)
      status = before.status
      version++
    }
  }
  const store = {
    get: async (id, a) => {
      const r = rows.get(id)
      return r?.account_id === a ? structuredClone(r) : null
    },
    intent: async (r) => {
      const row = {
        id: r.id,
        account_id: r.accountId,
        before_image: r.before,
        after_image: r.after,
        operation: r.operation,
        state: 'pending',
        receipt: {}
      }
      rows.set(r.id, row)
      return structuredClone(row)
    },
    record: async (id, a, state, receipt) => {
      const r = rows.get(id)
      assert.equal(r.account_id, a)
      r.state = state
      Object.assign(r.receipt, receipt)
    }
  }
  const release = { tag: 'business', version: '1', archiveSha256: 'archive' }
  const run = { id: 'run', account_id: 'a', input: { manifest: { release } } },
    site = { accountId: 'a', siteKey: 'owned', platform: 'emdash', release }
  const plan = {
    hash: 'plan',
    validation: { state: 'validated' },
    operations: [
      {
        kind: 'update',
        key: 'home/home@en',
        collection: 'home',
        slug: 'home',
        locale: 'en',
        fields: { title: 'After' }
      }
    ]
  }
  const args = {
    run,
    site,
    plan,
    buildId: 'build',
    cms,
    store,
    checkAllowed: async () => {
      if (!allowed) throw new Error('STOPPED')
    },
    audit: async () => {
      auditCalls++
    }
  }
  return {
    args,
    read,
    rows,
    setAllowed: (v) => (allowed = v),
    setDrop: (v) => (dropResponse = v),
    setPublishFailure: (v) => (publishFails = v),
    edit: () => {
      live = { title: 'Human edit' }
      version++
    },
    auditCalls: () => auditCalls
  }
}
test('an unaudited CMS refuses before any CMS read or write', async () => {
  const s = scenario()
  let reads = 0
  await assert.rejects(
    executeQualityPlan({
      ...s.args,
      cms: {
        ...s.args.cms,
        capabilities: {},
        read: async () => {
          reads++
        }
      }
    }),
    /QUALITY_CONDITIONAL_CMS_UNAVAILABLE/
  )
  assert.equal(reads, 0)
  assert.equal(s.rows.size, 0)
})

test('repair freezes reviewed revisions through intent, native CAS and owned partial resume', async () => {
  const reviewed = (s) => {
    s.args.plan.operations[0].id = s.read().id
    const content = [qualityReviewSnapshotRow(s.args.plan.operations[0], s.read())]
    return { content, hash: qualityHash(content) }
  }
  const changed = scenario(),
    expectedReview = reviewed(changed)
  changed.edit()
  await assert.rejects(
    executeQualityPlan({ ...changed.args, expectedReview }),
    /QUALITY_REPAIR_CONTENT_CONFLICT/
  )
  assert.equal(changed.rows.size, 0)
  assert.equal(changed.read().data.title, 'Human edit')

  const racing = scenario(),
    raceReview = reviewed(racing),
    write = racing.args.cms.write
  racing.args.cms.write = async (...args) => {
    racing.edit()
    return write(...args)
  }
  await assert.rejects(executeQualityPlan({ ...racing.args, expectedReview: raceReview }), {
    code: 'QUALITY_CONTENT_CONFLICT'
  })
  assert.equal([...racing.rows.values()][0].before_image.revision, raceReview.content[0].revision)
  assert.equal(racing.read().data.title, 'Human edit')

  const resume = scenario(),
    resumeReview = reviewed(resume)
  resume.setPublishFailure(true)
  await assert.rejects(executeQualityPlan({ ...resume.args, expectedReview: resumeReview }), /publish failed/)
  resume.setPublishFailure(false)
  await executeQualityPlan({ ...resume.args, expectedReview: resumeReview })
  const revision = resume.read().revision
  await executeQualityPlan({ ...resume.args, expectedReview: resumeReview })
  assert.equal(resume.read().revision, revision)
  assert.equal(resume.read().data.title, 'After')
  const forged = structuredClone(resumeReview)
  forged.content[0].revision = 'adopt-new-human-revision'
  forged.hash = qualityHash(forged.content)
  await assert.rejects(
    executeQualityPlan({ ...resume.args, expectedReview: forged }),
    /QUALITY_REPAIR_CONTENT_CONFLICT/
  )
})

test('repair replay preserves an already-unpublished reviewed member and its unchanged draft', async () => {
  const s = scenario()
  s.args.plan.operations[0].kind = 'unpublish'
  delete s.args.plan.operations[0].fields
  await executeQualityPlan(s.args)
  const plan = {
    ...s.args.plan,
    hash: 'repair-plan',
    operations: [{ ...s.args.plan.operations[0], id: 'record' }]
  }
  const content = [qualityReviewSnapshotRow(plan.operations[0], s.read())]
  const args = { ...s.args, plan, expectedReview: { content, hash: qualityHash(content) } }
  const before = s.read()
  const applied = await executeQualityPlan(args)
  assert.equal(applied.receipts[0].state, 'unchanged')
  const replay = await executeQualityPlan(args)
  assert.equal(replay.receipts[0].state, 'unchanged')
  assert.deepEqual(s.read(), before)
})
test('account/release fence and unsupported operations preflight before a partial write', async () => {
  const s = scenario()
  await assert.rejects(
    executeQualityPlan({ ...s.args, site: { ...s.args.site, accountId: 'b' } }),
    /QUALITY_EXECUTION_SCOPE/
  )
  await assert.rejects(
    executeQualityPlan({
      ...s.args,
      site: { ...s.args.site, release: { ...s.args.site.release, version: 'latest' } }
    }),
    /QUALITY_INSTALLED_RELEASE_MISMATCH/
  )
  await assert.rejects(
    executeQualityPlan({
      ...s.args,
      plan: { ...s.args.plan, operations: [...s.args.plan.operations, { kind: 'sql' }] }
    }),
    /QUALITY_OPERATION_CAPABILITY_UNAVAILABLE/
  )
  assert.equal(s.rows.size, 0)
  assert.equal(s.read().data.title, 'Before')
})
test('intent precedes sending, publish is read back, replay adopts the existing result', async () => {
  const s = scenario(),
    out = await executeQualityPlan(s.args)
  assert.equal(out.state, 'written')
  assert.equal(s.read().data.title, 'After')
  assert.equal(s.auditCalls(), 1)
  const revision = s.read().revision
  const replay = await executeQualityPlan(s.args)
  assert.equal(replay.receipts[0].reconciled, true)
  assert.equal(s.read().revision, revision)
})
test('lost publish response is observed without another write or invented ownership', async () => {
  const s = scenario()
  s.setDrop(true)
  await assert.rejects(executeQualityPlan(s.args), /response lost/)
  const revision = s.read().revision
  assert.equal([...s.rows.values()][0].state, 'uncertain')
  await assert.rejects(executeQualityPlan(s.args), /QUALITY_MUTATION_UNCERTAIN/)
  assert.equal([...s.rows.values()][0].state, 'converged')
  assert.equal([...s.rows.values()][0].receipt.undoable, false)
  assert.equal(s.read().revision, revision)
})
test('publish failure resumes only its recorded draft; a human edit causes conflict', async () => {
  const s = scenario()
  s.setPublishFailure(true)
  await assert.rejects(executeQualityPlan(s.args), /publish failed/)
  assert.equal(s.read().data.title, 'Before')
  assert.equal(s.read().draft.data.title, 'After')
  s.setPublishFailure(false)
  await executeQualityPlan(s.args)
  assert.equal(s.read().data.title, 'After')
  const other = scenario()
  other.setPublishFailure(true)
  await assert.rejects(executeQualityPlan(other.args), /publish failed/)
  other.edit()
  other.setPublishFailure(false)
  await assert.rejects(executeQualityPlan(other.args), /QUALITY_CONTENT_CONFLICT/)
  assert.equal(other.read().data.title, 'Human edit')
})
test('Stop before the next operation leaves finite partial receipts', async () => {
  const s = scenario(),
    audit = s.args.audit
  s.args.audit = async (r) => {
    await audit(r)
    s.setAllowed(false)
  }
  s.args.plan.operations.push({
    ...s.args.plan.operations[0],
    key: 'about/about@en',
    collection: 'about',
    slug: 'about'
  })
  await assert.rejects(executeQualityPlan(s.args), /STOPPED/)
  assert.equal(s.rows.size, 2)
  assert.deepEqual(
    [...s.rows.values()].map((r) => r.state),
    ['written', 'pending']
  )
})
test('compensating restore reads back the before image and never overwrites later edits', async () => {
  const s = scenario(),
    out = await executeQualityPlan(s.args),
    id = out.receipts[0].id
  const restored = await restoreQualityOperation({ ...s.args, id, accountId: 'a' })
  assert.equal(restored.state, 'restored')
  assert.equal(s.read().data.title, 'Before')
  const t = scenario(),
    written = await executeQualityPlan(t.args)
  t.edit()
  await assert.rejects(
    restoreQualityOperation({ ...t.args, id: written.receipts[0].id, accountId: 'a' }),
    /QUALITY_RESTORE_CONFLICT/
  )
  assert.equal(t.read().data.title, 'Human edit')
})

test('unpublish keeps its own draft and compensation publishes only that revision', async () => {
  const s = scenario()
  s.args.plan.operations[0] = { ...s.args.plan.operations[0], kind: 'unpublish', fields: undefined }
  const made = await executeQualityPlan(s.args)
  assert.equal(s.read().status, 'draft')
  assert.equal(s.read().draft.data.title, 'Before')
  await restoreQualityOperation({ ...s.args, id: made.receipts[0].id, accountId: 'a' })
  assert.equal(s.read().status, 'published')
  assert.equal(s.read().draft, null)
})

test('a failed publish can be compensated by discarding only the recorded draft', async () => {
  const s = scenario()
  s.setPublishFailure(true)
  await assert.rejects(executeQualityPlan(s.args), /publish failed/)
  const row = [...s.rows.values()][0]
  await restoreQualityOperation({ ...s.args, id: row.id, accountId: 'a' })
  assert.equal(s.read().data.title, 'Before')
  assert.equal(s.read().draft, null)
})

test('a same-value human edit never grants restoration ownership', async () => {
  const s = scenario()
  s.setDrop(true)
  await assert.rejects(executeQualityPlan(s.args), /response lost/)
  const row = [...s.rows.values()][0]
  await assert.rejects(
    restoreQualityOperation({ ...s.args, id: row.id, accountId: 'a' }),
    /QUALITY_RESTORE_CONFLICT/
  )
  assert.equal(s.read().data.title, 'After')
})

test('compensation resumes its own before-image draft after a failed restore publish', async () => {
  const s = scenario(),
    made = await executeQualityPlan(s.args)
  s.setPublishFailure(true)
  await assert.rejects(
    restoreQualityOperation({ ...s.args, id: made.receipts[0].id, accountId: 'a' }),
    /publish failed/
  )
  assert.equal(s.read().data.title, 'After')
  assert.equal(s.read().draft.data.title, 'Before')
  s.setPublishFailure(false)
  await restoreQualityOperation({ ...s.args, id: made.receipts[0].id, accountId: 'a' })
  assert.equal(s.read().data.title, 'Before')
})

test('resume preflights a later saved intent before writing an earlier pending target', async () => {
  const s = scenario(),
    first = s.args.plan.operations[0]
  const later = { ...first, key: 'about/about@en', slug: 'about', fields: { title: 'Later' } }
  const plan = { ...s.args.plan, operations: [first, later] }
  let writes = 0
  const read = s.args.cms.read,
    get = s.args.store.get,
    write = s.args.cms.write
  s.args.cms.read = async (operation) =>
    operation.slug === 'about'
      ? {
          ...(await read(operation)),
          id: 'later-record',
          revision: 'human-r2',
          data: { title: 'Human later edit' }
        }
      : read(operation)
  s.args.cms.write = async (...args) => {
    writes++
    return write(...args)
  }
  s.args.store.get = async (id, accountId) => {
    if (s.rows.size > 0) {
      const row = {
        id,
        operation: later,
        account_id: accountId,
        state: 'pending',
        receipt: {},
        before_image: { ...s.read(), id: 'later-record', revision: 'r1' },
        after_image: { data: { title: 'Later' }, status: 'published' }
      }
      s.rows.set(id, row)
      return structuredClone(row)
    }
    return get(id, accountId)
  }
  await assert.rejects(executeQualityPlan({ ...s.args, plan }), /QUALITY_CONTENT_CONFLICT/)
  assert.equal(writes, 0)
  assert.equal(s.read().data.title, 'Before')
})

test('one record resumes from its published receipt before rename and restores both data and URL', async () => {
  const s = scenario()
  s.args.plan.operations[0].newSlug = 'coffee-by-the-river'
  let blocked = true,
    renames = 0
  const rename = s.args.cms.rename
  s.args.cms.rename = async (...args) => {
    renames++
    if (blocked) throw new Error('network before rename')
    return rename(...args)
  }
  await assert.rejects(executeQualityPlan(s.args), /network before rename/)
  assert.equal(s.read().data.title, 'After')
  assert.equal(s.read().slug, 'home')
  const row = [...s.rows.values()][0]
  assert.ok(row.receipt.publishRevision)
  blocked = false
  await executeQualityPlan(s.args)
  assert.equal(s.read().slug, 'coffee-by-the-river')
  assert.equal(s.read().data.title, 'After')
  await restoreQualityOperation({ id: row.id, accountId: 'a', ...s.args })
  assert.equal(s.read().slug, 'home')
  assert.equal(s.read().data.title, 'Before')
  assert.equal(renames, 3)
})

test('a lost rename response never grants ownership from matching values', async () => {
  const s = scenario()
  s.args.plan.operations[0].newSlug = 'coffee-by-the-river'
  const rename = s.args.cms.rename
  s.args.cms.rename = async (...args) => {
    await rename(...args)
    throw new Error('rename response lost')
  }
  await assert.rejects(executeQualityPlan(s.args), /rename response lost/)
  assert.equal(s.read().slug, 'coffee-by-the-river')
  await assert.rejects(executeQualityPlan(s.args), /QUALITY_MUTATION_UNCERTAIN/)
  const row = [...s.rows.values()][0]
  await assert.rejects(
    restoreQualityOperation({ id: row.id, accountId: 'a', ...s.args }),
    /QUALITY_RESTORE_UNAVAILABLE/
  )
  assert.equal(s.read().data.title, 'After')
})

test('restoration resumes after its own publish without repeating the data write', async () => {
  const s = scenario()
  s.args.plan.operations[0].newSlug = 'coffee-by-the-river'
  let writes = 0,
    blocked = false
  const write = s.args.cms.write,
    rename = s.args.cms.rename
  s.args.cms.write = (...args) => {
    writes++
    return write(...args)
  }
  s.args.cms.rename = (...args) => {
    if (blocked) throw new Error('restore rename unavailable')
    return rename(...args)
  }
  await executeQualityPlan(s.args)
  const row = [...s.rows.values()][0]
  blocked = true
  await assert.rejects(
    restoreQualityOperation({ id: row.id, accountId: 'a', ...s.args }),
    /restore rename unavailable/
  )
  assert.equal(s.read().data.title, 'Before')
  assert.equal(s.read().slug, 'coffee-by-the-river')
  blocked = false
  await restoreQualityOperation({ id: row.id, accountId: 'a', ...s.args })
  assert.equal(s.read().slug, 'home')
  assert.equal(writes, 2)
})

test('a human edit after publish blocks the remaining rename and restoration', async () => {
  const s = scenario()
  s.args.plan.operations[0].newSlug = 'coffee-by-the-river'
  const rename = s.args.cms.rename
  s.args.cms.rename = async (...args) => {
    s.edit()
    return rename(...args)
  }
  await assert.rejects(executeQualityPlan(s.args), { code: 'QUALITY_CONTENT_CONFLICT' })
  const row = [...s.rows.values()][0]
  await assert.rejects(
    restoreQualityOperation({ id: row.id, accountId: 'a', ...s.args }),
    /QUALITY_RESTORE_UNAVAILABLE/
  )
  assert.equal(s.read().data.title, 'Human edit')
  assert.equal(s.read().slug, 'home')
})
