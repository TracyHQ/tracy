// Issue #74 — seeder/spec/prune: archive routes drop layout sections, unsupported modules, author and tag
// gaps, form labels, prune ignoring usermeta. One fixture per fixed item (named by its S- number); the
// items the seeder cannot finish are listed in references/demo-content.md "Seeder gaps (#68, #74)".
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fakeSite } from './lib/fake-site.mjs'
import { seedSpec, body } from './lib/seeder-spec.mjs'
// The post-batch regressions (refused tag writes, a missing taxonomy) ride along: this file is in the round checks.
import './post-batch.test.mjs'
import {
  archivePageContent,
  renderAside,
  buildPageContent,
  buildArchiveContent,
  articlePostLink,
  buildNavigation,
  renderAcm,
  declaredClassRule,
  authorMeta,
  declaredAuthors,
  tagsOfArchive,
  pagerLabels,
  checkPostTags
} from '../seed.mjs'
import { sourceForm, cf7Form } from '../lib/form-embed.mjs'
import { checkMarkup } from '../lib/block-fill.mjs'
import { collectUsermeta, parseUsermeta, usermetaNaming, withUsermetaRefs, deleteUnreferenced, deleteUnreferencedPhp, parseAttachmentDeletes, ATTDEL_MARKER, USERMETA_MARKER } from '../quickstart/prune-usermeta.mjs'
import { applyPrune } from '../quickstart/prune-audit.mjs'
import { classifyMedia } from '../quickstart/lib.mjs'

// ── S-36 / S-46: Joomla's separated label column ────────────────────────────────────────────────
const joomlaForm = `<form><fieldset>
<div class="control-group"><div class="control-label"><label id="n-lbl" for="jform_contact_name">Name<span class="star">&#160;*</span></label></div><div class="controls"><input type="text" name="jform[contact_name]" id="jform_contact_name" required></div></div>
<div class="control-group"><div class="control-label"><label for="jform_contact_email">Email<span class="star">&#160;*</span></label></div><div class="controls"><input type="email" id="jform_contact_email"></div></div>
<div class="control-group"><div class="control-label"><label for="jform_contact_message">Message</label></div><div class="controls"><textarea id="jform_contact_message"></textarea></div></div>
<button type="submit">Send</button></fieldset></form>`

test('S-36/S-46 sourceForm: a label[for] in a sibling column names the control that carries the id', () => {
  const f = sourceForm(joomlaForm)
  assert.deepEqual(f.fields.map((x) => [x.kind, x.label, x.required]), [['text', 'Name', true], ['email', 'Email', true], ['textarea', 'Message', false]])
  const { form } = cf7Form(f)
  assert.match(form, /Name[^]*\[text\* name\]/)
  assert.match(form, /\[email\* email\]/)
  assert.doesNotMatch(form, /\[text\* text-1\]/, 'no field is left with a generated name for want of a label')
})

test('S-36/S-46 sourceForm: a label that points at another control, or an id two controls share, is not borrowed', () => {
  const other = sourceForm('<div><div><label for="a">Alpha</label></div><div><input id="b"></div></div>')
  assert.equal(other.fields[0].label, '', 'label[for=a] does not name #b; the source states no label for it')
  const dup = sourceForm('<div><label for="x">Shared</label><div><input id="x"></div><div><input id="x"></div></div>')
  assert.deepEqual(dup.fields.map((f) => f.label), ['', ''], 'an id two controls carry names neither')
  const none = sourceForm('<div><div><input type="text" placeholder="Only a hint"></div></div>')
  assert.equal(none.fields[0].label, '', 'no label in the source: none is made up')
})

test('S-36/S-46 sourceForm: an ordinary wrapper label without for still names its control, and markup-like text stays text', () => {
  const f = sourceForm('<div><label>A &lt;b&gt; label</label><input type="text"></div>')
  assert.equal(f.fields[0].label, 'A <b> label')
  assert.match(cf7Form(f).form, /A &lt;b&gt; label/)
  assert.doesNotMatch(cf7Form(f).form, /<b>/)
})

test('S-36/S-46 sourceForm: two controls sharing an id take no label, not even an adjacent label[for] of that id', () => {
  const f = sourceForm('<div><label for="x">Name</label><input id="x" type="text"><input id="x" type="text"></div>')
  assert.deepEqual(f.fields.map((x) => x.label), ['', ''])
})

// ── S-48: prune reads usermeta ──────────────────────────────────────────────────────────────────
const refs = (over = {}) => ({
  attachments: [
    { ID: 50, post_type: 'attachment', post_status: 'inherit', post_name: 'avatar', post_parent: 0, file: '2026/09/avatar.jpg', sizes: [] },
    { ID: 51, post_type: 'attachment', post_status: 'inherit', post_name: 'orphan', post_parent: 0, file: '2026/09/orphan.jpg', sizes: [] }
  ],
  content: [],
  meta: [],
  termmeta: [],
  options: [],
  files: [],
  ...over
})
const um = (rows) => ({ usermeta: rows })

test('S-48 classifyMedia alone calls the avatar an orphan (the measured defect); withUsermetaRefs keeps it and leaves the real orphan', () => {
  const rows = classifyMedia(refs())
  assert.deepEqual(rows.map((r) => r.verdict), ['PRUNE', 'PRUNE'], 'REFS_PHP does not read usermeta')
  const out = withUsermetaRefs(rows, um([{ user_id: '7', meta_key: 'tracy_avatar', meta_value: '50' }]))
  assert.deepEqual(out.map((r) => r.verdict), ['KEEP', 'PRUNE'])
  assert.match(out[0].why, /user meta tracy_avatar of user 7/)
  assert.equal(out[0].remove, undefined, 'a kept row carries no removal')
})

test('S-48 withUsermetaRefs fails closed: unread or failed user meta turns every attachment PRUNE into UNKNOWN', () => {
  const rows = classifyMedia(refs())
  for (const media of [{}, { usermetaError: 'wp eval exited 1' }, null, { usermeta: 'nope' }]) {
    const out = withUsermetaRefs(rows, media)
    assert.deepEqual(out.map((r) => r.verdict), ['UNKNOWN', 'UNKNOWN'], JSON.stringify(media))
    assert.equal(out.every((r) => /user meta was not read/.test(r.why)), true)
  }
  const keep = classifyMedia(refs({ meta: [{ post_id: 1, meta_key: '_thumbnail_id', meta_value: '50' }] }))
  assert.equal(withUsermetaRefs(keep, {})[0].verdict, 'KEEP', 'a KEEP is never turned into anything else')
})

