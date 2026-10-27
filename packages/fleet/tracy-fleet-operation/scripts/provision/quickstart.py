#!/usr/bin/env python3
"""Download and verify a pinned runtime archive, including private GitHub releases."""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from quickstart_jpa import convert


class ReleaseRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward the GitHub credential to the binary download host."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        if target.scheme != 'https' or target.hostname != 'release-assets.githubusercontent.com' or target.username or target.password:
            raise ValueError('unexpected quickstart download host')
        return urllib.request.Request(newurl)


def pinned(artifact, part):
    """Refuse an entry whose checksum is not in the catalog yet.

    A release that has not been published carries `sha256: null` and a `pending` note. Downloading
    it anyway would write whatever the URL answers into a customer's site, unverified — and the
    catalog check below would only fail AFTER the bytes were fetched, with a message about a
    mismatch rather than about the missing pin. Say what is actually wrong, before any network."""
    sha = artifact.get('sha256')
    size = artifact.get('bytes')
    if not isinstance(sha, str) or len(sha) != 64 or not isinstance(size, int) or isinstance(size, bool) or size < 1:
        why = artifact.get('pending') or 'sha256/bytes missing from quickstarts.json'
        raise ValueError(f'quickstart {part} is not pinned yet ({why}); refusing to download unverified bytes')


def local_file(url):
    """The path a `file:` address names, when it lies under TRACY_LOCAL_RELEASES_DIR; else refuse.

    A dev stand tries a quickstart pack nobody has published yet (tracy-web's `local-releases.js`),
    and tracy-web hands the host a `file:` address into that directory. It is the ONE directory such
    an address may name: without this check, any entry could make the host copy any file it can
    read into a customer's webroot. Symbolic links are resolved before the comparison, so a link
    inside the directory that points outside it is refused too."""
    split = urllib.parse.urlsplit(url)
    root = os.environ.get('TRACY_LOCAL_RELEASES_DIR') or ''
    if not os.path.isabs(root):
        raise ValueError('a file: quickstart is read only from TRACY_LOCAL_RELEASES_DIR, and this host names none')
    if split.netloc not in ('', 'localhost'):
        raise ValueError('a file: quickstart must name a file on this host')
    base = os.path.realpath(root)
    wanted = os.path.realpath(urllib.parse.unquote(split.path))
    if wanted == base or os.path.commonpath([wanted, base]) != base:
        raise ValueError(f'quickstart file {wanted} is outside TRACY_LOCAL_RELEASES_DIR; refusing to read it')
    return wanted


def cache_dir():
    """Where this host keeps the release files it fetched, by sha256 (TRACY_QUICKSTART_CACHE_DIR, else
    $TRACY_PRIVATE_ROOT/_quickstarts), or None when neither is set.

    A JA quickstart's webroot is tens to hundreds of MB from GitHub, fetched again for every site built from it: on a
    slow link (~36 KB/s, the local host 14/10/2026) one Joomla site stood 30-50 minutes at "fetching webroot". A file is
    kept only once its size and sha256 match the catalogue, read back only when they still do, and the oldest go past
    TRACY_QUICKSTART_CACHE_BYTES (6 GB by default)."""
    d = os.environ.get('TRACY_QUICKSTART_CACHE_DIR') or (
        os.path.join(os.environ['TRACY_PRIVATE_ROOT'], '_quickstarts') if os.environ.get('TRACY_PRIVATE_ROOT') else ''
    )
    return pathlib.Path(d) if d else None


def cached(artifact):
    """The kept copy of an artifact when its size and sha256 still match the catalogue, else None."""
    d = cache_dir()
    if d is None:
        return None
    f = d / artifact['sha256']
    try:
        if f.stat().st_size != artifact['bytes']:
            return None
        sha = hashlib.sha256()
        with f.open('rb') as source:
            while chunk := source.read(1024 * 1024):
                sha.update(chunk)
        if sha.hexdigest() != artifact['sha256']:
            return None
        os.utime(f)
    except OSError:
        return None
    return f


