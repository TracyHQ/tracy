-- Shared research hub, intake half (ADR 0036 Phase 3): accounts and their one token, quota use, contributions,
-- the typed observations they carry, and the evidence the hub gathered itself to decide each observation.
-- A contributor's `source` and `observedAtClaimed` are claims kept for comparison; who sent it and when it arrived
-- are recorded by the hub. Publishing (snapshots, changes feed, revocations) reads these tables from 0003.

-- One hub account per principal. Quota, receipts and history belong to the account, never to a token.
CREATE TABLE wo_hub_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    principal_id uuid NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_hub_account_pkey PRIMARY KEY (id),
    CONSTRAINT wo_hub_account_principal_id_key UNIQUE (principal_id),
    CONSTRAINT wo_hub_account_principal_id_fkey FOREIGN KEY (principal_id) REFERENCES wo_principal(id) ON DELETE CASCADE,
    CONSTRAINT wo_hub_account_state_check CHECK ((state = ANY (ARRAY['active'::text, 'blocked'::text])))
);

-- Only a sha256 of a token is stored. Rotation revokes the active token and inserts a new one in one transaction.
CREATE TABLE wo_hub_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT wo_hub_token_pkey PRIMARY KEY (id),
    CONSTRAINT wo_hub_token_token_hash_key UNIQUE (token_hash),
    CONSTRAINT wo_hub_token_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_hub_account(id) ON DELETE CASCADE,
    CONSTRAINT wo_hub_token_hash_shape CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);

CREATE UNIQUE INDEX wo_hub_token_one_active ON wo_hub_token USING btree (account_id) WHERE (revoked_at IS NULL);

-- Use per account, category and calendar period (UTC day, UTC month). Day and month limits apply together.
CREATE TABLE wo_hub_quota_use (
    account_id uuid NOT NULL,
    category text NOT NULL,
    period text NOT NULL,
    period_start date NOT NULL,
    used bigint DEFAULT 0 NOT NULL,
    CONSTRAINT wo_hub_quota_use_pkey PRIMARY KEY (account_id, category, period, period_start),
    CONSTRAINT wo_hub_quota_use_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_hub_account(id) ON DELETE CASCADE,
    CONSTRAINT wo_hub_quota_use_category_check CHECK ((category = ANY (ARRAY['read_places'::text, 'research'::text, 'observations'::text, 'image_bytes'::text]))),
    CONSTRAINT wo_hub_quota_use_period_check CHECK ((period = ANY (ARRAY['day'::text, 'month'::text]))),
    CONSTRAINT wo_hub_quota_use_used_check CHECK ((used >= 0))
);

-- One accepted request. The same account and idempotency key with the same payload hash is the same receipt.
CREATE TABLE wo_hub_contribution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    schema_version text NOT NULL,
    payload_bytes integer NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    withdrawn_at timestamp with time zone,
    CONSTRAINT wo_hub_contribution_pkey PRIMARY KEY (id),
    CONSTRAINT wo_hub_contribution_account_key UNIQUE (account_id, idempotency_key),
    CONSTRAINT wo_hub_contribution_account_id_fkey FOREIGN KEY (account_id) REFERENCES wo_hub_account(id) ON DELETE CASCADE,
    CONSTRAINT wo_hub_contribution_payload_hash_shape CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT wo_hub_contribution_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'decided'::text, 'withdrawn'::text])))
);

-- One typed claim. `value` is the hub's normalized form (null when refused at intake). `reason` explains a rejection
-- or why a pending one waits (`deferred_budget`).
CREATE TABLE wo_hub_observation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contribution_id uuid NOT NULL,
    ordinal integer NOT NULL,
    subject_namespace text NOT NULL,
    subject_external_id text NOT NULL,
    field text NOT NULL,
    value jsonb,
    claimed_source_family text,
    claimed_source_object_id text,
    observed_at_claimed timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    decided_at timestamp with time zone,
    policy_version text NOT NULL,
    CONSTRAINT wo_hub_observation_pkey PRIMARY KEY (id),
    CONSTRAINT wo_hub_observation_contribution_ordinal UNIQUE (contribution_id, ordinal),
    CONSTRAINT wo_hub_observation_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES wo_hub_contribution(id) ON DELETE CASCADE,
    CONSTRAINT wo_hub_observation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text]))),
    CONSTRAINT wo_hub_observation_decided CHECK (((status = 'pending'::text) = (decided_at IS NULL)))
);

CREATE INDEX wo_hub_observation_pending ON wo_hub_observation USING btree (claimed_source_family, claimed_source_object_id) WHERE (status = 'pending'::text);

CREATE INDEX wo_hub_observation_subject ON wo_hub_observation USING btree (subject_namespace, subject_external_id, field);

-- What the hub itself read to decide an observation. `source_group` is hub-determined (`<family>:<object id>`): many
-- accounts resending the same Google record are one group, and one fetch (`fetch_id`) serves every observation of it.
CREATE TABLE wo_hub_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    observation_id uuid NOT NULL,
    source_family text NOT NULL,
    source_object_id text NOT NULL,
    source_group text NOT NULL,
    fetch_id uuid NOT NULL,
    fetched_at timestamp with time zone NOT NULL,
    content_hash text NOT NULL,
    collector_version text NOT NULL,
    result jsonb NOT NULL,
    CONSTRAINT wo_hub_evidence_pkey PRIMARY KEY (id),
    CONSTRAINT wo_hub_evidence_observation_id_key UNIQUE (observation_id),
    CONSTRAINT wo_hub_evidence_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES wo_hub_observation(id) ON DELETE CASCADE,
    CONSTRAINT wo_hub_evidence_content_hash_shape CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text))
);

CREATE INDEX wo_hub_evidence_group ON wo_hub_evidence USING btree (source_group, fetched_at DESC);
