-- A sign-in round started on a machine that cannot be signed into: a site's dsh lane.
--
-- WHY THIS TABLE EXISTS AT ALL. The lane's gateway (`vendor/tracy/dsh-passwords`) shows a sign-in
-- page on a host nobody's Google account has ever heard of — a loopback address, or a site's own
-- name. So it cannot run an OAuth round itself: it opens a round HERE, sends the person's browser
-- to Tracy to prove who they are, and asks back until the answer is yes. Until 16/09/2026 the round
-- lived in a Cloudflare Worker's Supabase table (`seat-registry`'s `auth_link`); this is that table,
-- in the app's own database, so the whole flow runs on a laptop with no Cloudflare account.
--
-- 🔒 NOTHING HERE IS THE SECRET ITSELF. The lane holds two 256-bit random strings; this table holds
-- only their SHA-256. A reader of this table cannot finish a round, and a leaked backup proves
-- nothing — the same reason `otp_code` stores `code_hash`.
create table if not exists auth_link (
  -- sha256 of the nonce the lane polls with. The nonce travels in a URL (the browser carries it to
  -- /signin), so it is the half-public half of the pair: knowing it lets you ASK, never FINISH.
  nonce_hash text primary key,
  -- sha256 of the client secret, which never leaves the lane process. Presenting it at /exchange is
  -- what proves the asker is the same process that opened the round.
  client_secret_hash text not null,
  -- Empty until somebody approves: the row does not know whose round it is, and must not guess.
  email text not null default '',
  -- 'pending' -> 'approved' (a person proved an address) -> 'consumed' (the lane exchanged it).
  -- A wrong client secret burns the row instead: a leaked nonce must not stay useful.
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
-- The sweep a poll does not do: an expired row answers 'expired' on its own (the poll compares
-- `expires_at`), so this index exists for the deletion, not for the read path.
create index if not exists auth_link_expires_at_idx on auth_link (expires_at);
