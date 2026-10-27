-- Website Opportunities schema baseline.
--
-- A new database starts here: `migrate()` in ./index.js applies this file, then every later file in name order, and
-- records each name with its checksum in `wo_schema_migration`. An applied file never changes; a change is a new file.
-- A database that reached this same schema through an earlier migration history is not migrated with this file: it is
-- compared with it (`verifyWoSchema` in ./verify.js) and, only when nothing differs, marked as adopted
-- (`adoptWoSchema`), after which the later files apply to it as to any other database.
--
-- `wo_principal` is whoever owns a row of the seller's pipeline (preferences, opportunities, jobs, media, requests,
-- charges). A host maps its own users to principals; a standalone install has one operator principal. Columns that
-- name a principal keep the historical name `account_id` (and `started_by_account_id`, `payer_account_id`).
--
-- Generated from the live schema and kept as one file on purpose: it is the target that verification compares against,
-- so it must say exactly what the tables are, constraint and index names included. No schema is named: the tables are
-- created in the first schema of the connection's search_path.

CREATE FUNCTION wo_place_media_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'wo_place_media rows are never deleted (revoke them)';
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoke_reason' - 'object_key')
       <> (to_jsonb(old) - 'revoked_at' - 'revoke_reason' - 'object_key') then
    raise exception 'wo_place_media is immutable except revoked_at and revoke_reason';
  end if;
  if new.object_key is distinct from old.object_key and not (
       old.object_key is not null and new.object_key is not null
       and lower(substring(old.object_key from '[^/]+$')) = lower(substring(new.object_key from '[^/]+$'))
       and lower(substring(new.object_key from '[^/]+$')) like old.sha256 || '.%'
     ) then
    raise exception 'wo_place_media.object_key may only move to another key of the same bytes';
  end if;
  return new;
end
$function$;

CREATE FUNCTION wo_social_stat_revised()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (to_jsonb(new)-'revision') is distinct from (to_jsonb(old)-'revision') then
    new.revision := nextval('wo_social_revision_seq');
  else new.revision := old.revision;
  end if;
  return new;
end $function$;

CREATE FUNCTION wo_social_alias_revised()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if row(new.owner_key,new.platform_id,new.provider,new.observed_at,new.verified_at,new.invalidated_at)
     is distinct from row(old.owner_key,old.platform_id,old.provider,old.observed_at,old.verified_at,old.invalidated_at) then
    new.revision := nextval('wo_social_revision_seq');
  else new.revision := old.revision;
  end if;
  return new;
end $function$;

CREATE FUNCTION wo_social_snapshot_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin raise exception 'Social snapshots are immutable'; end $function$;

CREATE TABLE wo_bulk_request (
    account_id uuid NOT NULL,
    request_id text NOT NULL,
    action text NOT NULL,
    request_hash text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_bulk_request_action_check CHECK ((action = ANY (ARRAY['resume'::text, 'cancel'::text])))
);

CREATE TABLE wo_cost_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_day date NOT NULL,
    place_id uuid,
    opportunity_id uuid,
    job_id uuid,
    provider text NOT NULL,
    operation text NOT NULL,
    reserved_cents integer NOT NULL,
    actual_cents integer,
    state text DEFAULT 'reserved'::text NOT NULL,
    provider_run_id text,
    request_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settled_at timestamp with time zone,
    account_id uuid,
    action_id uuid,
    build_id uuid,
    prefetch_campaign_id text,
    cost_reported boolean DEFAULT false NOT NULL,
    tokens jsonb,
    purpose text,
    payer text,
    payer_account_id uuid,
    CONSTRAINT wo_cost_ledger_actual_cents_check CHECK ((actual_cents >= 0)),
    CONSTRAINT wo_cost_ledger_payer_account CHECK (((payer_account_id IS NULL) OR (payer = ANY (ARRAY['account'::text, 'operator'::text])))),
    CONSTRAINT wo_cost_ledger_payer_known CHECK (((payer IS NULL) OR (payer = ANY (ARRAY['account'::text, 'public'::text, 'operator'::text, 'campaign'::text, 'none'::text])))),
    CONSTRAINT wo_cost_ledger_reserved_cents_check CHECK ((reserved_cents >= 0)),
    CONSTRAINT wo_cost_ledger_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'settled'::text, 'released'::text, 'unreconciled'::text]))),
    CONSTRAINT wo_cost_ledger_tokens_snapshot CHECK (((tokens IS NULL) OR
CASE
    WHEN ((jsonb_typeof(tokens) <> 'object'::text) OR ((tokens ->> 'version'::text) IS DISTINCT FROM '1'::text)) THEN false
    WHEN ((COALESCE((tokens ->> 'calls'::text), ''::text) !~ '^[0-9]{1,9}$'::text) OR (COALESCE((tokens ->> 'measured'::text), ''::text) !~ '^[0-9]{1,9}$'::text)) THEN false
    ELSE ((((tokens ->> 'measured'::text))::integer >= 1) AND (((tokens ->> 'measured'::text))::integer <= ((tokens ->> 'calls'::text))::integer))
END))
);

CREATE TABLE wo_job (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    kind text NOT NULL,
    request_id text NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT 'discovery'::text NOT NULL,
    progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    lease_owner text,
    lease_token bigint DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    heartbeat_at timestamp with time zone,
    attempt integer DEFAULT 0 NOT NULL,
    last_error jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    place_job_id uuid,
    result_snapshot_id uuid,
    CONSTRAINT wo_job_kind_check CHECK ((kind = ANY (ARRAY['research'::text, 'build'::text]))),
    CONSTRAINT wo_job_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'paused'::text, 'blocked'::text, 'failed'::text, 'cancelled'::text, 'completed'::text])))
);

CREATE TABLE wo_job_attempt (
    job_id uuid NOT NULL,
    attempt integer NOT NULL,
    lease_token bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    outcome text,
    error jsonb
);

