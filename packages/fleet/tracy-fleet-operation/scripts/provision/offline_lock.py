#!/usr/bin/env python3
"""The rebuilding lock of a brief build, written at the source: a Joomla configuration.php that is
offline before the web server first serves it (spec TracyHQ/tracy#189, criterion 12.1).

Tracy takes the lock through the Cowork plugin once the site is up and paired
(`apps/tracy-web/src/sites/site-lock.js`). Between Joomla's first answer after the restore and that
pairing, a visitor was served the raw template demo for tens of seconds. So a site provisioned for a
brief build is restored already offline: the same three settings the plugin's `site.identity` sets
(`offline`, `offline_message`, `display_offline_message`), plus the lock's preview key as the
plugin stores it (`tracy_offline_preview_key` = `<SHA-256 of the key>:<unix time>`), so Tracy's
readers still see the real site through `X-Tracy-Preview-Key` (claude-cowork `lib/SiteOffline.php`).
The end of a full build takes it off through the plugin, as before; a failed build keeps it.

The key and the message arrive in the environment (`TRACY_SITE_LOCK_PREVIEW_KEY`,
`TRACY_SITE_LOCK_MESSAGE`), never in argv: a preview key opens the locked site for six hours.

Two uses:
  * `lock_values()` — imported by render_configuration.py, which writes the restored file;
  * `offline_lock.py --config <file> lock|release` — the installer shape, whose configuration.php is
    written by Joomla's CLI after the stack is up, and the release of a lock the installed plugin
    cannot serve through (no preview-key bypass, or Joomla 3).
"""

from __future__ import annotations

import argparse
import hashlib
import html
import os
import re
import sys
import time
from pathlib import Path

KEY_ENV = "TRACY_SITE_LOCK_PREVIEW_KEY"
MESSAGE_ENV = "TRACY_SITE_LOCK_MESSAGE"
# The plugin's own shape for a preview key (SiteIdentity::PREVIEW_KEY_PATTERN).
KEY_SHAPE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
# The plugin's limit for the offline message (SiteIdentity::MAX_CHARACTERS).
MAX_MESSAGE = 1000

# Settings this module writes, by how configuration.php holds them.
QUOTED = {"offline_message", "tracy_offline_preview_key"}
BARE = {"offline", "display_offline_message"}


def stored_message(message: str) -> str:
    """The message as Joomla's offline page prints it raw: each line HTML-escaped, joined by <br>,
    then made safe inside a PHP single-quoted string (the plugin's SiteIdentity::cleanMessage)."""
    lines = [html.escape(line.strip(), quote=True) for line in message.strip().splitlines()]
    joined = "<br>".join(line for line in lines if line)
    return joined.replace("\\", "\\\\").replace("'", "\\'")


def lock_values(key: str, message: str, now: int | None = None) -> dict[str, str]:
    """The settings that put a restored site on its rebuilding page, readable with `key`."""
    if not KEY_SHAPE.match(key):
        raise ValueError("the preview key must be 32 to 128 characters of A-Z, a-z, 0-9, _ and -")
    message = message.strip()
    if not message or len(message) > MAX_MESSAGE:
        raise ValueError(f"the offline message must be 1 to {MAX_MESSAGE} characters")
    at = int(time.time() if now is None else now)
    return {
        "offline": "1",
        "offline_message": stored_message(message),
        # 1: the offline page shows the custom message (the plugin's lockFields).
        "display_offline_message": "1",
        "tracy_offline_preview_key": f"{hashlib.sha256(key.encode()).hexdigest()}:{at}",
    }


def release_values() -> dict[str, str]:
    """Online again, and no preview key left to open a later lock."""
    return {"offline": "0", "tracy_offline_preview_key": ""}


def lock_from_env(env: dict[str, str] | None = None) -> dict[str, str] | None:
    """The lock settings when this provision was asked for a locked site, else None."""
    env = os.environ if env is None else env
    key = env.get(KEY_ENV, "")
    if not key:
        return None
    return lock_values(key, env.get(MESSAGE_ENV, ""))


def literal(name: str, value: str) -> str:
    return value if name in BARE else f"'{value}'"


def main(argv: list[str]) -> int:
    # Imported here so render_configuration.py can import this module without a cycle.
    from render_configuration import substitute

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--config", required=True, type=Path, help="the site's configuration.php")
    p.add_argument("operation", choices=["lock", "release"])
    args = p.parse_args(argv)

    try:
        values = lock_from_env() if args.operation == "lock" else release_values()
    except ValueError as error:
        print(f"site lock refused: {error}", file=sys.stderr)
        return 1
    if values is None:
        print(f"site lock: no {KEY_ENV} in the environment, nothing written", file=sys.stderr)
        return 1
    rendered, unset = substitute(args.config.read_text(encoding="utf-8"), values)
    if unset:
        print(f"could not set: {', '.join(sorted(unset))} — is this a configuration.php?", file=sys.stderr)
        return 1
    args.config.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main(sys.argv[1:]))