test('S-48 usermetaNaming: the whole value or a serialized/JSON member; a longer number or another key shape is not a hit', () => {
  const rows = [
    { meta_key: 'tracy_avatar', meta_value: '50' },
    { meta_key: 'photo_ids', meta_value: 'a:2:{i:0;i:50;i:1;i:9;}' },
    { meta_key: 'gallery', meta_value: '{"id":50}' },
    { meta_key: 'avatar_list', meta_value: '[7,50,8]' },
    { meta_key: 'avatar', meta_value: '150' },
    { meta_key: 'avatar', meta_value: '500' }
  ]
  assert.deepEqual(usermetaNaming(50, rows).map((r) => r.meta_key), ['tracy_avatar', 'photo_ids', 'gallery', 'avatar_list'])
  assert.deepEqual(usermetaNaming('abc', rows), [])
  assert.deepEqual(usermetaNaming(5, rows), [])
})

test('S-48 parseUsermeta / collectUsermeta: a bad answer is an error, never an empty list', () => {
  assert.match(parseUsermeta('').error, /no user meta data/)
  assert.match(parseUsermeta(`${USERMETA_MARKER}{oops`).error, /not JSON/)
  assert.match(parseUsermeta(`${USERMETA_MARKER}{"usermeta":null}`).error, /no usermeta list/)
  assert.match(parseUsermeta(`${USERMETA_MARKER}{"usermeta":[1]}`).error, /not a complete meta row/)
  assert.match(parseUsermeta(`${USERMETA_MARKER}{"usermeta":[{"user_id":"1","meta_key":"tracy_avatar"}]}`).error, /not a complete meta row/, 'a row without meta_value is an incomplete answer')
  assert.match(parseUsermeta(`${USERMETA_MARKER}{"usermeta":[{"meta_key":"k","meta_value":{}}]}`).error, /not a complete meta row/)
  assert.deepEqual(parseUsermeta(`Notice: x\n${USERMETA_MARKER}{"usermeta":[]}`), { usermeta: [] })
  assert.match(collectUsermeta(() => ({ status: 255, stdout: '', stderr: 'boom' })).error, /exited 255/)
  assert.match(collectUsermeta(() => { throw new Error('timed out') }).error, /timed out/)
  assert.deepEqual(collectUsermeta(() => ({ status: 0, stdout: `${USERMETA_MARKER}{"usermeta":[{"user_id":"1","meta_key":"tracy_avatar","meta_value":"50"}]}`, stderr: '' })).usermeta.length, 1)
})