CREATE TABLE wo_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    sha256 text NOT NULL,
    object_key text,
    status text DEFAULT 'stored'::text NOT NULL,
    reason text,
    mime text,
    bytes bigint,
    width integer,
    height integer,
    duration_s numeric,
    kind text NOT NULL,
    category text,
    palette jsonb,
    source text NOT NULL,
    source_url text NOT NULL,
    post_id text,
    posted_at timestamp with time zone,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    caption text,
    alt text,
    dhash text,
    labels jsonb,
    CONSTRAINT wo_media_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT wo_media_status_check CHECK ((status = ANY (ARRAY['stored'::text, 'reference'::text])))
);

CREATE TABLE wo_media_analysis (
    media_sha256 text NOT NULL,
    model text NOT NULL,
    version text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    result jsonb,
    lease_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_media_analysis_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'done'::text, 'failed'::text])))
);

CREATE TABLE wo_opportunity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    team_id uuid,
    name text NOT NULL,
    branch text,
    provider text NOT NULL,
    provider_id text NOT NULL,
    candidate jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    place_id uuid
);

CREATE TABLE wo_ops_setting (
    id boolean DEFAULT true NOT NULL,
    google_key_cipher text,
    deepseek_key_cipher text,
    firecrawl_key_cipher text,
    jina_key_cipher text,
    apify_key_cipher text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rapidapi_key_cipher text,
    litescrape_key_cipher text,
    serpapi_key_cipher text,
    scrapecreators_key_cipher text,
    CONSTRAINT wo_ops_setting_id_check CHECK (id)
);

CREATE TABLE wo_place (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text,
    current_snapshot_id uuid,
    merged_into uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE wo_place_backfill (
    place_id uuid NOT NULL,
    state text NOT NULL,
    snapshot_id uuid,
    from_opportunity_id uuid,
    from_account_id uuid,
    from_job_id uuid,
    attempts integer DEFAULT 0 NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    website_pass text,
    website_pass_at timestamp with time zone,
    website_attempts integer DEFAULT 0 NOT NULL,
    website_detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    google_website text,
    google_website_at timestamp with time zone,
    CONSTRAINT wo_place_backfill_state_check CHECK ((state = ANY (ARRAY['done'::text, 'skipped'::text, 'retry'::text]))),
    CONSTRAINT wo_place_backfill_website_pass_check CHECK ((website_pass = ANY (ARRAY['waiting'::text, 'done'::text])))
);

CREATE TABLE wo_place_identity (
    namespace text NOT NULL,
    external_id text NOT NULL,
    place_id uuid NOT NULL,
    source text NOT NULL,
    confidence real DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_place_identity_namespace_check CHECK ((namespace = ANY (ARRAY['google'::text, 'osm'::text, 'url'::text, 'merge'::text, 'tripadvisor'::text])))
);

CREATE TABLE wo_place_import (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text NOT NULL,
    place_id uuid,
    snapshot_id uuid,
    places integer DEFAULT 0 NOT NULL,
    snapshots integer DEFAULT 0 NOT NULL,
    sources integer DEFAULT 0 NOT NULL,
    media_rows integer DEFAULT 0 NOT NULL,
    detail jsonb,
    CONSTRAINT wo_place_import_outcome_check CHECK ((outcome = ANY (ARRAY['imported'::text, 'skipped_existing'::text, 'retry_later'::text, 'conflict'::text, 'media_missing'::text, 'invalid'::text, 'error'::text])))
);

CREATE TABLE wo_place_job (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT 'discovery'::text NOT NULL,
    progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    force boolean DEFAULT false NOT NULL,
    snapshot_id uuid,
    lease_owner text,
    lease_token bigint DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    heartbeat_at timestamp with time zone,
    attempt integer DEFAULT 0 NOT NULL,
    last_error jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prefetch_campaign_id text,
    research_mode text DEFAULT 'full'::text NOT NULL,
    work_priority integer DEFAULT 0 NOT NULL,
    only_source text,
    started_by text,
    started_by_account_id uuid,
    again_plan jsonb,
    CONSTRAINT wo_place_job_only_source_check CHECK (((only_source IS NULL) OR (only_source = ANY (ARRAY['logo'::text, 'website'::text, 'facebook'::text, 'instagram'::text, 'tiktok'::text, 'youtube'::text, 'google-places'::text, 'google-maps'::text, 'tripadvisor'::text, 'facebook-search'::text, 'instagram-search'::text, 'menu-file'::text, 'menu-photos'::text])))),
    CONSTRAINT wo_place_job_research_mode_check CHECK ((research_mode = ANY (ARRAY['website'::text, 'full'::text]))),
    CONSTRAINT wo_place_job_started_by_known CHECK (((started_by IS NULL) OR (started_by = ANY (ARRAY['account'::text, 'public'::text, 'operator'::text, 'campaign'::text, 'none'::text])))),
    CONSTRAINT wo_place_job_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'paused'::text, 'blocked'::text, 'failed'::text, 'cancelled'::text, 'completed'::text]))),
    CONSTRAINT wo_place_job_work_priority_check CHECK ((work_priority = ANY (ARRAY[0, 1])))
);

CREATE TABLE wo_place_link (
    place_id uuid NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    verified_by text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_place_link_kind_check CHECK ((kind = ANY (ARRAY['website'::text, 'facebook'::text, 'instagram'::text, 'tiktok'::text, 'youtube'::text]))),
    CONSTRAINT wo_place_link_verified_by_check CHECK ((verified_by = ANY (ARRAY['identity'::text, 'google'::text, 'website'::text, 'operator'::text, 'osm'::text, 'search'::text])))
);

CREATE TABLE wo_place_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    sha256 text NOT NULL,
    object_key text,
    status text DEFAULT 'stored'::text NOT NULL,
    reason text,
    mime text,
    bytes bigint,
    width integer,
    height integer,
    duration_s numeric,
    kind text NOT NULL,
    category text,
    palette jsonb,
    caption text,
    alt text,
    dhash text,
    labels jsonb,
    source text NOT NULL,
    source_url text NOT NULL,
    post_id text,
    posted_at timestamp with time zone,
    provider text,
    credit jsonb,
    job_id uuid,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoke_reason text,
    CONSTRAINT wo_place_media_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT wo_place_media_status_check CHECK ((status = ANY (ARRAY['stored'::text, 'reference'::text])))
);

