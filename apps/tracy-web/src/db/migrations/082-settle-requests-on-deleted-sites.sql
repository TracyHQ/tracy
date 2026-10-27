-- Close the invitations and requests left open on sites that were deleted before the delete
-- learned to close them (live on dev 09/10/2026: Accept on e2ef-jo, a site deleted on 04/10, could
-- only fail). No outcome is written: nobody answered them.
update notification n set settled_at = now()
 where n.settled_at is null
   and n.kind in ('team.invited', 'team.join_request', 'team.edit_access_request')
   and n.site_key is not null
   and not exists (select 1 from site s where s.site_key = n.site_key);
