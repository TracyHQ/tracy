# Quickstart inventory — what a Joomla quickstart is made of, read from its files

> **Before Phase 2 (ingest) of a Joomla port.** Run it on the quickstarts a port may start from, to
> know the framework, the Joomla/PHP requirements, the extensions and the styles before choosing a
> pair to measure. `from-joomla.md` takes over once a quickstart is installed and captured.

```bash
# downloaded archives: each archive file, or each sub-directory of archives, is one quickstart
node scripts/ingest/quickstart-inventory.mjs --input <dir> --out <dir> \
  [--tag ja-nova=quickstart/ja-nova/j6]… [--verify-tags] \
  [--baseline ja-nova,ja-morgan --image wordpress:php8.3-apache --image mariadb:11 …]

# release tags: downloaded with `gh release download` (read-only), checked against the release digests
node scripts/ingest/quickstart-inventory.mjs --release quickstart/ja-nova/j6 … --out <dir> \
  [--repo JoomlArt-Products/ja-products] [--download-dir <dir>]

# strict re-measure of a frozen baseline (exit 1 on any gap)
node scripts/ingest/quickstart-inventory.mjs --verify-baseline <dir>/baseline.json --input <dir>
```

Needs `python3` (standard library only — `quickstart-inventory-archive.py` reads the archives),
`gh` for `--release` / `--verify-tags`, `docker` to resolve `--image name:tag` to a digest.
`--timeout` (default 1800 s) bounds the whole run; past it nothing is written.

## Output

`inventory.json` (schema `tracy.quickstart-inventory/1`) and `inventory.md` (one table + one short
section per quickstart), with `baseline.json` when there is one, published as one **generation**:

```
<out>/.generations/g-<id>/{inventory.json,inventory.md[,baseline.json],.reports.json}   written in full, flushed, renamed into place; never changed
<out>/current -> .generations/g-<id>                                        the published set
<out>/inventory.json -> current/inventory.json                              (and inventory.md, baseline.json)
```

The rename of `current` is the only commit boundary: before it a reader sees the previous set, after
it the new one — a failure or a kill at any point cannot publish part of a set. Every report is
written in full (a short write is continued; one that makes no progress fails the run) and flushed;
a failed directory flush fails the run too — only a file system that cannot flush directories at all
(`EINVAL`, `ENOTSUP`) is let through. `.reports.json` lists the reports of the generation.

A lock in `--out` refuses a second writer. The lock is a directory, `.quickstart-inventory.lock/`,
holding one owner file (pid and the process start time `ps` gives); a writer takes it by renaming a
complete claim directory onto that name, which succeeds only while no lock is there. A lock whose
owner is dead — the pid is gone, or runs with another start time (a reused pid) — is broken by
removing exactly that owner's file and then the empty directory: two writers breaking the same stale
lock cannot remove the lock one of them has just taken, since its owner file has another name, so
the second is refused. An owner file that cannot be read as one is left alone and refuses the run.
What a dead writer left (an unfinished generation, a half-made link, a claim, a generation it was
removing) is cleaned by the next run. Because the report names go through
`current`, a run that writes no baseline leaves no `baseline.json` of an earlier set visible (the
link points at nothing). Reports left as regular files by an earlier version of the tool are first
copied into a generation of their own and replaced by the links, so they stay readable, byte for
byte, until the switch. The new generation, the one it replaced and every generation a reader holds
are kept; the others are removed — renamed away first, then checked for a reader's hold again, then
deleted. Other files in `--out` are never touched.

**Reading a set.** Opening the three names one by one follows `current` each time, so a publication
between two opens can mix two sets. A reader that needs the reports together resolves `current` once
and reads from that generation — `readReports(out)` does this and returns `{generation, files}`,
`null` only for a report the generation's `.reports.json` does not list. While it reads it holds the
generation (a file under `.generations/.holds/` with its pid and start time), which no writer removes;
a read that still finds a file gone (the generation was being removed before the hold) starts again
from `current`, so what it returns is always one whole set. Holds of readers that are gone are
removed by the next writer. The JSON
carries no timestamp: two runs over the same input are byte-identical.

Per quickstart:

