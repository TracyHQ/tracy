# Rebuilding `source/snapshot`

`source/snapshot` (21 MB, 209 files) is the Visual QA reference: a mirror of the source site plus the 404 page and the two
files that page cites. It is **git-ignored**. What the gates read in its place is committed: `source/snapshot-SHA256SUMS`
(`sha256sum` lines of every file, `./` paths, sorted in the C locale), `inventory/source-inventory.json` and
`qa.contract.json` (it hashes every source file it cites).

Source: JoomlArt's released quickstart `quickstart/ja-diner/j6` **1.0.5** (Joomla 6), the installer zip
`ja-diner-j6-quickstart-1.0.5.zip`, sha256 `bb3315946fccc5bed59d520c80257f08f3dfedc5e2828744d53f30735892e393`
(DECISIONS D2). The demo data is in the zip (`installation/sql`): there is no separate dump.

**A fresh crawl never matches an earlier one byte for byte.** Every page load prints new random values: the Joomla form token in
the page's `joomla-script-options` and the AcyMailing form ids (`formAcym<n>`, `email_field_<n>`); `crawl.json` records
`crawledAt`. So `crawl.json` and every HTML page differ from one crawl to the next; the pictures, fonts, scripts and stylesheets
(including the generated `t3-assets/css/*`) do not. The manifest and the source hashes were last pinned from the crawl of
2026-11-13 (DECISIONS D-K2).

Steps (from the template folder; `$W` is any new folder outside the repository, `$CRAWL` is
`../../../vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/ingest/from-url.mjs`, the skill's crawler):

```bash
# 1. the release, checked
sha256sum ja-diner-j6-quickstart-1.0.5.zip          # bb3315946fccc5bed59d520c80257f08f3dfedc5e2828744d53f30735892e393
mkdir -p $W/webroot $W/build && (cd $W/webroot && unzip -q <path>/ja-diner-j6-quickstart-1.0.5.zip)
# 2. a PHP image with the extensions Joomla needs ($W/build/Dockerfile):
#      FROM php:8.3-apache
#      RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev libpng-dev libjpeg-dev libfreetype6-dev libicu-dev libwebp-dev \
#       && docker-php-ext-configure gd --with-jpeg --with-freetype --with-webp \
#       && docker-php-ext-install -j4 mysqli pdo_mysql gd zip intl && a2enmod rewrite
docker build -t diner-snap-php:8.3 $W/build
# 3. the stand: the port must be 127.0.0.1:18080 (the pages print absolute addresses)
docker network create snap-net
docker run -d --name snap-db --network snap-net -e MARIADB_DATABASE=joomla -e MARIADB_USER=joomla \
  -e MARIADB_PASSWORD=joomla -e MARIADB_ROOT_PASSWORD=root mariadb:11
chmod -R a+w $W/webroot
docker run -d --name snap-web --network snap-net -p 127.0.0.1:18080:80 -v $W/webroot:/var/www/html diner-snap-php:8.3
# 4. install: the quickstart's own installer loads the demo data
docker exec -u www-data snap-web php installation/joomla.php install -n --site-name="JA Diner" --admin-user=Admin \
  --admin-username=admin --admin-password=<any> --admin-email=admin@example.com --db-type=mysqli --db-host=snap-db \
  --db-user=joomla --db-pass=joomla --db-name=joomla --db-prefix=jd_
# the web server must own the tree, or the first page is a cache "Permission denied" error page
docker exec snap-web chown -R www-data:www-data /var/www/html
# 5. the crawl (SEF URLs under /index.php/, no rewrite): 55 pages, 153 assets, 1 failed fetch
node $CRAWL http://127.0.0.1:18080/ --out $W/snapshot --max-pages 80
# 6. the 404 page the contract cites is the stand's own answer, saved raw (the crawler skips non-200 answers),
#    and the two files only that page uses, copied from the webroot
mkdir -p $W/snapshot/index.php/nope-404 && curl -s http://127.0.0.1:18080/index.php/nope-404 -o $W/snapshot/index.php/nope-404/index.html
for f in templates/ja_diner/css/error.css templates/ja_diner/images/bg-404.jpg; do
  mkdir -p "$W/snapshot/$(dirname "$f")" && cp "$W/webroot/$f" "$W/snapshot/$f"; done
# 7. check: the same 209 files; only ./crawl.json and the HTML pages may fail
(cd $W/snapshot && sha256sum -c <template folder>/source/snapshot-SHA256SUMS | grep -v ': OK$')
cp -r $W/snapshot source/snapshot
# 8. tear down
docker rm -f snap-web snap-db && docker network rm snap-net && docker rmi diner-snap-php:8.3
# files the web container wrote are owned by www-data: remove $W with a container
docker run --rm -v $W:/w0 alpine rm -rf /w0/webroot
```

**Re-pinning after a new crawl** (only `./crawl.json` and HTML pages may have moved; any picture, font, script or stylesheet
that differs stops the re-pin):

```bash
(cd source/snapshot && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > source/snapshot-SHA256SUMS
# qa.contract.json: replace each source.files[].sha256 whose file changed with "sha256:" + the file's new sha256, keep every
# disposition and reason; then:
node tools/qa-contract.mjs qa.contract.json --source source/snapshot          # status pass, 210 cases
node tools/inventory.mjs source/snapshot <tmp-dir>                            # copy <tmp-dir>/source-inventory.json over
                                                                              # inventory/source-inventory.json, "source": "source/snapshot"
```

`ingest/snapshot-manifest.mjs` writes paths without `./`, so it does not read this manifest; use `sha256sum -c` as above.
Serve the mirror for the gates with `python3 -I -m http.server 18217 --bind 127.0.0.1 --directory source/snapshot`.
