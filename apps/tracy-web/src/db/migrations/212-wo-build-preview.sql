-- The Your site card of Details (#537, option A): what a finished demo build cost and took, and a small picture of its
-- home page. `built` is written when the build's demo action completes ({at, minutes, usd}, usd null when unmeasured),
-- so the line "Built ... · 26 min · $1.84" still reads after a reload and after later runs. The picture is a WebP of
-- the home page's first screen (640 by 400, under 80 KB), kept in its own table so `select *` of a build never carries
-- the bytes; it goes with its build. Expand-only: an older image never reads either.
alter table wo_build add column if not exists built jsonb;
create table if not exists wo_build_preview (
  build_id uuid primary key references wo_build(id) on delete cascade,
  content_type text not null,
  bytes bytea not null,
  width integer not null,
  height integer not null,
  captured_at timestamptz not null default now()
);