CREATE TABLE wo_place_media_legacy (
    wo_media_id uuid NOT NULL,
    place_media_id uuid NOT NULL,
    old_object_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE wo_place_media_rekey (
    media_id uuid NOT NULL,
    old_key text NOT NULL,
    new_key text NOT NULL,
    moved_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE wo_place_merge_candidate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url_place_id uuid NOT NULL,
    google_place_id uuid NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    score real DEFAULT 0 NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_at timestamp with time zone,
    apply_error text,
    CONSTRAINT wo_place_merge_candidate_check CHECK ((url_place_id <> google_place_id)),
    CONSTRAINT wo_place_merge_candidate_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE wo_place_ops_event (
    id bigint NOT NULL,
    place_id uuid NOT NULL,
    action text NOT NULL,
    actor text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_place_ops_event_action_check CHECK ((action = ANY (ARRAY['refresh'::text, 'revoke'::text, 'unrevoke'::text, 'merge'::text, 'split'::text, 'approve-merge'::text, 'reject-merge'::text, 'research-again'::text, 'social-page'::text])))
);

CREATE SEQUENCE wo_place_ops_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE wo_place_ops_event_id_seq OWNED BY wo_place_ops_event.id;

CREATE TABLE wo_place_paid_receipt (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    source text NOT NULL,
    job_id uuid NOT NULL,
    request_hash text NOT NULL,
    reservation_id uuid NOT NULL,
    state text NOT NULL,
    response jsonb,
    fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_place_paid_receipt_state_check CHECK ((state = ANY (ARRAY['starting'::text, 'received'::text])))
);

CREATE TABLE wo_place_public_request (
    receipt uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    provider_id text NOT NULL,
    place_job_id uuid NOT NULL,
    ip_bucket text NOT NULL,
    new_job boolean NOT NULL,
    reserved_cents integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_place_public_request_reserved_cents_check CHECK ((reserved_cents >= 0))
);

CREATE TABLE wo_place_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    state text DEFAULT 'preparing'::text NOT NULL,
    job_id uuid,
    base_snapshot_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    enrichment_scope text DEFAULT 'full'::text NOT NULL,
    CONSTRAINT wo_place_snapshot_enrichment_scope_check CHECK ((enrichment_scope = ANY (ARRAY['full'::text, 'prefetch'::text]))),
    CONSTRAINT wo_place_snapshot_state_check CHECK ((state = ANY (ARRAY['preparing'::text, 'published'::text, 'failed'::text, 'superseded'::text])))
);

CREATE TABLE wo_place_snapshot_import (
    snapshot_id uuid NOT NULL,
    import_id uuid NOT NULL,
    origin text NOT NULL,
    origin_snapshot_id uuid NOT NULL
);

CREATE TABLE wo_place_snapshot_media (
    snapshot_id uuid NOT NULL,
    media_id uuid NOT NULL
);

CREATE TABLE wo_place_snapshot_profile (
    snapshot_id uuid NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    brand jsonb
);

CREATE TABLE wo_place_snapshot_source (
    snapshot_id uuid NOT NULL,
    source text NOT NULL,
    ref text,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    cursor jsonb,
    coverage jsonb,
    collected jsonb DEFAULT '{}'::jsonb NOT NULL,
    collected_at timestamp with time zone,
    attempted_at timestamp with time zone,
    last_error jsonb,
    collector_version text
);

CREATE TABLE wo_place_social_link (
    place_id uuid NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    origin text NOT NULL,
    authority_id uuid NOT NULL,
    identity_key text NOT NULL,
    binding_revision bigint NOT NULL,
    alias_key text NOT NULL,
    verified_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);

CREATE TABLE wo_places_cache (
    key text NOT NULL,
    answer jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE TABLE wo_preference (
    account_id uuid NOT NULL,
    cms text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    quality_mode text DEFAULT 'off'::text NOT NULL,
    CONSTRAINT wo_preference_cms_check CHECK ((cms = ANY (ARRAY['joomla'::text, 'wordpress'::text, 'emdash'::text]))),
    CONSTRAINT wo_preference_quality_mode_check CHECK ((quality_mode = ANY (ARRAY['off'::text, 'shadow'::text, 'apply'::text])))
);

CREATE TABLE wo_prefetch_campaign (
    id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    seed_source jsonb NOT NULL,
    selection_rule text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_tick_at timestamp with time zone,
    next_tick_at timestamp with time zone DEFAULT now() NOT NULL,
    tick_count integer DEFAULT 0 NOT NULL,
    last_error text,
    paid_enabled boolean DEFAULT false NOT NULL,
    research_mode text DEFAULT 'website'::text NOT NULL,
    budget_cents integer DEFAULT 10000 NOT NULL,
    max_concurrency integer DEFAULT 1 NOT NULL,
    selection_candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    selection_observations jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT wo_prefetch_campaign_budget_cents_check CHECK (((budget_cents >= 0) AND (budget_cents <= 1000000))),
    CONSTRAINT wo_prefetch_campaign_id_check CHECK ((id = 'dubai'::text)),
    CONSTRAINT wo_prefetch_campaign_max_concurrency_check CHECK (((max_concurrency >= 1) AND (max_concurrency <= 3))),
    CONSTRAINT wo_prefetch_campaign_research_mode_check CHECK ((research_mode = ANY (ARRAY['website'::text, 'full'::text])))
);

CREATE TABLE wo_prefetch_seed (
    campaign_id text NOT NULL,
    external_id text NOT NULL,
    place_id uuid NOT NULL,
    facts jsonb NOT NULL,
    job_id uuid,
    next_refresh_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE wo_prefetch_source_batch (
    source_key text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_prefetch_source_batch_source_key_check CHECK ((source_key = 'dubai-google-v1'::text))
);

CREATE TABLE wo_prefetch_source_page (
    source_key text NOT NULL,
    page integer NOT NULL,
    request_hash text NOT NULL,
    state text DEFAULT 'planned'::text NOT NULL,
    reservation_id uuid,
    http_status integer,
    response jsonb,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_prefetch_source_page_page_check CHECK (((page >= 0) AND (page <= 2))),
    CONSTRAINT wo_prefetch_source_page_state_check CHECK ((state = ANY (ARRAY['planned'::text, 'starting'::text, 'received'::text])))
);

CREATE TABLE wo_principal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    external_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_principal_kind_check CHECK ((kind <> ''::text))
);

CREATE TABLE wo_profile (
    opportunity_id uuid NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    brand jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE wo_site_check (
    url_key text NOT NULL,
    url text NOT NULL,
    final_url text,
    status text NOT NULL,
    performance integer,
    seo integer,
    lcp_ms integer,
    https boolean,
    mobile_friendly boolean,
    cms text,
    cms_version text,
    copyright_year integer,
    emails jsonb,
    socials jsonb,
    error text,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    checked_at timestamp with time zone,
    lease_token bigint DEFAULT 0 NOT NULL,
    CONSTRAINT wo_site_check_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'done'::text, 'down'::text, 'blocked'::text, 'failed'::text])))
);

