#!/usr/bin/env python3
"""Add or remove one hostname→port rule in cloudflared's ingress list.

Text-based rather than a YAML round-trip: the file carries the comments that explain why the
catch-all is last and why one tunnel serves the whole host, and every YAML library available
here would drop them. The shape being edited is two lines, so the trade is worth it.

Two things this exists to get right, both of which a shell one-liner gets wrong:

* **Idempotence.** Provisioning is re-runnable by design. Appending blindly leaves two rules
  for one hostname, and cloudflared honours the first, so a re-provision onto a new port would
  keep serving the old one.
* **The catch-all stays last.** `service: http_status:404` matches everything, so a rule added
  after it is dead — the site answers 404 from the internet while looking perfectly healthy on
  the host. New rules go strictly before it.

Callers must hold a lock around this (provision.sh uses flock): the file is one mutable thing
shared by every site on the host, and two concurrent provisions would otherwise lose a rule.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
from pathlib import Path

CATCH_ALL = re.compile(r"^\s*-\s*service:\s*http_status:404\s*$", re.M)


def strip_rule(config: str, hostname: str) -> str:
    """Removes the rule for `hostname`, if the file has one. Leaves everything else alone."""
    # A rule's continuation lines are indented AND are neither a new list item nor a comment.
    # Matching "any indented line" instead swallows the rest of the file: the next rule starts
    # `  - hostname:` and the catch-all's own comment starts `  #`, both of which are indented.
    pattern = re.compile(
        # The lookahead sits at the START of the line, before the indentation is consumed. Put
        # after `[ \t]+` it can backtrack to a single space and then look at the second space
        # instead of at the `-`, which quietly matches the next rule and eats the rest of the
        # file — a config with one site left in it and no catch-all.
        rf"^[ \t]*-[ \t]*hostname:[ \t]*{re.escape(hostname)}[ \t]*\n(?:^(?![ \t]*[-#])[ \t]+[^\n]*\n)*",
        re.M,
    )
    return pattern.sub("", config)


def upsert(config: str, hostname: str, port: int) -> str:
    """Sets `hostname` to `port`, replacing any rule the file already had for it."""
    config = strip_rule(config, hostname)
    match = CATCH_ALL.search(config)
    if not match:
        raise SystemExit("ingress has no `service: http_status:404` catch-all — refusing to guess where a rule goes")

    # Anchor on the catch-all itself, not on the comment above it: a comment is prose someone
    # may reword, while the catch-all is the thing that must stay last.
    rule = f"  - hostname: {hostname}\n    service: http://127.0.0.1:{port}\n"
    line_start = config.rfind("\n", 0, match.start()) + 1
    # Keep any comment block that introduces the catch-all attached to it.
    while True:
        prev_end = line_start - 1
        if prev_end <= 0:
            break
        prev_start = config.rfind("\n", 0, prev_end) + 1
        if not config[prev_start:prev_end].lstrip().startswith("#"):
            break
        line_start = prev_start
    return config[:line_start] + rule + config[line_start:]


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--config", type=Path, default=Path("/etc/cloudflared/config.yml"))
    p.add_argument("--hostname", required=True)
    p.add_argument("--port", type=int, help="omit to remove the rule instead")
    p.add_argument("--remove", action="store_true")
    args = p.parse_args(argv)

    config = args.config.read_text(encoding="utf-8")
    if args.remove:
        updated = strip_rule(config, args.hostname)
    else:
        if args.port is None:
            raise SystemExit("--port is required unless --remove")
        updated = upsert(config, args.hostname, args.port)

    if updated == config:
        print(f"ingress unchanged: {args.hostname}")
        return 0

    # Written whole, then renamed: cloudflared may read this file at any moment, and a
    # half-written ingress list is a host that serves nothing.
    directory = args.config.parent
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=directory, delete=False) as tmp:
        tmp.write(updated)
        temp_path = Path(tmp.name)
    os.replace(temp_path, args.config)
    print(f"ingress updated: {args.hostname}" + ("" if args.remove else f" → 127.0.0.1:{args.port}"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
