-- A site brief is the research frozen once and names no CMS or template; the build holds what it was built with.
-- `choice`: {cms, cmsSource, resolvedAt, template, quickstartWorkflow, executionProfile?, picturePolicy?, reviewMode?, briefMd}.
-- `choice_key`: what one live build per (brief, choice) is keyed on (`build-choice.js` `choiceKey`).
alter table wo_build add column if not exists choice jsonb;
alter table wo_build add column if not exists choice_key text;

update wo_build b set
  choice = jsonb_strip_nulls(jsonb_build_object(
    'cms', r.cms,
    'cmsSource', r.cms_source,
    'resolvedAt', to_char(r.resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'template', r.template,
    'quickstartWorkflow', r.brief->'quickstartWorkflow',
    'executionProfile', r.brief->'executionProfile',
    'picturePolicy', r.brief->'picturePolicy',
    'reviewMode', r.brief->'reviewMode',
    'briefMd', r.brief_md
  )),
  -- Same text as `choiceKey` in JS: a missing part is an empty string, never dropped.
  choice_key = coalesce(r.cms, '') || '|' || coalesce(r.template->>'quickstart', '') || '|' ||
    coalesce(r.template->>'design', '') || '|' || coalesce(r.template->>'version', '') || '|' ||
    coalesce(r.brief->>'quickstartWorkflow', '')
from wo_revision r
where r.id = b.revision_id and b.choice is null;

alter table wo_build alter column choice set not null;
alter table wo_build alter column choice_key set not null;
create index if not exists wo_build_revision_choice on wo_build (revision_id, choice_key);

-- One brief per distinct research read: a build finds the brief of the same research instead of writing another.
alter table wo_revision add column if not exists research_hash text;
create unique index if not exists wo_revision_research on wo_revision (opportunity_id, research_hash)
  where research_hash is not null;

alter table wo_revision drop column if exists cms;
alter table wo_revision drop column if exists cms_source;
alter table wo_revision drop column if exists resolved_at;
alter table wo_revision drop column if exists template;
