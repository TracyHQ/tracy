# Rebuilding the source stand and `source/snapshot` (JA Essence j6 1.0.10)

Inputs (outside the repo): `ja-essence-j6-webroot-1.0.10.tar.gz` (sha256 `d6285e99ac0710a874f03b6de37cc41a8ba66a255481ec4181ada25ce6df8a46`) and
`ja-essence-j6-database-1.0.10.sql.gz` (sha256 `890fc10c4ad8ce068e525c2c390f0f8efbf142e1e7ca6ed25e1cb27876448c26`), from `tracy_setting.json` of the release.
`$W` is any new folder outside the repository.

```bash
mkdir -p $W/webroot $W/build && tar xzf ja-essence-j6-webroot-1.0.10.tar.gz -C $W/webroot
# $W/build/Dockerfile: FROM php:8.3-apache + libzip/png/jpeg/freetype/icu/webp dev packages;
#   docker-php-ext-configure gd --with-jpeg --with-freetype --with-webp; docker-php-ext-install mysqli pdo_mysql gd zip intl; a2enmod rewrite
docker build -t essence-snap-php:8.3 $W/build && docker network create essence-net
docker run -d --name essence-db --network essence-net -e MARIADB_DATABASE=joomla -e MARIADB_USER=joomla -e MARIADB_PASSWORD=joomla -e MARIADB_ROOT_PASSWORD=root mariadb:11
# configuration.php: host essence-db, user/password/db joomla; sef_rewrite true; cp htaccess.txt .htaccess; mkdir tmp logs administrator/logs; chmod -R a+rwX
zcat ja-essence-j6-database-1.0.10.sql.gz | docker exec -i essence-db mariadb -ujoomla -pjoomla joomla     # prefix jd_
docker run -d --name essence-web --network essence-net -p 127.0.0.1:18081:80 -v $W/webroot:/var/www/html essence-snap-php:8.3
docker exec essence-web sh -c 'sed -i "s/AllowOverride None/AllowOverride All/" /etc/apache2/apache2.conf; apachectl graceful'
node <skill>/scripts/ingest/from-url.mjs http://127.0.0.1:18081/ --out $W/snapshot --max-pages 160     # 148 pages, 224 assets
(cd $W/snapshot && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)                       # compare with snapshot-SHA256SUMS
```

A fresh crawl differs byte for byte in pages (form tokens), not in pictures, fonts, scripts or stylesheets.
