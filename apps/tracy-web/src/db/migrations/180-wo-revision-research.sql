-- The research a revision was made from, kept once (#1791 V2): the brief references it and the place profile by
-- hash (`brief.agentDemoResearch`) instead of embedding a copy (`brief.agentDemoSnapshot`). Revisions made before
-- keep their embedded copy and a null column; the existing revision trigger keeps this column immutable too.
alter table wo_revision add column if not exists research jsonb;
alter table wo_revision drop constraint if exists wo_revision_research_check;
alter table wo_revision add constraint wo_revision_research_check check (
  research is null or jsonb_typeof(research) = 'object'
);
