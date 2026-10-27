"""What each backup point (`tracy-release/vN` tag) can restore — ADR 0024 sub-decision 1.

Read from the point itself, never from a software version: the tag's `Tracy-Database:` /
`Tracy-Uploads:` / `Tracy-Backup:` trailers (written by lib/site-backup.sh, on this host only) and
the dump files they name under `<private dir>/backups/`.

    database   null                          no trailer: every backup made before ADR 0024,
                                             or a dump that failed
               {engine, bytes, sha256, ok}   ok = the file(s) are there and hash to the trailer;
                                             else `reason`: missing | mismatch | removed (retention)

Usage (the last stdout line is the answer):
    backup_points.py list <repo> <prefix> <backups dir>
    backup_points.py point <repo> <prefix> <backups dir> <version>
"""
import hashlib
import json
import os
import re
import subprocess
import sys

TRAILER = re.compile(r"^Tracy-(Database|Uploads|Backup): (.+)$")
FIELDS = re.compile(r"(\w+):(\S+)")


def git(repo, *args):
    return subprocess.run(["git", "--git-dir", repo, *args], capture_output=True, text=True, check=True).stdout


def split_message(contents):
    """(notes, trailers): trailers are the LAST paragraph when every line of it is one of ours."""
    text = contents.rstrip("\n")
    paragraphs = text.split("\n\n")
    trailers = {}
    last = paragraphs[-1].splitlines() if len(paragraphs) > 1 else []
    if last and all(TRAILER.match(line) for line in last):
        for line in last:
            key, value = TRAILER.match(line).groups()
            trailers[key] = value
        paragraphs = paragraphs[:-1]
    body = "\n\n".join(paragraphs[1:]).strip()
    return (body or None), trailers


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def check(path, fields):
    """`ok` | `missing` | `mismatch` for one file against its trailer fields."""
    if not os.path.isfile(path):
        return "missing"
    if os.path.getsize(path) != int(fields.get("size", -1)) or sha256(path) != fields.get("sha256"):
        return "mismatch"
    return "ok"


ENGINE = {"mysql": "mariadb", "sqlite": "sqlite"}


def inspect(version, trailers, backups):
    """(public `database`, internal facts) of one point. `database` is the contract shape tracy-web
    reads (B2): `null` without a trailer, else `{engine, bytes, sha256, ok, reason?}` with reason
    `missing` (file gone), `mismatch` (bytes differ from the tag) or `removed` (retention)."""
    raw = trailers.get("Database")
    if not raw:
        return None, {"kind": None, "tables": None}
    f = dict(FIELDS.findall(raw))
    kind = f.get("kind")
    facts = {"kind": kind, "tables": int(f["tables"]) if f.get("tables", "").isdigit() else None}
    out = {"engine": ENGINE.get(kind, kind), "bytes": int(f["size"]) if f.get("size", "").isdigit() else None,
           "sha256": f.get("sha256")}
    if kind not in ENGINE or not re.fullmatch(r"[0-9a-f]{64}", f.get("sha256", "")):
        return {**out, "ok": False, "reason": "mismatch"}, facts
    state = check(os.path.join(backups, f"v{version}.{kind}.gz"), f)
    if kind == "sqlite" and state == "ok":
        # EmDash: the point restores only when its uploads are whole too.
        u = dict(FIELDS.findall(trailers.get("Uploads", "")))
        state = check(os.path.join(backups, f"v{version}.uploads.tar.gz"), u) if u else "missing"
    if state == "ok":
        return {**out, "ok": True}, facts
    if state == "missing" and os.path.exists(os.path.join(backups, f"v{version}.expired")):
        state = "removed"
    return {**out, "ok": False, "reason": state}, facts


def point_fields(version, contents, backups):
    """What a backup row gains from its tag: notes without trailers, `database`, and `auto` (only
    on a Before-restore point). Shared with webroot-git.sh `history`."""
    notes, trailers = split_message(contents)
    database, facts = inspect(version, trailers, backups)
    extra = {"database": database}
    if facts["kind"] == "sqlite":
        extra["applicationAvailable"] = os.path.isfile(os.path.join(backups, f"v{version}.app.tar"))
    if trailers.get("Backup"):
        extra["auto"] = trailers["Backup"]
    return notes, extra, facts


def points(repo, prefix, backups, with_facts=False):
    rows = []
    fmt = "%(refname:short)%09%(*objectname)%09%(objectname)%09%(creatordate:unix)%09%(taggername)%09%(taggeremail:trim)%09%(subject)"
    for line in git(repo, "for-each-ref", f"--format={fmt}", f"refs/tags/{prefix}/*").splitlines():
        if not line:
            continue
        name, peeled, own, at, tname, temail, subject = (line.split("\t") + [""] * 7)[:7]
        match = re.search(r"/v(\d+)$", name)
        if not match:
            continue
        version = int(match.group(1))
        notes, extra, facts = point_fields(version, git(repo, "tag", "-l", "--format=%(contents)", name), backups)
        row = {
            "version": version,
            # `objectname` of an annotated tag is the tag object; the commit is what a restore stands on.
            "sha": peeled or own,
            "at": int(at) if at.isdigit() else None,
            "title": subject,
            # The tagger is the person who pressed Create; v1 and machine points belong to the agent.
            "by": {"kind": "person", "name": tname, "email": temail} if temail and temail != "agent@tracy.ai" else {"kind": "agent"},
            "notes": notes,
            **extra,
        }
        if with_facts:
            row["facts"] = facts
        rows.append(row)
    rows.sort(key=lambda r: r["version"], reverse=True)
    return rows


def main():
    op, repo, prefix, backups = sys.argv[1:5]
    if op == "list":
        print(json.dumps({"ok": True, "backups": points(repo, prefix, backups)}))
    elif op == "point":
        want = int(sys.argv[5])
        print(json.dumps(next((r for r in points(repo, prefix, backups, True) if r["version"] == want), None)))
    else:
        raise SystemExit(f"unknown op {op}")


if __name__ == "__main__":
    main()
