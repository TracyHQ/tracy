#!/usr/bin/env python3
"""Which Joomla can follow which, and on what PHP.

Two chains, and the second one is the one people forget. Joomla's update server enforces the
first with signed metadata; PHP enforces the second by refusing to run.

The PHP support sets below are read off the images the Joomla project publishes for each
version (hub.docker.com/library/joomla, read 2026-08-19), which is the closest thing to a
statement of what the project will stand behind. They are not the documented minimums: Joomla
4.4's minimum is PHP 7.2.5, but no 4.4 image is built below 8.0, and running a version on a
PHP nobody builds for is a support conversation nobody wants.

The rule that falls out is the useful part. `core:update` runs on the code that is there and
produces the code that comes next, in one container, on one PHP, so the hop has to run on a
PHP BOTH majors support. Too low and the updater refuses, because it checks the target's
php_minimum before it starts. Too high and the site that is still running breaks before the
update begins.

Measured against the real chain, every hop overlaps in exactly one PHP:

    3.10 → 4.4    {7.3,7.4,8.0} ∩ {8.0,8.1,8.2}   = 8.0
    4.4  → 5.4    {8.0,8.1,8.2} ∩ {8.2,8.3}       = 8.2
    5.4  → 6.1    {8.2,8.3}     ∩ {8.3,8.4}       = 8.3
"""
from __future__ import annotations

#: PHP the Joomla project builds images for, per release line.
PHP_SUPPORT: dict[str, tuple[str, ...]] = {
    "3.10": ("7.3", "7.4", "8.0"),
    "4.4": ("8.0", "8.1", "8.2"),
    "5.4": ("8.2", "8.3"),
    "6.1": ("8.3", "8.4"),
}

#: The launch point of each major: the only release the update server will let you leave from.
#: From the signed TUF metadata at update.joomla.org/cms/targets.json, where a 6.x package
#: matches `(6\.[0-4])|^(5\.4)` and a 5.x package matches `(5\.[0-4])|^(4\.4)`.
CHAIN: tuple[str, ...] = ("3.10", "4.4", "5.4", "6.1")


def _line(version: str) -> str:
    """`5.4.8` becomes `5.4`. A version this table has never heard of raises."""
    parts = str(version or "").split(".")
    if len(parts) < 2 or not all(p.isdigit() for p in parts[:2]):
        raise ValueError(f"unreadable Joomla version: {version!r}")
    line = f"{parts[0]}.{parts[1]}"
    if line in PHP_SUPPORT:
        return line
    # A release inside a known major that is not its launch point: 5.2 is a Joomla 5, and the
    # hop it can make is the one to its own launch point.
    major = parts[0]
    for known in CHAIN:
        if known.split(".")[0] == major:
            return known
    raise ValueError(f"no support data for Joomla {version}")


def php_for_hop(current: str, target: str) -> str:
    """The one PHP both ends of this hop run on, or ValueError.

    Refused rather than guessed, because the caller's next move is to take a snapshot and
    start an upgrade, and finding out then is expensive.
    """
    here, there = _line(current), _line(target)
    shared = [p for p in PHP_SUPPORT[here] if p in PHP_SUPPORT[there]]
    if not shared:
        raise ValueError(
            f"Joomla {here} and {there} share no PHP version, so this is not one hop")
    if here != there and CHAIN.index(there) - CHAIN.index(here) != 1:
        raise ValueError(
            f"Joomla {here} to {there} is not a hop the update server allows; "
            f"the chain is {' -> '.join(CHAIN)}")
    return max(shared, key=lambda p: [int(x) for x in p.split(".")])


def image_for_php(php: str) -> str:
    """The fleet supplies PHP through the image tag. The Joomla code inside the image is
    never used: provision.sh overrides the entrypoint and the webroot comes from the archive,
    so only the PHP half of the tag means anything here."""
    # Every tag this produces was confirmed present on 2026-08-19: joomla:php8.0-apache
    # through joomla:php8.4-apache all resolve. The bare phpX.Y tags are used rather than the
    # version-pinned ones because the Joomla code in the image is never run.
    known = {p for versions in PHP_SUPPORT.values() for p in versions}
    if php not in known:
        raise ValueError(f"no Joomla image is built for PHP {php}")
    return f"joomla:php{php}-apache"


def chain_to_six(current: str) -> list[str]:
    """Every release line this site must pass through, in order, to reach Joomla 6.

    A site already at a launch point starts from the next one. A site behind its own launch
    point, 5.2 or 3.9, has that launch point as its first stop, which is a point update inside
    one major rather than a major upgrade, but it is a hop with a snapshot all the same.
    """
    here = _line(current)
    parts = str(current).split(".")
    at_launch = f"{parts[0]}.{parts[1]}" == here
    start = CHAIN.index(here) + (1 if at_launch else 0)
    return list(CHAIN[start:])


def _main(argv: list[str]) -> int:
    """The shell's half. set-php.sh asks it two things and substitutes the answer into a
    command, so a refusal leaves stdout empty rather than half-answered."""
    import argparse
    import sys

    ap = argparse.ArgumentParser(description="Which PHP and image a Joomla hop runs on.")
    ap.add_argument("--from", dest="current", default="")
    ap.add_argument("--to", dest="target", default="")
    ap.add_argument("--image", action="store_true", help="print the image, not the PHP")
    ap.add_argument("--chain", default="", metavar="VERSION",
                    help="print every release line from here to Joomla 6, one per line")
    args = ap.parse_args(argv)

    try:
        if args.chain:
            for line in chain_to_six(args.chain):
                print(line)
            return 0
        if not args.current or not args.target:
            raise ValueError("need --from and --to")
        php = php_for_hop(args.current, args.target)
        print(image_for_php(php) if args.image else php)
        return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
