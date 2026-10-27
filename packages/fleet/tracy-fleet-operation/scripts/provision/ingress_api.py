#!/usr/bin/env python3
"""Add or remove one hostname→port rule in a tunnel's ingress, through the Cloudflare API.

The same job as `ingress.py`, for a tunnel Cloudflare configures rather than a file this host
reads. Which one applies is decided by the tunnel's `config_src`, and the difference matters:

* A file is one mutable thing shared by every site on the host. Two provisions at once each read
  it, each add a rule, and the second write loses the first — a site left running and
  unreachable. It also has to be edited over ssh, and applying an edit means restarting the
  process that is serving every other site.
* The API has neither problem. There is no file to race over and no restart: the connector picks
  up a new configuration by itself.

What the API does NOT solve is two callers writing at once — the whole ingress list is sent in
one PUT, so of two that read the same list the second write drops the first one's rule, and both
are told "success". Two sites published, taken back to draft or torn down at the same moment did
exactly that. So every change here — whoever calls it: provision, teardown, go-live, a domain
removed — is made under ONE lock per tunnel (`tunnel_lock`), read and write together, and is read
back before it is reported: a change the tunnel's configuration does not show is a failure.

## A customer's own domain leads to tracy-web, and its rule has an owner on record (#1037)

A site's Tracy address has a rule of its own, `hostname → 127.0.0.1:<the site's port>`, and whose
rule it is can be read off the port. A customer's OWN domain used to get the same kind of rule —
which sent every request for it straight to the site, past tracy-web and everything tracy-web does
(it strips the identity headers the site trusts, it knows whether the name is still connected). It
now gets `hostname → <tracy-web>` (`--service`), the same service for every site, so the port says
nothing about whose rule it is any more. Each such rule therefore has a record beside the lock:
`<owners dir>/<hostname>` holds the site's label and the GENERATION of the operation that wrote the
rule (`--owner`, `--owner-gen`; one rising sequence for the whole deployment, minted by tracy-web).

* An add writes the rule, reads it back, then writes the record. A record of a higher generation
  means a newer operation already routed the name: the add leaves everything alone (exit 3).
* A removal takes the rule out only when the record names this site and no newer generation (or
  there is no record at all: an unclaimed rule to tracy-web opens nothing, tracy-web refuses a name
  no site holds). Otherwise the rule is somebody else's by now and is left standing (exit 3).
* `--takeover-port` names the site's own port: a rule from before #1037 (`→ 127.0.0.1:<port>`) is
  this site's by that port, and an add replaces it. That is how a site connected the old way moves.
* The record is read without following a link or waiting on a pipe and judged by what was opened; a
  record that cannot be read or is not one ends the script. It is written beside itself and moved
  into place, so a write cut short never leaves half a record.

Reads TRACY_CF_API_TOKEN, TRACY_CF_ACCOUNT_ID and TRACY_TUNNEL_ID from the environment, and
TRACY_INGRESS_LOCK (the lock file) and TRACY_INGRESS_OWNERS (the owners directory) when the default
places are not the ones to use.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import re
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.request

# The provider's API. `TRACY_CF_API_BASE` names another one: a test or a local stand points it at a
# stand-in it owns, so no run of theirs ever reaches a real account. Only an http(s) address is
# taken; anything else under that name ends the script rather than falling back to the real API.
API = os.environ.get("TRACY_CF_API_BASE") or "https://api.cloudflare.com/client/v4"
if not re.match(r"^https?://[^\s/]+(/[^\s]*)?$", API):
    raise SystemExit("TRACY_CF_API_BASE is not an http(s) address")
API = API.rstrip("/")
# Exit code when the hostname's rule points at another port: `--remove --only-port` leaves it, and
# an add without `--replace` does not take it over.
NOT_THIS_PORT = 3
# How long a caller waits for the tunnel's lock. A holder makes three API calls of at most 30 s.
LOCK_WAIT_SECONDS = 180


def lock_file(tunnel: str) -> str:
    """Where the lock of one tunnel's ingress lives.

    Under the private root when there is one: tracy-host runs these scripts in a container and an
    operator runs them on the machine itself, and that directory is the one both see (the network
    allocator's lock is there for the same reason). Otherwise `/var/lock`, otherwise the temp dir.
    """
    named = os.environ.get("TRACY_INGRESS_LOCK")
    if named:
        return named
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", tunnel)
    roots = [os.environ.get("TRACY_SRV"), os.environ.get("TRACY_PRIVATE_ROOT"), "/srv/tracy", "/var/lock"]
    for root in roots:
        if root and os.path.isdir(root) and os.access(root, os.W_OK):
            return os.path.join(root, f".tunnel-ingress-{safe}.lock")
    return os.path.join(tempfile.gettempdir(), f"tracy-tunnel-ingress-{safe}.lock")


@contextlib.contextmanager
def tunnel_lock(tunnel: str):
    """Hold the one lock every writer of this tunnel's ingress takes, or end the script.

    Fails CLOSED: a lock that cannot be opened or is not given in time is not worked around —
    writing unlocked is the lost rule this exists to stop.
    """
    path = lock_file(tunnel)
    try:
        # Never through a link, and never waiting on a pipe put under its name (O_NONBLOCK).
        fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    except OSError as e:
        raise SystemExit(f"cannot open the ingress lock {path}: {e.strerror}")
    try:
        # Judged by what was opened, not by its name: the lock is a plain file this script made.
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise SystemExit(f"cannot open the ingress lock {path}: not a regular file")
        deadline = time.monotonic() + LOCK_WAIT_SECONDS
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise SystemExit(f"another change to the tunnel's ingress has held {path} for {LOCK_WAIT_SECONDS} s")
                time.sleep(0.1)
        yield
    finally:
        os.close(fd)


HOSTNAME = re.compile(r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
LABEL = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
SERVICE = re.compile(r"^http://[A-Za-z0-9.-]+:[0-9]{1,5}$")
# The most of an owner record that is read: a label, a number, a service.
OWNER_MAX_BYTES = 4096


def owners_dir(tunnel: str) -> str:
    """Where the owner records of one tunnel's own-domain routes live: beside its lock."""
    named = os.environ.get("TRACY_INGRESS_OWNERS")
    if named:
        return named
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", tunnel)
    return os.path.join(os.path.dirname(lock_file(tunnel)), f".own-domain-routes-{safe}")


def owner_file(tunnel: str, hostname: str) -> str:
    # The hostname becomes a file name: only a host name is one (no slash, no `..`, no leading dot).
    if not HOSTNAME.match(hostname):
        raise SystemExit(f"{hostname!r} is not a host name an owner record can be kept for")
    return os.path.join(owners_dir(tunnel), hostname)


def read_owner(path: str) -> dict | None:
    """The owner on record for a route, None when there is none — or the script ends.

    🔒 A RECORD THAT CANNOT BE READ IS NOT "NO RECORD". No record means the rule is unclaimed and may
    be taken or removed; reading a damaged, linked or unreadable record that way would hand one
    site's route to another. Anything but a plain file holding `{label, gen, service}` ends the script.
    """
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    except OSError as e:
        raise SystemExit(f"cannot read the owner record {path}: {e.strerror}")
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise SystemExit(f"cannot read the owner record {path}: not a regular file")
        raw = os.read(fd, OWNER_MAX_BYTES + 1)
    except OSError as e:
        raise SystemExit(f"cannot read the owner record {path}: {e.strerror}")
    finally:
        os.close(fd)
    if len(raw) > OWNER_MAX_BYTES:
        raise SystemExit(f"the owner record {path} is not one: too large")
    try:
        record = json.loads(raw)
    except ValueError:
        raise SystemExit(f"the owner record {path} is not one: not JSON")
    if (
        not isinstance(record, dict)
        or not isinstance(record.get("label"), str)
        or not LABEL.match(record["label"])
        or isinstance(record.get("gen"), bool)
        or not isinstance(record.get("gen"), int)
        or record["gen"] < 0
    ):
        raise SystemExit(f"the owner record {path} is not one: need a label and a generation")
    # The service is what ties the record to a rule: one that is there and is not a service address
    # could match no rule, and a record that matches nothing would read as "nobody's".
    if not isinstance(record.get("service"), str) or not SERVICE.match(record["service"]):
        raise SystemExit(f"the owner record {path} is not one: need the service its rule leads to")
    # `previous`: where the rule led before a write that has not been read back yet (see `main`).
    previous = record.get("previous", [])
    if not isinstance(previous, list) or any(not isinstance(s, str) or not SERVICE.match(s) for s in previous):
        raise SystemExit(f"the owner record {path} is not one: its previous services are not service addresses")
    return record


def write_owner(path: str, record: dict) -> None:
    """Put the record in place whole: written beside itself, synced, then moved over."""
    folder = os.path.dirname(path)
    try:
        os.makedirs(folder, mode=0o700, exist_ok=True)
        # Judged by what is there, not by its name: a link under the directory's name is not it.
        if not stat.S_ISDIR(os.lstat(folder).st_mode):
            raise SystemExit(f"cannot keep owner records in {folder}: not a directory")
    except OSError as e:
        raise SystemExit(f"cannot keep owner records in {folder}: {e.strerror}")
    beside = f"{path}.{os.getpid()}.tmp"
    data = json.dumps(record, sort_keys=True).encode()
    try:
        fd = os.open(beside, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            written = 0
            while written < len(data):
                n = os.write(fd, data[written:])
                if n <= 0:
                    raise OSError(0, "short write")
                written += n
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(beside, path)
        dir_fd = os.open(folder, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except OSError as e:
        with contextlib.suppress(OSError):
            os.unlink(beside)
        raise SystemExit(f"cannot write the owner record {path}: {e.strerror}")


def drop_owner(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        return
    except OSError as e:
        raise SystemExit(f"cannot remove the owner record {path}: {e.strerror}")


def call(path: str, token: str, method: str = "GET", body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{API}/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    # 🔒 EVERY ANSWER THAT IS NOT THE API SAYING "success" ENDS THE SCRIPT, NAMED. No answer at all
    # (the network, a timeout), an error page that is not JSON (a proxy's 502, a 429 in HTML), JSON
    # that is not an object, an object without `success` — none of them says the change was made or
    # read, and each used to end in a traceback or, for a body that happened to parse, be read on.
    status = 0
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
            raw = response.read()
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            raw = e.read()
        except OSError as inner:
            raise SystemExit(f"cloudflare answered {status} and its body could not be read: {inner}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SystemExit(f"cloudflare gave no answer ({method} {path.split('?')[0]}): {getattr(e, 'reason', e)}")
    try:
        payload = json.loads(raw)
    except ValueError:
        raise SystemExit(f"cloudflare answered {status} with something that is not JSON")
    if not isinstance(payload, dict):
        raise SystemExit(f"cloudflare answered {status} with JSON that is not an object")
    if payload.get("success") is not True:
        errors = payload.get("errors")
        messages = "; ".join(
            str(x.get("message", "?")) for x in (errors if isinstance(errors, list) else []) if isinstance(x, dict)
        )
        raise SystemExit(f"cloudflare refused ({status}): {messages or 'unknown error'}")
    if "result" not in payload:
        raise SystemExit(f"cloudflare answered {status} without a result")
    return payload["result"]


def ingress_of(result: object, *, unconfigured_ok: bool) -> tuple[dict, list[dict]]:
    """The tunnel's `config` and its list of rules, out of one answer — or the script ends.

    🔒 AN ANSWER THAT DOES NOT SHOW THE LIST IS NOT AN EMPTY LIST. "No rule for this name" is what a
    removal is reported on, and every other site's rule is in the list this script sends back: a
    `config` or an `ingress` that is missing, null, or holds something that is not a rule used to be
    read as `[]` — a removal "done" on an answer that said nothing, and a PUT that would have dropped
    every rule the answer left out. Each rule must be an object with a `service` and, unless it is
    the catch-all, a `hostname`, both text.

    `unconfigured_ok`: before the FIRST rule is added a tunnel has no configuration (`config: null`,
    or one without `ingress`); that alone reads as no rules, and only for an add.
    """
    if not isinstance(result, dict):
        raise SystemExit("the tunnel's configuration is not an object")
    if "config" not in result:
        raise SystemExit("the answer does not show the tunnel's configuration")
    config = result["config"]
    if config is None and unconfigured_ok:
        return {}, []
    if not isinstance(config, dict):
        raise SystemExit("the tunnel's configuration is not an object")
    rules = config.get("ingress")
    if rules is None and unconfigured_ok:
        return config, []
    if not isinstance(rules, list):
        raise SystemExit("the tunnel's ingress is not a list of rules")
    for rule in rules:
        if not isinstance(rule, dict) or not isinstance(rule.get("service"), str) or not rule["service"]:
            raise SystemExit("the tunnel's ingress is not a list of rules")
        if "hostname" in rule and (not isinstance(rule["hostname"], str) or not rule["hostname"]):
            raise SystemExit("the tunnel's ingress is not a list of rules")
    return config, rules


def reorder(ingress: list[dict]) -> list[dict]:
    """Exact hostnames, then wildcards, then the catch-all.

    Cloudflare matches ingress rules IN ORDER and takes the first hostname that fits. It accepts
    whatever order it is given and warns about none of it, so both halves of this are ours to get
    right.

    The catch-all last is the older half: `service: http_status:404` matches everything, so a rule
    after it is dead — the site answers 404 from the internet while looking perfectly healthy on
    the host.

    🔒 A WILDCARD SHADOWS EVERY MORE-SPECIFIC RULE ADDED AFTER IT, AND THAT IS THE SAME BUG ONE
    STEP EARLIER. Measured 11/09 on the dev tunnel: `*.tracy.site → :8080` sat at index 6 (it
    routes every Tracy-issued site address to tracy-web, which is the front door), a go-live then
    appended `golive-test.tracy.site → :8083` at index 7, and the customer's own domain never got
    a single request — the wildcard answered first and tracy-web, which has never heard of that
    name as a site key, replied `Unknown site`. The job printed `ingress updated`, exited 0, and
    was right about everything it said.

    Sorting is STABLE within each group, so rules that do not compete keep the order a person put
    them in. Only the one relationship that actually decides an outcome is enforced.
    """
    named = [r for r in ingress if r.get("hostname")]
    catch_all = [r for r in ingress if not r.get("hostname")]
    exact = [r for r in named if "*" not in r["hostname"]]
    wildcard = [r for r in named if "*" in r["hostname"]]
    return exact + wildcard + (catch_all or [{"service": "http_status:404"}])


def dns_record(token: str, tunnel: str, hostname: str, *, remove: bool) -> None:
    """Point `hostname` at this tunnel with a proxied CNAME, or take that record away.

    Why a rule in the ingress list is not enough: DNS decides which tunnel a name reaches, and
    the fleet zone's wildcard (`*.tracy.ai`) already sends every unnamed host to the FIRST fleet
    host. A demo living on a second host is reachable only once its own record exists, and until
    then the ingress rule written above answers nobody — the request never arrives here.

    The zone is the last two labels of the hostname; one level under it is all Universal SSL
    covers, so a deeper name would be an error at the edge rather than here (measured 14/09).
    """
    zone_name = ".".join(hostname.split(".")[-2:])
    zones = call(f"zones?name={zone_name}", token)
    if not zones:
        raise SystemExit(f"no zone named {zone_name} on this account")
    zone = zones[0]["id"]
    existing = call(f"zones/{zone}/dns_records?name={hostname}", token)
    target = f"{tunnel}.cfargotunnel.com"
    if remove:
        for record in existing:
            call(f"zones/{zone}/dns_records/{record['id']}", token, method="DELETE")
        return
    # A zone whose wildcard already lands on THIS tunnel (dev: `*.tracy.site` → the dev tunnel)
    # needs no record of its own — writing one would be a second answer to the same question, and
    # one to forget at teardown. Said out loud, so the log shows why nothing was written.
    if not existing:
        wildcard = call(f"zones/{zone}/dns_records?name=*.{zone_name}", token)
        if any(r.get("type") == "CNAME" and r.get("content") == target for r in wildcard):
            print(f"dns: *.{zone_name} already points at this tunnel; no record written for {hostname}")
            return
    body = {"type": "CNAME", "name": hostname, "content": target, "proxied": True, "ttl": 1}
    if existing:
        call(f"zones/{zone}/dns_records/{existing[0]['id']}", token, method="PUT", body=body)
    else:
        call(f"zones/{zone}/dns_records", token, method="POST", body=body)


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--hostname", required=True)
    p.add_argument("--port", type=int, help="omit to remove the rule instead")
    p.add_argument("--remove", action="store_true")
    p.add_argument(
        "--dns",
        action="store_true",
        help="also point the hostname's DNS record at this tunnel (removed again with --remove)",
    )
    p.add_argument(
        "--only-port",
        type=int,
        help="with --remove: take the rule out only when it points at this local port; a rule that "
        f"points elsewhere is left alone and the exit code is {NOT_THIS_PORT}",
    )
    p.add_argument(
        "--replace",
        action="store_true",
        help="with --port: take the hostname over when its rule points at another port. Only for a "
        "hostname that is this site's by its very name (the Tracy address made from its label); "
        f"without it such a rule is left alone and the exit code is {NOT_THIS_PORT}",
    )
    p.add_argument(
        "--service",
        help="a customer's own domain: the local http address of tracy-web the rule leads to "
        "(http://host:port) instead of --port; with --remove, the service this caller's rule may lead to",
    )
    p.add_argument("--owner", help="with --service: the label of the site the route belongs to")
    p.add_argument(
        "--owner-gen",
        type=int,
        help="with --owner: the generation of the operation making this change; a route on record "
        "under a higher one is left alone",
    )
    p.add_argument(
        "--takeover-port",
        type=int,
        help="with --service and --owner: replace a rule for the hostname that leads straight to "
        "this local port (the site's own, from before own domains went through tracy-web)",
    )
    args = p.parse_args(argv)
    if args.service is not None and not SERVICE.match(args.service):
        raise SystemExit("--service is not http://host:port")
    if args.owner is not None and not LABEL.match(args.owner):
        raise SystemExit("--owner is not a site label")
    if args.owner_gen is not None and (args.owner is None or args.owner_gen < 0):
        raise SystemExit("--owner-gen goes with --owner and is not negative")
    if not args.remove and (args.service is None) != (args.owner is None):
        raise SystemExit("an add takes --service and --owner together")
    if not args.remove and args.service is not None and args.port is not None:
        raise SystemExit("an add takes --service or --port, not both")
    if args.takeover_port is not None and (args.remove or args.owner is None):
        raise SystemExit("--takeover-port goes with an add that names --service and --owner")
    if args.service is not None and args.remove and args.owner is None:
        raise SystemExit("--remove --service needs --owner")

    # A shard host (TRACY_TUNNEL=catch-all, set by tracy-host): its tunnel takes every name and
    # holds no per-name rule. This script must never touch it, whatever credentials are in the env.
    if os.environ.get("TRACY_TUNNEL") == "catch-all":
        raise SystemExit(
            "TRACY_TUNNEL=catch-all: this host's tunnel takes every name; no rule is written or removed here"
        )

    token = os.environ.get("TRACY_CF_API_TOKEN")
    account = os.environ.get("TRACY_CF_ACCOUNT_ID")
    tunnel = os.environ.get("TRACY_TUNNEL_ID")
    if not (token and account and tunnel):
        raise SystemExit("need TRACY_CF_API_TOKEN, TRACY_CF_ACCOUNT_ID and TRACY_TUNNEL_ID")

    path = f"accounts/{account}/cfd_tunnel/{tunnel}/configurations"
    if not args.remove and args.port is None and args.service is None:
        raise SystemExit("--port is required unless --remove")
    proxied = args.service is not None and not args.remove
    service = None if args.remove else (args.service if proxied else f"http://127.0.0.1:{args.port}")
    # The record is read for every caller that could change a rule it is about: one that names an
    # owner, and one that removes by port alone.
    recorded_caller = args.owner is not None or (args.remove and args.only_port is not None)
    record_path = owner_file(tunnel, args.hostname) if recorded_caller else None
    if record_path is not None:
        # Before the tunnel is touched: a place under that name that is not a directory (a link, a
        # file) is not where records are kept, and a rule must not be written that cannot be recorded.
        folder = os.path.dirname(record_path)
        try:
            if not stat.S_ISDIR(os.lstat(folder).st_mode):
                raise SystemExit(f"cannot keep owner records in {folder}: not a directory")
        except FileNotFoundError:
            pass
        except OSError as e:
            raise SystemExit(f"cannot keep owner records in {folder}: {e.strerror}")
    with tunnel_lock(tunnel):
        # The owner on record, read under the lock like the rules it is about.
        record = read_owner(record_path) if record_path is not None else None
        # Read immediately before writing, and under the lock: the whole list goes back in one PUT,
        # so anything held from earlier would overwrite whatever landed in between.
        config, rules = ingress_of(call(path, token), unconfigured_ok=not args.remove)
        # 🔒 A SITE REMOVES ONLY ITS OWN RULE. A hostname is the customer's to move: removed from one
        # site and connected to another, it is the second site's rule by the time the first site goes
        # back to draft with the name still in its record. Whose rule it is can be read off the rule —
        # each site has its own local port — so a caller that names its port never takes down a rule
        # that leads somewhere else.
        #
        # 🔒 AND A ROUTE TO TRACY-WEB IS A SITE'S ONLY BY ITS RECORD — ALL OF IT. Every own domain
        # leads to the same service, so the port proves nothing there. The record does, and it is
        # three things read together: the SERVICE the rule leads to (the rule the record is about is
        # the one at that address — not whatever address tracy-web is said to listen on today), the
        # site's LABEL, and the GENERATION of the operation that wrote it (no newer than the
        # caller's). A rule that matches a record on all three is the caller's; one that fails any
        # of them is not.
        #
        # 🔒 NO RECORD IS NOT PERMISSION. A rule to tracy-web with no record has no known owner: it
        # may be a newer site's whose record was lost. A removal leaves it standing and says so
        # (exit 3, "not this site's") — which costs nothing, because tracy-web opens nothing for a
        # name no site holds — and the next connect of the name, which only the site that holds it
        # in tracy-web's book can ask for, claims the rule and writes its record.
        #
        # 🔒 WHILE A WRITE IS NOT READ BACK, THE RECORD NAMES BOTH ENDS OF IT. A change of service
        # (tracy-web moved, or the site's old direct rule being taken over) writes the record first
        # and the rule second; if the provider then refuses, the rule still leads where it led
        # before. So the unfinished record keeps `previous` — every service the rule could still be
        # at — beside the intended `service`, and a rule at ANY of them is the record's rule: the
        # site's retry replaces it and its removal takes it out, whichever side of the failed write
        # the tunnel is on. The list is dropped only once the rule was read back at `service`.
        #
        # 🔒 THE PORT PROVES A RULE IS THE SITE'S ONLY WHILE THE HOSTNAME HAS NO RECORD. A rule that
        # leads straight to a site's port, from before own domains went through tracy-web, is that
        # site's by the port. But once a record stands for the hostname, an operation has claimed it
        # — its write may have been refused, so the rule can still lead to the port — and the record
        # is what decides, for the direct rule as for any other: same label, generation no newer
        # than the caller's. An older removal that names the port does not take out the rule a newer
        # operation of the same site is about to replace, and a caller that names no owner removes
        # nothing a record is about.
        recorded = record["service"] if record is not None else None
        known = {recorded, *record.get("previous", [])} if record is not None else set()
        by_record = record is not None and (
            args.owner is not None
            and record["label"] == args.owner
            and (args.owner_gen is None or record["gen"] <= args.owner_gen)
        )
        if args.remove and (args.only_port is not None or args.owner is not None):
            wanted = f"http://127.0.0.1:{args.only_port}" if args.only_port is not None else None
            for r in rules:
                if r.get("hostname") != args.hostname:
                    continue
                at = r.get("service")
                if record is None and at == wanted:
                    continue
                if record is not None and (at == wanted or at in known):
                    if by_record:
                        continue
                    as_whom = args.owner if args.owner is not None else "a caller that names no owner"
                    print(
                        f"ingress: {args.hostname} is routed for {record['label']} "
                        f"(generation {record['gen']}), not {as_whom}; left alone"
                    )
                    return NOT_THIS_PORT
                if args.owner is not None and record is None and at == args.service:
                    print(
                        f"ingress: {args.hostname} is routed to {at} with no owner on record, "
                        f"so not as {args.owner}'s; left alone"
                    )
                    return NOT_THIS_PORT
                print(f"ingress: {args.hostname} is routed to {at}, not {wanted or recorded or args.service}; left alone")
                return NOT_THIS_PORT
        # 🔒 AND A SITE ADDS ONLY WHERE NO OTHER RULE STANDS. The same question the other way round:
        # a rule for this hostname that leads to another port is another site's (or somebody's by
        # hand), and an add used to replace it without a word — the name taken from a site that was
        # serving it. Left standing, exit 3; the caller's "added" line is never printed. `--replace`
        # is for the one hostname that cannot be anybody else's: the address made from the site's
        # own label, whose port changes when the site is provisioned again.
        #
        # An own domain (`--service`, `--owner`): a record of a HIGHER generation is a newer
        # operation's route — this add is the stale one and changes nothing. What it may replace:
        # the site's own old rule (`--takeover-port`, this site's by its port), and the rule the
        # record is about, AT THE SERVICE THE RECORD NAMES — so a host whose tracy-web moved to
        # another address brings each route over with the site's next publish instead of refusing
        # its own rule as a stranger's. (Generations come from one sequence in tracy-web's book, and
        # tracy-web hands a name only to the site that holds it: the newest operation is the holder.)
        if proxied and record is not None and record["gen"] > (args.owner_gen or 0):
            print(
                f"ingress: {args.hostname} is routed for {record['label']} by a newer operation "
                f"(generation {record['gen']}); left alone"
            )
            return NOT_THIS_PORT
        own_old = f"http://127.0.0.1:{args.takeover_port}" if args.takeover_port is not None else None
        if service is not None and not args.replace:
            replaceable = {service, own_old, *(known if proxied else ())}
            elsewhere = [
                r for r in rules if r.get("hostname") == args.hostname and r.get("service") not in replaceable
            ]
            if elsewhere:
                print(f"ingress: {args.hostname} is routed to {elsewhere[0].get('service')}, not {service}; left alone")
                return NOT_THIS_PORT
        ingress = [r for r in rules if r.get("hostname") != args.hostname]
        mine_now = [r.get("service") for r in rules if r.get("hostname") == args.hostname]

        if service is not None:
            ingress.append({"hostname": args.hostname, "service": service})

        config["ingress"] = reorder(ingress)
        # 🔒 WHAT IS ALREADY SO IS NOT WRITTEN AGAIN. A cleanup run a second time (its first run
        # failed further on) finds this rule gone already, and an add finds its rule standing: the
        # tunnel holds what was asked for, as just read under the lock, and a second PUT of the whole
        # list would only be one more chance to drop somebody else's rule.
        already = (service is None and not mine_now) or (service is not None and mine_now == [service])
        claim = {"label": args.owner, "gen": args.owner_gen or 0, "service": service} if proxied else None
        # Where the rule may still lead if the write below is not taken: where it leads now, and
        # wherever the record already says it may be (an earlier write's service — its answer may
        # have been lost after the provider applied it — and that write's own `previous`).
        before = sorted({*mine_now, *known} - {service})
        if not already:
            # 🔒 THE RECORD IS WRITTEN BEFORE THE RULE, SO NO RULE TO TRACY-WEB IS EVER LEFT WITHOUT
            # ONE. A run cut between the two used to leave a rule nobody could be shown to own. Now it
            # leaves a record that names this operation (`state: writing`) whether or not the tunnel
            # took the rule — and that is right either way: the operation is the newest thing known
            # about the name, an older one is turned away by its generation, and this site's own
            # retry (same label, same or higher generation) finishes or removes what is there.
            if claim is not None:
                write_owner(record_path, {**claim, "state": "writing", **({"previous": before} if before else {})})
            call(path, token, method="PUT", body={"config": config})

        # 🔒 READ BACK BEFORE SAYING SO. "success" on the PUT is what a writer outside this lock (an
        # older script, another machine) overwrites a moment later; what the tunnel holds now is the
        # only thing the callers' "added" and "removed" lines may be printed on.
        after = rules if already else ingress_of(call(path, token), unconfigured_ok=False)[1]
        mine = [r for r in after if r.get("hostname") == args.hostname]
        if service is None and mine:
            raise SystemExit(f"the tunnel still has a rule for {args.hostname} after removing it")
        if service is not None and [r.get("service") for r in mine] != [service]:
            raise SystemExit(f"the tunnel does not show {args.hostname} → {service} after adding it")
        # The rule was read back: the record says so (this also claims a rule found standing with no
        # record). A record is removed only after the rule was read to be gone, and only this site's.
        if claim is not None:
            write_owner(record_path, claim)
        elif args.remove and by_record:
            drop_owner(record_path)

    if args.dns:
        dns_record(token, tunnel, args.hostname, remove=args.remove)

    print(
        f"ingress updated: {args.hostname}"
        + ("" if args.remove else f" → {service.removeprefix('http://')}")
        + f" ({len(config['ingress'])} rules)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
