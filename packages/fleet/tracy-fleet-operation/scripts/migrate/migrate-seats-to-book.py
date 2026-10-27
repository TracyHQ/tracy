#!/usr/bin/env python3
"""Carry the seat book from the seat-registry's Supabase into tracy-web's Postgres.

WHY THE MAPPING IS NOT ONE-TO-ONE, AND WHY GETTING IT WRONG IS SILENT
--------------------------------------------------------------------
The old book had no accept step: a `seat_site` row with `revoked_at IS NULL`, held by a seat whose
status is 'active', WAS access. The new book splits invited from accepted, and `role-on-site.js`
is explicit that "an invited-but-not-yet-accepted seat reads identically to never invited" — it
fails closed. So a straight column copy, leaving `accepted_at` null, would revoke every owner on
the fleet while every row still looked present in the table.

  accepted_at = coalesce(seen_at, granted_at)   for a LIVE row on an ACTIVE seat
  accepted_at = null                            for a seat the old book still calls 'invited'

The second line is not an oversight: someone who was invited and never signed in should still see
"an invitation is waiting", which is what the new door shows them.

Dry-run by default. `--apply` writes.
"""
import json, os, subprocess, sys, urllib.request, urllib.parse

ENV = os.path.expanduser('~/.tracy-migrate.env')
def load_env(path):
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1); out[k] = v
    return out

def rest(base, key, table, select='*', limit=10000):
    url = f"{base}/rest/v1/{table}?select={urllib.parse.quote(select)}&limit={limit}"
    req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def q(v):
    if v is None: return 'null'
    return "'" + str(v).replace("'", "''") + "'"

def main():
    apply = '--apply' in sys.argv
    env = load_env(ENV)
    base = env['SUPABASE_URL'].rstrip('/'); key = env['SUPABASE_SERVICE_ROLE_KEY']

    seats = rest(base, key, 'seat', 'id,email,display_name,avatar_url,status,revoked_at')
    links = rest(base, key, 'seat_site', 'seat_id,site_key,role,created_by_proof,granted_by,granted_at,revoked_at,requested_at,seen_at')
    print(f"read from Supabase: {len(seats)} seats, {len(links)} grants", file=sys.stderr)

    # Only sites this Postgres actually knows: a grant on a site that is not here would violate the
    # foreign key, and silently dropping it is better than a failed transaction that carries
    # nothing — but it is printed, because a grant with nowhere to go is a fact someone must read.
    rows = subprocess.run(
        ['docker', 'exec', '-i', 'tracy-postgres-1', 'psql', '-U', 'tracy', '-d', 'tracy', '-At', '-F', '\t', '-c',
         'select site_key, label from site'],
        capture_output=True, text=True, check=True).stdout.strip().split('\n')
    known, by_label = set(), {}
    for r in rows:
        if not r.strip(): continue
        sk, lb = r.split('\t'); known.add(sk); by_label[lb] = sk

    # 🔒 THE OLD BOOK KEYS SOME SITES BY THE CUSTOMER'S OWN DOMAIN, NOT BY A TRACY ADDRESS.
    # `fijitrips.example`, `joomlart.com`, `ja-teline-v.demo.joomlart.com`, `tracy.ai` — twenty-two
    # of the thirty-seven live grants hang on those four keys, and a straight match on site_key
    # drops every one of them without a word. Provisioning derived the fleet label from the domain
    # the same way every time: dots to dashes, then an eight-hex suffix. So the mapping is not a
    # guess — it is that rule, run backwards, and it is REJECTED unless it lands on exactly one
    # label this book already holds.
    def resolve(sk):
        if sk in known: return sk
        stem = sk.replace('.', '-')
        hits = [lb for lb in by_label if lb == stem or (lb.startswith(stem + '-') and len(lb) == len(stem) + 9)]
        return by_label[hits[0]] if len(hits) == 1 else None

    by_id = {s['id']: s for s in seats}
    by_email = {}
    sql = []
    for s in seats:
        if not s.get('email'): continue
        e = s['email'].strip().lower()
        by_email[s['id']] = e
        sql.append(f"insert into account (email, display_name, avatar_url) values ({q(e)},{q(s.get('display_name'))},{q(s.get('avatar_url'))}) on conflict (email) do nothing;")

    kept = skipped = 0
    for g in links:
        raw_sk = (g.get('site_key') or '').strip().lower()
        email = by_email.get(g['seat_id'])
        sk = resolve(raw_sk) if raw_sk else None
        if not email or not sk:
            skipped += 1
            why = 'seat has no email' if not email else 'no site in this book answers for it'
            print(f"  skip: {email or '<no seat>'} on {raw_sk or '<no site>'} — {why}", file=sys.stderr)
            continue
        if sk != raw_sk:
            print(f"  map:  {raw_sk} -> {sk}", file=sys.stderr)
        seat = by_id.get(g['seat_id']) or {}
        live = g.get('revoked_at') is None and seat.get('status') == 'active'
        accepted = (g.get('seen_at') or g.get('granted_at')) if live else None
        kept += 1
        sql.append(
            "insert into seat (site_key, account_id, role, created_by_proof, granted_by, granted_at, seen_at, accepted_at, requested_at, revoked_at) "
            f"select {q(sk)}, a.id, {q(g.get('role') or 'editor')}, {q(g.get('created_by_proof'))}, "
            f"(select id from account where email = {q((g.get('granted_by') or '').strip().lower())}), "
            f"coalesce({q(g.get('granted_at'))}::timestamptz, now()), {q(g.get('seen_at'))}::timestamptz, "
            f"{q(accepted)}::timestamptz, {q(g.get('requested_at'))}::timestamptz, {q(g.get('revoked_at'))}::timestamptz "
            f"from account a where a.email = {q(email)} on conflict (site_key, account_id) do nothing;"
        )

    print(f"grants to carry: {kept}, skipped: {skipped}", file=sys.stderr)
    body = "begin;\n" + "\n".join(sql) + "\ncommit;\n"
    if not apply:
        print(body)
        print("-- dry run; re-run with --apply", file=sys.stderr)
        return
    p = subprocess.run(['docker', 'exec', '-i', 'tracy-postgres-1', 'psql', '-U', 'tracy', '-d', 'tracy', '-v', 'ON_ERROR_STOP=1'],
                       input=body, capture_output=True, text=True)
    sys.stderr.write(p.stdout + p.stderr)
    sys.exit(p.returncode)

main()
