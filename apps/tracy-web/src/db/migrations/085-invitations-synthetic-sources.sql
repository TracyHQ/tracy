-- Synthetic-only source history, independent of credentials and transport connections.
create table invitations_source_scope (
 id uuid primary key, namespace text not null check(namespace='synthetic:invitations:v1'),
 coverage_key text not null check(coverage_key='foundation-v1'), policy jsonb not null,
 revision bigint not null default 0, status text not null default 'pending',
 reasons jsonb not null default '["SOURCE_PENDING"]', fence_cursor text, cursor text,
 completed_at timestamptz, unique(namespace,coverage_key)
);
create table invitations_source_run (
 id uuid primary key, scope_id uuid not null references invitations_source_scope(id),
 campaign_id uuid not null references invitations_sandbox_campaign(id), actor text not null,
 request_key text not null, request_digest text not null, fixture_id text not null,
 anchor timestamptz not null, version_base bigint not null check(version_base between 1 and 9007199254740991),
 status text not null default 'pending', terminal boolean not null default false,
 state jsonb not null, result jsonb, error_code text,
 unique(campaign_id,actor,request_key)
);
create table invitations_source_page (
 id uuid primary key, run_id uuid not null references invitations_source_run(id),
 phase text not null, input_token text not null, digest text not null,
 committed_at timestamptz not null, unique(run_id,phase,input_token)
);
create table invitations_source_observation (
 id uuid primary key, scope_id uuid not null references invitations_source_scope(id),
 source text not null check(source in ('membership','marketingBasis','amember','sendy','tracy')),
 subject_key text not null check(subject_key ~ '^sandbox-[A-Za-z0-9_-]+$'),
 source_version bigint not null check(source_version between 1 and 9007199254740991),
 digest text not null, payload jsonb not null, observed_at timestamptz not null,
 unique(scope_id,source,subject_key,source_version)
);
create table invitations_source_current (
 scope_id uuid not null references invitations_source_scope(id), source text not null,
 subject_key text not null, observation_id uuid not null references invitations_source_observation(id),
 facts_revision bigint not null, primary key(scope_id,source,subject_key)
);
create table invitations_source_decision (
 id uuid primary key, scope_id uuid not null references invitations_source_scope(id),
 campaign_id uuid not null references invitations_sandbox_campaign(id), recipient_id uuid not null,
 facts_revision bigint not null, policy_version text not null, checked_at timestamptz not null,
 payload jsonb not null
);
create index invitations_source_decision_recipient on invitations_source_decision(campaign_id,recipient_id,checked_at desc);
create table invitations_source_invalidation (
 id uuid primary key, scope_id uuid not null references invitations_source_scope(id),
 campaign_id uuid not null references invitations_sandbox_campaign(id), recipient_id uuid not null,
 draft_revision integer not null, reasons jsonb not null, created_at timestamptz not null
);
create function invitations_source_immutable() returns trigger language plpgsql as $$
begin raise exception 'source_observation_immutable'; end;
$$;
create trigger source_observation_immutable before update or delete on invitations_source_observation
 for each row execute function invitations_source_immutable();
create trigger source_decision_immutable before update or delete on invitations_source_decision
 for each row execute function invitations_source_immutable();
create trigger source_invalidation_immutable before update or delete on invitations_source_invalidation
 for each row execute function invitations_source_immutable();
