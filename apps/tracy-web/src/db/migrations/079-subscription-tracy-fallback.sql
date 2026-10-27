-- Account-wide consent to use the deployment model after subscription failure.
alter table seat_plan_routing add column tracy_fallback boolean not null default true;
