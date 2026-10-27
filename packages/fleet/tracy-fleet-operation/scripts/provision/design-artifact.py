#!/usr/bin/env python3
"""Fetch the template package a resolved design installs, pinned exactly like a quickstart part.

Separate from `quickstart.py` only because it is fed by a resolved plan rather than a catalog id —
the fetching, the redirect rule, the size ceiling and the checksum are that module's, imported
rather than rewritten. A second copy of a download that carries a credential is a second place for
the credential to leak.

The plan file is written by `design-plan.py` from the registry this host ships. Nothing a request
carries reaches here: a caller names a design, never a URL.
"""
import argparse
import json
import pathlib
import sys
import urllib.error

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from quickstart import download  # noqa: E402  (path set above so this resolves beside us)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    plan = json.loads(pathlib.Path(args.plan).read_text())
    artifact = plan.get('artifact')
    if not artifact:
        raise ValueError('this design installs no template package')
    if artifact.get('kind') != 'joomla-extension':
        raise ValueError('a design template must be a Joomla extension package')
    # `part` is what tells `download` whether to walk the archive as a tar; an extension is a zip
    # Joomla's own installer unpacks, so it is checked by size and digest only.
    download(artifact, args.out, 'extension')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        raise SystemExit(
            f'design template download failed (HTTP {error.code}); verify the release credential and repository access'
        ) from None
    except ValueError as error:
        raise SystemExit(str(error)) from None
