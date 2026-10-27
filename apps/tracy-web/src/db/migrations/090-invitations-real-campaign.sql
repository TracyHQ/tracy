-- Real customer data is separate from the synthetic sandbox. Payloads are AES-GCM envelopes.
create table invitations_real_setting (
 id integer primary key check(id=1), retention_days integer not null check(retention_days between 1 and 365),
 updated_by uuid not null, updated_at timestamptz not null default clock_timestamp()
);
create table invitations_real_campaign (
 id uuid primary key, revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 source_date date not null, first_imported_at timestamptz not null, expires_at timestamptz not null,
 tombstoned_at timestamptz, key_checked_at timestamptz, payload jsonb,
 counts jsonb not null default '{"total":0,"groups":[0,0,0,0,0],"suppressed":0,"recheck":0}'
);
create index invitations_real_campaign_expiry on invitations_real_campaign(expires_at) where tombstoned_at is null;
create table invitations_real_recipient (
 id uuid primary key, campaign_id uuid not null references invitations_real_campaign(id),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 group_key text not null check(group_key in ('group_1','group_2','group_3','group_4','group_5')),
 state text not null check(state in ('suppressed','recheck')), payload jsonb not null,
 unique(campaign_id,id)
);
create index invitations_real_recipient_page on invitations_real_recipient(campaign_id,group_key,state,id);
create table invitations_real_identity (
 campaign_id uuid not null, recipient_id uuid not null, kind text not null check(kind in ('email','member')),
 identity_key text not null check(identity_key ~ '^[A-Za-z0-9_-]{43}$'),
 primary key(campaign_id,kind,identity_key),
 foreign key(campaign_id,recipient_id) references invitations_real_recipient(campaign_id,id) on delete cascade
);
-- Preview/upload UUIDs have their own short-lived vault keys; a receipt has no customer payload.
create table invitations_real_import (
 id uuid primary key, campaign_id uuid references invitations_real_campaign(id), actor_id uuid not null,
 kind text not null check(kind in ('recipients','template')), status text not null check(status in ('preview','committed')),
 digest text not null, request_key text, expected_revision bigint, group_key text,
 payload jsonb, result jsonb, expires_at timestamptz not null,
 unique(actor_id,kind,request_key)
);
create index invitations_real_import_expiry on invitations_real_import(expires_at);
create table invitations_real_template (
 id uuid primary key, campaign_id uuid not null references invitations_real_campaign(id),
 group_key text not null check(group_key in ('group_1','group_2','group_3','group_4','group_5')),
 version integer not null check(version>0), payload jsonb not null,
 unique(campaign_id,group_key,version), unique(campaign_id,id)
);
create table invitations_real_asset (
 id uuid primary key, campaign_id uuid not null references invitations_real_campaign(id),
 version integer not null check(version>0), payload jsonb not null, unique(campaign_id,id)
);
create table invitations_real_draft (
 id uuid primary key, campaign_id uuid not null, recipient_id uuid not null,
 revision integer not null default 1 check(revision>0), payload jsonb not null,
 unique(campaign_id,recipient_id),
 foreign key(campaign_id,recipient_id) references invitations_real_recipient(campaign_id,id) on delete cascade
);
create table invitations_real_audit (
 id uuid primary key, campaign_id uuid references invitations_real_campaign(id), actor_id uuid,
 action text not null check(action ~ '^[a-z][a-z0-9_]{0,63}$'),
 code text check(code ~ '^[A-Z][A-Z0-9_]{0,63}$'), created_at timestamptz not null default clock_timestamp()
);
