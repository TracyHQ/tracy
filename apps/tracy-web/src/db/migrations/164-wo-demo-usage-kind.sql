-- Build from my business has its own daily cap (`ownSiteBuildsPerAccountPerDay`): its builds are counted
-- apart from Website Opportunities demo builds, so trying demos never uses up the customer's own site.
alter table wo_demo_usage add column kind text not null default 'demo' check (kind in ('demo', 'own-site'));
alter table wo_demo_usage drop constraint wo_demo_usage_pkey;
alter table wo_demo_usage add primary key (account_id, day, kind);
