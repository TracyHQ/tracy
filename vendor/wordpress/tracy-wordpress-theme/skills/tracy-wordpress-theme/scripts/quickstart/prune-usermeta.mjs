// prune-usermeta.mjs — attachments that only user meta names. The seeder stores an author's photo
// as an attachment id in usermeta (`tracy_avatar`) and nowhere else, but lib.mjs REFS_PHP reads
// content, post meta, term meta and options only, so the audit called every avatar an orphan and
// `--apply` deleted them, leaving the pack with a `tracy_avatar` pointing at removed ids (#74 S-48).
// This module reads the user meta that can hold an attachment and turns the audit's PRUNE rows
// for the attachments it names into KEEP. Fail closed: a read that failed, or facts collected
// without it, turn every attachment PRUNE into UNKNOWN — never a deletion.

import { REF_SHAPES } from './lib.mjs'

export const USERMETA_MARKER = '__TRACY_USERMETA__'
/** User meta keys that can hold an attachment: the seeder's own, and any named like an image. */
export const USERMETA_KEY_PATTERN = 'avatar|photo|picture|image|attachment|thumbnail'
export const USERMETA_PHP = String.raw`global $wpdb;
$rows = $wpdb->get_results("SELECT user_id, meta_key, meta_value FROM {$wpdb->usermeta} WHERE meta_key = 'tracy_avatar' OR meta_key REGEXP '${USERMETA_KEY_PATTERN}'", ARRAY_A);
if (!is_array($rows)) { fwrite(STDERR, "usermeta query failed"); exit(1); }
echo "\n" . '${USERMETA_MARKER}' . wp_json_encode(array('usermeta' => $rows));`

/** The user meta list a USERMETA_PHP run printed, or `{ error }` — never an empty list from a bad answer. */
export function parseUsermeta(stdout) {
  const text = String(stdout ?? '')
  const at = text.lastIndexOf(USERMETA_MARKER)
  if (at === -1) return { error: 'wp eval printed no user meta data' }
  try {
    const o = JSON.parse(text.slice(at + USERMETA_MARKER.length).trim())
    if (!Array.isArray(o?.usermeta)) return { error: 'user meta data has no usermeta list' }
    for (const [i, r] of o.usermeta.entries())
      if (!r || typeof r !== 'object' || typeof r.meta_key !== 'string' || !('meta_value' in r) || !(r.meta_value === null || typeof r.meta_value === 'string' || typeof r.meta_value === 'number'))
        return { error: `usermeta[${i}] is not a complete meta row (meta_key and meta_value)` }
    return { usermeta: o.usermeta }
  } catch (e) {
    return { error: `user meta data is not JSON: ${e.message}` }
  }
}

/** One read of the user meta that can name an attachment: `{ usermeta }` or `{ error }`. */
export function collectUsermeta(wp) {
  let r
  try {
    r = wp(['eval', USERMETA_PHP], { allowFail: true, raw: true })
  } catch (e) {
    return { error: String(e.message).split('\n')[0] }
  }
  if (r?.status !== 0) return { error: `wp eval exited ${r?.status ?? '?'}: ${String(r?.stderr ?? '').trim().split('\n').slice(-2).join(' | ')}` }
  return parseUsermeta(r.stdout)
}

/** The rows of `usermeta` that name attachment `id`: the whole value is the id, or a serialized/JSON/list value holds it as a number. */
export function usermetaNaming(id, usermeta) {
  const n = String(id).trim()
  if (!/^\d+$/.test(n)) return []
  // The id as a number of its own inside the value: serialized (`i:50;`), JSON, a list — not a longer number.
  const held = new RegExp(`(?<![\\d.])${n}(?![\\d.])`)
  return usermeta.filter((m) => {
    const v = String(m.meta_value ?? '').trim()
    return v === n || held.test(v)
  })
}

const isAttachmentPrune = (r) => r.area === 'attachment' && r.verdict === 'PRUNE'

/**
 * `rows` from classifyPrune with the user meta taken into account. `media.usermeta` is the list
 * collectUsermeta read; `media.usermetaError` says why there is none. An attachment PRUNE that the
 * user meta names becomes KEEP; when the user meta is unknown (a failed read, or facts collected
 * before this check) each attachment PRUNE becomes UNKNOWN.
 */