| field | from |
|---|---|
| `id` | archive file name without extension, or the sub-directory name; `idForTag` (`quickstart/ja-nova/j6` → `ja-nova-j6`) for `--release` |
| `tag` | `{value, source}` — `release` (downloaded from it), `release-digest` (a local file whose SHA-256 equals an asset digest of that release, `--verify-tags`), `declared` (`--tag` without a check) |
| `assets[]` | name, path under `--input`, size, SHA-256 (measured twice: Node stream + the helper; a mismatch or a changed stat is an error), container (`zip`, `tar.gz`, `sql.gz`…), role (`installer`, `webroot`, `database`, `bundle`, `other`) |
| `format` | `installer` (Joomla root with `installation/sql/mysql/*.sql`), `runtime-webroot-db` (root without installer + one database dump), `runtime-webroot` (no dump), `bundle` (the root is inside a nested archive; `innerFormat` says which kind), `unknown` (no root), `ambiguous` (several roots) |
| `joomla` | `<version>` of `administrator/manifests/files/joomla.xml`, cross-checked with the constants of `libraries/src/Version.php` |
| `phpMinimum` | `JOOMLA_MINIMUM_PHP` defined in `index.php`, `administrator/index.php`, `api/index.php`, `installation/index.php` — one value, or `null` with the disagreement listed. Only PHP code counts: a `define()` or `const` in a comment, a string, a heredoc or inline HTML is not a declaration |
| `framework`, `frameworkTemplate` | the framework of the template of the default site style (`home = '1'`, client 0) |
| `sites[]` | per Joomla root: `templates[]` (each site template with `framework`, `evidence[]`, `plugin`, `notes`), `frameworkPlugins`, `extensions.present[]` (manifests) joined with the database (`registered`, `enabled`, `registeredVersion`), `extensions.registeredWithoutManifest`, `templateStyles`, `languages.installed` (language manifests) and `languages.content` (`#__languages`), `embeddedArchives` |
| `unknowns[]` | every fact that could not be read or decided, with the reason: unreadable template, extension and language manifests, a missing `<version>`, a template in `conflict` or `unknown`, a default style naming a template the files lack, a framework template whose plugin is not shipped, database tables not known |

`null` means unknown; `[]` means read and empty. Only allowlisted columns leave a database source
(style id/template/client/home/title/inheritable/parent and, from its `params`, only the profile names
`typelist-site` / `typelist-theme`; menu item id/menutype/alias/path/type/published/template_style_id/home/language/client/parent
— the pages each style renders; language code/title/sef/published; extension
type/element/folder/client/enabled + the `version` of `manifest_cache`) — never any other `params`,
users, content or configuration. The text of a few typography files is read in memory (T4 `etc/site|theme/*.json`,
`etc/customfonts.json` / `fontcustoms.json`, T3 `etc/assets.xml`, the top-level `css/*.css` and `less/*.less`, `fonts/**/*.css`, T4's
`googlefonts/fonts.json`; each under `maxTextBytes`, all under `maxTextTotal`) and never written out.

`sites[].sourceFonts` is the **static source-font report** (`tracy.source-fonts-static/1`): per template style a
page renders with, the effective body / heading / menu family, the file and key it came from, what loads it and a
verdict; `findings[]` are the `source-font` findings, `complete: false` + `gaps[]` the evidence that is missing.
It is not an unknown of the inventory. `node scripts/ingest/source-font.mjs check --inventory inventory.json` exits
1 on a finding or a gap (from-joomla.md §Source fonts).

## Framework: from the template's own files

A framework is decided per template directory from markers **in that template**; the product name is
never read. The system plugins of the site (`plugins/system/t4/`, `t3/`, `helix3/`, `helixultimate/`)
corroborate — their version is recorded — but a template without markers does not inherit them:
Cassiopeia on a T4 site is `other`, with a note that the site ships the plugin.

| framework | template markers |
|---|---|
| T4 | `<t4>` in `templateDetails.xml`; a manifest attribute naming `plugins/system/t4`; `etc/layout/*.json` |
| T3 | `<t3>` in `templateDetails.xml`; a manifest attribute naming `plugins/system/t3`; `etc/layout/*.ini`; `tpls/` |
| Helix | a manifest attribute naming `plugins/system/helix3` or `plugins/system/helixultimate` |
| Gavick | `lib/gavern/` |

`etc/layout` alone is not T4: the T3 templates carry it too, as INI files (four of four T3
quickstarts measured). Markers of two frameworks in one template → `conflict`; no marker →
`other`; no readable manifest → `unknown`. A framework template whose plugin is not in the archive
is still classified, with a note.

When the default style is unknown (no database source, or its SQL is not modelled), the site
framework is the framework of the only site template with markers, and `basis` says so; otherwise
`unknown`.

## Database: replayed, never imported

