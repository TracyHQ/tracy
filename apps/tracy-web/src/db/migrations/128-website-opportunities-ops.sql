-- apps/tracy-web/src/db/migrations/128-website-opportunities-ops.sql
-- Website Opportunities operations: deployment-wide provider credentials and pipeline settings
-- (`wo_ops_setting`, one row like `ui_setting` and `speech_setting`) plus per-operator read state
-- for the `/ops/wo` Live Queue (`ops_wo_read`, like `ops_ci_pr_read`).
--
-- Provider keys (`google_key_cipher`, `deepseek_key_cipher`, `firecrawl_key_cipher`, `jina_key_cipher`, `apify_key_cipher`)
-- are sealed by `lib/secret-box.js` (AES-256-GCM derived from `SESSION_SECRET`); they are never stored
-- in clear and never returned to a browser. Null or absent means no override saved here, so the
-- environment fallback (`MODEL_API_KEY` / `APIFY_TOKEN`) is used when present.
create table if not exists wo_ops_setting (
  id boolean primary key default true check (id),
  google_key_cipher text,
  deepseek_key_cipher text,
  firecrawl_key_cipher text,
  jina_key_cipher text,
  apify_key_cipher text,
  settings jsonb not null default '{}'::jsonb,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table wo_ops_setting add column if not exists google_key_cipher text;

-- Read state belongs to the signed-in Tracy account across browsers and user filters on `/ops/wo`.
-- Missing rows and null `read_at` mean unread.
create table if not exists ops_wo_read (
  account_id uuid not null references account(id) on delete cascade,
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  read_at timestamptz,
  primary key (account_id, opportunity_id)
);
