-- A seat its holder gave up is "left", not "revoked" (04/10/2026: the Team tab showed
-- "Revoked" for a member who pressed Leave in My Sites). `removal_kind` gains a fourth value, written
-- by the leave door in the same statement as `revoked_at`.
alter table seat drop constraint seat_removal_kind_known;
alter table seat
  add constraint seat_removal_kind_known
    check (removal_kind in ('revoke', 'cancel_invite', 'decline_request', 'left'));

-- BACKFILLED FROM A RECORD, NEVER GUESSED. A leave since #855 wrote a `team.left` notification for
-- the remaining team, naming the person who left as its actor; a revoked seat with no kind and such a
-- row after its grant was a leave. A leave with nobody left to tell wrote no row and stays unknown.
update seat s
   set removal_kind = 'left'
 where s.revoked_at is not null
   and s.removal_kind is null
   and exists (
     select 1 from notification n
      where n.kind = 'team.left'
        and n.site_key = s.site_key
        and n.actor_account_id = s.account_id
        and n.created_at >= s.granted_at
   );