def keep(artifact, file):
    """Keep a downloaded, verified artifact for the next site; a cache that cannot be written costs only that."""
    d = cache_dir()
    if d is None:
        return
    try:
        d.mkdir(parents=True, exist_ok=True)
        part = d / f'.{artifact["sha256"]}.{os.getpid()}'
        shutil.copyfile(file, part)
        os.chmod(part, 0o644)
        os.replace(part, d / artifact['sha256'])
        budget = int(os.environ.get('TRACY_QUICKSTART_CACHE_BYTES') or 6 * 1024**3)
        kept = sorted(
            (p for p in d.iterdir() if p.is_file() and not p.name.startswith('.')),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        total = 0
        for p in kept:
            total += p.stat().st_size
            if total > budget:
                p.unlink(missing_ok=True)
    except OSError:
        pass


class RateLimited(Exception):
    """GitHub refused the download because the release credential's quota is spent (primary or secondary)."""

    def __init__(self, code, until):
        self.code = code
        self.until = until
        when = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(until)) if until else 'an unknown time'
        super().__init__(
            f'quickstart download failed (HTTP {code}): GitHub rate limit for the release credential is spent '
            f'until {when}; press again after that'
        )


def rate_limit_wait(error, now):
    """Seconds GitHub asks to wait before the next try, or None when this refusal is not a rate limit.

    A 403/429 is a rate limit when GitHub says so in its headers: `Retry-After` (the secondary limit), or
    `x-ratelimit-remaining: 0` with `x-ratelimit-reset` (the primary, hourly one). A 403 without either is a
    permission problem, and waiting would not change it."""
    if error.code not in (403, 429):
        return None
    headers = error.headers or {}
    retry_after = headers.get('retry-after')
    if retry_after and retry_after.strip().isdigit():
        return int(retry_after.strip())
    if headers.get('x-ratelimit-remaining') == '0':
        reset = headers.get('x-ratelimit-reset')
        if reset and reset.strip().isdigit():
            return max(0, int(reset.strip()) - int(now))
        return -1
    return None


def open_release(url, headers):
    """Open one release download, waiting out a SHORT rate limit and naming a long one.

    The hourly quota of the release credential is shared by every Tracy deployment that uses it
    (25/10/2026: the dev stacks spent it and a demo update got 403 twice). A reset at most
    TRACY_QUICKSTART_RATE_WAIT_S away (120 s by default) is waited for, then asked again; a longer one
    fails at once with the time it lifts, because holding a provision for most of an hour helps nobody."""
    limit = int(os.environ.get('TRACY_QUICKSTART_RATE_WAIT_S') or 120)
    for attempt in range(3):
        request = urllib.request.Request(url, headers=headers)
        opener = urllib.request.build_opener(ReleaseRedirect())
        try:
            return opener.open(request, timeout=60)
        except urllib.error.HTTPError as error:
            now = time.time()
            wait = rate_limit_wait(error, now)
            if wait is None:
                raise
            if wait < 0 or wait > limit or attempt == 2:
                reset = (error.headers or {}).get('x-ratelimit-reset')
                until = int(reset) if reset and reset.strip().isdigit() else (int(now) + wait if wait >= 0 else None)
                raise RateLimited(error.code, until) from None
            print(f'GitHub rate limit (HTTP {error.code}): waiting {wait + 1} s before asking again', file=sys.stderr, flush=True)
            time.sleep(wait + 1)
    raise AssertionError('unreachable')


def prefetch(entry):
    """Fetch and verify every pinned part of an entry, so the provision after it reads them from the cache.

    The first step of a demo update (tracy-host `/_host/prefetch`): run while the old demo still serves, so
    a download that fails (403, checksum, a missing asset) costs nothing. A part with no pin yet is skipped
    here, exactly as a provision that needs it would refuse it before any network."""
    if cache_dir() is None:
        print('no quickstart cache on this host: the parts are verified, the provision will fetch them again', flush=True)
    fetched = 0
    for part, artifact in entry.items():
        if not isinstance(artifact, dict) or 'sha256' not in artifact or 'url' not in artifact:
            continue
        try:
            pinned(artifact, part)
        except ValueError as why:
            print(f'skipping {part}: {why}', flush=True)
            continue
        print(f'==> fetching {artifact.get("file") or part}', flush=True)
        with tempfile.TemporaryDirectory(prefix='tracy-prefetch-') as temp:
            download(artifact, pathlib.Path(temp) / part, part)
        fetched += 1
    if fetched == 0:
        raise ValueError('quickstart entry has no pinned part to fetch')
    print(f'fetched and verified {fetched} part(s)', flush=True)


