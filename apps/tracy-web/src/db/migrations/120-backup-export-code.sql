create table backup_export_code (
  id uuid primary key,
  site_key text not null,
  export_id uuid not null references backup_export(id) on delete cascade,
  requested_by uuid not null references account(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index backup_export_code_one_live
  on backup_export_code (export_id, requested_by) where consumed_at is null;
