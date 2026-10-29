#!/usr/bin/env python3
"""Build reproducible runtime assets from a disposable, scrubbed Joomla database and webroot."""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import re
import tarfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--webroot', required=True)
parser.add_argument('--database', required=True)
parser.add_argument('--out', required=True)
# The version was a literal for the first two releases, so the second cascade began by editing this
# file. It is an argument now; the default reproduces the published 1.1.0 byte for byte (measured
# 13/09/2026: repackaging the released archive unchanged gave the released sha256 and size).
parser.add_argument('--version', default='1.1.0')
parser.add_argument('--cowork-version', default='0.13.0')
args = parser.parse_args()
root = pathlib.Path(args.webroot)
out = pathlib.Path(args.out)
out.mkdir(parents=True, exist_ok=True)
version = args.version
name = 'tracy-apple-j6'
blocked = ['installation', 'cache', 'tmp', 'administrator/cache', 'administrator/logs',
           'administrator/components/com_akeebabackup/backup', 'media/t4/optimize',
           'language/fr-FR', 'administrator/language/fr-FR']
archive = out / f'{name}-webroot-{version}.tar.gz'
with archive.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as zipped, tarfile.open(fileobj=zipped, mode='w|') as tar:
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root).as_posix()
        if any(relative == item or relative.startswith(item + '/') for item in blocked):
            continue
        if file.name == '.DS_Store' or file.name.startswith('kickstart.') or file.suffix in ['.jpa', '.jps', '.j01', '.log']:
            continue
        if file.is_symlink():
            raise SystemExit(f'Unexpected symlink: {relative}')
        if not file.is_file():
            continue
        data = file.read_bytes()
        if relative == 'configuration.php':
            text = data.decode()
            for key in ['host', 'user', 'password', 'db', 'secret', 'smtpuser', 'smtppass', 'proxy_user', 'proxy_pass', 'cookie_domain', 'cookie_path', 'live_site']:
                text = re.sub(r'(public\s+\$' + key + r'\s*=\s*)[^;]*;', lambda m: m[1] + "'';", text)
            data = text.encode()
        info = tarfile.TarInfo(relative)
        info.size = len(data)
        info.mode = 0o644
        info.mtime = 0
        tar.addfile(info, io.BytesIO(data))
sql = pathlib.Path(args.database).read_bytes()
database = out / f'{name}-database-{version}.sql.gz'
with database.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as zipped:
    zipped.write(sql)
manifest = {'schemaVersion': 'tracy-runtime-quickstart/v1', 'release': 'tracy-apple/j6', 'version': version,
            'platform': 'joomla', 'platformVersion': '6.1.1', 'template': 'tracy', 'coworkVersion': args.cowork_version,
            'writeDoor': 'disabled-until-provision', 'parts': {}}
for kind, file in [('webroot', archive), ('database', database)]:
    manifest['parts'][kind] = {'file': file.name, 'bytes': file.stat().st_size,
        'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
        'url': f'https://github.com/JoomlArt-Products/joomlart-products/releases/download/tracy-apple%2Fj6/{file.name}'}
(out / f'runtime-manifest-{version}.json').write_text(json.dumps(manifest, indent=2) + '\n')
readme = f'''# Tracy Apple / Joomla 6 — runtime quickstart {version}

This package is for automated Tracy provision. It contains the complete T4 `tracy`
webroot and database, including Cowork {args.cowork_version}. It is not a Joomla extension ZIP.

Use TCH provision.sh --platform joomla --fresh --quickstart tracy-apple/j6 with the
normal site/label arguments. The pinned catalog verifies both parts; provision
rewrites the database settings, creates a site-specific token, and probes Cowork.
No source credentials or working shared Cowork token are shipped.

For interactive Akeeba restoration, the original quickstart 1.0.0 remains available
on this release; that older archive does not include the new Cowork batch workflow.

Existing sites must not be overwritten with this archive. Airbnb is installed as
its own template package and activated through the build recipe.
'''
(out / 'RUNTIME-README.md').write_text(readme)
with zipfile.ZipFile(out / f'{name}-runtime-quickstart-{version}.zip', 'w', zipfile.ZIP_STORED) as bundle:
    for file in [archive, database, out / f'runtime-manifest-{version}.json', out / 'RUNTIME-README.md']:
        info = zipfile.ZipInfo(file.name, date_time=(2026, 9, 11, 0, 0, 0))
        bundle.writestr(info, file.read_bytes())
print(json.dumps(manifest, indent=2))