def download(artifact, output, part):
    pinned(artifact, part)
    url = artifact['url']
    headers = {}
    local = None
    asset_id = artifact.get('githubAssetId')
    if asset_id is not None:
        if not isinstance(asset_id, int) or isinstance(asset_id, bool) or asset_id < 1:
            raise ValueError('invalid release asset id')
        token = os.environ.get('TRACY_RELEASES_GITHUB_TOKEN')
        if not token:
            raise ValueError('private quickstart requires TRACY_RELEASES_GITHUB_TOKEN on the provision host')
        url = f'https://api.github.com/repos/JoomlArt-Products/ja-products/releases/assets/{asset_id}'
        headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28'}
    elif urllib.parse.urlsplit(url).scheme == 'file':
        local = local_file(url)
    with tempfile.TemporaryDirectory(prefix='tracy-quickstart-') as temp:
        file = pathlib.Path(temp) / 'artifact'
        hit = cached(artifact) if local is None else None
        if hit is not None:
            shutil.copyfile(hit, file)
        else:
            if local is not None:
                # Opened directly, not through urllib: the path was checked above, and urllib's own
                # file handler would take the address as given.
                opened = open(local, 'rb')
            else:
                opened = open_release(url, headers)
            with opened as source, file.open('wb') as target:
                size = 0
                sha = hashlib.sha256()
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    if size > artifact['bytes']:
                        raise ValueError('quickstart size exceeds catalog')
                    sha.update(chunk)
                    target.write(chunk)
            if size != artifact['bytes'] or sha.hexdigest() != artifact['sha256']:
                raise ValueError('quickstart checksum mismatch')
            if local is None:
                keep(artifact, file)
        if part in ('webroot', 'state'):
            with tarfile.open(file, 'r:*') as archive:
                for member in archive.getmembers():
                    name = pathlib.PurePosixPath(member.name)
                    if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):
                        raise ValueError('unsafe quickstart member')
        if part == 'installer':
            # A classic Joomla quickstart package: the whole webroot plus Joomla's own installer.
            # It is unpacked straight into the customer's webroot, so its members are held to the
            # same rule as a webroot tar — and it is checked HERE for the one file the whole shape
            # rests on. `platform/joomla.sh` builds the site by running that file; a package without
            # it is a webroot nobody can install, and the refusal belongs before a customer's
            # provision has started rather than half way through it.
            with zipfile.ZipFile(file) as package:
                names = package.namelist()
                for name in names:
                    inside = pathlib.PurePosixPath(name)
                    if inside.is_absolute() or '..' in inside.parts:
                        raise ValueError('unsafe quickstart member')
                if 'installation/joomla.php' not in names:
                    raise ValueError(
                        'installer package carries no installation/joomla.php at its root — '
                        'that CLI installer is what builds this shape'
                    )
        shutil.copyfile(file, output)


