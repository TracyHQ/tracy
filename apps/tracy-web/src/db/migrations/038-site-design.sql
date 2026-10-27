-- The design system a site wears, owned by tracy-web (ADR 0023, "Addendum 29/09").
--
-- The build's `check` stage records it (through the actor-signed PUT door), and the Apply door
-- rewrites it when `theme.style` answers ok — the one place every look change passes, whoever calls
-- it (site-tools, `/v1`, ops). The site folder's `docs/agents/design.json` is a COPY the agent reads.
--
-- `tokens` are the VALUES frozen for this site (T4 compiles them away, so nothing else holds them).
-- `wrote_by` is written by the server only — `build`, `apply:<applyId>` — never taken from a payload.
-- `manifest_design` and `wrote_by` never leave through a public door.
-- 038, not 035: `feat/comment-thread` holds 035–037 (site_comment) on 29/09.
create table site_design (
  site_key text primary key references site(site_key) on delete cascade,
  id text,
  source text not null check (source in ('catalog', 'brand', 'template', 'quickstart', 'none')),
  name text,
  platform text not null,
  tokens jsonb,
  tokens_from text,
  manifest_design jsonb,
  wrote_by text not null,
  updated_at timestamptz not null default now()
);
