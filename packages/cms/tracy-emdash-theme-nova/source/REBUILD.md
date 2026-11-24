# Rebuilding the source stand and the snapshot (JA Nova j6 1.0.12)

Inputs (outside the repo): `ja-nova-j6-webroot-1.0.12.tar.gz` (sha256 `cbaab83246a6555d189636dae6474a475d990540e6f14c7782ba550ddb7135cf`) and
`ja-nova-j6-database-1.0.12.sql.gz` (sha256 `38642a7c39b91a5828093ddc6a92504ea9d010b7c84b86b2c6a8dcb4f01f366c`), both checked against the release's
`tracy_setting.json`. `$W` is any new folder outside the repository. Same recipe as `tracy-emdash-theme-essence/source/REBUILD.md`.

```bash
mkdir -p $W/webroot $W/build && tar xzf ja-nova-j6-webroot-1.0.12.tar.gz -C $W/webroot
# $W/build/Dockerfile: FROM php:8.3-apache + libzip/png/jpeg/freetype/icu/webp dev packages;
#   docker-php-ext-configure gd --with-jpeg --with-freetype --with-webp; docker-php-ext-install mysqli pdo_mysql gd zip intl; a2enmod rewrite
docker build -t nova-snap-php:8.3 $W/build && docker network create nova-net
docker run -d --name nova-db --network nova-net -e MARIADB_DATABASE=joomla -e MARIADB_USER=joomla -e MARIADB_PASSWORD=joomla -e MARIADB_ROOT_PASSWORD=root mariadb:11
# configuration.php: host nova-db, user/password/db joomla; sef_rewrite true; cp htaccess.txt .htaccess; mkdir tmp logs administrator/logs; chmod -R a+rwX
zcat ja-nova-j6-database-1.0.12.sql.gz | docker exec -i nova-db mariadb -ujoomla -pjoomla joomla     # prefix jd_
docker run -d --name nova-web --network nova-net -p 127.0.0.1:18082:80 -v $W/webroot:/var/www/html nova-snap-php:8.3
docker exec nova-web sh -c 'sed -i "s/AllowOverride None/AllowOverride All/" /etc/apache2/apache2.conf; apachectl graceful'
# model: joomla-dump.mjs --container nova-db --web-container nova-web --prefix jd_ --user root --password root --capture, then from-joomla.mjs
node ingest/from-url.mjs http://127.0.0.1:18082/ --out $W/snapshot --max-pages 160     # 114 pages, 225 assets
(cd $W/snapshot && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)      # compare with snapshot-SHA256SUMS
```

A fresh crawl differs byte for byte in pages (form tokens), not in pictures, fonts, scripts or stylesheets.
