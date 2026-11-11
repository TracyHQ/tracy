# Rebuilding `source/snapshot`

`source/snapshot` (22 MB) is the Visual QA reference: a mirror of the source site plus the pictures its pages cite through
inline `background-image` (which the crawler cannot see, SF-19). It is **git-ignored**. What the gates read in its
place is committed: `source/snapshot-SHA256SUMS` (`sha256sum` lines of every file), `inventory/*.json`, `qa.contract.json` (it hashes the
source files it cites).

Source: JoomlArt's released quickstart `quickstart/ja-restaurant/j6` **1.0.6** (Joomla 6). The demo photographs are the ones that
release (and the WordPress 7 release of the same template) ships.

| File | sha256 |
|---|---|
| `ja-restaurant-j6-webroot-1.0.6.tar.gz` | `c5810cd6f7fa200530cce2f0d454663dbd9d0553af13cbd6163574468090bacb` |
| `ja-restaurant-j6-database-1.0.6.sql.gz` | `c70dd8d92a56948c4dfaeb35313115da6ceff2b94978c8aa81231db76d6eb7e0` |

**A fresh crawl never matches an earlier one byte for byte.** The source prints a different random value on every page load: the
Joomla form token (`csrf.token` in the page options and the hidden token field) and the AcyMailing form ids (`formAcym<n>`,
`email_field_<n>`); `crawl.json` also records `crawledAt`. Every HTML page and `crawl.json` therefore differ from one crawl to the
next (two crawls of one stand: 56 of 58 pages differ); the pictures, fonts, scripts and the generated stylesheets (`t3-assets/`) do
not. So `snapshot-manifest.mjs verify` passes only against the crawl the manifest was written from. The manifest and the source
hashes of `qa.contract.json` were last written from the crawl of 2026-11-09 (DECISIONS D64); after a new crawl, re-pin them (below).

Steps (run from the template folder; `$S` is the `tracy-emdash-template` skill folder, `$W` any new folder):

```bash
sha256sum -c SHA256SUMS              # next to the two release files
mkdir -p $W/webroot $W/db && tar -xzf ja-restaurant-j6-webroot-1.0.6.tar.gz -C $W/webroot
gunzip -c ja-restaurant-j6-database-1.0.6.sql.gz > $W/db/dump.sql
# the release ships configuration.php with the connection and three paths blank; fill them in the copy under $W/webroot:
#   $host = <the database container's name>; $user = $password = $db = 'joomla' (the stand's own);
#   $log_path = /var/www/html/administrator/logs; $tmp_path = /var/www/html/tmp; $secret = any non-empty string
# (an empty $tmp_path answers every page with "Path cannot be empty")
mkdir -p $W/webroot/t3-assets $W/webroot/tmp $W/webroot/administrator/logs $W/webroot/cache $W/webroot/administrator/cache
chmod -R a+w $W/webroot/t3-assets $W/webroot/tmp $W/webroot/administrator/logs $W/webroot/cache $W/webroot/administrator/cache
docker network create snap-net
# stand: mariadb:11 (MARIADB_DATABASE/USER/PASSWORD = joomla, $W/db mounted read-only at /docker-entrypoint-initdb.d) and
# joomla:6-php8.3-apache on 127.0.0.1:18216 with $W/webroot at /var/www/html and -e JOOMLA_DB_HOST=<db container>
# -e JOOMLA_DB_USER/PASSWORD/NAME=joomla (the image refuses to start without JOOMLA_DB_HOST); the administrator password is blanked
node $S/scripts/ingest/from-url.mjs http://127.0.0.1:18216/index.php --out $W/snapshot --max-pages 80
# (58 pages, 166 assets, 5 failed fetches: template picture files the CSS names but the stand does not serve; the crawl also keeps
#  the two later pages of the Blog list, index~start=5.html and index~start=10.html)
# the 404 page the contract cites is the stand's own answer, saved raw as the crawler saves a page (the crawler skips non-200 answers):
mkdir -p $W/snapshot/index.php/nope-404 && curl -s http://127.0.0.1:18216/index.php/nope-404 -o $W/snapshot/index.php/nope-404/index.html
# pictures the pages cite but the crawler cannot see: copy exactly the files the manifest names and the crawl did not produce
node ingest/snapshot-manifest.mjs missing $W/snapshot source/snapshot-SHA256SUMS | grep -v nope-404 | while read f; do mkdir -p "$W/snapshot/$(dirname "$f")"; cp "$W/webroot/$f" "$W/snapshot/$f"; done
mv $W/snapshot source/snapshot
# tear the stand down: docker rm -f both containers, docker network rm snap-net (files the web container wrote are owned by
# www-data: remove $W with a container, e.g. docker run --rm -v $W:/w0 alpine rm -rf /w0/...)
```

**Re-pinning after a new crawl** (the pictures must come out identical; only HTML and `crawl.json` move):

```bash
node ingest/snapshot-manifest.mjs verify source/snapshot source/snapshot-SHA256SUMS   # expect changed = HTML + crawl.json only, no picture, font, script or stylesheet
node ingest/snapshot-manifest.mjs write source/snapshot source/snapshot-SHA256SUMS
# qa.contract.json: replace each `source.files[].sha256` with the one `initContract(source/snapshot).source.files` (tools/qa-contract.mjs)
# computes for the same path, keep every disposition and reason, give a page the crawl added a disposition with a reason, then:
node tools/qa-contract.mjs qa.contract.json --source source/snapshot          # status pass, 246 cases
node tools/inventory.mjs source/snapshot <tmp-dir>                            # copy source-inventory.json over inventory/source-inventory.json and inventory/source-inventory/
```

`from-url.mjs` is the kit's crawler (`scripts/ingest/` of the `tracy-emdash-template` skill). The mirror carries no JavaScript
execution: pages that the source builds client-side come back thin, which is how the source renders in the Fast Gate too.
Serve it for the gates with `python3 -I -m http.server 18217 --bind 127.0.0.1 --directory source/snapshot`.