CREATE SEQUENCE wo_social_revision_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE wo_social_alias (
    alias_key text NOT NULL,
    owner_key text NOT NULL,
    network text NOT NULL,
    platform_id text NOT NULL,
    provider text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone NOT NULL,
    invalidated_at timestamp with time zone,
    revision bigint DEFAULT nextval('wo_social_revision_seq'::regclass) NOT NULL,
    CONSTRAINT wo_social_alias_network_check CHECK ((network = ANY (ARRAY['facebook'::text, 'instagram'::text, 'tiktok'::text, 'youtube'::text])))
);

CREATE TABLE wo_social_authority (
    singleton boolean DEFAULT true NOT NULL,
    authority_id uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT wo_social_authority_singleton_check CHECK (singleton)
);

CREATE TABLE wo_social_deployment (
    deployment_id text NOT NULL,
    origin text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    reads_per_minute integer DEFAULT 0 NOT NULL,
    refreshes_per_day integer DEFAULT 0 NOT NULL,
    forces_per_day integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_social_deployment_forces_per_day_check CHECK (((forces_per_day >= 0) AND (forces_per_day <= 10000))),
    CONSTRAINT wo_social_deployment_reads_per_minute_check CHECK (((reads_per_minute >= 0) AND (reads_per_minute <= 10000))),
    CONSTRAINT wo_social_deployment_refreshes_per_day_check CHECK (((refreshes_per_day >= 0) AND (refreshes_per_day <= 10000)))
);

CREATE TABLE wo_social_operation (
    op_key text NOT NULL,
    deployment_id text NOT NULL,
    operation_id uuid NOT NULL,
    request_hash text NOT NULL,
    network text NOT NULL,
    url text NOT NULL,
    alias_key text NOT NULL,
    force boolean NOT NULL,
    target_key text NOT NULL,
    binding_revision bigint,
    target_generation bigint,
    target_exists boolean NOT NULL,
    admitted_generation bigint,
    admission text,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    queued_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    lease_token bigint DEFAULT 0 NOT NULL,
    checked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE wo_social_outbox (
    outbox_key text NOT NULL,
    origin text NOT NULL,
    authority_id uuid NOT NULL,
    expected_fence jsonb,
    operation_id uuid NOT NULL,
    alias_key text NOT NULL,
    network text NOT NULL,
    url text NOT NULL,
    force boolean NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    remote_result jsonb,
    queued_at timestamp with time zone NOT NULL,
    next_retry_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    lease_token bigint DEFAULT 0 NOT NULL,
    checked_at timestamp with time zone
);

CREATE TABLE wo_social_replica_alias (
    origin text NOT NULL,
    authority_id uuid NOT NULL,
    alias_key text NOT NULL,
    identity_key text,
    binding_revision bigint DEFAULT 0 NOT NULL,
    observed_at timestamp with time zone,
    verified_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    state_revision bigint DEFAULT 0 NOT NULL,
    state_observed_at timestamp with time zone NOT NULL,
    synced_at timestamp with time zone NOT NULL
);

CREATE TABLE wo_social_replica_authority (
    origin text NOT NULL,
    authority_id uuid NOT NULL,
    pinned_at timestamp with time zone NOT NULL
);

CREATE TABLE wo_social_replica_identity (
    origin text NOT NULL,
    authority_id uuid NOT NULL,
    identity_key text NOT NULL,
    network text NOT NULL,
    platform_id text NOT NULL,
    version bigint NOT NULL,
    snapshot jsonb NOT NULL,
    fetched_at timestamp with time zone NOT NULL,
    synced_at timestamp with time zone NOT NULL
);

CREATE TABLE wo_social_service_key (
    key_id text NOT NULL,
    deployment_id text NOT NULL,
    secret_hash text NOT NULL,
    scopes text[] NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_social_service_key_scopes_check CHECK ((scopes <@ ARRAY['read'::text, 'refresh'::text]))
);

CREATE TABLE wo_social_snapshot (
    version bigint DEFAULT nextval('wo_social_revision_seq'::regclass) NOT NULL,
    identity_key text NOT NULL,
    network text NOT NULL,
    platform_id text NOT NULL,
    snapshot jsonb NOT NULL,
    fetched_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_social_snapshot_network_check CHECK ((network = ANY (ARRAY['facebook'::text, 'instagram'::text, 'tiktok'::text, 'youtube'::text]))),
    CONSTRAINT wo_social_snapshot_snapshot_check CHECK ((jsonb_typeof(snapshot) = 'object'::text))
);

CREATE TABLE wo_social_stat (
    stat_key text NOT NULL,
    network text NOT NULL,
    url text NOT NULL,
    status text NOT NULL,
    requested_by uuid,
    platform_id text,
    handle text,
    followers bigint,
    posts bigint,
    last_post_at timestamp with time zone,
    posts_per_month numeric,
    coverage text,
    provider text,
    fetched_at timestamp with time zone,
    last_attempt_at timestamp with time zone,
    last_error text,
    next_retry_at timestamp with time zone,
    error text,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    lease_token bigint DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    checked_at timestamp with time zone,
    apify_attempt jsonb,
    provider_quota jsonb,
    revision bigint DEFAULT nextval('wo_social_revision_seq'::regclass) NOT NULL,
    CONSTRAINT wo_social_stat_coverage_check CHECK ((coverage = ANY (ARRAY['complete'::text, 'partial'::text]))),
    CONSTRAINT wo_social_stat_network_check CHECK ((network = ANY (ARRAY['facebook'::text, 'instagram'::text, 'tiktok'::text, 'youtube'::text]))),
    CONSTRAINT wo_social_stat_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'done'::text, 'not_found'::text, 'failed'::text])))
);