class FieldAbsent(ValueError):
    """`--field` names a key the entry does not carry: exit 4, apart from every other refusal."""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', required=True)
    parser.add_argument(
        '--part', choices=['webroot', 'database', 'cowork', 'source', 'state', 'installer']
    )
    parser.add_argument('--out')
    # Two read-only modes for the shell, so provision.sh never lists quickstart ids itself:
    # `--platform` prints which CMS the entry restores (the gate compares it with --platform of the
    # provision), `--field <name>` prints one scalar of the entry (`contract`, `coworkMinVersion`).
    parser.add_argument('--platform', action='store_true', help='print the platform of --id and exit')
    parser.add_argument('--field', help='print one scalar field of --id (dotted path) and exit')
    parser.add_argument('--prefetch', action='store_true', help='fetch and verify every pinned part of --id into the cache, then exit')
    args = parser.parse_args()
    # TRACY_QUICKSTARTS_JSON exists for the tests: the refusal of an unpinned entry must stay
    # provable after every real entry is pinned, so the test hands in a catalog of its own.
    catalog_path = pathlib.Path(os.environ.get('TRACY_QUICKSTARTS_JSON') or pathlib.Path(__file__).with_name('quickstarts.json'))
    catalog = json.loads(catalog_path.read_text())
    if not isinstance(catalog, dict):
        raise ValueError('quickstart catalog is not an object')
    entry = catalog.get(args.id)
    if not entry:
        raise ValueError('unknown quickstart')
    if args.platform:
        platform = entry.get('platform')
        if platform not in ('joomla', 'wordpress', 'emdash'):
            raise ValueError('quickstart names no supported platform')
        print(platform)
        return
    if args.field:
        # Dotted, so a nested fact is readable without a second flag: `template.id` is what names
        # the image an EmDash quickstart builds, and it lives one level down.
        # ABSENT and INVALID are two answers, not one: a card that names no `contract` is unsealed,
        # while a `contract` of `""`, a number or a list is a broken catalogue entry, and a caller
        # that read both as "none" would provision a sealed card unbound. Absent alone exits 4, and
        # only from an object: an entry (or a dotted parent) that is a string, a list or a number is
        # a broken entry too, never one that "lacks" the key.
        value = entry
        for step in args.field.split('.'):
            if not isinstance(value, dict):
                raise ValueError(f'quickstart entry holding {args.field} is not an object')
            if step not in value:
                raise FieldAbsent(f'quickstart has no {args.field}')
            value = value[step]
        if not isinstance(value, str) or value == '':
            raise ValueError(f'quickstart {args.field} is not a non-empty string')
        print(value)
        return
    if args.prefetch:
        prefetch(entry)
        return
    if not args.part or not args.out:
        parser.error('--part and --out are required to download')
    if entry.get('format') == 'jpa-zip' and args.part in ('webroot', 'database'):
        with tempfile.TemporaryDirectory(prefix='tracy-base-') as temp:
            archive = pathlib.Path(temp) / 'quickstart.zip'
            download(entry['artifact'], archive, 'archive')
            convert(archive, args.out, args.part, entry['jpa'])
    elif 'bundle' in entry and args.part in ('webroot', 'database'):
        # The `bundle` shape of tracy_setting.json (ADR 0017 §4): one Akeeba zip, the JPA inside it
        # unnamed. Tracy Base and every `quickstart/ja-*` release ship this way. The zip must carry
        # exactly one .jpa — two would be two sites, and the caller never chose between them.
        with tempfile.TemporaryDirectory(prefix='tracy-bundle-') as temp:
            archive = pathlib.Path(temp) / 'quickstart.zip'
            download(entry['bundle'], archive, 'bundle')
            with zipfile.ZipFile(archive) as outer:
                jpas = [i.filename for i in outer.infolist() if i.filename.lower().endswith('.jpa')]
            if len(jpas) != 1:
                raise ValueError(f'bundle must carry exactly one .jpa, found {len(jpas)}')
            convert(archive, args.out, args.part, jpas[0])
    elif 'installer' in entry and args.part in ('webroot', 'database'):
        # Not "webroot is missing": this release is on the OTHER road. It is a classic Joomla
        # quickstart package — the site is built on the host by Joomla's CLI installer, not
        # restored from a capture — so there is no tar and no dump for anyone to fetch, and the
        # generic sentence would read like a broken release instead of the wrong road.
        raise ValueError(
            'quickstart is built by the Joomla CLI installer (--part installer): it carries no '
            'webroot tar and no database dump to restore'
        )
    elif args.part not in entry:
        raise ValueError(f'quickstart has no {args.part} to install — its setting declares {sorted(k for k in entry if isinstance(entry[k], dict) and "file" in entry[k])}')
    else:
        download(entry[args.part], args.out, args.part)


if __name__ == '__main__':
    try:
        main()
    except RateLimited as error:
        raise SystemExit(str(error)) from None
    except urllib.error.HTTPError as error:
        raise SystemExit(f'quickstart download failed (HTTP {error.code}); verify the release credential and repository access') from None
    except FieldAbsent as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(4) from None
    except ValueError as error:
        raise SystemExit(str(error)) from None