function pruneStand({ usermeta }) {
  const calls = []
  const deletedInEval = []
  let now = usermeta
  const wp = (args, opts = {}) => {
    calls.push(args)
    if (args[0] === 'eval' && String(args[1]).includes(ATTDEL_MARKER)) {
      // The combined check and delete: judged on the meta as it is when this one call runs.
      if (now === null) return { status: 255, stdout: '', stderr: 'db gone' }
      const want = JSON.parse(Buffer.from(/base64_decode\('([^']*)'/.exec(String(args[1]))[1], 'base64').toString())
      const results = {}
      for (const { id } of want) {
        if (usermetaNaming(id, now).length) results[id] = 'named: tracy_avatar of user 3'
        else {
          results[id] = 'deleted'
          deletedInEval.push(id)
        }
      }
      return { status: 0, stdout: `${ATTDEL_MARKER}${JSON.stringify({ results, left: [], withheld: [] })}`, stderr: '' }
    }
    if (args[0] === 'eval' && String(args[1]).includes(USERMETA_MARKER)) {
      if (now === null) return { status: 255, stdout: '', stderr: 'db gone' }
      return { status: 0, stdout: `${USERMETA_MARKER}${JSON.stringify({ usermeta: now })}`, stderr: '' }
    }
    if (args[0] === 'eval') {
      // ownersPhp re-read: the attachments still exist as attachments
      return { status: 0, stdout: `__TRACY_OWNERS__${JSON.stringify({ users: [], posts: [{ ID: '51', post_type: 'attachment', post_status: 'inherit' }, { ID: '50', post_type: 'attachment', post_status: 'inherit' }] })}`, stderr: '' }
    }
    return opts.raw ? { status: 0, stdout: '', stderr: '' } : ''
  }
  return { wp, calls, deletedInEval, set: (v) => (now = v) }
}

test('S-48 applyPrune revalidates the user meta right before deleting an attachment: a reference that appeared since the audit, or a failed re-read, stops the deletion', async () => {
  const { OWNERS_MARKER } = await import('../quickstart/lib.mjs')
  const deletes = (calls) => calls.filter((c) => c[0] === 'post' && c[1] === 'delete')
  const mk = (state) => {
    const st = pruneStand(state)
    const wp = (args, opts) => (args[0] === 'eval' && !String(args[1]).includes(USERMETA_MARKER) && !String(args[1]).includes(ATTDEL_MARKER) ? { status: 0, stdout: `${OWNERS_MARKER}${JSON.stringify({ users: [], posts: [{ ID: '51', post_type: 'attachment', post_status: 'inherit' }] })}`, stderr: '' } : st.wp(args, opts))
    return { ...st, wp }
  }
  const audit = () => withUsermetaRefs(classifyMedia(refs({ attachments: [refs().attachments[1]] })), um([]))

  const combined = (calls) => calls.filter((c) => c[0] === 'eval' && String(c[1]).includes(ATTDEL_MARKER))

  const clean = mk({ usermeta: [] })
  const ok = applyPrune(audit(), { wp: clean.wp, webroot: '.' })
  assert.deepEqual(clean.deletedInEval.map(String), ['51'], 'a genuine orphan is still removed')
  assert.equal(ok[0].verdict, 'REMOVED')
  assert.equal(combined(clean.calls).length, 1)
  assert.deepEqual(deletes(clean.calls), [], 'no separate delete call after a separate check: the check and the deletion are one wp call')
  assert.equal(clean.calls.filter((c) => c[0] === 'eval' && String(c[1]).includes(USERMETA_MARKER)).length, 0, 'no separate user meta read that could go stale before the delete')

  const late = mk({ usermeta: [{ user_id: '3', meta_key: 'tracy_avatar', meta_value: '51' }] })
  const rows = applyPrune(audit(), { wp: late.wp, webroot: '.' })
  assert.deepEqual(late.deletedInEval, [], 'the avatar set after the audit is not deleted')
  assert.equal(rows[0].verdict, 'UNKNOWN')
  assert.match(rows[0].why, /named: tracy_avatar/)

  const broken = mk({ usermeta: null })
  const r2 = applyPrune(audit(), { wp: broken.wp, webroot: '.' })
  assert.deepEqual([broken.deletedInEval, deletes(broken.calls)], [[], []], 'a call that failed deletes nothing')
  assert.equal(r2[0].verdict, 'UNKNOWN')
  assert.match(r2[0].why, /wp eval exited 255/)

  const unreadable = deleteUnreferenced(() => ({ status: 0, stdout: 'no marker', stderr: '' }), [{ remove: { wp: ['post', 'delete', '1'], expect: { post_type: 'attachment', post_status: 'inherit' } }, why: 'x' }])
  assert.deepEqual(unreadable, [])
  const expect = { post_type: 'attachment', post_status: 'inherit' }
  const partial = [{ remove: { wp: ['post', 'delete', '1'], expect }, why: 'x' }, { remove: { wp: ['post', 'delete', '2'], expect }, why: 'y' }]
  const done = deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"1":"deleted"},"left":[],"withheld":[]}`, stderr: '' }), partial)
  assert.deepEqual(done.map((r) => r.remove.wp[2]), ['1'])
  assert.equal(partial[1].verdict, 'UNKNOWN', 'an id the report does not account for is never assumed deleted')
  const bad = [{ remove: { wp: ['post', 'delete', '1; DROP'], expect }, why: 'z' }]
  assert.deepEqual(deleteUnreferenced(() => assert.fail('no call for a bad id'), bad), [])
  assert.equal(bad[0].verdict, 'UNKNOWN')
  const php = deleteUnreferencedPhp([{ id: '51', type: 'attachment', status: 'inherit' }, { id: '7', type: 'attachment', status: 'inherit' }])
  const carried = JSON.parse(Buffer.from(/base64_decode\('([^']*)'/.exec(php)[1], 'base64').toString())
  assert.deepEqual(carried, [{ id: 51, type: 'attachment', status: 'inherit' }, { id: 7, type: 'attachment', status: 'inherit' }])
  // one transaction per attachment: locking reads over every place that can name it, type/status re-read, rollback on any doubt
  for (const part of ['START TRANSACTION', 'ROLLBACK', 'COMMIT', 'FOR UPDATE', '{$wpdb->usermeta}', '{$wpdb->posts}', '{$wpdb->postmeta}', '{$wpdb->termmeta}', '{$wpdb->options}', 'changed since the audit'])
    assert.ok(php.includes(part), `the combined check and delete carries ${part}`)
  // an id past the safe integer range, a leading zero, a sign or a repeat is refused before any PHP is built
  for (const id of ['9007199254740993', '007', '+5', '0', '5.0', '1e3'])
    assert.throws(() => deleteUnreferencedPhp([{ id, type: 'attachment', status: 'inherit' }]), /positive safe integer/, id)
  for (const id of ['9007199254740993', '007', '0']) {
    const rows = [{ remove: { wp: ['post', 'delete', id], expect }, why: 'x' }]
    assert.deepEqual(deleteUnreferenced(() => assert.fail(`no call for id ${id}`), rows), [])
    assert.equal(rows[0].verdict, 'UNKNOWN')
  }
  const twice = [{ remove: { wp: ['post', 'delete', '4'], expect }, why: 'x' }, { remove: { wp: ['post', 'delete', '4'], expect }, why: 'y' }]
  assert.deepEqual(deleteUnreferenced(() => assert.fail('no call for a repeated id'), twice), [])
  // every source classifyMedia counts is read inside the transaction, and files wait for the commit
  for (const part of ["$d['sizes']", "'[gallery'", 'RecursiveDirectoryIterator', "add_filter('wp_delete_file'", "'commit failed, outcome unknown", "'rollback failed, stopped'", 'not processed'])
    assert.ok(php.includes(part), `the combined check and delete carries ${part}`)
  assert.ok(php.indexOf("'COMMIT'") < php.indexOf('wp_delete_file($f)'), 'files are removed after the commit')
  assert.ok(/\$res\[\$id\] = 'commit failed[^\n]*verify the attachment by hand';\n    break;/.test(php), 'a failed COMMIT stops the run')
  assert.ok(php.includes("'rollback failed, stopped'; break;"), 'a failed ROLLBACK stops the run')
  // two deleted attachments, one file left behind: the report names the attachment it belongs to
  const two = [1, 2].map((n) => ({ remove: { wp: ['post', 'delete', String(n)], expect }, why: 'x' }))
  deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"1":"deleted","2":"deleted"},"left":{"2":["/u/b.jpg"]},"withheld":[]}`, stderr: '' }), two)
  assert.doesNotMatch(two[0].why, /could not be removed/, 'the attachment whose files all went is not blamed')
  assert.match(two[1].why, /\/u\/b\.jpg/)
  // a run that stopped: the attachment it stopped on and every later one are UNKNOWN, none removed
  const halted = [1, 2].map((n) => ({ remove: { wp: ['post', 'delete', String(n)], expect }, why: 'x' }))
  assert.deepEqual(deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"1":"commit failed, outcome unknown, stopped; verify the attachment by hand","2":"not processed: an earlier attachment stopped the run"},"left":[],"withheld":[]}`, stderr: '' }), halted), [])
  assert.deepEqual(halted.map((r) => r.verdict), ['UNKNOWN', 'UNKNOWN'])
  const left = deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"1":"deleted"},"left":{"1":["/u/a.jpg"]},"withheld":[]}`, stderr: '' }), [{ remove: { wp: ['post', 'delete', '1'], expect }, why: 'x' }])
  assert.match(left[0].why, /1 file\(s\) could not be removed.*\/u\/a\.jpg/, 'a file left behind is reported')
  // a report without a well-formed left/withheld list never marks anything REMOVED, and names the ids
  for (const bad of ['{"results":{"1":"deleted"}}', '{"results":{"1":"deleted"},"left":"x","withheld":[]}', '{"results":{"1":"deleted"},"left":[],"withheld":{"1":"a"}}', '{"results":{"1":"deleted"},"left":{"1":[5]},"withheld":[]}']) {
    const rows = [{ remove: { wp: ['post', 'delete', '1'], expect }, why: 'x' }]
    assert.deepEqual(deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}${bad}`, stderr: '' }), rows), [], bad)
    assert.equal(rows[0].verdict, 'UNKNOWN')
    assert.match(rows[0].why, /attachment #1/)
  }
  // a failed COMMIT lists the attachment and the files that were held back
  const cf = [{ remove: { wp: ['post', 'delete', '3'], expect }, why: 'x' }]
  deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"3":"commit failed, outcome unknown (state unverified), stopped"},"left":[],"withheld":{"3":["/u/c.jpg","/u/c-150.jpg"]}}`, stderr: '' }), cf)
  assert.equal(cf[0].verdict, 'UNKNOWN')
  assert.match(cf[0].why, /2 file\(s\) held back.*\/u\/c\.jpg.*\/u\/c-150\.jpg/)
  const noExpect = [{ remove: { wp: ['post', 'delete', '1'] }, why: 'x' }]
  assert.deepEqual(deleteUnreferenced(() => assert.fail('no call without the audited type and status'), noExpect), [])
  assert.equal(noExpect[0].verdict, 'UNKNOWN')
})

