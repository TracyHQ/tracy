#!/usr/bin/env python3
"""Give every prefixed site of this deployment its own DNS record at this host's tunnel.

Run on the STAGING host only, by a systemd timer (docs/references/may-staging.md):

    /opt/tracy-fleet/stack/sync-prefixed-site-dns.py [--env /etc/tracy/tracy-web.env] [--dry-run]
    /opt/tracy-fleet/stack/sync-prefixed-site-dns.py --plan < facts.json   # pure decision, no network

WHY IT EXISTS. Staging borrows the dev zone instead of owning one (decided 06/10/2026: reuse,
buy nothing). `*.tracy.site` already sends every unnamed host to the dev tunnel, so a staging site
`stg-<name>.tracy.site` is reachable only once a record of its own outranks that wildcard. Production
and dev never need this: their wildcard lands on their own tunnel, and every site there is served
through it by tracy-web.

WHY HERE AND NOT IN tracy-web. The record is the only thing staging needs that production does not
do. Keeping it outside the product means staging runs exactly the code production will run, which
is the reason staging exists. A record only points the name at the tunnel; the tunnel's catch-all
rule still hands the request to tracy-web, so the bar, the proxy and the badge behave as on
production. (`provision/ingress_api.py --dns` would also write an ingress rule to the site's
container, which skips tracy-web, so it is not used here.)

WHAT IT TOUCHES. Only CNAME records whose name starts with SITE_ADDRESS_PREFIX, ends with
`.SITE_DOMAIN`, and points at THIS tunnel. It refuses to run with an empty prefix, so on a host
whose sites carry no prefix it can never write or delete a record at all. Records for labels no
longer in the `site` table are removed; nothing else in the zone is read for deletion.

Reads CLOUDFLARE_TOKEN, CLOUDFLARE_TUNNEL, SITE_DOMAIN and SITE_ADDRESS_PREFIX from the env file.
The token needs Zone:DNS:Edit on the zone. Labels come from the deployment's own postgres
(`site.label`), read through `docker exec` on the compose project `tracy`.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def read_env(path: str) -> dict[str, str]:
    env: dict[str, str] = {}
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            env[key.strip()] = value
    return env


def plan(facts: dict) -> dict:
    """Which records to add and which to delete. Pure: the facts in, the decision out.

    facts = {prefix, zone, target, labels: [str], records: [{id, name, type, content}]}
    """
    prefix = facts["prefix"]
    zone = facts["zone"]
    target = facts["target"]
    if not prefix:
        raise ValueError("SITE_ADDRESS_PREFIX is empty: this host's sites are served by its wildcard")
    suffix = f".{zone}"
    wanted = sorted(
        {f"{label}{suffix}" for label in facts["labels"] if label.startswith(prefix) and LABEL.match(label)}
    )
    ours = [
        r
        for r in facts["records"]
        if r.get("type") == "CNAME"
        and r.get("content") == target
        and r.get("name", "").endswith(suffix)
        and r.get("name", "").startswith(prefix)
    ]
    # A prefixed name that already exists with any other content belongs to someone else: say so,
    # never overwrite it.
    taken = {
        r.get("name")
        for r in facts["records"]
        if r.get("name", "").startswith(prefix) and r not in ours
    }
    have = {r["name"] for r in ours}
    return {
        "add": [name for name in wanted if name not in have and name not in taken],
        "delete": sorted(
            ({"id": r["id"], "name": r["name"]} for r in ours if r["name"] not in wanted),
            key=lambda r: r["name"],
        ),
        "conflict": sorted(name for name in wanted if name in taken),
    }


def call(path: str, token: str, method: str = "GET", body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{API}/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"cloudflare {method} {path}: HTTP {error.code}") from None
    if not payload.get("success"):
        raise SystemExit(f"cloudflare {method} {path}: {payload.get('errors')}")
    return payload


def zone_records(zone_id: str, prefix: str, token: str) -> list[dict]:
    records: list[dict] = []
    page = 1
    while True:
        # Every type, not just CNAME: an A/AAAA/TXT record already holding a prefixed name is a
        # conflict to report, and a CNAME-only read would try to create beside it and fail.
        payload = call(f"zones/{zone_id}/dns_records?per_page=500&page={page}", token)
        records += [r for r in payload["result"] if r.get("name", "").startswith(prefix)]
        info = payload.get("result_info") or {}
        if page >= int(info.get("total_pages") or 1):
            return records
        page += 1


def site_labels(prefix: str) -> list[str]:
    container = subprocess.run(
        [
            "docker", "ps", "-q",
            "--filter", "label=com.docker.compose.project=tracy",
            "--filter", "label=com.docker.compose.service=postgres",
        ],
        check=True, capture_output=True, text=True,
    ).stdout.split()
    if len(container) != 1:
        raise SystemExit(f"expected one running tracy postgres container, found {len(container)}")
    out = subprocess.run(
        [
            "docker", "exec", container[0], "psql", "-U", "tracy", "-d", "tracy", "-At",
            "-c", "select label from site where label is not null",
        ],
        check=True, capture_output=True, text=True,
    ).stdout
    return [line.strip() for line in out.splitlines() if line.strip().startswith(prefix)]


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--env", default="/etc/tracy/tracy-web.env")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--plan", action="store_true", help="read facts as JSON on stdin, print the plan")
    args = p.parse_args(argv)

    if args.plan:
        try:
            print(json.dumps(plan(json.load(sys.stdin))))
        except ValueError as error:
            print(str(error), file=sys.stderr)
            return 2
        return 0

    env = read_env(args.env)
    prefix = env.get("SITE_ADDRESS_PREFIX", "")
    zone = env.get("SITE_DOMAIN", "")
    token = env.get("CLOUDFLARE_TOKEN", "")
    tunnel = env.get("CLOUDFLARE_TUNNEL", "")
    if not prefix:
        print("SITE_ADDRESS_PREFIX is empty: nothing to do on this host", file=sys.stderr)
        return 2
    if not (zone and token and tunnel):
        print("need SITE_DOMAIN, CLOUDFLARE_TOKEN and CLOUDFLARE_TUNNEL", file=sys.stderr)
        return 2

    zones = call(f"zones?name={zone}", token)["result"]
    if not zones:
        raise SystemExit(f"no zone named {zone} on this token")
    zone_id = zones[0]["id"]
    target = f"{tunnel}.cfargotunnel.com"
    decided = plan(
        {
            "prefix": prefix,
            "zone": zone,
            "target": target,
            "labels": site_labels(prefix),
            "records": zone_records(zone_id, prefix, token),
        }
    )
    for name in decided["conflict"]:
        print(f"!! {name}: a record with other content already exists; left alone", file=sys.stderr)
    for name in decided["add"]:
        print(f"+ {name}")
        if not args.dry_run:
            body = {"type": "CNAME", "name": name, "content": target, "proxied": True, "ttl": 1}
            call(f"zones/{zone_id}/dns_records", token, method="POST", body=body)
    for record in decided["delete"]:
        print(f"- {record['name']}")
        if not args.dry_run:
            call(f"zones/{zone_id}/dns_records/{record['id']}", token, method="DELETE")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
