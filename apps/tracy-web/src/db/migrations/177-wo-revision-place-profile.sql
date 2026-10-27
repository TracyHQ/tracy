-- The existing revision trigger also protects this host-owned snapshot and its assessments.
-- Historical revisions remain readable without a profile; new research keys name this snapshot version.
alter table wo_revision add column if not exists place_profile jsonb;
alter table wo_revision drop constraint if exists wo_revision_place_profile_check;
alter table wo_revision add constraint wo_revision_place_profile_check check (
  place_profile is null or ((
    jsonb_typeof(place_profile) = 'object'
    and place_profile ?& array['profile', 'profileSchemaVersion', 'converterVersion', 'profileHash', 'origin', 'assessment']
    and jsonb_typeof(place_profile->'profile') = 'object'
    and (place_profile->>'profileHash') ~ '^[0-9a-f]{64}$'
    and place_profile->'assessment'->>'profileHash' = place_profile->>'profileHash'
  ) is true)
);
