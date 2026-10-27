-- Tracy's own count of the account's live demos and its limit (`demos: {live, limit}` of /v1/demos), as of the last
-- answer about this demo: the Build card shows it under the button.
alter table wo_tracy_demo add column demos jsonb;