test('S-48 prune: a failed COMMIT or a malformed left report halts the run, names ids and paths, and no later deletion starts', async () => {
  const expect = { post_type: 'attachment', post_status: 'inherit' }
  const mk = (id) => ({ area: 'attachment', item: `#${id}`, verdict: 'PRUNE', why: 'x', remove: { wp: ['post', 'delete', String(id), '--force'], expect } })
  // failed COMMIT: halt names the id and the held files
  const o1 = {}
  deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"1":"commit failed, outcome unknown (state unverified), stopped","2":"not processed: an earlier attachment stopped the run"},"left":[],"withheld":{"1":["/u/a.jpg"]}}`, stderr: '' }), [mk(1), mk(2)], o1)
  assert.match(o1.halt, /affected attachment ids: 1\b/)
  assert.match(o1.halt, /#1: \/u\/a\.jpg/)
  // malformed left: never REMOVED, halt names every id and the withheld paths that are known
  const rows = [mk(3), mk(4)]
  const o2 = {}
  const removed = deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"3":"deleted","4":"deleted"},"left":"oops","withheld":{"3":["/u/w.jpg"]}}`, stderr: '' }), rows, o2)
  assert.deepEqual(removed, [])
  assert.deepEqual(rows.map((r) => r.verdict), ['UNKNOWN', 'UNKNOWN'])
  assert.match(o2.halt, /ids: 3, 4/)
  assert.match(o2.halt, /#3: \/u\/w\.jpg/)
  // a missing report and a failed call halt as well
  const o3 = {}
  deleteUnreferenced(() => ({ status: 1, stdout: '', stderr: 'boom' }), [mk(5)], o3)
  assert.match(o3.halt, /ids: 5\b/)
  // a clean run sets no halt
  const o4 = {}
  deleteUnreferenced(() => ({ status: 0, stdout: `${ATTDEL_MARKER}{"results":{"6":"deleted"},"left":[],"withheld":[]}`, stderr: '' }), [mk(6)], o4)
  assert.equal(o4.halt, undefined)
  // applyPrune: after a halt the next batch is not touched (batch 1: two attachments, two batches)
  const { OWNERS_MARKER } = await import('../quickstart/lib.mjs')
  const evals = []
  const wp = (a) => {
    if (a[0] !== 'eval') return { status: 0, stdout: '', stderr: '' }
    if (String(a[1]).includes(ATTDEL_MARKER)) { evals.push('del'); return { status: 0, stdout: `${ATTDEL_MARKER}{"results":{"7":"commit failed, outcome unknown (state unverified), stopped"},"left":[],"withheld":{"7":["/u/7.jpg"]}}`, stderr: '' } }
    return { status: 0, stdout: `${OWNERS_MARKER}${JSON.stringify({ users: [], posts: [{ ID: '7', post_type: 'attachment', post_status: 'inherit' }, { ID: '8', post_type: 'attachment', post_status: 'inherit' }] })}`, stderr: '' }
  }
  const oc = {}
  const out = applyPrune([mk(7), mk(8)], { wp, webroot: '.', batch: 1, outcome: oc })
  assert.deepEqual(evals, ['del'], 'the second batch is never started')
  assert.match(oc.halt, /#7: \/u\/7\.jpg/)
  assert.equal(out[1].verdict, 'PRUNE')
})

// ── S-10: class fields with explicit map semantics ──────────────────────────────────────────────
const leaf = (name, cls) => `<!-- wp:group {"className":"${cls}","metadata":{"name":"${name}"}} -->\n<div class="wp-block-group ${cls}">x</div>\n<!-- /wp:group -->`
const runField = (fieldDef, value, cls = 'row stt-old') => {
  const map = { types: { 't:style-1': { pattern: 'x/t', fields: { f: { block: 'core/group', path: 't.x', attr: 'className', repeat: null, ...fieldDef } } } } }
  const out = renderAcm({ id: '9', type: 't', style: 'style-1', fields: { f: value }, items: [] }, map, { 'x/t': leaf('t.x', cls) }, () => null)
  assert.equal(checkMarkup(out.markup), true)
  return { cls: /"className":"([^"]*)"/.exec(out.markup)?.[1], notes: out.notes }
}

