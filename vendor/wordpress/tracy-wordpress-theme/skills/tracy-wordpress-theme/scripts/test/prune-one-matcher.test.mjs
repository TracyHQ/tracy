// One reference matcher for both prune passes (issue #93). The same fixture feeds pass 1
// (classifyMedia, JS) and pass 2 (the PHP deleteUnreferencedPhp sends to `wp eval`, run through php
// against a stand-in $wpdb that answers from the fixture): the two must agree on every attachment.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyMedia } from '../quickstart/lib.mjs'
import { deleteUnreferencedPhp, parseAttachmentDeletes } from '../quickstart/prune-usermeta.mjs'

const phpOk = spawnSync('php', ['-v']).status === 0

const att = (ID, file, extra = {}) => ({ ID, post_type: 'attachment', post_status: 'inherit', post_name: `a${ID}`, post_parent: 0, file, sizes: [], ...extra })
const post = (ID, post_content, extra = {}) => ({ ID, post_type: 'page', post_status: 'publish', post_name: `p${ID}`, post_title: `P${ID}`, post_parent: 0, post_content, post_excerpt: '', ...extra })

/** Pass 1 on a fixture: `{ id: verdict }`. */
function passOne(db) {
  const rows = classifyMedia({ termmeta: [], options: [], meta: [], content: [], files: [], ...db })
  return Object.fromEntries(rows.filter((r) => r.area === 'attachment').map((r) => [r.item.match(/^#(\d+)/)[1], r]))
}

/** Pass 2 on the same fixture: `{ id: answer }`, the PHP run for real. */
function passTwo(db) {
  const dir = mkdtempSync(join(tmpdir(), 'prune-one-'))
  try {
    const data = {
      attachments: db.attachments.map((a) => ({ ID: a.ID, post_type: a.post_type, post_status: a.post_status, post_parent: a.post_parent, file: a.file, sizes: a.sizes })),
      content: db.content ?? [],
      meta: db.meta ?? [],
      termmeta: db.termmeta ?? [],
      options: db.options ?? [],
      usermeta: db.usermeta ?? []
    }
    const b64 = Buffer.from(JSON.stringify(data)).toString('base64')
    const stub = String.raw`<?php
define('ARRAY_A', 'ARRAY_A');
define('WP_CONTENT_DIR', ${JSON.stringify(dir)});
$DB = json_decode(base64_decode('${b64}'), true);
class W { public $usermeta='um'; public $posts='posts'; public $postmeta='pm'; public $termmeta='tm'; public $options='op'; public $last_error='';
  function prepare($sql, ...$a) { foreach ($a as $x) { $sql = preg_replace_callback('/%[ds]/', function () use ($x) { return is_int($x) ? (string) $x : "'" . addslashes($x) . "'"; }, $sql, 1); } return $sql; }
  function esc_like($s) { return $s; }
  function query($s) { return true; }
  // A row passes the LIKE filter of the query when any of its text columns holds any needle: the real database does the same.
  function keep($sql, $rows, $cols) {
    preg_match_all("/LIKE '%(.*?)%'/", $sql, $m);
    $out = array();
    foreach ($rows as $r) { foreach ($m[1] as $n) { foreach ($cols as $c) if (false !== strpos((string) $r[$c], stripslashes($n))) { $out[] = $r; continue 3; } } }
    return $out;
  }
  function get_results($sql, $t) {
    global $DB;
    if (preg_match('/FROM posts WHERE ID = (\d+) FOR UPDATE/', $sql, $m)) {
      foreach ($DB['attachments'] as $a) if ((int) $a['ID'] === (int) $m[1]) return array($a);
      foreach ($DB['content'] as $c) if ((int) $c['ID'] === (int) $m[1]) return array($c);
      return array();
    }
    if (preg_match('/FROM pm WHERE post_id = (\d+)/', $sql, $m)) {
      foreach ($DB['attachments'] as $a) if ((int) $a['ID'] === (int) $m[1]) {
        $out = array();
        if (!empty($a['file'])) $out[] = array('meta_key' => '_wp_attached_file', 'meta_value' => $a['file']);
        if ($a['sizes']) { $s = array(); foreach ($a['sizes'] as $f) $s[] = array('file' => $f); $out[] = array('meta_key' => '_wp_attachment_metadata', 'meta_value' => serialize(array('sizes' => $s))); }
        return $out;
      }
      return array();
    }
    if (false !== strpos($sql, 'FROM um')) return $DB['usermeta'];
    if (false !== strpos($sql, 'FROM posts WHERE post_type NOT IN')) return $this->keep($sql, $DB['content'], array('post_content', 'post_excerpt'));
    if (false !== strpos($sql, 'FROM pm m JOIN')) return $this->keep($sql, $DB['meta'], array('meta_value'));
    if (false !== strpos($sql, 'FROM tm')) return $this->keep($sql, $DB['termmeta'], array('meta_value'));
    if (false !== strpos($sql, 'FROM op')) return $this->keep($sql, $DB['options'], array('option_value'));
    return array();
  } }
$wpdb = new W();
function maybe_unserialize($v) { return @unserialize($v); }
function add_filter() {} function remove_filter() {} function wp_delete_file($f) {}
function wp_json_encode($v) { return json_encode($v); }
function wp_delete_attachment($id, $f) { return true; }
`
    const code = deleteUnreferencedPhp(db.attachments.map((a) => ({ id: String(a.ID), type: a.post_type, status: a.post_status })))
    const file = join(dir, 'run.php')
    writeFileSync(file, stub + code)
    const r = spawnSync('php', [file], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const rep = parseAttachmentDeletes(r.stdout)
    assert.ok(rep.results, JSON.stringify(rep))
    return rep.results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Each attachment is an orphan to pass 1 and must not be named by pass 2. The comment on each says
// which pass 2 line produced the hit before the matcher was shared.
const classes = {
  // `$hit`'s `'i:' . $id . ';'` test: `i:41;` is an array value, and sticky_posts is no key that holds attachment ids.
  stickyPosts: { att: att(41, '2024/05/photo.jpg'), options: [{ option_name: 'sticky_posts', option_value: 'a:2:{i:0;i:41;i:1;i:99;}' }] },
  // `$hit`'s stem loop (`strpos($t, $s)`): the stem `2019` is found inside a date.
  dateText: { att: att(190, '2024/05/2019.jpg'), meta: [{ post_id: 68, meta_key: 'created-date', meta_value: '2019-05-02 10:00:00' }] },
  // The same stem loop: the stem `12` is found in a block attribute that is no attachment id.
  queryId: { att: att(55, '2024/05/12.jpg'), content: [post(70, '<!-- wp:query {"queryId":12} /-->')] },
  // The same stem loop, on a post meta value that is the file's name.
  fileNameInMeta: { att: att(60, '2024/05/intro-image.jpg'), meta: [{ post_id: 70, meta_key: 'intro-image', meta_value: 'intro-image.jpg' }], use: true }
}

for (const [name, c] of Object.entries(classes)) {
  test(`one matcher: ${name} — pass 1 and pass 2 give the same answer`, { skip: !phpOk && 'php is not installed' }, () => {
    const db = { attachments: [c.att], content: c.content ?? [post(1, '')], meta: c.meta ?? [], options: c.options ?? [] }
    const one = passOne(db)[c.att.ID]
    const two = passTwo(db)[c.att.ID]
    const kept = Boolean(c.use)
    assert.equal(one.verdict, kept ? 'KEEP' : 'PRUNE', `pass 1: ${one.why}`)
    assert.equal(two === 'deleted', !kept, `pass 2: ${two}`)
  })
}

test('one matcher: real references still protect in both passes', { skip: !phpOk && 'php is not installed' }, () => {
  const db = {
    attachments: [
      att(7, '2024/06/hero.jpg'),
      att(8, '2024/06/band.jpg'),
      att(9, '2024/06/gallery.jpg'),
      att(10, '2024/06/logo.jpg'),
      att(11, '2024/06/card.jpg', { sizes: ['card-300x200.jpg'] }),
      att(12, '2024/06/mod.jpg'),
      att(13, '2024/06/free.jpg')
    ],
    content: [
      post(1, '<img class="wp-image-7" src="x">'),
      post(2, '<!-- wp:cover {"id":8} /-->'),
      post(3, '<!-- wp:gallery {"ids":[5,9]} /-->'),
      post(4, '<img src="https://example.test/wp-content/uploads/2024/06/card-300x200.jpg">')
    ],
    options: [
      { option_name: 'theme_mods_t', option_value: 'a:1:{s:11:"custom_logo";i:10;}' },
      { option_name: 'site_icon', option_value: '12' }
    ]
  }
  const one = passOne(db)
  const two = passTwo(db)
  for (const id of [7, 8, 9, 10, 11, 12]) {
    assert.equal(one[id].verdict, 'KEEP', `pass 1 #${id}: ${one[id].why}`)
    assert.notEqual(two[id], 'deleted', `pass 2 #${id}`)
    assert.match(two[id], /^named: .*\(matched /, `pass 2 #${id} names the token: ${two[id]}`)
  }
  assert.equal(one[13].verdict, 'PRUNE')
  assert.equal(two[13], 'deleted')
})

test('one matcher: a file name or relative path as a whole meta value is a use, in both passes', { skip: !phpOk && 'php is not installed' }, () => {
  const db = {
    attachments: [att(20, '2024/07/a.jpg'), att(21, '2024/07/b.jpg', { sizes: ['b-150x150.jpg'] }), att(22, '2024/07/c.jpg')],
    content: [post(1, '')],
    meta: [
      { post_id: 1, meta_key: 'by_name', meta_value: 'a.jpg' },
      { post_id: 1, meta_key: 'by_path', meta_value: '2024/07/b.jpg' },
      { post_id: 1, meta_key: 'note', meta_value: 'see c.jpg.bak for the story' }
    ]
  }
  const one = passOne(db)
  const two = passTwo(db)
  assert.equal(one[20].verdict, 'KEEP')
  assert.equal(one[21].verdict, 'KEEP')
  assert.equal(one[22].verdict, 'PRUNE', 'a file name inside prose is not a whole-value use')
  assert.notEqual(two[20], 'deleted')
  assert.notEqual(two[21], 'deleted')
  assert.equal(two[22], 'deleted')
})

test('one matcher: a decimal or longer number is not the id, in both passes', { skip: !phpOk && 'php is not installed' }, () => {
  const db = {
    attachments: [att(12, '2024/08/d.jpg'), att(14, '2024/08/e.jpg')],
    content: [post(1, '<!-- wp:cover {"id":12.5} /--><!-- wp:gallery {"ids":[12.5,3.14,140]} /-->')]
  }
  const one = passOne(db)
  const two = passTwo(db)
  for (const id of [12, 14]) {
    assert.equal(one[id].verdict, 'PRUNE', `pass 1 #${id}: ${one[id].why}`)
    assert.equal(two[id], 'deleted', `pass 2 #${id}`)
  }
})

test('one matcher: the refusal names the id even when the matched value is long', { skip: !phpOk && 'php is not installed' }, () => {
  const ids = Array.from({ length: 60 }, (_, i) => 1000 + i).join(',')
  const um = 'x'.repeat(200) + ' 77 ' + 'y'.repeat(200)
  const db = {
    attachments: [att(1059, '2024/09/f.jpg'), att(77, '2024/09/g.jpg')],
    content: [post(1, `<!-- wp:gallery {"ids":[${ids}]} /-->`)],
    usermeta: [{ user_id: 3, meta_key: 'profile_image_note', meta_value: um }]
  }
  const two = passTwo(db)
  assert.match(two[1059], /named: content of #1 \(matched "\.\.\..*\b1059"\)$/, two[1059])
  assert.match(two[77], /named: profile_image_note of user 3 \(matched ".*\b77\b.*"\)$/, two[77])
})
