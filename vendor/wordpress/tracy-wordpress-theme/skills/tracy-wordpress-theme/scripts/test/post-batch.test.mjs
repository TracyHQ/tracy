// Posts go into the site in batches, through scripts/php/*.php run with `wp eval-file -`: one
// call reads every seed fingerprint, one call per ten posts creates or updates them. The seed's
// counts (created / updated / skipped) are the same as when every post was its own wp call.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPostBatch, runPhp, phpSource } from '../lib/post-batch.mjs'
import { fingerprint } from '../seed.mjs'

/** A runner whose site is a Map of posts; answers the two PHP files the batch sends. */
function fakeWp({ posts = new Map(), dryRun = false, fail = null } = {}) {
  const calls = []
  let nextId = 100
  const run = (args, { stdin, mutate = true } = {}) => {
    calls.push({ args, stdin })
    if (dryRun && mutate) return { code: 0, stdout: '', stderr: '' }
    assert.deepEqual(args, ['eval-file', '-'])
    const b64 = /\$tracy_payload_b64 = '([^']*)'/.exec(stdin)[1]
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    if (/^\/\/ tracy-php: fingerprints$/m.test(stdin)) {
      const out = {}
      for (const [id, p] of posts) if (p.meta?._tracy_seed) out[id] = p.meta._tracy_seed
      return { code: 0, stdout: JSON.stringify(out), stderr: '' }
    }
    if (/^\/\/ tracy-php: upsert-posts$/m.test(stdin)) {
      const out = payload.items.map((it) => {
        if (fail && it.post_name === fail) return { id: 0, slug: it.post_name, action: 'error', error: 'Invalid post type.' }
        if (it.existing_id) {
          const p = posts.get(it.existing_id)
          Object.assign(p, it, { meta: { ...p.meta, ...it.meta } })
          return { id: it.existing_id, slug: it.post_name, action: 'updated', error: null }
        }
        const id = nextId++
        posts.set(id, { ...it, meta: { ...it.meta } })
        return { id, slug: it.post_name, action: 'created', error: null }
      })
      return { code: 0, stdout: JSON.stringify(out), stderr: '' }
    }
    throw new Error('unexpected php')
  }
  return { run, calls, dryRun, posts }
}

const desiredPage = (n) => ({
  post_title: `Page ${n}`,
  post_name: `page-${n}`,
  post_status: 'publish',
  post_parent: 0,
  post_excerpt: '',
  content: `<!-- wp:paragraph --><p>${n}</p><!-- /wp:paragraph -->`,
  meta: { _wp_page_template: 'page-no-sidebar' }
})

function counter() {
  const counts = {}
  const count = (kind, what) => {
    counts[kind] ??= { created: 0, updated: 0, skipped: 0 }
    counts[kind][what]++
  }
  return { counts, count }
}

test('runPhp: the PHP file goes down stdin with the payload ahead of it, and its JSON comes back', () => {
  const wp = fakeWp()
  wp.run = (args, { stdin, mutate }) => {
    wp.calls.push({ args, stdin, mutate })
    return { code: 0, stdout: '{"7":"abc"}', stderr: '' }
  }
  const out = runPhp(wp, 'fingerprints', { ids: [7] }, { mutate: false })
  assert.deepEqual(out, { 7: 'abc' })
  const { args, stdin, mutate } = wp.calls[0]
  assert.deepEqual(args, ['eval-file', '-'])
  assert.equal(mutate, false)
  assert.ok(stdin.startsWith('<?php\n$tracy_payload_b64 = '))
  assert.ok(stdin.includes('// tracy-php: fingerprints'))
  assert.equal((stdin.match(/<\?php/g) ?? []).length, 1, 'the file\'s own open tag is dropped')
  assert.ok(stdin.includes(phpSource('fingerprints').replace(/^<\?php\s*/, '').slice(0, 40)))
  const b64 = /\$tracy_payload_b64 = '([^']*)'/.exec(stdin)[1]
  assert.deepEqual(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')), { ids: [7] })
})

test('runPhp: output that is not JSON names the file', () => {
  const wp = { run: () => ({ code: 0, stdout: 'PHP Warning: x', stderr: '' }), calls: [] }
  assert.throws(() => runPhp(wp, 'upsert-posts', { items: [] }), /upsert-posts\.php: not JSON: PHP Warning/)
})

