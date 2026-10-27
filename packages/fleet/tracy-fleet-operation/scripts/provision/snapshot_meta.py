#!/usr/bin/env python3
"""The record that makes a restore point restorable, and the rule for letting one go.

Split out of the shell for the same reason render_configuration.py is: these are the two
decisions where being quietly wrong costs the site. A tag that escapes its directory reaches
another site's artifacts; a retention rule off by one deletes the last thing that could have
put a half-finished upgrade back.

Used by snapshot.sh, restore.sh and list-snapshots.sh.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

#: A tag is both a directory under the site and a key segment in the object store, so it may
#: only be the characters that are unambiguous in both. Leading punctuation is out because
#: `-x` reads as a flag to half the tools that will ever be handed one.
_TAG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

#: Everything a restore needs to put the site back as it stood. `web_image` is here because an
#: upgrade changes it mid-chain, and files alone are not the site.
_REQUIRED = ("label", "tag", "platform", "web_image", "taken_at")


def safe_tag(tag: str) -> str:
    """The tag, or ValueError. Never a cleaned-up version of it.

    Sanitising silently would let `../other-site` become `other-site` and write a snapshot
    over a neighbour's. A caller that passed something wrong should hear about it.
    """
    if not isinstance(tag, str) or not _TAG.match(tag):
        raise ValueError(f"unusable snapshot tag: {tag!r}")
    return tag


def build_meta(*, label: str, tag: str, platform: str, web_image: str,
               cms_version: str, php_version: str, taken_at: str,
               db_bytes: int, webroot_bytes: int) -> dict:
    return {
        "label": label,
        "tag": safe_tag(tag),
        "platform": platform,
        "web_image": web_image,
        "cms_version": cms_version,
        "php_version": php_version,
        "taken_at": taken_at,
        "db_bytes": int(db_bytes),
        "webroot_bytes": int(webroot_bytes),
    }


def dump_meta(meta: dict) -> str:
    return json.dumps(meta, indent=2, sort_keys=True) + "\n"


def parse_meta(text: str) -> dict:
    """The record, or ValueError.

    A missing `web_image` is refused rather than defaulted: guessing it would restore a
    Joomla 5 webroot onto whatever PHP the upgrade left behind, which is a different site
    wearing the same files.
    """
    try:
        meta = json.loads(text)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"snapshot metadata is not readable JSON: {exc}") from exc
    if not isinstance(meta, dict):
        raise ValueError("snapshot metadata is not an object")
    missing = [k for k in _REQUIRED if not meta.get(k)]
    if missing:
        raise ValueError(f"snapshot metadata is missing {', '.join(missing)}")
    return meta


def _when(value) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def prune(snapshots: list[dict], *, keep_days: int = 30, now: str) -> list[str]:
    """Tags to delete: older than `keep_days`, except never the newest one.

    Retention is by age rather than by count because a count says nothing about whether the
    upgrade it belonged to is finished. But age alone deletes the last restore point on a
    site nobody has touched in months, and that site is the least able to recover, so the
    newest always stays whatever its date.

    A snapshot whose date cannot be read is kept. That is our bug, not the operator's, and
    the safe direction to be wrong in is a restore point we did not need.
    """
    cutoff = _when(now)
    if cutoff is None:
        raise ValueError(f"unreadable current time: {now!r}")
    cutoff -= timedelta(days=keep_days)

    dated = [(s, _when(s.get("taken_at"))) for s in snapshots]
    readable = [(s, d) for s, d in dated if d is not None]
    newest = max(readable, key=lambda pair: pair[1])[0] if readable else None

    return [s["tag"] for s, d in readable if d < cutoff and s is not newest]


_COLUMNS = (("tag", "TAG", 24), ("taken_at", "TAKEN", 22),
            ("cms_version", "CMS", 10), ("php_version", "PHP", 9),
            ("web_image", "IMAGE", 0))


def format_listing(records: list) -> str:
    """One row per restore point, newest first.

    A record missing fields still gets a row. Somebody reading this listing is usually
    reading it because something went wrong, and a half-written record is the most
    interesting thing on the page, not the one to hide.
    """
    if not records:
        return "no snapshots\n"
    rows = sorted(records, key=lambda r: str(r.get("taken_at") or ""), reverse=True)
    out = [" ".join(head.ljust(width) if width else head for _, head, width in _COLUMNS).rstrip()]
    for r in rows:
        cells = []
        for key, _, width in _COLUMNS:
            value = str(r.get(key) or "?")
            cells.append(value.ljust(width) if width else value)
        out.append(" ".join(cells).rstrip())
    return "\n".join(out) + "\n"


def _main(argv: list[str]) -> int:
    """The shell's half of this module.

    snapshot.sh and restore.sh are bash, and bash has no safe way to validate a tag or read a
    date. Rather than reimplement either badly in shell, they call this. Refusals leave stdout
    empty on purpose: the caller substitutes stdout straight into a path, and a half-answer
    there is worse than no answer.
    """
    import argparse
    import sys

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--safe-tag")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--prune", action="store_true")
    ap.add_argument("--format", action="store_true")
    ap.add_argument("--label", default="")
    ap.add_argument("--tag", default="")
    ap.add_argument("--platform", default="joomla")
    ap.add_argument("--web-image", default="")
    ap.add_argument("--cms-version", default="unknown")
    ap.add_argument("--php-version", default="unknown")
    ap.add_argument("--db-bytes", type=int, default=0)
    ap.add_argument("--webroot-bytes", type=int, default=0)
    ap.add_argument("--keep-days", type=int, default=30)
    ap.add_argument("--now", default="")
    args = ap.parse_args(argv)

    try:
        if args.safe_tag is not None:
            print(safe_tag(args.safe_tag))
            return 0

        if args.build:
            taken = args.now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            print(dump_meta(build_meta(
                label=args.label, tag=args.tag, platform=args.platform,
                web_image=args.web_image, cms_version=args.cms_version,
                php_version=args.php_version, taken_at=taken,
                db_bytes=args.db_bytes, webroot_bytes=args.webroot_bytes)), end="")
            return 0

        if args.format:
            raw = sys.stdin.read()
            records = json.loads(raw) if raw.strip() else []
            if not isinstance(records, list):
                raise ValueError("expected a list of snapshot records")
            print(format_listing(records), end="")
            return 0

        if args.prune:
            raw = sys.stdin.read()
            if not raw.strip():
                raise ValueError("no snapshot records on stdin")
            records = json.loads(raw)
            if not isinstance(records, list):
                raise ValueError("expected a list of snapshot records")
            now = args.now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            for tag in prune(records, keep_days=args.keep_days, now=now):
                print(tag)
            return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    ap.print_usage(sys.stderr)
    return 2


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
