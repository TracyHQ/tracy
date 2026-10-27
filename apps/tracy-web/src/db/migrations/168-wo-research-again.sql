-- Research again (tasks/todo-wo-research-again.md): a run that looks again only at what failed, is out of date or was
-- never tried. `again_plan` freezes the parts the person accepted in the preview ({run: [{part, reason, ceilingCents}],
-- ceilingCents}); the run may drop a part that is no longer due, never add one. NULL = an ordinary run.
alter table wo_place_job add column if not exists again_plan jsonb;

-- The web search for a place's Facebook and Instagram pages is a part of its own, one per network, so a row of the
-- research card can be tried again alone.
alter table wo_place_job drop constraint if exists wo_place_job_only_source_check;
alter table wo_place_job add constraint wo_place_job_only_source_check
  check (only_source is null or only_source in ('logo', 'website', 'facebook', 'instagram', 'tiktok', 'youtube',
    'google-places', 'google-maps', 'tripadvisor', 'facebook-search', 'instagram-search'));

-- /ops events of the two new operator actions: a Research again of a place, and a verdict on a social page its web
-- search left for a person to check.
alter table wo_place_ops_event drop constraint if exists wo_place_ops_event_action_check;
alter table wo_place_ops_event add constraint wo_place_ops_event_action_check
  check (action in ('refresh', 'revoke', 'unrevoke', 'merge', 'split', 'approve-merge', 'reject-merge',
    'research-again', 'social-page'));