test('the PHP files read their payload from the prelude, an argument, or stdin, and print JSON only', () => {
  for (const name of ['fingerprints', 'upsert-posts']) {
    const src = phpSource(name)
    assert.ok(src.startsWith('<?php'), `${name}.php starts with <?php`)
    assert.ok(src.includes('$tracy_payload_b64'), `${name}.php reads the prelude`)
    assert.ok(src.includes('$args[0]'), `${name}.php reads an argument`)
    assert.ok(src.includes('STDIN'), `${name}.php reads stdin`)
    assert.ok(src.includes('echo json_encode('), `${name}.php prints JSON`)
    assert.ok(!/\$wpdb->(query|insert|update|delete|replace)/.test(src), `${name}.php writes through the WP API, not SQL`)
  }
  assert.ok(/wp_insert_post\(\s*wp_slash/.test(phpSource('upsert-posts')), 'insert is slashed as wp-cli slashes it')
  assert.ok(/wp_update_post\(\s*wp_slash/.test(phpSource('upsert-posts')))
  assert.ok(phpSource('upsert-posts').includes('is_wp_error('))
})

test('post batch: 32 new pages are four calls, each created once, ids handed back in order', () => {
  const wp = fakeWp()
  const { counts, count } = counter()
  const batch = createPostBatch(wp, { count })
  const handles = Array.from({ length: 32 }, (_, n) => batch.add({ postType: 'page', have: null, desired: desiredPage(n), kind: 'pages' }))
  assert.equal(handles[0].id, null, 'not known before the flush')
  batch.flush()
  assert.equal(wp.calls.length, 4)
  assert.equal(wp.calls[0].stdin.includes('tracy-php: upsert-posts'), true)
  assert.deepEqual(counts, { pages: { created: 32, updated: 0, skipped: 0 } })
  assert.deepEqual(handles.map((h) => h.id), Array.from({ length: 32 }, (_, n) => 100 + n))
  const item = JSON.parse(Buffer.from(/'([^']*)'/.exec(wp.calls[0].stdin)[1], 'base64').toString()).items[0]
  assert.equal(item.post_type, 'page')
  assert.equal(item.existing_id, null)
  assert.equal(item.post_content, desiredPage(0).content)
  assert.equal(item.meta._wp_page_template, 'page-no-sidebar')
  assert.match(item.meta._tracy_seed, /^[0-9a-f]{24}$/)
  assert.equal(item.clear_template, false)
})

test('post batch: a second run reads every fingerprint in one call and skips what matches, updates what does not', () => {
  const wp = fakeWp()
  const { count } = counter()
  const first = createPostBatch(wp, { count })
  const hs = [0, 1, 2].map((n) => first.add({ postType: 'page', have: null, desired: desiredPage(n), kind: 'pages' }))
  first.flush()
  const listed = (n) => ({ ID: hs[n].id, post_name: `page-${n}`, page_template: 'page-no-sidebar' })
  wp.calls.length = 0
  const c2 = counter()
  const second = createPostBatch(wp, { count: c2.count })
  const a = second.add({ postType: 'page', have: listed(0), desired: desiredPage(0), kind: 'pages' })
  const b = second.add({ postType: 'page', have: listed(1), desired: { ...desiredPage(1), post_title: 'Renamed' }, kind: 'pages' })
  const c = second.add({ postType: 'page', have: { ...listed(2), page_template: '' }, desired: desiredPage(2), kind: 'pages' })
  assert.equal(a.id, hs[0].id, 'a skip knows its id at once')
  assert.equal(b.id, null)
  second.flush()
  assert.deepEqual(c2.counts, { pages: { created: 0, updated: 2, skipped: 1 } })
  assert.equal(b.id, hs[1].id)
  assert.equal(c.id, hs[2].id, 'a template the listing does not carry is an update even with the fingerprint equal')
  assert.equal(wp.calls.filter((k) => k.stdin.includes('tracy-php: fingerprints')).length, 1)
  assert.equal(wp.calls.filter((k) => k.stdin.includes('tracy-php: upsert-posts')).length, 1)
  const items = JSON.parse(Buffer.from(/'([^']*)'/.exec(wp.calls[1].stdin)[1], 'base64').toString()).items
  assert.deepEqual(items.map((i) => i.existing_id), [hs[1].id, hs[2].id])
  assert.equal(second.fingerprintOf(hs[0].id), fingerprint({ ...desiredPage(0), meta: desiredPage(0).meta }))
})

test('post batch: template cleared, category cleared, terms on create, meta-only items', () => {
  const wp = fakeWp()
  const { count } = counter()
  const batch = createPostBatch(wp, { count })
  const post = { post_title: 'P', post_name: 'p', post_status: 'publish', post_excerpt: '', content: '', post_category: undefined, meta: { _thumbnail_id: 9 } }
  batch.add({ postType: 'post', have: { ID: 5, post_name: 'p' }, desired: post, kind: 'posts' })
  batch.add({ postType: 'wp_template_part', have: null, desired: { post_title: 'Header', post_name: 'header', post_status: 'publish', content: '<x>', meta: {} }, kind: 'templateParts', terms: { wp_theme: 'tracy', wp_template_part_area: 'header' } })
  batch.addMeta(7, { _wp_attachment_image_alt: 'A photo' })
  wp.posts.set(5, { meta: { _tracy_seed: 'old' } })
  wp.posts.set(7, { meta: {} })
  batch.flush()
  const items = JSON.parse(Buffer.from(/'([^']*)'/.exec(wp.calls.at(-1).stdin)[1], 'base64').toString()).items
  assert.equal(items[0].clear_template, true, 'a desired without _wp_page_template deletes it, as before')
  assert.equal(items[0].clear_category, true, 'post_category present but empty removes every category')
  assert.deepEqual(items[0].meta, { _thumbnail_id: '9', _tracy_seed: items[0].meta._tracy_seed })
  assert.deepEqual(items[1].terms, { wp_theme: 'tracy', wp_template_part_area: 'header' })
  assert.deepEqual(items[2], { existing_id: 7, meta_only: true, meta: { _wp_attachment_image_alt: 'A photo' } })
  assert.equal(wp.posts.get(7).meta._wp_attachment_image_alt, 'A photo')
})

test('post batch: one failed item stops the seed and names it', () => {
  const wp = fakeWp({ fail: 'page-3' })
  const { count } = counter()
  const batch = createPostBatch(wp, { count })
  for (const n of [0, 1, 2, 3, 4]) batch.add({ postType: 'page', have: null, desired: desiredPage(n), kind: 'pages' })
  assert.throws(() => batch.flush(), /pages page-3 \(create\): Invalid post type\./)
})

test('post batch: a dry run makes no call, counts an existing post as updated and a new one as created with id 0', () => {
  const wp = fakeWp({ dryRun: true })
  const { counts, count } = counter()
  const batch = createPostBatch(wp, { count })
  const a = batch.add({ postType: 'page', have: { ID: 4, post_name: 'page-0' }, desired: desiredPage(0), kind: 'pages' })
  const b = batch.add({ postType: 'page', have: null, desired: desiredPage(1), kind: 'pages' })
  batch.flush()
  assert.deepEqual(counts, { pages: { created: 1, updated: 1, skipped: 0 } })
  assert.equal(a.id, 4)
  assert.equal(b.id, 0)
  assert.equal(wp.calls.length, 0, 'a dry run creates nothing and reads no fingerprint, as before')
})

test('the PHP files carry no Vietnamese: they land on a customer site', () => {
  for (const name of ['fingerprints', 'upsert-posts'])
    assert.doesNotMatch(readFileSync(new URL(`../php/${name}.php`, import.meta.url), 'utf8'), /[ăâđêôơưàáảãạ]/i) // language-allow: regex matching Vietnamese
})

// ---------------------------------------------------------------- the PHP itself, under php
// WordPress is stubbed with a few arrays; what runs is the real file behind the real prelude,
// exactly the bytes wp eval-file - would read. Skipped when php is not on PATH.
const php = spawnSync('php', ['--version']).status === 0

const STUBS = `<?php
class WP_Error { public $m; function __construct($m){$this->m=$m;} function get_error_message(){return $this->m;} }
function is_wp_error($x){ return $x instanceof WP_Error; }
function wp_slash($v){ return is_array($v) ? array_map('wp_slash', $v) : (is_string($v) ? addslashes($v) : $v); }
function wp_unslash($v){ return is_array($v) ? array_map('wp_unslash', $v) : (is_string($v) ? stripslashes($v) : $v); }
function get_gmt_from_date($d){ return $d; }
$GLOBALS['posts'] = json_decode(getenv('SITE_POSTS') ?: '{}', true); $GLOBALS['next'] = 100; $GLOBALS['terms'] = [];
function get_post_types(){ return ['post'=>'post','page'=>'page']; }
function get_post_stati(){ return ['publish'=>'publish']; }
function get_posts($q){ $ids=[]; foreach($GLOBALS['posts'] as $id=>$p) if(isset($p['meta'][$q['meta_key']])) $ids[]=(int)$id; sort($ids); return $ids; }
function update_meta_cache(){}
function get_post_meta($id,$k,$single){ return $GLOBALS['posts'][$id]['meta'][$k] ?? ''; }
function update_post_meta($id,$k,$v){ $GLOBALS['posts'][$id]['meta'][$k]=wp_unslash($v); }
function delete_post_meta($id,$k){ unset($GLOBALS['posts'][$id]['meta'][$k]); }
function taxonomy_exists($t){ return getenv('STUB_NO_TAX') !== '1'; }
function get_post_type($id){ return $GLOBALS['posts'][$id]['post_type'] ?? 'page'; }
function register_taxonomy_for_object_type($t,$type){ return true; }
function wp_set_object_terms($id,$t,$tax){ if(getenv('STUB_FAIL_TERMS')==='1') return new WP_Error('term write refused'); $GLOBALS['terms'][$id][$tax]=$t; return $t; }
$GLOBALS['sticky'] = [];
function stick_post($id){ $GLOBALS['sticky'][$id]=true; }
function unstick_post($id){ unset($GLOBALS['sticky'][$id]); }
function get_post_field($f,$id){ return $GLOBALS['posts'][$id][$f] ?? ''; }
function wp_insert_post($p,$err){ if(($p['post_type']??'')==='bad') return new WP_Error('Invalid post type.'); $id=$GLOBALS['next']++; $p=wp_unslash($p); $meta=$p['meta_input']??[]; unset($p['meta_input']); $p['meta']=$meta; $GLOBALS['posts'][$id]=$p; return $id; }
function wp_update_post($p,$err){ $id=$p['ID']; if(!isset($GLOBALS['posts'][$id])) return new WP_Error('Invalid post ID.'); $p=wp_unslash($p); $meta=$p['meta_input']??[]; unset($p['meta_input']); foreach($meta as $k=>$v) $GLOBALS['posts'][$id]['meta'][$k]=$v; $GLOBALS['posts'][$id]=array_merge($GLOBALS['posts'][$id],$p); return $id; }
register_shutdown_function(function(){ file_put_contents(getenv('SITE_OUT'), json_encode(['posts'=>$GLOBALS['posts'],'terms'=>$GLOBALS['terms'],'sticky'=>array_keys($GLOBALS['sticky'])])); });
?>
`

/** A runner that hands the stdin wp eval-file - would get to php, with the stubs ahead of it. */
function phpWp(dir, posts = {}) {
  const site = { posts }
  const run = (args, { stdin }) => {
    assert.deepEqual(args, ['eval-file', '-'])
    const outFile = join(dir, 'site.json')
    const r = spawnSync('php', [], {
      input: STUBS + stdin.replace(/^<\?php\s*/, '<?php '),
      encoding: 'utf8',
      env: { ...process.env, SITE_POSTS: JSON.stringify(site.posts), SITE_OUT: outFile }
    })
    assert.equal(r.status, 0, r.stderr)
    const after = JSON.parse(readFileSync(outFile, 'utf8'))
    site.posts = after.posts
    site.terms = after.terms
    site.sticky = after.sticky
    return { code: 0, stdout: r.stdout, stderr: r.stderr }
  }
  return { wp: { run, dryRun: false, calls: [] }, site }
}

test('under php: fingerprints.php answers {id: hash} and honours ids', { skip: !php && 'php not on PATH' }, () => {
  const { wp } = phpWp(mkdtempSync(join(tmpdir(), 'php-')), { 3: { post_name: 'a', meta: { _tracy_seed: 'h3' } }, 4: { post_name: 'b', meta: {} }, 5: { post_name: 'c', meta: { _tracy_seed: 'h5' } } })
  assert.deepEqual(runPhp(wp, 'fingerprints', {}, { mutate: false }), { 3: 'h3', 5: 'h5' })
  assert.deepEqual(runPhp(wp, 'fingerprints', { ids: [5, 9] }, { mutate: false }), { 5: 'h5' })
})

test('under php: upsert-posts.php creates, updates in place, clears template and category, sets terms, reports an error per item', { skip: !php && 'php not on PATH' }, () => {
  const { wp, site } = phpWp(mkdtempSync(join(tmpdir(), 'php-')), { 7: { post_type: 'page', post_name: 'old', page_template: 'x', meta: { _tracy_seed: 'h7', _wp_page_template: 'page-landing' } } })
  const content = '<!-- wp:paragraph {"x":"a\\"b\\u003c"} --><p>it\'s \\ here</p><!-- /wp:paragraph -->'
  const out = runPhp(wp, 'upsert-posts', {
    items: [
      { post_type: 'page', post_title: 'New', post_name: 'new', post_status: 'publish', post_excerpt: '', post_content: content, meta: { _tracy_seed: 'n1', _wp_page_template: 'page-no-sidebar' }, existing_id: null, clear_template: false, clear_category: false, post_parent: 0, sticky: true },
      { post_type: 'page', post_title: 'Old renamed', post_name: 'old', post_status: 'publish', post_excerpt: 'e', post_content: 'c', meta: { _tracy_seed: 'h7b' }, existing_id: 7, clear_template: true, clear_category: true, post_date: '2024-01-02 03:04:05' },
      { post_type: 'wp_template_part', post_title: 'Header', post_name: 'header', post_status: 'publish', post_excerpt: '', post_content: '', meta: { _tracy_seed: 't' }, existing_id: null, clear_template: false, clear_category: false, terms: { wp_theme: 'tracy', wp_template_part_area: 'header' } },
      { post_type: 'bad', post_title: 'X', post_name: 'x', post_status: 'publish', post_excerpt: '', post_content: '', meta: {}, existing_id: null, clear_template: false, clear_category: false },
      { existing_id: 7, meta_only: true, meta: { _wp_attachment_image_alt: 'alt "q"' } }
    ]
  })
  assert.deepEqual(out.map((r) => [r.id, r.slug, r.action, r.error]), [
    [100, 'new', 'created', null],
    [7, 'old', 'updated', null],
    [101, 'header', 'created', null],
    [0, 'x', 'error', 'Invalid post type.'],
    [7, 'old', 'updated', null]
  ])
  assert.equal(site.posts[100].post_content, content, 'backslashes and quotes survive the slash/unslash trip')
  assert.deepEqual(site.posts[100].meta, { _tracy_seed: 'n1', _wp_page_template: 'page-no-sidebar' })
  assert.equal(site.posts[100].post_parent, 0)
  assert.equal(site.posts[7].post_title, 'Old renamed')
  assert.equal(site.posts[7].post_date_gmt, '2024-01-02 03:04:05')
  assert.equal(site.posts[7].edit_date, true)
  assert.deepEqual(site.posts[7].meta, { _tracy_seed: 'h7b', _wp_attachment_image_alt: 'alt "q"' }, 'template deleted, alt written')
  assert.deepEqual(site.terms[7], { category: [] })
  assert.deepEqual(site.terms[101], { wp_theme: 'tracy', wp_template_part_area: 'header' })
  assert.deepEqual(site.sticky, [100], 'sticky: true sticks the new post; an item without the key leaves the list alone')
  const again = runPhp(wp, 'upsert-posts', { items: [{ post_type: 'page', post_title: 'New', post_name: 'new', post_status: 'publish', post_excerpt: '', post_content: '', meta: {}, existing_id: 100, clear_template: false, clear_category: false, sticky: false }] })
  assert.equal(again[0].action, 'updated')
  assert.deepEqual(site.sticky, [], 'sticky: false unsticks on update')
})

test('under php: clear_tags clears post_tag without the page-tags plugin; a refused write or a missing taxonomy is an error and drops the new fingerprint', { skip: !php && 'php not on PATH' }, () => {
  const item = { post_type: 'page', post_title: 'T', post_name: 't', post_status: 'publish', post_excerpt: '', post_content: '', meta: { _tracy_seed: 'new' }, existing_id: 7, clear_template: false, clear_category: false, clear_tags: true }
  const start = () => phpWp(mkdtempSync(join(tmpdir(), 'php-')), { 7: { post_type: 'page', post_name: 't', meta: { _tracy_seed: 'old' } } })
  const ok = start()
  assert.deepEqual(runPhp(ok.wp, 'upsert-posts', { items: [item] }).map((r) => r.action), ['updated'])
  assert.deepEqual(ok.site.terms[7], { post_tag: [] })
  assert.equal(ok.site.posts[7].meta._tracy_seed, 'new')
  for (const [env, re] of [['STUB_FAIL_TERMS', /term write refused/], ['STUB_NO_TAX', /not registered/]]) {
    process.env[env] = '1'
    try {
      const bad = start()
      const [r] = runPhp(bad.wp, 'upsert-posts', { items: [item] })
      assert.equal(r.action, 'error')
      assert.match(r.error, re)
      assert.equal(bad.site.posts[7].meta._tracy_seed, undefined, 'no fingerprint stored: a repeat seed retries the page')
    } finally {
      delete process.env[env]
    }
  }
})
