-- A deployment opts in through Ops; the original one-background-job behavior stays the default.
alter table wo_prefetch_campaign add column max_concurrency integer not null default 1
  check(max_concurrency between 1 and 3);
