#!/usr/bin/env python3
"""What "verified" is allowed to mean after a hop.

The upgrade chain reads this to decide whether to take the next hop. A verify that answers
"fine" when it could not look carries a broken site forward into a state that no single
restore puts back, so there is one rule here and everything else follows from it:

    a check that did not run is a failure, exactly like a check that failed.

They are told apart in the report, because a failed read is our bug and a wrong version is the
site's, and the person reading this at two in the morning needs to know which.
"""
from __future__ import annotations

import json

#: All four, always. Named here rather than counted at runtime so that a check quietly
#: dropped from the shell shows up as missing instead of shrinking the requirement.
CHECKS = ("version", "home", "admin", "schema")

OK, FAIL, UNKNOWN = "ok", "fail", "unknown"

#: A check the running version cannot perform, told apart from both a pass and a failure.
#: Joomla 4.3 and earlier carry no `maintenance:database` CLI command, so the schema check
#: there is not "clean" and not "broken" — it did not run. It does not block: the doctrine
#: that "could not run is a failure" defends the chain against a broken read, but this is a
#: version that never had the command, and `core:update`'s own checkSchema() is the real gate
#: that stops a bad hop. Only `schema` is ever allowed to be `na`.
NA = "na"
NON_BLOCKING = (OK, NA)


def version_status(reading: str, expected: str) -> str:
    """`ok`, `fail`, or `unknown`.

    `expected` may be a release line (`6.1`) or a full version (`6.1.3`); a hop aims at a
    line, and which patch it lands on is the update server's business, not ours.
    """
    reading = (reading or "").strip()
    if not reading or reading == UNKNOWN:
        return UNKNOWN
    expected = (expected or "").strip()
    if not expected:
        return UNKNOWN
    return OK if reading == expected or reading.startswith(expected + ".") else FAIL


def decide(checks: dict, detail: dict | None = None) -> dict:
    """The verdict, and every check standing in the way of it.

    Every name in CHECKS must be present and non-blocking (`ok`, or `na` for a check the
    version cannot run). A missing key is not a pass: a check that
    never ran leaves no key at all, and treating absence as success is the same bug as
    treating `unknown` as success.
    """
    blocking = [name for name in CHECKS if checks.get(name) not in NON_BLOCKING]
    return {
        "passed": not blocking,
        "checks": {name: checks.get(name, UNKNOWN) for name in CHECKS},
        "blocking": blocking,
        "detail": dict(detail or {}),
    }


def dump(result: dict) -> str:
    return json.dumps(result, indent=2, sort_keys=True) + "\n"


def _main(argv: list[str]) -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(description="Assemble a post-hop verdict.")
    for name in CHECKS:
        ap.add_argument(f"--{name}", default=UNKNOWN)
        ap.add_argument(f"--{name}-detail", default="")
    ap.add_argument("--reading", default="", help="the version actually read")
    ap.add_argument("--expected", default="", help="the version the hop aimed at")
    args = ap.parse_args(argv)

    checks = {name: getattr(args, name) for name in CHECKS}
    if args.expected:
        checks["version"] = version_status(args.reading, args.expected)
    detail = {name: getattr(args, f"{name}_detail")
              for name in CHECKS if getattr(args, f"{name}_detail")}
    if args.reading:
        detail.setdefault("version", f"read {args.reading}, expected {args.expected}")

    result = decide(checks, detail)
    print(dump(result), end="")
    # Non-zero so a shell caller can branch on it without parsing anything.
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