For an installer, `installation/sql/mysql/` is replayed in the installer's order — `base.sql`,
`extensions.sql`, `supports.sql`, then the rest by name (the quickstart's `custom.sql`). Only three
tables are modelled (`#__template_styles`, `#__languages`, `#__extensions`, under `#__` or a prefix of
letters, digits, `_` and `$` ending in `_` — `jos_`, `my_site_`): `DROP` empties and removes, `CREATE`
(without `IF NOT EXISTS` on an existing table) restarts it, `TRUNCATE` / `DELETE` without `WHERE`
empties it, `INSERT` / `REPLACE` / `INSERT IGNORE … VALUES` with literal values adds rows — columns
mapped by name, from the column list or, without one, from the table's `CREATE TABLE`; `DROP TABLE a,
b` drops each modelled table it lists; `LOCK`/`UNLOCK TABLES` and `ALTER TABLE … DISABLE|ENABLE KEYS`
change nothing. So `custom.sql` replaces the base tables it drops and leaves the others. **Every**
statement that names a modelled table must be one of these forms for it; any other — `UPDATE` (with
or without `LOW_PRIORITY` / `IGNORE`, one or several tables), `DELETE … WHERE` or `… LIMIT` (any
modifiers), multi-table `DELETE`, `RENAME`, other `ALTER`, `CREATE TEMPORARY`, `CREATE … LIKE/SELECT`,
`INSERT … SELECT/SET` into or reading from it — as do non-literal values, a second row with the same
key or two table prefixes, makes that table **unknown**, listed in `unknowns`; no row is invented.
A `CREATE TABLE` of a modelled table with a foreign key (`FOREIGN KEY` or an inline `REFERENCES`)
makes it unknown, since `ON DELETE` / `ON UPDATE` lets a statement on another table, naming none of
the modelled ones, change its rows. A later `DROP` and `CREATE` of the table end an uncertainty about
its rows (an `UPDATE`, an `INSERT … SELECT`, that foreign key, an index); they do not end one that
outlives the table — a trigger, routine or event (a statement kind not modelled), or a view, `MERGE`
table or other object that a `CREATE`/`ALTER` defines over it: the table stays unknown for the rest
of the dump.
A table is named wherever its name stands outside a single-quoted value — after an alias list
(`UPDATE a AS x, #__template_styles AS s`), in a subquery, or double-quoted (a name under
`ANSI_QUOTES`). A repeated key is reported by its column and count, never its value.

A table prefix is a site's when a table position (after `FROM`, `JOIN`, `INTO`, `TABLE`, `UPDATE`,
`USING`, past an opening parenthesis and the modifiers MySQL allows there, and each name of a list,
aliases included; backquoted, bare or double-quoted) in **any** SQL file of the
same archive names a core Joomla table under it (`content`,
`users`, `menu`, `extensions` …), so a column such as `display_languages` is not a `languages` table.
A name that ends like a modelled table under a longer prefix (`jos_ja_languages` beside `jos_`) may be
a second site's: two prefixes, so the table is unknown. Table names inside strings are not read.

