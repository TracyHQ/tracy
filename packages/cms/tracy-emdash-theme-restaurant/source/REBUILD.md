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

```bash
W=/path/to/work                      # any new folder
sha256sum -c SHA256SUMS              # next to the two release files
mkdir -p $W/webroot $W/db && tar -xzf ja-restaurant-j6-webroot-1.0.6.tar.gz -C $W/webroot
gunzip -c ja-restaurant-j6-database-1.0.6.sql.gz > $W/db/dump.sql
mkdir -p $W/webroot/t3-assets && chmod -R a+w $W/webroot/t3-assets   # else Joomla prints a "Could not create folder" notice on every page (SF-14)
# stand: mariadb:11 (database joomla / user joomla, the dump in /docker-entrypoint-initdb.d) + joomla:6-php8.3-apache on
# 127.0.0.1:18216 with $W/webroot bind-mounted at /var/www/html; the administrator password of the demo is blanked
node <skill>/scripts/ingest/from-url.mjs http://127.0.0.1:18216/index.php --out $W/snapshot --max-pages 80
# pictures the pages cite but the crawler cannot see: copy exactly the files the manifest names and the crawl did not produce
node ingest/snapshot-manifest.mjs missing $W/snapshot source/snapshot-SHA256SUMS | while read f; do mkdir -p "$W/snapshot/$(dirname "$f")"; cp "$W/webroot/$f" "$W/snapshot/$f"; done
node ingest/snapshot-manifest.mjs verify $W/snapshot source/snapshot-SHA256SUMS   # exit 0 = identical to the one the contract was built on
mv $W/snapshot source/snapshot
```

`from-url.mjs` is the kit's crawler (`scripts/ingest/` of the `tracy-emdash-template` skill). The mirror carries no JavaScript
execution: pages that the source builds client-side come back thin, which is how the source renders in the Fast Gate too.
Serve it for the gates with `python3 -I -m http.server 18217 --bind 127.0.0.1 --directory source/snapshot`.
