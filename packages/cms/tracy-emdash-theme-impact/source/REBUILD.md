# Rebuilding the source stand and `source/snapshot`

`source/snapshot` is the Visual QA reference: a mirror of the source site. It is **git-ignored**; what the gates read in its place is committed (`source/snapshot-SHA256SUMS` once written, `inventory/source-inventory.json`, `qa.contract.json`).

Source: JoomlArt's released quickstart `quickstart/ja-impact/j6` **1.0.6**: `ja-impact-j6-webroot-1.0.6.tar.gz` (sha256 `9cb9ac3cb54e2717e866131aa24d1f34a8a0ebc9c845736feda00602efcaf679`) and `ja-impact-j6-database-1.0.6.sql.gz` (sha256 `a8e0ae5f7bd6c76c554426afcb7f94822685ac5c1a02dcfcb0f50eb4cee382a4`), DECISIONS D2. Table prefix `jd_`.

```bash
# 1. the release, checked against tracy_setting.json
sha256sum ja-impact-j6-webroot-1.0.6.tar.gz ja-impact-j6-database-1.0.6.sql.gz
mkdir -p $W/webroot $W/build && tar xzf ja-impact-j6-webroot-1.0.6.tar.gz -C $W/webroot
# 2. a PHP image with the extensions Joomla needs ($W/build/Dockerfile):
#      FROM php:8.3-apache
#      RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev libpng-dev libjpeg-dev libfreetype6-dev libicu-dev libwebp-dev \
#       && docker-php-ext-configure gd --with-jpeg --with-freetype --with-webp \
#       && docker-php-ext-install -j4 mysqli pdo_mysql gd zip intl && a2enmod rewrite \
#       && sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf
docker build -t impact-php:8.3 $W/build
# 3. configuration.php in the webroot: host im-db, user root, password root, db joomla, sef_rewrite true, tmp_path and
#    log_path inside the webroot; cp htaccess.txt .htaccess; chmod -R a+rwX the webroot (T4 compiles its stylesheets
#    on every request when it cannot write them: 28 s a page instead of 40 ms)
docker network create imp-net
docker run -d --name im-db --network imp-net -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=joomla mariadb:11
docker run -d --name im-web --network imp-net -p 127.0.0.1:18090:80 -v $W/webroot:/var/www/html impact-php:8.3
zcat ja-impact-j6-database-1.0.6.sql.gz | docker exec -i im-db mariadb -uroot -proot joomla
# 4. the model and the crawl (the WordPress skill's ingest scripts, `npm install` in a copy of that skill first)
node scripts/ingest/joomla-dump.mjs --out $W/j6 --container im-db --web-container im-web --db joomla --prefix jd_ --user root --password root --site-url http://127.0.0.1:18090 --capture
node scripts/ingest/from-joomla.mjs $W/j6 --out $W/spec --site-url http://127.0.0.1:18090
SRC_WORK=$W ingest/rebuild-seed.sh          # $W holds spec/ j6/ webroot/
node ../../../vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/ingest/from-url.mjs http://127.0.0.1:18090/ --out source/snapshot --max-pages 90 --max-asset-mb 8
```

A fresh crawl never matches an earlier one byte for byte (form tokens): only pictures, fonts, scripts and stylesheets must match.