CREATE TABLE wo_source (
    opportunity_id uuid NOT NULL,
    source text NOT NULL,
    ref text,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    cursor jsonb,
    coverage jsonb,
    collected jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY wo_place_ops_event ALTER COLUMN id SET DEFAULT nextval('wo_place_ops_event_id_seq'::regclass);

ALTER TABLE ONLY wo_bulk_request
    ADD CONSTRAINT wo_bulk_request_pkey PRIMARY KEY (account_id, request_id);

ALTER TABLE ONLY wo_cost_ledger
    ADD CONSTRAINT wo_cost_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_cost_ledger
    ADD CONSTRAINT wo_cost_ledger_request_key_key UNIQUE (request_key);

ALTER TABLE ONLY wo_job
    ADD CONSTRAINT wo_job_account_id_request_id_key UNIQUE (account_id, request_id);

ALTER TABLE ONLY wo_job_attempt
    ADD CONSTRAINT wo_job_attempt_pkey PRIMARY KEY (job_id, attempt);

ALTER TABLE ONLY wo_job
    ADD CONSTRAINT wo_job_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_media_analysis
    ADD CONSTRAINT wo_media_analysis_pkey PRIMARY KEY (media_sha256, model, version);

ALTER TABLE ONLY wo_media
    ADD CONSTRAINT wo_media_opportunity_id_sha256_key UNIQUE (opportunity_id, sha256);

ALTER TABLE ONLY wo_media
    ADD CONSTRAINT wo_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_opportunity
    ADD CONSTRAINT wo_opportunity_account_id_provider_provider_id_key UNIQUE (account_id, provider, provider_id);

ALTER TABLE ONLY wo_opportunity
    ADD CONSTRAINT wo_opportunity_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_ops_setting
    ADD CONSTRAINT wo_ops_setting_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_backfill
    ADD CONSTRAINT wo_place_backfill_pkey PRIMARY KEY (place_id);

ALTER TABLE ONLY wo_place_identity
    ADD CONSTRAINT wo_place_identity_pkey PRIMARY KEY (namespace, external_id);

ALTER TABLE ONLY wo_place_import
    ADD CONSTRAINT wo_place_import_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_job
    ADD CONSTRAINT wo_place_job_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_link
    ADD CONSTRAINT wo_place_link_pkey PRIMARY KEY (place_id, kind, url);

ALTER TABLE ONLY wo_place_media_legacy
    ADD CONSTRAINT wo_place_media_legacy_pkey PRIMARY KEY (wo_media_id);

ALTER TABLE ONLY wo_place_media
    ADD CONSTRAINT wo_place_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_media
    ADD CONSTRAINT wo_place_media_place_id_sha256_key UNIQUE (place_id, sha256);

ALTER TABLE ONLY wo_place_media_rekey
    ADD CONSTRAINT wo_place_media_rekey_pkey PRIMARY KEY (media_id);

ALTER TABLE ONLY wo_place_merge_candidate
    ADD CONSTRAINT wo_place_merge_candidate_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_merge_candidate
    ADD CONSTRAINT wo_place_merge_candidate_url_place_id_google_place_id_key UNIQUE (url_place_id, google_place_id);

ALTER TABLE ONLY wo_place_ops_event
    ADD CONSTRAINT wo_place_ops_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_paid_receipt
    ADD CONSTRAINT wo_place_paid_receipt_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_paid_receipt
    ADD CONSTRAINT wo_place_paid_receipt_reservation_id_key UNIQUE (reservation_id);

ALTER TABLE ONLY wo_place
    ADD CONSTRAINT wo_place_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_public_request
    ADD CONSTRAINT wo_place_public_request_pkey PRIMARY KEY (receipt);

ALTER TABLE ONLY wo_place_snapshot_import
    ADD CONSTRAINT wo_place_snapshot_import_origin_origin_snapshot_id_key UNIQUE (origin, origin_snapshot_id);

ALTER TABLE ONLY wo_place_snapshot_import
    ADD CONSTRAINT wo_place_snapshot_import_pkey PRIMARY KEY (snapshot_id);

ALTER TABLE ONLY wo_place_snapshot_media
    ADD CONSTRAINT wo_place_snapshot_media_pkey PRIMARY KEY (snapshot_id, media_id);

ALTER TABLE ONLY wo_place_snapshot
    ADD CONSTRAINT wo_place_snapshot_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_place_snapshot_profile
    ADD CONSTRAINT wo_place_snapshot_profile_pkey PRIMARY KEY (snapshot_id);

ALTER TABLE ONLY wo_place_snapshot_source
    ADD CONSTRAINT wo_place_snapshot_source_pkey PRIMARY KEY (snapshot_id, source);

ALTER TABLE ONLY wo_place_social_link
    ADD CONSTRAINT wo_place_social_link_pkey PRIMARY KEY (place_id, kind, url);

ALTER TABLE ONLY wo_places_cache
    ADD CONSTRAINT wo_places_cache_pkey PRIMARY KEY (key);

ALTER TABLE ONLY wo_preference
    ADD CONSTRAINT wo_preference_pkey PRIMARY KEY (account_id);

ALTER TABLE ONLY wo_prefetch_campaign
    ADD CONSTRAINT wo_prefetch_campaign_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_prefetch_seed
    ADD CONSTRAINT wo_prefetch_seed_campaign_id_place_id_key UNIQUE (campaign_id, place_id);

ALTER TABLE ONLY wo_prefetch_seed
    ADD CONSTRAINT wo_prefetch_seed_pkey PRIMARY KEY (campaign_id, external_id);

ALTER TABLE ONLY wo_prefetch_source_batch
    ADD CONSTRAINT wo_prefetch_source_batch_id_key UNIQUE (id);

ALTER TABLE ONLY wo_prefetch_source_batch
    ADD CONSTRAINT wo_prefetch_source_batch_pkey PRIMARY KEY (source_key);

ALTER TABLE ONLY wo_prefetch_source_page
    ADD CONSTRAINT wo_prefetch_source_page_pkey PRIMARY KEY (source_key, page);

ALTER TABLE ONLY wo_principal
    ADD CONSTRAINT wo_principal_kind_ref UNIQUE (kind, external_ref);

ALTER TABLE ONLY wo_principal
    ADD CONSTRAINT wo_principal_pkey PRIMARY KEY (id);

ALTER TABLE ONLY wo_profile
    ADD CONSTRAINT wo_profile_pkey PRIMARY KEY (opportunity_id);

ALTER TABLE ONLY wo_site_check
    ADD CONSTRAINT wo_site_check_pkey PRIMARY KEY (url_key);

ALTER TABLE ONLY wo_social_alias
    ADD CONSTRAINT wo_social_alias_pkey PRIMARY KEY (alias_key);

ALTER TABLE ONLY wo_social_authority
    ADD CONSTRAINT wo_social_authority_authority_id_key UNIQUE (authority_id);

ALTER TABLE ONLY wo_social_authority
    ADD CONSTRAINT wo_social_authority_pkey PRIMARY KEY (singleton);

ALTER TABLE ONLY wo_social_deployment
    ADD CONSTRAINT wo_social_deployment_pkey PRIMARY KEY (deployment_id);

ALTER TABLE ONLY wo_social_operation
    ADD CONSTRAINT wo_social_operation_deployment_id_operation_id_key UNIQUE (deployment_id, operation_id);

ALTER TABLE ONLY wo_social_operation
    ADD CONSTRAINT wo_social_operation_pkey PRIMARY KEY (op_key);

ALTER TABLE ONLY wo_social_outbox
    ADD CONSTRAINT wo_social_outbox_origin_operation_id_key UNIQUE (origin, operation_id);

ALTER TABLE ONLY wo_social_outbox
    ADD CONSTRAINT wo_social_outbox_pkey PRIMARY KEY (outbox_key);

ALTER TABLE ONLY wo_social_replica_alias
    ADD CONSTRAINT wo_social_replica_alias_pkey PRIMARY KEY (origin, authority_id, alias_key);

ALTER TABLE ONLY wo_social_replica_authority
    ADD CONSTRAINT wo_social_replica_authority_origin_authority_id_key UNIQUE (origin, authority_id);

ALTER TABLE ONLY wo_social_replica_authority
    ADD CONSTRAINT wo_social_replica_authority_pkey PRIMARY KEY (origin);

ALTER TABLE ONLY wo_social_replica_identity
    ADD CONSTRAINT wo_social_replica_identity_pkey PRIMARY KEY (origin, authority_id, identity_key);

ALTER TABLE ONLY wo_social_service_key
    ADD CONSTRAINT wo_social_service_key_pkey PRIMARY KEY (key_id);

ALTER TABLE ONLY wo_social_snapshot
    ADD CONSTRAINT wo_social_snapshot_pkey PRIMARY KEY (version);

ALTER TABLE ONLY wo_social_stat
    ADD CONSTRAINT wo_social_stat_pkey PRIMARY KEY (stat_key);

ALTER TABLE ONLY wo_source
    ADD CONSTRAINT wo_source_pkey PRIMARY KEY (opportunity_id, source);

CREATE INDEX wo_cost_ledger_account_day ON wo_cost_ledger USING btree (account_id, budget_day) WHERE (account_id IS NOT NULL);

CREATE INDEX wo_cost_ledger_day ON wo_cost_ledger USING btree (budget_day, state);

CREATE INDEX wo_cost_ledger_job ON wo_cost_ledger USING btree (job_id) WHERE (job_id IS NOT NULL);

CREATE INDEX wo_cost_ledger_model_usage_at ON wo_cost_ledger USING btree (created_at) WHERE ((purpose IS NOT NULL) OR (provider = 'vision'::text));

CREATE INDEX wo_cost_ledger_open ON wo_cost_ledger USING btree (created_at) WHERE (state = 'reserved'::text);

CREATE INDEX wo_cost_ledger_place_day ON wo_cost_ledger USING btree (place_id, budget_day) WHERE (place_id IS NOT NULL);

CREATE INDEX wo_cost_ledger_prefetch_campaign ON wo_cost_ledger USING btree (prefetch_campaign_id) WHERE (prefetch_campaign_id IS NOT NULL);

CREATE INDEX wo_job_claimable ON wo_job USING btree (state, lease_until) WHERE (state = ANY (ARRAY['queued'::text, 'running'::text]));

CREATE UNIQUE INDEX wo_job_one_active ON wo_job USING btree (opportunity_id) WHERE ((kind = 'research'::text) AND (state = ANY (ARRAY['queued'::text, 'running'::text])));

CREATE INDEX wo_job_opportunity ON wo_job USING btree (opportunity_id, created_at DESC);

CREATE INDEX wo_job_place_job ON wo_job USING btree (place_job_id) WHERE (place_job_id IS NOT NULL);

CREATE INDEX wo_media_source_url ON wo_media USING btree (opportunity_id, source_url);

CREATE INDEX wo_opportunity_account ON wo_opportunity USING btree (account_id, created_at DESC);

CREATE INDEX wo_opportunity_place ON wo_opportunity USING btree (place_id) WHERE (place_id IS NOT NULL);

CREATE INDEX wo_place_backfill_website_pass ON wo_place_backfill USING btree (place_id) WHERE ((state = ANY (ARRAY['done'::text, 'skipped'::text])) AND ((website_pass IS NULL) OR (website_pass = 'waiting'::text)));

CREATE INDEX wo_place_identity_place ON wo_place_identity USING btree (place_id);

CREATE INDEX wo_place_import_received ON wo_place_import USING btree (received_at DESC);

CREATE INDEX wo_place_job_claimable ON wo_place_job USING btree (state, updated_at) WHERE (state = ANY (ARRAY['queued'::text, 'running'::text]));

CREATE UNIQUE INDEX wo_place_job_one_queued ON wo_place_job USING btree (place_id) WHERE (state = 'queued'::text);

CREATE UNIQUE INDEX wo_place_job_one_running ON wo_place_job USING btree (place_id) WHERE (state = 'running'::text);

CREATE INDEX wo_place_job_place ON wo_place_job USING btree (place_id, created_at DESC);

CREATE INDEX wo_place_link_url ON wo_place_link USING btree (kind, url);

CREATE INDEX wo_place_media_legacy_place_media ON wo_place_media_legacy USING btree (place_media_id);

CREATE INDEX wo_place_media_source_url ON wo_place_media USING btree (place_id, source_url);

CREATE INDEX wo_place_merge_candidate_pending ON wo_place_merge_candidate USING btree (created_at DESC) WHERE (state = 'pending'::text);

CREATE INDEX wo_place_merge_candidate_unapplied ON wo_place_merge_candidate USING btree (decided_at) WHERE ((state = 'approved'::text) AND (applied_at IS NULL) AND (apply_error IS NULL));

CREATE INDEX wo_place_ops_event_place ON wo_place_ops_event USING btree (place_id, created_at DESC);

CREATE INDEX wo_place_paid_receipt_lookup ON wo_place_paid_receipt USING btree (place_id, source, request_hash, created_at DESC);

CREATE INDEX wo_place_public_request_day ON wo_place_public_request USING btree (created_at) WHERE new_job;

CREATE INDEX wo_place_public_request_job ON wo_place_public_request USING btree (place_job_id);

CREATE INDEX wo_place_snapshot_place ON wo_place_snapshot USING btree (place_id, created_at DESC);

CREATE INDEX wo_places_cache_expires ON wo_places_cache USING btree (expires_at);

CREATE INDEX wo_site_check_queued ON wo_site_check USING btree (queued_at) WHERE (status = 'queued'::text);

CREATE INDEX wo_social_alias_owner ON wo_social_alias USING btree (owner_key);

CREATE INDEX wo_social_operation_queue ON wo_social_operation USING btree (status, queued_at);

CREATE UNIQUE INDEX wo_social_outbox_pending ON wo_social_outbox USING btree (origin, alias_key) WHERE (status = 'queued'::text);

CREATE INDEX wo_social_snapshot_identity ON wo_social_snapshot USING btree (identity_key, version DESC);

CREATE INDEX wo_social_stat_queued ON wo_social_stat USING btree (queued_at) WHERE (status = 'queued'::text);

CREATE TRIGGER wo_place_media_immutable BEFORE DELETE OR UPDATE ON wo_place_media FOR EACH ROW EXECUTE FUNCTION wo_place_media_guard();

CREATE TRIGGER wo_social_alias_revision BEFORE UPDATE ON wo_social_alias FOR EACH ROW EXECUTE FUNCTION wo_social_alias_revised();

CREATE TRIGGER wo_social_snapshot_immutable BEFORE DELETE OR UPDATE ON wo_social_snapshot FOR EACH ROW EXECUTE FUNCTION wo_social_snapshot_immutable();

CREATE TRIGGER wo_social_stat_revision BEFORE UPDATE ON wo_social_stat FOR EACH ROW EXECUTE FUNCTION wo_social_stat_revised();

ALTER TABLE ONLY wo_bulk_request
    ADD CONSTRAINT wo_bulk_request_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_cost_ledger
    ADD CONSTRAINT wo_cost_ledger_payer_account_id_fkey FOREIGN KEY (payer_account_id) REFERENCES wo_principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY wo_cost_ledger
    ADD CONSTRAINT wo_cost_ledger_prefetch_campaign_id_fkey FOREIGN KEY (prefetch_campaign_id) REFERENCES wo_prefetch_campaign(id);

ALTER TABLE ONLY wo_job
    ADD CONSTRAINT wo_job_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_job_attempt
    ADD CONSTRAINT wo_job_attempt_job_id_fkey FOREIGN KEY (job_id) REFERENCES wo_job(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_job
    ADD CONSTRAINT wo_job_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES wo_opportunity(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_job
    ADD CONSTRAINT wo_job_place_job_id_fkey FOREIGN KEY (place_job_id) REFERENCES wo_place_job(id);

ALTER TABLE ONLY wo_job
    ADD CONSTRAINT wo_job_result_snapshot_id_fkey FOREIGN KEY (result_snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_media
    ADD CONSTRAINT wo_media_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_media
    ADD CONSTRAINT wo_media_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES wo_opportunity(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_opportunity
    ADD CONSTRAINT wo_opportunity_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_opportunity
    ADD CONSTRAINT wo_opportunity_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_backfill
    ADD CONSTRAINT wo_place_backfill_from_opportunity_id_fkey FOREIGN KEY (from_opportunity_id) REFERENCES wo_opportunity(id) ON DELETE SET NULL;

ALTER TABLE ONLY wo_place_backfill
    ADD CONSTRAINT wo_place_backfill_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_backfill
    ADD CONSTRAINT wo_place_backfill_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place
    ADD CONSTRAINT wo_place_current_snapshot_fk FOREIGN KEY (current_snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_identity
    ADD CONSTRAINT wo_place_identity_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_import
    ADD CONSTRAINT wo_place_import_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_import
    ADD CONSTRAINT wo_place_import_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_job
    ADD CONSTRAINT wo_place_job_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_job
    ADD CONSTRAINT wo_place_job_prefetch_campaign_id_fkey FOREIGN KEY (prefetch_campaign_id) REFERENCES wo_prefetch_campaign(id);

ALTER TABLE ONLY wo_place_job
    ADD CONSTRAINT wo_place_job_snapshot_fk FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_job
    ADD CONSTRAINT wo_place_job_started_by_account_id_fkey FOREIGN KEY (started_by_account_id) REFERENCES wo_principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY wo_place_link
    ADD CONSTRAINT wo_place_link_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_media
    ADD CONSTRAINT wo_place_media_job_id_fkey FOREIGN KEY (job_id) REFERENCES wo_place_job(id);

ALTER TABLE ONLY wo_place_media_legacy
    ADD CONSTRAINT wo_place_media_legacy_place_media_id_fkey FOREIGN KEY (place_media_id) REFERENCES wo_place_media(id);

ALTER TABLE ONLY wo_place_media_legacy
    ADD CONSTRAINT wo_place_media_legacy_wo_media_id_fkey FOREIGN KEY (wo_media_id) REFERENCES wo_media(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_place_media
    ADD CONSTRAINT wo_place_media_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_media_rekey
    ADD CONSTRAINT wo_place_media_rekey_media_id_fkey FOREIGN KEY (media_id) REFERENCES wo_place_media(id);

ALTER TABLE ONLY wo_place_merge_candidate
    ADD CONSTRAINT wo_place_merge_candidate_google_place_id_fkey FOREIGN KEY (google_place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_merge_candidate
    ADD CONSTRAINT wo_place_merge_candidate_url_place_id_fkey FOREIGN KEY (url_place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place
    ADD CONSTRAINT wo_place_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_ops_event
    ADD CONSTRAINT wo_place_ops_event_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_paid_receipt
    ADD CONSTRAINT wo_place_paid_receipt_job_id_fkey FOREIGN KEY (job_id) REFERENCES wo_place_job(id);

ALTER TABLE ONLY wo_place_paid_receipt
    ADD CONSTRAINT wo_place_paid_receipt_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_paid_receipt
    ADD CONSTRAINT wo_place_paid_receipt_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES wo_cost_ledger(id);

ALTER TABLE ONLY wo_place_public_request
    ADD CONSTRAINT wo_place_public_request_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_public_request
    ADD CONSTRAINT wo_place_public_request_place_job_id_fkey FOREIGN KEY (place_job_id) REFERENCES wo_place_job(id);

ALTER TABLE ONLY wo_place_snapshot
    ADD CONSTRAINT wo_place_snapshot_base_snapshot_id_fkey FOREIGN KEY (base_snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_snapshot_import
    ADD CONSTRAINT wo_place_snapshot_import_import_id_fkey FOREIGN KEY (import_id) REFERENCES wo_place_import(id);

ALTER TABLE ONLY wo_place_snapshot_import
    ADD CONSTRAINT wo_place_snapshot_import_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_snapshot
    ADD CONSTRAINT wo_place_snapshot_job_id_fkey FOREIGN KEY (job_id) REFERENCES wo_place_job(id);

ALTER TABLE ONLY wo_place_snapshot_media
    ADD CONSTRAINT wo_place_snapshot_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES wo_place_media(id);

ALTER TABLE ONLY wo_place_snapshot_media
    ADD CONSTRAINT wo_place_snapshot_media_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_snapshot
    ADD CONSTRAINT wo_place_snapshot_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_place_snapshot_profile
    ADD CONSTRAINT wo_place_snapshot_profile_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_snapshot_source
    ADD CONSTRAINT wo_place_snapshot_source_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wo_place_snapshot(id);

ALTER TABLE ONLY wo_place_social_link
    ADD CONSTRAINT wo_place_social_link_place_id_kind_url_fkey FOREIGN KEY (place_id, kind, url) REFERENCES wo_place_link(place_id, kind, url);

ALTER TABLE ONLY wo_preference
    ADD CONSTRAINT wo_preference_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_prefetch_seed
    ADD CONSTRAINT wo_prefetch_seed_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES wo_prefetch_campaign(id);

ALTER TABLE ONLY wo_prefetch_seed
    ADD CONSTRAINT wo_prefetch_seed_job_id_fkey FOREIGN KEY (job_id) REFERENCES wo_place_job(id);

ALTER TABLE ONLY wo_prefetch_seed
    ADD CONSTRAINT wo_prefetch_seed_place_id_fkey FOREIGN KEY (place_id) REFERENCES wo_place(id);

ALTER TABLE ONLY wo_prefetch_source_page
    ADD CONSTRAINT wo_prefetch_source_page_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES wo_cost_ledger(id);

ALTER TABLE ONLY wo_prefetch_source_page
    ADD CONSTRAINT wo_prefetch_source_page_source_key_fkey FOREIGN KEY (source_key) REFERENCES wo_prefetch_source_batch(source_key);

ALTER TABLE ONLY wo_profile
    ADD CONSTRAINT wo_profile_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES wo_opportunity(id) ON DELETE CASCADE;

ALTER TABLE ONLY wo_social_alias
    ADD CONSTRAINT wo_social_alias_owner_key_fkey FOREIGN KEY (owner_key) REFERENCES wo_social_stat(stat_key);

ALTER TABLE ONLY wo_social_operation
    ADD CONSTRAINT wo_social_operation_deployment_id_fkey FOREIGN KEY (deployment_id) REFERENCES wo_social_deployment(deployment_id);

ALTER TABLE ONLY wo_social_replica_alias
    ADD CONSTRAINT wo_social_replica_alias_origin_authority_id_fkey FOREIGN KEY (origin, authority_id) REFERENCES wo_social_replica_authority(origin, authority_id);

ALTER TABLE ONLY wo_social_replica_identity
    ADD CONSTRAINT wo_social_replica_identity_origin_authority_id_fkey FOREIGN KEY (origin, authority_id) REFERENCES wo_social_replica_authority(origin, authority_id);

ALTER TABLE ONLY wo_social_service_key
    ADD CONSTRAINT wo_social_service_key_deployment_id_fkey FOREIGN KEY (deployment_id) REFERENCES wo_social_deployment(deployment_id);

ALTER TABLE ONLY wo_social_snapshot
    ADD CONSTRAINT wo_social_snapshot_identity_key_fkey FOREIGN KEY (identity_key) REFERENCES wo_social_stat(stat_key);

ALTER TABLE ONLY wo_source
    ADD CONSTRAINT wo_source_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES wo_opportunity(id) ON DELETE CASCADE;

