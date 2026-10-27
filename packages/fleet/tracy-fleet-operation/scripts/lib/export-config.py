#!/usr/bin/env python3
"""The site's configuration file as a downloaded backup carries it (plan todo-backup-export, S1b).

A backup point's webroot holds the CMS configuration file Tracy's stack runs with: its database
host, user, password and name are this host's, and mean nothing anywhere else. The package a
person downloads carries the file with exactly those four values replaced by a placeholder, under
the same names the importer rewrites (`provision/render_wp_config.py`, `render_configuration.py`),
so taking the package back in renders them again. Everything else stays byte for byte, line
endings included: the table prefix, charset, salts and `secret`, every setting the site's owner
made — the download is the owner's own site, and Owner-only (decision 4).

A file whose shape this does not know is refused with "unsupported config", never passed through:
a package that silently kept the host's password would leak it, one that silently dropped a line
would break the site it claims to hold.

Usage (the last stdout line is the answer, `{"ok": true, "changed": [...]}`):
    export-config.py <wordpress|joomla> <in> <out>
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

PLACEHOLDER = "tracy-placeholder"

# The importer's own rewrite, so what is written here is exactly what it can find again.
_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "render_wp_config", os.path.join(_HERE, "..", "provision", "render_wp_config.py")
)
_wp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_wp)

WORDPRESS_FIELDS = ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST")
JOOMLA_FIELDS = ("host", "user", "password", "db")


class Unsupported(ValueError):
    """The file does not have the shape this rewrite knows; nothing is written."""


def _wordpress(source: str) -> tuple[str, list[str]]:
    missing = []
    for name in WORDPRESS_FIELDS:
        source, found = _wp.replace_define(source, name, PLACEHOLDER)
        if not found:
            missing.append(name)
    if missing:
        raise Unsupported("wp-config.php does not define " + ", ".join(missing) + " directly")
    return source, list(WORDPRESS_FIELDS)


def _joomla(source: str) -> tuple[str, list[str]]:
    missing = []
    for name in JOOMLA_FIELDS:
        # One setting per line, `public $name = '<value>';` — what Joomla itself writes, and the
        # line `render_configuration.py` rewrites on the way back in.
        pattern = re.compile(rf"(^[ \t]*public[ \t]+\${name}[ \t]*=[ \t]*)'(?:[^'\\]|\\.)*'([ \t]*;)", re.M)
        source, count = pattern.subn(lambda m: f"{m.group(1)}'{PLACEHOLDER}'{m.group(2)}", source)
        if count != 1:
            missing.append(name)
    if missing:
        raise Unsupported("configuration.php has no single quoted $" + ", $".join(missing))
    return source, list(JOOMLA_FIELDS)


def rewrite(platform: str, source: str) -> tuple[str, list[str]]:
    """(text with Tracy's database credentials replaced, the names replaced). Raises Unsupported."""
    if platform == "wordpress":
        return _wordpress(source)
    if platform == "joomla":
        return _joomla(source)
    raise Unsupported(f"no configuration rewrite for platform {platform!r}")


def config_path(platform: str) -> str:
    """The configuration file's path inside the webroot, for a platform `rewrite` knows."""
    if platform == "wordpress":
        return "wp-config.php"
    if platform == "joomla":
        return "configuration.php"
    raise Unsupported(f"no configuration rewrite for platform {platform!r}")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: export-config.py <wordpress|joomla> <in> <out>", file=sys.stderr)
        return 2
    platform, src, out = argv
    # newline="" on both ends: a CRLF file comes back out CRLF.
    with open(src, encoding="utf-8", errors="surrogateescape", newline="") as handle:
        source = handle.read()
    try:
        text, changed = rewrite(platform, source)
    except Unsupported as error:
        print(f"unsupported config: {error}", file=sys.stderr)
        return 1
    with open(out, "w", encoding="utf-8", errors="surrogateescape", newline="") as handle:
        handle.write(text)
    print(json.dumps({"ok": True, "changed": changed}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