Plain comments are dropped. A version-conditional comment (`/*!40000 … */`, MariaDB's `/*M!… */`) runs
on the servers it names, so its body is kept: a statement that names a modelled table inside one makes
that table unknown, except the lock and key-toggle forms that change nothing (mysqldump's `/*!40000
ALTER TABLE … DISABLE KEYS */`). Only statement forms that change the tables they name are read as
such — `SET`, `LOCK`/`UNLOCK TABLES`, a transaction (`START TRANSACTION`, a bare `BEGIN`, `COMMIT`,
`ROLLBACK`, `SAVEPOINT`, `RELEASE`), `USE`, `CREATE`/`DROP` of a table, index, database or view,
`INSERT`, `REPLACE`, `ALTER TABLE`/`DATABASE`, `UPDATE`, `DELETE`, `TRUNCATE`, `RENAME TABLE`,
`ANALYZE`, `OPTIMIZE`, `FLUSH`. Any other — `CALL`, `PREPARE` / `EXECUTE`, `DELIMITER`, `LOAD`,
`HANDLER`, `SELECT`, a stored procedure, function, trigger or event, a compound `BEGIN … END` — may
change any table, named or not: all three become unknown.
Strings are unescaped the MySQL way.

Per database source `sites[].database.statements[]` counts the statements — `modelled`, `noEffect`
(naming no modelled table, of a kind that cannot change one), `unsupported`, `unrecognised` — with up to
20 distinct reasons and their counts (`reasonsOmitted` for the rest). A reason names the statement kind,
the table and the clause keywords only, never a value of the dump; `inventory.md` prints the same line.

A runtime quickstart uses the one `.sql` / `.sql.gz` outside the Joomla tree. Several candidates,
or an installer set plus a dump, are listed and none is chosen. SQL inside the tree (extension
install/update schemas) is never read as a site database.

## Input

`--input` is resolved once (`realpath`): a trailing `/` or `/.` and a symlink to the directory name
the same root, and a link on the way to it (macOS `/tmp` → `/private/tmp`) is the operator's to use.
`inventory.json` records both under `source` (`input` as given, made absolute; `inputResolved`), and
`--verify-baseline` prints both. Everything afterwards is read by the archive helper below that one
root: the root is opened from `/` one component at a time without following a link (a link that
appears on the resolved path after it was resolved is refused), and every listing, hash, stamp and scan
below it goes through directory descriptors (`openat` with `O_NOFOLLOW`) — Node lists, hashes and
re-checks nothing by pathname. A symlink, FIFO, socket or device inside `--input` is refused by
discovery, never followed; a component swapped during a walk is refused or never reached. Each asset
is hashed, then scanned from the descriptor the scan's own walk opened; the two reads must agree on
the bytes and the file (device, inode, size, mtime), and the same stamp is checked again just before
publication. A `--release` run reads its download directory the same way: the directory of a tag is
resolved before `gh` writes into it, and each download is checked against the release through that
descriptor walk — a file, or the directory, swapped for a link after the download is refused.

## Archives

Read by the helper, one pass per asset: every member is streamed (a corrupt, truncated or encrypted
one fails the run), metadata files are parsed in memory, nothing is extracted or executed. A nested
`.zip` / `.tar[.gz|.bz2|.xz]` / `.tgz` is spooled to an unlinked temporary file and scanned the same
way. A nested archive whose member path lies **below a Joomla root** of an enclosing archive is
recorded as that site's `embeddedArchives` and not read as a site (the AcyMailing template ZIPs in
three quickstarts); one beside that root (`siteA/` and `old/quickstart.zip` in one ZIP) is a site of
its own, so the quickstart is `ambiguous`. A Joomla root found only in a nested archive makes the
quickstart a `bundle`.

Refused, naming the asset and member: symlinks, hard links, FIFOs, sockets, devices and GNU sparse
members; absolute paths, `..`, backslashes, NUL; two members with one normalised name (an explicit
directory entry twice included), or a member under a file; a directory entry carrying data (directory
entries are read like files); encrypted ZIP members; unsupported compression; XML declaring entities
(external entities are never resolved). Archive metadata is bounded **before** it is loaded: a ZIP's
end-of-central-directory record is read first and its declared entry count and central directory size
checked; each tar metadata header (PAX, GNU long name/link) is counted as a member and size-checked
before its body is read. Limits (`--limit key=n`):

| key | default | |
|---|---|---|
| `maxMembers` | 200000 | members across the asset and its nested archives |
| `maxExpandedBytes` | 8 GiB | bytes decompressed across the asset |
| `maxRatio` / `ratioFloor` | 200 / 1 MiB | expanded ÷ compressed, checked once a member expands past the floor |
| `maxDepth` | 2 | nested archive levels |
| `maxNestedBytes` | 2 GiB | one nested archive |
| `maxMetadataBytes` | 4 MiB | one parsed XML/PHP file |
| `maxDirectoryBytes` | 64 MiB | one ZIP central directory; one tar metadata header |
| `maxSqlBytes` / `maxSqlRows` | 1 GiB / 200000 | one parsed SQL file / rows kept from it |

A refused asset fails the run: there is no partial inventory.

## Baseline: the frozen inputs of two measured ports

`--baseline a,b` writes `baseline.json` (schema `tracy.quickstart-baseline/1`) beside the inventory:
per quickstart the tag and its **release binding** (which release asset carries the local SHA-256 —
the digest the release publishes, never the hash measured here; a release that publishes none leaves
the binding's `sha256` null and the baseline incomplete),
the asset hashes, format, Joomla, PHP and framework; `runtimeImages[]` (`--image`: a `name@sha256:…`
pin is recorded as declared, a `name:tag` is resolved to its repository digest with
`docker image inspect` — a repository digest that is not `sha256:<64 hex>`, or of another repository,
leaves the image unresolved); `tool`; the SHA-256 of the `inventory.json` of the same run.

`tool.identity` is the version of the tool that **produced** the baseline:

| `kind` | when | recorded |
|---|---|---|
| `commit` | both implementation files equal their blobs at HEAD | `commit` |
| `staged-tree` | each file equals its blob at HEAD or its staged blob (not yet committed, e.g. under review) | `tree` (`git write-tree`), `baseCommit` (HEAD — required, recorded as context) |
| `none` | a file differs from the index (unstaged edits) | `why` |

`tool.implementationFiles[]` carries each file's SHA-256, git blob and `state` (`committed`,
`staged`, `unstaged`); `gitHead` and `dirty` describe the checkout. A staged-tree baseline names a
reviewable, reproducible version, not a published commit: a HEAD from before the tool existed is
never said to hold it. When a measured port starts, the baseline is regenerated from the commit that
carries the tool, so its identity is that `commit`.

`complete` is true only when `baselineGaps` — the one rule generation and `--verify-baseline` both
apply to the document — finds nothing: the pair in order, distinct tags bound by release digests,
a framework and a known format (`installer`, `runtime-webroot-db`, `runtime-webroot`, `bundle`) for
both, every asset with a path of the one form (`assetPathOk`) discovery and release download
produce and the run enforces before scanning — `<archive>` whose name is a quickstart id plus an
archive extension, or `<quickstart id>/<archive>` where the archive name is any directory entry
that is not hidden and holds no `/` or control character (spaces and non-ASCII letters included;
discovery refuses an archive named with a control character) — SHA-256 and size; an `inventorySha256`; at least one image, each with a
`sha256:<64 hex>` digest carried by a repository digest **of the image's own repository** (and equal
to a pinned one); both implementation files hashed; a `gitHead`; and a `commit` identity equal to it,
or a `staged-tree` identity whose `baseCommit` equals it. Otherwise `gaps[]` says what is missing and
the run warns. Generation and `--verify-baseline` apply one binding rule
(`bindingGaps`): the tag is `release` or `release-digest`, it has at least one binding, every binding
carries the release's own SHA-256 equal to its asset's measured one, and every asset is bound. A
release that publishes no digest leaves the binding's `sha256` null — the downloaded bytes are
hashed and recorded as the asset, never copied into the binding — so the baseline stays incomplete.

`--verify-baseline` first checks the document's shape — every list and object the rules walk is of
the expected type — and stops there with named gaps when it is not. It applies `baselineGaps` again,
then re-measures: the inventory.json of the baseline's own generation (read through one pinned
generation for `<out>/baseline.json`, else the `inventory.json` beside the resolved file) hashes to
`inventorySha256`, and each quickstart of the baseline is what that inventory says of it; the sources
under the resolved `--input` re-hashed by the archive helper (`hash <root> <path>`, see Input): a
symlinked directory or file below the root is refused rather than followed, and the bytes hashed are
those of the file at that path inside the resolved `--input`; the implementation files on disk against the recorded
hashes (unstaged drift fails), and — with `git cat-file` in the local repository — the identity's object exists with the right type (a
commit for `commit`, a tree for `staged-tree`, whose `baseCommit` is a commit), holds both files
with those same hashes, and `gitHead` is a commit here. A forged `complete` flag does
not help: every rule is re-checked. It works offline and exits 1 with one line per problem.

## Measured 28/09/2026 on the seven downloaded quickstarts

| quickstart | Joomla | PHP ≥ | framework | markers |
|---|---|---|---|---|
| ja-resort, ja-phio | 6.1.2 | 8.3.0 | T4 | `<t4>`; `etc/layout/*.json` |
| ja-nova | 6.1.1 | 8.3.0 | T4 | `<t4>`; `etc/layout/*.json` |
| ja-morgan | 6.1.1 | 8.3.0 | T3 | `<t3>`; `plugins/system/t3` field path; `etc/layout/*.ini`; `tpls/` |
| ja-mood, ja-donate, ja-directory | 6.0.0 | 8.3.0 | T3 | same four T3 markers |

ja-resort's manifest also names `plugins/system/t4` — inside an XML comment, which is not a marker.

All seven are installer ZIPs; in each, the default site style's template is the product template
and Cassiopeia / Cassiopeia Extended are `other`. `quickstart/ja-nova/j6` and
`quickstart/ja-morgan/j6` on `JoomlArt-Products/ja-products` carry the SHA-256 of the local
`ja-nova.zip` / `ja-morgan.zip` (release asset `ja-<name>-j6-quickstart.zip`). The opt-in test
`scripts/test/quickstart-inventory-real.test.mjs` (`P1_REAL_INPUT_DIR`, `P1_ARTIFACT_ROOT`) re-checks
every figure with `unzip` and plain hashing.