export function withUsermetaRefs(rows, media) {
  const usermeta = Array.isArray(media?.usermeta) ? media.usermeta : null
  const why = media?.usermetaError ?? (usermeta ? null : 'the facts carry no user meta reading')
  return rows.map((r) => {
    if (!isAttachmentPrune(r)) return r
    if (!usermeta) return { ...r, verdict: 'UNKNOWN', why: `${r.why} — kept: user meta was not read (${why}), so an avatar cannot be ruled out; check it by hand` }
    const hit = usermetaNaming(r.remove?.wp?.[2], usermeta)
    if (!hit.length) return r
    const { remove, ...rest } = r
    return { ...rest, verdict: 'KEEP', why: `id held by user meta ${hit.map((m) => `${m.meta_key} of user ${m.user_id}`).join(', ')}` }
  })
}

/** An attachment id as `wp` prints it: a positive integer in canonical form that a JS number and PHP int both hold exactly. */
export const isAttachmentId = (id) => typeof id === 'string' && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))

export const ATTDEL_MARKER = '__TRACY_ATTDEL__'

/**
 * One `wp eval` that decides and deletes each attachment inside one database transaction: it locks
 * the attachment row and every row that could name it (user meta, content, post/term meta, options,
 * all `FOR UPDATE`, so a write that would add a reference waits for the commit), re-reads type and
 * status against what the audit saw, and deletes only when nothing names it. Anything it cannot
 * read, or any doubt (an id or a file name in the shapes classifyMedia counts, REF_SHAPES), keeps
 * the attachment and rolls back. `items`: `[{ id, type, status }]`, ids validated digit strings.
 */
