-- Analytics outlive the mutable site registry. A reused key is not the same site incarnation.
-- Null means the historical incarnation/classification is not recoverable, never non-demo.
alter table ops_signal add column site_instance timestamptz;
alter table ops_signal add column site_demo boolean;
alter table site_turn add column site_instance timestamptz;
alter table site_turn add column site_demo boolean;

-- Only the surviving incarnation can be classified from today's registry. Older rows may belong
-- to a deleted demo and must remain unknown. Do not infer anything for a missing registry row.
update ops_signal h set site_instance = s.created_at, site_demo = s.demo
  from site s where h.site_key = s.site_key and h.occurred_at >= s.created_at;
update site_turn h set site_instance = s.created_at, site_demo = s.demo
  from site s where h.site_key = s.site_key and h.opened_at >= s.created_at;

create function snapshot_ops_site_history() returns trigger language plpgsql as $$
declare
  recorded_at timestamptz;
  instance_at timestamptz;
  is_demo boolean;
begin
  if new.site_key is null then return new; end if;
  if TG_TABLE_NAME = 'site_turn' then recorded_at := new.opened_at;
  else recorded_at := new.occurred_at;
  end if;
  select s.created_at, s.demo into instance_at, is_demo from site s
    where s.site_key = new.site_key and s.created_at <= recorded_at;
  if new.site_instance is null then new.site_instance := instance_at; end if;
  if new.site_demo is null and new.site_instance = instance_at then new.site_demo := is_demo; end if;
  return new;
end $$;

create trigger ops_signal_site_history before insert on ops_signal
  for each row execute function snapshot_ops_site_history();
create trigger site_turn_site_history before insert on site_turn
  for each row execute function snapshot_ops_site_history();