test('S-10 class fields: classPrefix replaces the family, classMap picks by value, unknown values and malformed rules are reported', () => {
  assert.deepEqual(runField({ classPrefix: 'stt-' }, 'blue'), { cls: 'row stt-blue', notes: [] })
  assert.equal(runField({ classPrefix: 'stt-' }, '').cls, 'row', 'an empty value takes the family off')
  const dropped = runField({ classPrefix: 'stt-', dropEmpty: true }, '')
  assert.equal(dropped.cls, undefined, 'dropEmpty removes the block')
  const map = { classMap: { 1: 'is-highlight', 2: 'is-hot big' } }
  assert.equal(runField(map, '1', 'row').cls, 'row is-highlight')
  assert.equal(runField(map, '2', 'row is-highlight').cls, 'row is-hot big')
  assert.equal(runField(map, '', 'row is-highlight').cls, 'row', 'empty: every mapped class comes off')
  const unknown = runField(map, '9', 'row')
  assert.equal(unknown.cls, 'row')
  assert.match(unknown.notes[0], /value "9" is not in the map's classMap/)
  assert.match(runField({ classPrefix: 'stt-' }, 'a b').notes[0], /not usable in a class name/)
  assert.match(runField({ classPrefix: 'stt-', classMap: { 1: 'x' } }, '1').notes[0], /both classPrefix and classMap/)
  assert.match(runField({ classMap: { 1: 'bad"quote' } }, '1').notes[0], /is not a class name/)
  assert.match(runField({}, '1').notes[0], /className rule unknown/, 'no declaration: the old note, not a guess')
  assert.equal(declaredClassRule({}), null)
  assert.match(declaredClassRule({ classPrefix: 3 }).error, /classPrefix/)
  assert.match(declaredClassRule({ classMap: [] }).error, /classMap must be an object/)
})

// ── S-38 / S-39 / S-40 ──────────────────────────────────────────────────────────────────────────
test('S-38 pages[].tags: written as tags_input on the page, post_tag put on pages by a must-use plugin; a bad tag stops the seed', async () => {
  const site = fakeSite()
  const report = await seedSpec(site, { edit: (s) => (s.content.pages[1].tags = ['Development', 'Illustration']) })
  assert.equal(site.page((p) => p.post_name === 'about-us').tags_input, 'Development,Illustration')
  assert.equal(site.page((p) => p.post_name === 'home').tags_input, undefined, 'a page without tags gets none')
  assert.ok([...site.muPlugins.keys()].includes('tracy-page-tags.php'))
  assert.deepEqual(report.pageTags.pages, ['/about-us'])
  const none = fakeSite()
  await seedSpec(none)
  assert.ok(![...none.muPlugins.keys()].includes('tracy-page-tags.php'), 'no tagged page: no plugin')
  await assert.rejects(seedSpec(fakeSite(), { edit: (s) => (s.content.pages[1].tags = ['ok', '']) }), /pages\[\]\.tags[^]*page about-us: tag "" is not a tag name/)
  assert.throws(() => checkPostTags([{ slug: 'p', tags: 'x' }], 'page'), /page p: tags must be a list/)
})

test('S-38 pages[].tags: removing every tag from a tagged page clears its tags on the repeat seed', async () => {
  const site = fakeSite()
  const root = mkdtempSync(join(tmpdir(), 'i74t-'))
  await seedSpec(site, { root, edit: (s) => (s.content.pages[1].tags = ['Development']) })
  assert.equal(site.page((p) => p.post_name === 'about-us').tags_input, 'Development')
  const second = await seedSpec(site, { root, n: 2 })
  assert.equal(site.page((p) => p.post_name === 'about-us').tags_input, undefined, 'the old tag is gone')
  assert.equal(second.counts.pages.updated, 1, 'the changed page is updated once')
  const third = await seedSpec(site, { root, n: 3 })
  assert.equal(third.counts.pages.updated, 0, 'and then settles')
})

test('redirects: a redirects plugin that cannot be written stops the seed, as the page-tags and pager plugins do', async () => {
  const site = fakeSite()
  site.failMuPlugins = new Set(['tracy-redirects.php'])
  await assert.rejects(seedSpec(site, { edit: (s) => (s.redirects.rules = [{ from: '/old', to: '/about-us', status: 301 }]) }), /redirects: the must-use plugin tracy-redirects\.php[^]*unserved/)
})

test('S-39 authors[].meta: profile values written as user meta, repeat run writes nothing, reserved or malformed keys stop the seed', async () => {
  const site = fakeSite()
  const authors = [{ id: '5', name: 'Ada', meta: { user_jobtitle: 'Designer', user_social: 'https://x.test/ada', seats: 3, live: true } }]
  const edit = (s) => {
    s.content.authors = authors
    s.content.posts.push({ slug: 'p', path: '/p', category: null, title: 'P', content: body('x'), images: [], author: { id: '5' } })
  }
  const root = mkdtempSync(join(tmpdir(), 'i74-'))
  await seedSpec(site, { root, edit })
  const mine = [...site.userMeta.values()].find((m) => m.user_jobtitle !== undefined)
  assert.deepEqual({ ...mine, tracy_source_author: undefined }, { user_jobtitle: 'Designer', user_social: 'https://x.test/ada', seats: '3', live: 'true', tracy_source_author: undefined })
  const before = site.calls.filter((c) => c.join(' ').includes('user meta update') && /user_jobtitle|user_social/.test(c.join(' '))).length
  await seedSpec(site, { root, edit, n: 2 })
  const after = site.calls.filter((c) => c.join(' ').includes('user meta update') && /user_jobtitle|user_social/.test(c.join(' '))).length
  assert.equal(after, before, 'unchanged values are not written again')
  for (const bad of [{ tracy_avatar: '1' }, { wp_capabilities: 'x' }, { _hidden: 'x' }, { description_en: 'x' }, { session_tokens: 'x' }, { Job: 'x' }, { ok: { a: 1 } }, { ok: null }])
    assert.throws(() => authorMeta(bad, '5'), /content\.authors 5: meta/, JSON.stringify(bad))
  assert.throws(() => authorMeta([1], '5'), /meta must be an object/)
  assert.throws(() => declaredAuthors([{ id: '1', name: 'A', meta: { tracy_x: '1' } }]), /owns/)
  assert.deepEqual(authorMeta(undefined, '1'), {})
})

// ── S-32: a menu item on one article links the post ─────────────────────────────────────────────
test('S-32 buildNavigation: an item on a single route that names its article is a post-type link with the post id', () => {
  const spec = {
    pagemap: { pages: [{ path: '/project/project-detail', view: 'single', source: { articleId: '42' } }, { path: '/blog-detail', view: 'single' }] },
    content: { posts: [{ slug: 'project-detail', joomla: { articleId: '42' } }, { slug: 'other', joomla: { articleId: '43' } }] }
  }
  const postIds = new Map([['project-detail', 900], ['other', 901]])
  const postUrls = new Map([['project-detail', '/projects/project-detail/'], ['other', '/other/']])
  assert.deepEqual(articlePostLink('/project/project-detail', spec, postIds, postUrls), { type: 'post', id: 900, url: '/projects/project-detail/' })
  assert.equal(articlePostLink('/blog-detail', spec, postIds, postUrls), null, 'a route that names no article is never given another post')
  assert.equal(articlePostLink('/nope', spec, postIds, postUrls), null)
  assert.equal(articlePostLink('/project/project-detail', spec, new Map(), postUrls), null, 'an article that is not a seeded post')
  const nav = buildNavigation(
    [{ label: 'Project Detail', url: '/project/project-detail' }],
    (url) => articlePostLink(url, spec, postIds, postUrls),
    new Map()
  )
  assert.match(nav, /"type":"post","id":900,"url":"\/projects\/project-detail\/","kind":"post-type"/)
  const page = buildNavigation([{ label: 'About', url: '/about' }], () => ({ id: 3, url: '/about/' }), new Map())
  assert.match(page, /"type":"page","id":3/, 'pages keep type page')
})

// ── S-20 / S-26 / S-29 / S-31 / S-34: archives ──────────────────────────────────────────────────
const CARDS =
  '<!-- wp:query {"queryId":1,"query":{"perPage":6,"inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query">\n<!-- wp:post-template -->\n<!-- wp:post-terms {"term":"category"} /-->\n<!-- wp:post-excerpt {"excerptLength":24} /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->'
const archiveCtx = (over = {}) => {
  const log = []
  const sections = []
  const custom = [
    { id: '138', title: 'CTA', position: 'main-bottom-1', html: '<div>If you want to talk!</div>', blocks: '<!-- wp:paragraph -->\n<p>If you want to talk! We are here</p>\n<!-- /wp:paragraph -->', sectionType: null, pages: ['ALL'] },
    { id: '131', title: 'Top', position: 'main-top-1', html: '<div>Top</div>', blocks: '<!-- wp:paragraph -->\n<p>Top row</p>\n<!-- /wp:paragraph -->', sectionType: null, pages: ['ALL'] }
  ]
  const other = [
    { id: '117', title: '[T] Latest', module: 'mod_articles_latest', position: 'main-top-1', params: { count: 3 }, pages: ['ALL'] },
    { id: '118', title: 'Finder', module: 'mod_finder', position: 'main-top-2', params: {}, pages: ['ALL'] },
    { id: '120', title: 'Popular tags', module: 'mod_tags_popular', position: 'main-top-2', params: {}, pages: ['ALL'] },
    { id: '146', title: 'Menu', module: 'mod_menu', position: 'main-top-2', params: { menutype: 'side' }, pages: ['ALL'] }
  ]
  const ctx = {
    spec: { sections: { acm: [], custom, other }, content: { categories: [{ id: '1', wpSlug: 'blog', title: 'Blog', parent: null }], pages: [], archives: [] }, pagemap: { pages: [] } },
    patternsMap: { types: {} },
    patterns: { 'tracy/cards': CARDS },
    terms: new Map([['blog', { id: 5, slug: 'blog', parent: null }]]),
    descendants: () => [],
    categoryUrl: (s) => `/category/${s}/`,
    rewrite: (m) => m,
    log,
    sections,
    inlineColors: [],
    palette: null,
    tagIdOf: (t) => ({ development: 11, illustration: 12, Development: 11, Illustration: 12 })[t] ?? null,
    ...over
  }
  return { ctx, log, sections }
}
const catArchive = (over = {}) => ({ view: 'category', path: '/project/branding', category: 'blog', title: 'Branding', display: { showTitle: false, showDescription: false, maxLevel: 0 }, sections: [], aside: [], ...over })

test('S-20 archivePageContent: the route\'s layout rows stand around the list in layout order; an archive without sections keeps the list alone', () => {
  const { ctx, log } = archiveCtx()
  const plain = archivePageContent({ path: '/project/branding', view: 'category', archive: catArchive() }, ctx)
  assert.equal(plain, buildArchiveContent(catArchive(), archiveCtx().ctx), 'no sections: byte for byte the list')

  const archive = catArchive({ sections: [{ position: 'main-top-1', via: 'layout', modules: ['131'] }, { position: 'main-bottom-1', via: 'layout', modules: ['138'] }] })
  const out = archivePageContent({ path: '/project/branding', view: 'category', archive }, ctx)
  assert.equal(checkMarkup(out), true)
  const top = out.indexOf('Top row')
  const list = out.indexOf('wp:query')
  const cta = out.indexOf('If you want to talk! We are here')
  assert.ok(top >= 0 && list > top && cta > list, `order top < list < cta: ${top} ${list} ${cta}`)
  assert.deepEqual(log.filter((l) => l.unsupported), [])

  const missing = catArchive({ sections: [{ position: 'main-bottom-1', modules: ['999'] }] })
  archivePageContent({ path: '/x', view: 'category', archive: missing }, ctx)
  assert.ok(log.some((l) => l.module === '999' && /not drawn/.test(l.note)), 'a module the spec does not hold is named, not dropped silently')
})

test('S-12/S-31 list modules a layout row names are drawn (latest, finder, popular tags); one with no block is reported as unsupported', () => {
  const { ctx, log, sections } = archiveCtx()
  const archive = catArchive({
    sections: [
      { position: 'main-top-1', modules: ['117'] },
      { position: 'main-top-2', modules: ['118', '120', '146'] }
    ]
  })
  const out = archivePageContent({ path: '/project/branding', view: 'category', archive }, ctx)
  assert.match(out, /tracy-aside__latest/, 'mod_articles_latest → a titles query')
  assert.doesNotMatch(/"taxQuery"/.exec(/wp:query \{[^\n]*tracy-aside__latest[^\n]*/.exec(out)?.[0] ?? '') ?? '', /x/)
  assert.match(out, /<!-- wp:search /, 'mod_finder → the search block')
  assert.match(out, /<!-- wp:tag-cloud \/-->/, 'mod_tags_popular → the tag cloud')
  const un = log.filter((l) => l.unsupported)
  assert.deepEqual(un.map((l) => [l.module, l.unsupported]), [['146', 'mod_menu']])
  assert.match(un[0].note, /menu side/)
  assert.deepEqual(sections.filter((s) => s.kind === 'list-module').map((s) => s.module).sort(), ['117', '118', '120'])
})

test('S-12/S-31 list module headings containing only a break are omitted for sidebar and sibling module types', () => {
  const { ctx } = archiveCtx()
  const latest = { id: 'latest-empty', title: '</br>', module: 'mod_articles_latest', params: { count: 3 } }
  const category = { id: 'category-empty', title: '</br>', module: 'mod_articles_category', params: { catid: ['1'] } }
  const finder = { id: 'finder-empty', title: '</br>', module: 'mod_finder', params: {} }
  const categories = { id: 'categories-empty', title: '</br>', module: 'mod_articles_categories', params: { parent: '1' } }
  const tags = { id: 'tags-empty', title: '</br>', module: 'mod_tags_popular', params: {} }
  for (const mod of [latest, category, finder, categories, tags]) {
    const out = renderAside([mod.id], { ...ctx, spec: { ...ctx.spec, sections: { ...ctx.spec.sections, other: [mod] } } }, '/news')
    assert.doesNotMatch(out, /<h2[^>]*>\s*<\/h2>/, `${mod.module} should not emit an empty heading`)
    if (mod !== categories) assert.notEqual(out, '', `${mod.module} still renders its module body`)
  }
})

const slotCtx = (other) => ({
  spec: { sections: { acm: [], custom: [], other }, content: { categories: [{ id: '15', wpSlug: 'grid-layout' }] } },
  patternsMap: { types: {} },
  patterns: {},
  log: [],
  sections: [],
  terms: new Map([['grid-layout', { id: 9 }]]),
  rewrite: (m) => m,
  media: () => null
})
const listMod = (id, title, position) => ({ id, title, module: 'mod_articles_category', position, ordering: 1, params: { catid: ['15'], count: 3 } })
const para = (t) => ({ kind: 'blocks', markup: `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->` })

test('S-12/S-31 slots: each slot draws its own modules; content between two slots of one position keeps its place', () => {
  const ctx = slotCtx([listMod('201', 'First list', 'main'), listMod('202', 'Second list', 'main')])
  const content = [{ kind: 'slot', position: 'main', modules: ['201'] }, para('Between'), { kind: 'slot', position: 'main', modules: ['202'] }]
  const out = buildPageContent({ path: '/x', contentKind: 'sections', content, drawn: new Set() }, ctx)
  const at = (t) => out.indexOf(t)
  assert.ok(at('First list') !== -1 && at('First list') < at('Between') && at('Between') < at('Second list'), out)
})

test('S-12/S-31 slots: a module the layout names at a slot is drawn there whichever position it was recorded at; an id nothing holds is named', () => {
  const ctx = slotCtx([listMod('201', 'Moved list', 'elsewhere')])
  const content = [{ kind: 'slot', position: 'main', modules: ['201', '999'] }]
  const out = buildPageContent({ path: '/x', contentKind: 'sections', content, drawn: new Set() }, ctx)
  assert.match(out, /Moved list/)
  assert.ok(ctx.log.some((l) => l.module === '201' && /recorded at "elsewhere"/.test(l.note)), JSON.stringify(ctx.log))
  assert.ok(ctx.log.some((l) => l.module === '999' && /nothing drawn/.test(l.note)), JSON.stringify(ctx.log))
})

const acmInst = (id, position, marker) => ({ id, type: 'm', style: 'style-1', position, published: true, ordering: 1, scope: 'page', pages: [{ wpPath: '/x' }], fields: {}, items: [], marker })
const acmPattern = (marker) => `<!-- wp:paragraph -->\n<p>${marker}</p>\n<!-- /wp:paragraph -->`

test('S-12/S-31 slots: an ACM section a slot names at another position than it was recorded at is drawn at the slot, once', () => {
  const ctx = slotCtx([])
  ctx.spec.sections.acm = [acmInst('7', 'elsewhere')]
  ctx.patternsMap = { types: { 'm:style-1': { pattern: 'x/m', fields: {} } } }
  ctx.patterns = { 'x/m': acmPattern('ACM-SEVEN') }
  const content = [para('Before'), { kind: 'slot', position: 'main', modules: ['7'] }, para('After'), { kind: 'slot', position: 'elsewhere' }]
  const out = buildPageContent({ path: '/x', contentKind: 'sections', content, drawn: new Set() }, ctx)
  assert.equal(out.match(/ACM-SEVEN/g)?.length, 1, out)
  assert.ok(out.indexOf('Before') < out.indexOf('ACM-SEVEN') && out.indexOf('ACM-SEVEN') < out.indexOf('After'), out)
  assert.ok(ctx.log.some((l) => l.module === '7' && /recorded at "elsewhere"/.test(l.note)))
  assert.ok(!ctx.log.some((l) => /neither as a section/.test(l.note ?? '')))
})

test('S-12/S-31 slots: the first slot naming a module keeps it, even at its recorded position; a later slot elsewhere does not move it', () => {
  const ctx = slotCtx([listMod('201', 'Home list', 'main')])
  const content = [{ kind: 'slot', position: 'main', modules: ['201'] }, para('Between'), { kind: 'slot', position: 'elsewhere', modules: ['201'] }]
  const out = buildPageContent({ path: '/x', contentKind: 'sections', content, drawn: new Set() }, ctx)
  assert.equal(out.match(/Home list/g)?.length, 1, out)
  assert.ok(out.indexOf('Home list') < out.indexOf('Between'), out)

  const ctx2 = slotCtx([])
  ctx2.spec.sections.acm = [acmInst('7', 'main')]
  ctx2.patternsMap = { types: { 'm:style-1': { pattern: 'x/m', fields: {} } } }
  ctx2.patterns = { 'x/m': acmPattern('ACM-SEVEN') }
  const c2 = [{ kind: 'slot', position: 'main', modules: ['7'] }, para('Between'), { kind: 'slot', position: 'elsewhere', modules: ['7'] }]
  const out2 = buildPageContent({ path: '/x', contentKind: 'sections', content: c2, drawn: new Set() }, ctx2)
  assert.equal(out2.match(/ACM-SEVEN/g)?.length, 1, out2)
  assert.ok(out2.indexOf('ACM-SEVEN') < out2.indexOf('Between'), out2)
})

test('S-12/S-31 slots: on a post route a list module moved to a slot is not drawn again at its recorded position', () => {
  const ctx = slotCtx([listMod('201', 'Moved list', 'elsewhere')])
  const content = [{ kind: 'slot', position: 'main', modules: ['201'] }, { kind: 'slot', position: 'elsewhere' }]
  const page = { path: '/x', contentKind: 'sections', content, drawn: new Set(), routeModules: new Set(['201']) }
  const out = buildPageContent(page, ctx)
  assert.equal(out.match(/Moved list/g)?.length, 1, out)
  assert.ok(page.drawn.has('201'))
})

test('S-26 archive views: a patterns-map view block replaces the seeder\'s cards, once', () => {
  const { ctx, log } = archiveCtx({ patternsMap: { types: {}, views: { category: { block: 'tracy-base/project-grid' } } } })
  const archive = catArchive({ sections: [{ position: 'main-bottom-1', modules: ['138'] }] })
  const out = archivePageContent({ path: '/project/branding', view: 'category', archive }, ctx)
  assert.equal(out.match(/wp:tracy-base\/project-grid/g).length, 1)
  assert.doesNotMatch(out, /wp:query/)
  assert.match(out, /We are here/)
  assert.ok(log.some((l) => /project-grid draws the list instead/.test(l.note)))
})

test('S-29 tag route: the declared tags filter the list, in the declared order; no declaration is reported, unknown tags are named', () => {
  const { ctx, log } = archiveCtx()
  const tagArchive = { view: 'tag', path: '/tagged-items', tags: ['Development', 'Illustration'], orderBy: 'title', order: 'asc', perPage: 20 }
  const out = buildArchiveContent(tagArchive, ctx)
  const q = JSON.parse(/<!-- wp:query (\{.*\}) -->/.exec(out)[1]).query
  assert.deepEqual(q.taxQuery.post_tag, [11, 12])
  assert.equal(q.orderBy, 'title')
  assert.equal(q.order, 'asc')
  assert.equal(q.perPage, 20)

  const unknown = buildArchiveContent({ ...tagArchive, tags: ['Development', 'Ghost'] }, ctx)
  assert.deepEqual(JSON.parse(/<!-- wp:query (\{.*\}) -->/.exec(unknown)[1]).query.taxQuery.post_tag, [11])
  assert.ok(log.some((l) => /tag "Ghost" is not on the site/.test(l.note)))

  const none = buildArchiveContent({ ...tagArchive, tags: ['Ghost'] }, ctx)
  assert.doesNotMatch(none, /wp:query/, 'no declared tag on the site: no unfiltered list')
  assert.ok(log.some((l) => /none of its declared tags/.test(l.note)))

  const undeclared = buildArchiveContent({ view: 'tag', path: '/t' }, ctx)
  assert.match(undeclared, /wp:query/)
  assert.ok(log.some((l) => /declares no tags/.test(l.note)), 'the unfiltered fallback says so')

  const odd = buildArchiveContent({ ...tagArchive, orderBy: 'ordering' }, ctx)
  assert.equal(JSON.parse(/<!-- wp:query (\{.*\}) -->/.exec(odd)[1]).query.orderBy, undefined)
  assert.ok(log.some((l) => /ordering "ordering" is not supported/.test(l.note)))
  assert.throws(() => tagsOfArchive({ path: '/t', tags: 'x' }), /list of tag names/)
  assert.throws(() => tagsOfArchive({ path: '/t', tags: [1] }), /not a tag name/)
  assert.deepEqual(tagsOfArchive({ tags: [{ name: 'A' }, { slug: 'b' }, 'A'] }), ['A', 'b'])
})

test('S-34 author view: the list of people has no core block — the post query stays and the report names the gap', () => {
  const { ctx, log } = archiveCtx()
  const out = buildArchiveContent({ view: 'author', path: '/author-listting' }, ctx)
  assert.match(out, /wp:query/)
  assert.deepEqual(log.filter((l) => l.unsupported === 'author-list').map((l) => l.page), ['/author-listting'])
})

test('pager labels: the words the archives declare replace the symbols; disagreeing archives are noted; a bad label stops the seed', () => {
  const notes = []
  assert.equal(pagerLabels([{ path: '/a', paging: {} }], notes), null)
  assert.deepEqual(pagerLabels([{ path: '/a', paging: { labels: { start: 'Start', previous: 'Prev', next: 'Next', end: 'End' } } }, { path: '/b', paging: { labels: { start: 'Home' } } }], notes), { start: 'Start', previous: 'Prev', next: 'Next', end: 'End' })
  assert.equal(notes.length, 1)
  assert.throws(() => pagerLabels([{ path: '/a', paging: { labels: { start: 5 } } }]), /labels\.start must be text/)
  assert.throws(() => pagerLabels([{ path: '/a', paging: { labels: 'x' } }]), /must be \{ start/)
})

test('pager labels: removing paging.labels writes an explicit empty set on the repeat seed', async () => {
  const site = fakeSite()
  const root = mkdtempSync(join(tmpdir(), 'i74p-'))
  const edit = (labels) => (s) => {
    s['page-map'].pages.push({ file: 'news.html', path: '/news', slug: 'news', title: 'News', view: 'category' })
    s.content.categories.push({ id: '1', title: 'News', wpSlug: 'news', parent: null, description: '' })
    s.content.archives.push({ file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 7, paging: { leading: 1, intro: 6, links: 0, ...(labels ? { labels } : {}) } })
  }
  await seedSpec(site, { root, edit: edit({ start: 'First', previous: 'Prev', next: 'Next', end: 'Last' }) })
  assert.deepEqual(JSON.parse(site.options.get('tracy_joomla_pager_text')), { start: 'First', previous: 'Prev', next: 'Next', end: 'Last' })
  await seedSpec(site, { root, edit: edit(null), n: 2 })
  assert.deepEqual(JSON.parse(site.options.get('tracy_joomla_pager_text')), {}, 'the words the source no longer declares are not kept')
})

// A theme file rewritten with the same size and mtime between two attachment checks: the second attachment is protected.
test('S-48 prune: a same-size, same-mtime theme rewrite between two attachment checks protects the second attachment', (t) => {
  const php = spawnSync('php', ['-v'])
  if (php.error || php.status !== 0) return t.skip('php is not installed')
  const dir = mkdtempSync(join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'prune-cache-'))
  try {
    mkdirSync(join(dir, 'themes', 't'), { recursive: true })
    const css = join(dir, 'themes', 't', 'style.css')
    const before = 'x{y:url(2024/b.jpq)}'
    const after = 'x{y:url(2024/b.jpg)}'
    assert.equal(before.length, after.length)
    writeFileSync(css, before)
    const stamp = new Date('2024-01-01T00:00:00Z')
    utimesSync(css, stamp, stamp)
    const stub = String.raw`<?php
define('ARRAY_A', 'ARRAY_A');
define('WP_CONTENT_DIR', ${JSON.stringify(dir)});
class W { public $usermeta='um'; public $posts='posts'; public $postmeta='pm'; public $termmeta='tm'; public $options='op'; public $last_error='';
  function prepare($sql, ...$a) { foreach ($a as $x) { $sql = preg_replace_callback('/%[ds]/', function () use ($x) { return is_int($x) ? (string) $x : "'" . addslashes($x) . "'"; }, $sql, 1); } return $sql; }
  function esc_like($s) { return $s; }
  function query($s) { return true; }
  function get_results($sql, $t) {
    if (preg_match('/FROM posts WHERE ID = (\d+) FOR UPDATE/', $sql, $m)) return array(array('ID' => $m[1], 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_parent' => 0));
    if (preg_match('/FROM pm WHERE post_id = (\d+)/', $sql, $m)) return array(array('meta_key' => '_wp_attached_file', 'meta_value' => '2024/' . ($m[1] == 1 ? 'a' : 'b') . '.jpg'));
    return array();
  } }
$wpdb = new W();
function maybe_unserialize($v) { return @unserialize($v); }
function add_filter() {} function remove_filter() {} function wp_delete_file($f) {}
function wp_json_encode($v) { return json_encode($v); }
function wp_delete_attachment($id, $f) { if (1 === $id) { $m = filemtime(${JSON.stringify(css)}); file_put_contents(${JSON.stringify(css)}, ${JSON.stringify(after)}); touch(${JSON.stringify(css)}, $m); } return true; }
`
    const code = deleteUnreferencedPhp([{ id: '1', type: 'attachment', status: 'inherit' }, { id: '2', type: 'attachment', status: 'inherit' }])
    const file = join(dir, 'run.php')
    writeFileSync(file, stub + code)
    const r = spawnSync('php', [file], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const rep = parseAttachmentDeletes(r.stdout)
    assert.equal(rep.results['1'], 'deleted')
    assert.match(rep.results['2'], /named: theme file/, 'the rewritten theme file protects the second attachment')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