export function deleteUnreferencedPhp(items) {
  for (const i of items) if (!isAttachmentId(i.id)) throw new Error(`attachment id ${JSON.stringify(i.id)} is not a positive safe integer`)
  const want = items.map((i) => ({ id: Number(i.id), type: String(i.type), status: String(i.status) }))
  const b64 = Buffer.from(JSON.stringify(want)).toString('base64')
  const shapes = Buffer.from(JSON.stringify(REF_SHAPES)).toString('base64')
  return String.raw`global $wpdb;
$want = json_decode(base64_decode('${b64}'), true);
$cfg = json_decode(base64_decode('${shapes}'), true);
$res = array();
$left = array();
$withheld = array();
$q = function ($sql) use ($wpdb) { $r = $wpdb->get_results($sql, ARRAY_A); return (is_array($r) && '' === $wpdb->last_error) ? $r : null; };
$themeRoot = WP_CONTENT_DIR . '/themes';
// Theme files are read afresh for every attachment (no cache: a rewrite the cache could not tell apart would hide a new reference); any that cannot be read is doubt.
$show = function ($tok) { $tok = preg_replace('/\s+/', ' ', (string) $tok); return ' (matched "' . (strlen($tok) > 80 ? '...' . substr($tok, -77) : $tok) . '")'; };
$themeNames = function ($hit) use ($themeRoot, $show) {
  if (!is_dir($themeRoot)) return null;
  try {
    $skip = function ($f) { $n = $f->getFilename(); return !($f->isDir() && ('node_modules' === $n || '.' === $n[0])); };
    $it = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(new RecursiveDirectoryIterator($themeRoot, FilesystemIterator::SKIP_DOTS), $skip));
    foreach ($it as $f) {
      if (!$f->isFile() || !preg_match('/\.(html|php|json|css|js|svg)$/i', $f->getFilename())) continue;
      $path = $f->getPathname();
      $t = @file_get_contents($path);
      if (false === $t) return 'theme file unreadable: ' . $path;
      $tok = $hit($t);
      if (null !== $tok) return 'named: theme file ' . substr($path, strlen($themeRoot) + 1) . $show($tok);
    }
  } catch (Exception $e) { return 'theme files unreadable: ' . $e->getMessage(); }
  return null;
};
$why = function ($id, $exp) use ($wpdb, $q, $themeNames, $cfg, $show) {
  $rows = $q($wpdb->prepare("SELECT ID, post_type, post_status, post_parent FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id));
  if (null === $rows) return 'read failed';
  if (!$rows) return 'no longer on the stand';
  if ('attachment' !== $rows[0]['post_type'] || $rows[0]['post_type'] !== $exp['type'] || $rows[0]['post_status'] !== $exp['status']) return 'changed since the audit: now ' . $rows[0]['post_type'] . '/' . $rows[0]['post_status'];
  $meta = $q($wpdb->prepare("SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key IN ('_wp_attached_file', '_wp_attachment_metadata')", $id));
  if (null === $meta) return 'read failed';
  // The file and its sizes, as classifyMedia reads them: the relative path, and each size in the same directory.
  $file = null; $sizes = array();
  foreach ($meta as $m) {
    if ('_wp_attached_file' === $m['meta_key']) { $file = (string) $m['meta_value']; continue; }
    $d = maybe_unserialize($m['meta_value']);
    if (!is_array($d)) continue;
    if (!empty($d['original_image'])) $sizes[] = (string) $d['original_image'];
    if (!empty($d['sizes']) && is_array($d['sizes'])) foreach ($d['sizes'] as $x) if (is_array($x) && !empty($x['file'])) $sizes[] = (string) $x['file'];
  }
  if (null === $file || '' === $file) return 'no file recorded';
  $dir = false !== strpos($file, '/') ? substr($file, 0, strrpos($file, '/') + 1) : '';
  $names = array($file);
  foreach ($sizes as $n) $names[] = $dir . $n;
  $values = array_values(array_unique(array_merge($names, array(basename($file)), $sizes)));
  // The one definition of a reference (lib.mjs REF_SHAPES), the same patterns classifyMedia applies.
  $idRe = '~' . str_replace('@ID@', (string) $id, $cfg['id']) . '~';
  $serialRe = '~' . str_replace('@ID@', (string) $id, $cfg['serial']) . '~i';
  $nameRe = '~' . $cfg['nameBefore'] . '(' . implode('|', array_map(function ($n) { return preg_quote($n, '~'); }, $names)) . ')' . $cfg['nameAfter'] . '~';
  $unslash = function ($t) { return str_ireplace(array('\\/', '\\u002f'), '/', (string) $t); };
  // Rows are pulled by what could hold the id or a file name; whether one DOES is decided by the shapes alone.
  $like = function ($col) use ($wpdb, $id, $values) {
    $parts = array($wpdb->prepare("$col LIKE %s", '%' . $wpdb->esc_like((string) $id) . '%'));
    foreach ($values as $v) $parts[] = $wpdb->prepare("$col LIKE %s", '%' . $wpdb->esc_like(basename($v)) . '%');
    return '(' . implode(' OR ', array_unique($parts)) . ')';
  };
  // The token a free text names the attachment by, or null.
  $hit = function ($text) use ($idRe, $serialRe, $nameRe, $unslash) {
    $t = $unslash($text);
    if (preg_match($idRe, $t, $m) || preg_match($serialRe, $t, $m)) return $m[0];
    if (preg_match($nameRe, $t, $m)) return $m[1];
    return null;
  };
  // A stored value that IS the id, or IS the file's name or relative path (an option counts by id only under a media-like name).
  $whole = function ($key, $value, $isOption) use ($id, $values, $cfg, $unslash) {
    $v = trim($unslash($value));
    if ('' === $v) return null;
    if ($v === (string) $id) return (preg_match('/' . $cfg['editKey'] . '/', $key) || ($isOption && !preg_match('/' . $cfg['mediaOption'] . '/i', $key))) ? null : $v;
    return in_array($v, $values, true) ? $v : null;
  };
  $um = $q("SELECT user_id, meta_key, meta_value FROM {$wpdb->usermeta} WHERE (meta_key = 'tracy_avatar' OR meta_key REGEXP '${USERMETA_KEY_PATTERN}') FOR UPDATE");
  if (null === $um) return 'read failed';
  foreach ($um as $m) {
    $v = trim((string) $m['meta_value']);
    if ($v === (string) $id) return 'named: ' . $m['meta_key'] . ' of user ' . $m['user_id'] . $show($v);
    // The token shown is the window around the id, so it stays visible in a long value.
    if (preg_match('/(?<![\d.])' . $id . '(?![\d.])/', $v, $w, PREG_OFFSET_CAPTURE)) { $at = max(0, $w[0][1] - 30); return 'named: ' . $m['meta_key'] . ' of user ' . $m['user_id'] . $show(substr($v, $at, 60 + strlen((string) $id))); }
  }
  $c = $q("SELECT ID, post_content, post_excerpt FROM {$wpdb->posts} WHERE post_type NOT IN ('attachment', 'revision') AND (" . substr($like('post_content'), 1, -1) . ' OR ' . substr($like('post_excerpt'), 1, -1) . ') FOR UPDATE');
  if (null === $c) return 'read failed';
  foreach ($c as $r) { $t = $hit($r['post_content']); if (null === $t) $t = $hit($r['post_excerpt']); if (null !== $t) return 'named: content of #' . $r['ID'] . $show($t); }
  $pm = $q("SELECT m.post_id, m.meta_key, m.meta_value FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE p.post_type NOT IN ('attachment', 'revision') AND " . $like('m.meta_value') . ' FOR UPDATE');
  if (null === $pm) return 'read failed';
  foreach ($pm as $r) {
    if (preg_match('/' . $cfg['editKey'] . '/', $r['meta_key'])) continue;
    $t = $whole($r['meta_key'], $r['meta_value'], false); if (null === $t) $t = $hit($r['meta_value']);
    if (null !== $t) return 'named: meta ' . $r['meta_key'] . ' of #' . $r['post_id'] . $show($t);
  }
  $tm = $q("SELECT term_id, meta_key, meta_value FROM {$wpdb->termmeta} WHERE " . $like('meta_value') . ' FOR UPDATE');
  if (null === $tm) return 'read failed';
  foreach ($tm as $r) { $t = $whole($r['meta_key'], $r['meta_value'], false); if (null === $t) $t = $hit($r['meta_value']); if (null !== $t) return 'named: term meta ' . $r['meta_key'] . ' of term ' . $r['term_id'] . $show($t); }
  $op = $q("SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name NOT LIKE '\\_transient\\_%' AND option_name NOT LIKE '\\_site\\_transient\\_%' AND " . $like('option_value') . ' FOR UPDATE');
  if (null === $op) return 'read failed';
  foreach ($op as $r) { $t = $whole($r['option_name'], $r['option_value'], true); if (null === $t) $t = $hit($r['option_value']); if (null !== $t) return 'named: option ' . $r['option_name'] . $show($t); }
  $par = (int) $rows[0]['post_parent'];
  if ($par > 0) {
    $pp = $q($wpdb->prepare("SELECT ID, post_type, post_content FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $par));
    if (null === $pp) return 'read failed';
    if ($pp && false !== stripos((string) $pp[0]['post_content'], '[gallery') && preg_match('~' . $cfg['galleryAll'] . '~', (string) $pp[0]['post_content'])) return 'named: [gallery] of its parent ' . $pp[0]['post_type'] . ' #' . $par;
  }
  // A theme file is code and styles: it names the attachment the way any text does (its path or its id in the shapes above), and a bare stem is no reference.
  return $themeNames($hit);
};
foreach ($want as $exp) {
  $id = (int) $exp['id'];
  if ($id < 1) { $res[$id] = 'not an attachment id'; continue; }
  if (false === $wpdb->query('START TRANSACTION')) { $res[$id] = 'no transaction'; continue; }
  $r = $why($id, $exp);
  // A transaction that cannot be closed as intended is doubt about every later attachment too: stop, and let the
  // connection's end discard whatever is still open.
  if (null !== $r) { if (false === $wpdb->query('ROLLBACK')) { $res[$id] = 'rollback failed, stopped'; break; } $res[$id] = $r; continue; }
  // wp_delete_attachment removes the files as well as the rows, and a rollback cannot bring files back:
  // hold every file path back until the rows are committed, and touch the files only then.
  $files = array();
  $hold = function ($f) use (&$files) { if ($f) $files[] = $f; return ''; };
  add_filter('wp_delete_file', $hold, PHP_INT_MAX);
  $ok = wp_delete_attachment($id, true);
  remove_filter('wp_delete_file', $hold, PHP_INT_MAX);
  if (!$ok) { if (false === $wpdb->query('ROLLBACK')) { $res[$id] = 'rollback failed, stopped'; break; } $res[$id] = 'delete failed'; continue; }
  // A failed COMMIT leaves the outcome unknown: the files stay, nothing more is started.
  if (false === $wpdb->query('COMMIT')) {
    // The outcome is unknown: read the row back (when that fails, it stays unknown) and name the files that were held back.
    $now = $q($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d", $id));
    $state = null === $now ? 'state unverified' : ($now ? 'row still present' : 'row gone');
    $withheld[$id] = array_values(array_unique($files));
    $res[$id] = 'commit failed, outcome unknown (' . $state . '), stopped; files held back, none deleted; verify the attachment by hand';
    break;
  }
  $res[$id] = 'deleted';
  foreach (array_unique($files) as $f) { wp_delete_file($f); if (file_exists($f)) $left[$id][] = $f; }
}
foreach ($want as $exp) if (!isset($res[(int) $exp['id']])) $res[(int) $exp['id']] = 'not processed: an earlier attachment stopped the run';
echo "\n" . '${ATTDEL_MARKER}' . wp_json_encode(array('results' => $res, 'left' => $left, 'withheld' => $withheld));`
}

