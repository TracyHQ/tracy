-- What aMember said the person is entitled to at their last "Login with JoomlArt" (plan
-- tasks/todo-tai-joomlart-qua-tracy.md, B3): the `entitlement` array of the signed SSO response,
-- kept as sent (`[{product_id, name, expires_at, paid}]`). Null for every identity that is not
-- joomlart, and for a joomlart identity written before this column existed. Replaced, never merged,
-- on each sign-in: aMember is the source, this is a copy for the beta admission rule and for /ops.
alter table identity add column entitlement jsonb;
