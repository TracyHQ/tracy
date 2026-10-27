#!/usr/bin/env python3
"""Rewrite a site's configuration.php for the environment it is being provisioned into.

Substitutes by **setting name**, so the input can be either the site's own configuration.php
(which travels inside the webroot archive) or a placeholder template. That is deliberate: it
removes a second artifact that would have to be produced, shipped and kept in step with the
first, and there is nothing in a template that the real file does not already carry.

Why rewrite rather than write a fresh default: the file has ~104 settings and only ~13 are
environment or secret. The other ~91 are the customer's own — timezone, SEF, caching, site
name. A site provisioned from defaults comes up on the wrong timezone with SEF off, which
changes every URL it serves (migration/lessons.md, trap 14).

Two values are generated rather than carried across, and both matter:

  * ``secret`` signs sessions and tokens, and the source site's travelled inside a backup
    archive. Reusing it carries the old host's exposure onto the new one.
  * the mail settings point at the customer's real mail account. Before go-live outbound mail
    must not reach it — one of the three mandatory safety nets in ADR 0031 §5. Left as
    configured, a staging copy emails real members.

One more is turned off on an IMPORTED copy (``--online``): ``offline``. A site the customer is
rebuilding is often offline ("we'll be back soon") — the import reads it through the administrator
door for exactly that reason — and the copy kept it, so the customer's preview and the agent's own
page pictures showed the offline page (beta week 16–23/10/2026: every turn on one site said it could
not check the screen). Being in ``BARE`` also makes it an environment setting for Sync from live
(``live_sync.py``), so a sync never takes the copy offline again.
"""

from __future__ import annotations

import argparse
import re
import secrets
import sys
from pathlib import Path

# Settings replaced. Everything not named here is the customer's and is left untouched.
QUOTED = {"host", "user", "password", "db", "secret", "log_path", "tmp_path", "live_site", "mailer", "smtpuser", "smtppass", "smtphost"}
BARE = {"force_ssl", "behind_loadbalancer", "offline"}


def _literal(name: str, value: str) -> str:
    return f"'{value}'" if name in QUOTED else value


def substitute(source: str, values: dict[str, str]) -> tuple[str, list[str]]:
    """Set each named setting, leaving every other line of the file alone.

    A setting already present is replaced in place. One that is absent is **appended** rather
    than treated as an error: which settings a configuration.php carries varies by Joomla
    generation and by how the site was set up — `behind_loadbalancer` is simply missing from
    plenty of real files — and Joomla reads whatever properties the class happens to define.

    The danger this guards against is a stale value surviving, not an absent one. Appending
    cannot leave the old host's password behind, because there was no line holding it.

    Returns the result and any setting that could be neither replaced nor appended, which
    means the file did not parse as a JConfig class at all.
    """
    out = source
    unset = []

    for name, value in values.items():
        # Joomla writes one setting per line as `public $name = <value>;`. Anchoring on the
        # name rather than the old value is what lets this run on a real config and a
        # placeholder template alike.
        pattern = re.compile(rf"(^\s*public\s+\${re.escape(name)}\s*=\s*).*?;\s*$", re.M)
        out, count = pattern.subn(lambda m: f"{m.group(1)}{_literal(name, value)};", out)
        if count:
            continue

        # Append just inside the class's closing brace.
        appended, count = re.subn(
            r"(\n)(\}\s*)$",
            lambda m: f"\n\tpublic ${name} = {_literal(name, value)};{m.group(1)}{m.group(2)}",
            out,
            count=1,
        )
        if count:
            out = appended
        else:
            unset.append(name)

    return out, unset


def build_values(args: argparse.Namespace) -> dict[str, str]:
    over_tls = args.live_site.startswith("https://")
    return {
        "host": args.db_host,
        "user": args.db_user,
        "password": args.db_password,
        "db": args.db_name,
        # Fresh every provision. Never the source site's.
        "secret": secrets.token_urlsafe(24),
        "log_path": f"{args.webroot}/administrator/logs",
        "tmp_path": f"{args.webroot}/tmp",
        "live_site": args.live_site,
        # Left at the source site's 2 on a plain-http host, Joomla 301s forever and serves
        # nothing (migration/lessons.md, trap 16).
        "force_ssl": "2" if over_tls else "0",
        # The fleet terminates TLS at cloudflared and forwards plain HTTP to the container.
        # Joomla decides "was this request HTTPS?" from $_SERVER, and with force_ssl=2 an
        # origin that only ever sees http redirects to https forever — the same loop, arrived
        # at from the other side. This tells Joomla to believe X-Forwarded-Proto instead.
        "behind_loadbalancer": "1" if over_tls else "0",
        # Neutralised, not carried over: see the module docstring.
        "mailer": "mail" if args.allow_mail else "none",
        "smtpuser": "",
        "smtppass": "",
        "smtphost": "localhost",
        # The copy is for looking at: online, whatever the source said (module docstring).
        **({"offline": "0"} if getattr(args, "online", False) else {}),
    }


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--source", required=True, type=Path, help="the site's configuration.php")
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--db-host", required=True)
    p.add_argument("--db-user", required=True)
    p.add_argument("--db-password", required=True)
    p.add_argument("--db-name", required=True)
    p.add_argument("--webroot", default="/var/www/html")
    p.add_argument("--live-site", required=True, help="e.g. https://example-com.tracy.ai")
    p.add_argument(
        "--allow-mail",
        action="store_true",
        help="Let the site send mail. Off by default: a pre-go-live copy carries the real "
        "member list, and mail from it reaches real people (ADR 0031 §5).",
    )
    p.add_argument(
        "--online",
        action="store_true",
        help="Set offline = 0: an imported copy is looked at, whatever its source site said.",
    )
    args = p.parse_args(argv)

    rendered, unset = substitute(args.source.read_text(encoding="utf-8"), build_values(args))

    # Refuse rather than half-configure: reaching here means the file is not a JConfig class,
    # so nothing could be set — a site with the old host's database password still in place.
    if unset:
        print(f"could not set: {', '.join(sorted(unset))} — is this a configuration.php?", file=sys.stderr)
        return 1

    left = sorted(set(re.findall(r"__TRACY_[A-Z_]+__", rendered)))
    if left:
        print(f"placeholders left unreplaced: {', '.join(left)}", file=sys.stderr)
        return 1

    args.out.write_text(rendered, encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