/** The per-id answers a deleteUnreferencedPhp run printed, or `{ error }`. */
export function parseAttachmentDeletes(stdout) {
  const text = String(stdout ?? '')
  const at = text.lastIndexOf(ATTDEL_MARKER)
  if (at === -1) return { error: 'wp eval printed no deletion report' }
  try {
    const o = JSON.parse(text.slice(at + ATTDEL_MARKER.length).trim())
    if (!o?.results || typeof o.results !== 'object' || Array.isArray(o.results)) return { error: 'deletion report has no results object' }
    // `left` and `withheld`: file paths per attachment id (removal failed / held back after a failed COMMIT).
    // Both must be present and well formed: a report without them cannot say what is still in uploads/.
    const paths = (name) => {
      const v = o[name]
      if (Array.isArray(v)) return v.length ? null : {} // PHP prints an empty array as []
      if (!v || typeof v !== 'object') return null
      const out = {}
      for (const [id, files] of Object.entries(v)) {
        if (!Array.isArray(files) || !files.every((f) => typeof f === 'string')) return null
        out[id] = files
      }
      return out
    }
    const left = paths('left')
    const withheld = paths('withheld')
    // Whatever list is well formed still rides along on an error, so the caller can name the files it knows of.
    if (!left) return { error: 'deletion report has a missing or malformed left list', ...(withheld && { withheld }) }
    if (!withheld) return { error: 'deletion report has a missing or malformed withheld list', left }
    return { results: o.results, left, withheld }
  } catch (e) {
    return { error: `deletion report is not JSON: ${e.message}` }
  }
}

/**
 * Delete attachment rows whose user meta still names nobody, checking and deleting in one wp
 * call. `deleted` rows are REMOVED; a row the user meta names, or any row the answer does not
 * account for (a failed call, a missing id), becomes UNKNOWN and nothing is assumed deleted.
 * `outcome.halt` is set (a message naming the attachment ids and the file paths known to be
 * affected) when the run cannot be trusted to have ended cleanly — a failed call, a report that is
 * missing or malformed, a failed COMMIT or ROLLBACK — and the caller must delete nothing more.
 */
export function deleteUnreferenced(wp, rows, outcome = {}) {
  if (!rows.length) return []
  const ids = rows.map((r) => String(r.remove?.wp?.[2]))
  const items = rows.map((r, i) => ({ id: ids[i], type: r.remove?.expect?.post_type, status: r.remove?.expect?.post_status }))
  let out
  if (!ids.every(isAttachmentId) || new Set(ids).size !== ids.length) out = { error: 'an attachment id is not a positive safe integer, or listed twice' }
  else if (items.some((i) => typeof i.type !== 'string' || !i.type || typeof i.status !== 'string' || !i.status)) out = { error: 'the audit recorded no type or status to re-check the attachment against' }
  else {
    try {
      const r = wp(['eval', deleteUnreferencedPhp(items)], { allowFail: true, raw: true })
      out = r?.status === 0 ? parseAttachmentDeletes(r.stdout) : { error: `wp eval exited ${r?.status ?? '?'}: ${String(r?.stderr ?? '').trim().split('\n').slice(-2).join(' | ')}` }
    } catch (e) {
      out = { error: String(e.message).split('\n')[0] }
    }
  }
  const files = (m) => Object.entries(m ?? {}).flatMap(([id, fs]) => fs.map((f) => `#${id}: ${f}`))
  const uncertain = ids.filter((id) => /^(commit|rollback) failed/.test(String(out.results?.[id] ?? '')))
  if (out.error || uncertain.length) {
    const affected = out.error ? ids : uncertain
    const paths = [...files(out.left), ...files(out.withheld)]
    outcome.halt = `attachment deletion stopped (${out.error ?? 'a transaction could not be closed'}); affected attachment ids: ${affected.join(', ')}; files: ${paths.length ? paths.join(', ') : 'none known from the report'}; verify by hand`
  }
  const removed = []
  for (const [i, r] of rows.entries()) {
    const answer = out.error ? null : out.results[ids[i]]
    if (answer === 'deleted') {
      r.verdict = 'REMOVED'
      const left = out.left[ids[i]] ?? []
      if (left.length) r.why += ` — rows deleted, but ${left.length} file(s) could not be removed and stay in uploads/: ${left.join(', ')}`
      removed.push(r)
    } else {
      r.verdict = 'UNKNOWN'
      const held = out.withheld?.[ids[i]] ?? []
      const heldNote = held.length ? `; ${held.length} file(s) held back in uploads/: ${held.join(', ')}` : ''
      r.why += ` — not removed: ${answer ?? `no answer to the combined check and delete (${out.error ?? 'id missing from the report'}); attachment #${ids[i]} and its files may be affected, verify by hand`}${heldNote}`
    }
  }
  return removed
}
