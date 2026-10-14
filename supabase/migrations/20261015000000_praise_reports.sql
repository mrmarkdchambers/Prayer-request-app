-- Praise reports: entries for things to give thanks for, stored alongside
-- prayer requests (status 'answered', answered_at = the day of the praise),
-- shareable with groups, with a "Praise God" reaction (an intercession row).

alter table public.prayers
  add column kind text not null default 'request' check (kind in ('request', 'praise'));

-- The group view now says which entries are praise reports.
drop function public.group_requests(uuid);
create function public.group_requests(gid uuid)
returns table (
  id uuid, kind text, owner_id uuid, owner_name text, title text, details text, person text, tags text[],
  status text, answered_at timestamptz, answer_note text, updates jsonb,
  created_at timestamptz, updated_at timestamptz, intercessions jsonb
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.owner_id, owner.display_name, p.title, p.details, p.person, p.tags,
    p.status, p.answered_at, p.answer_note, p.updates, p.created_at, p.updated_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', i.user_id, 'prayed_on', i.prayed_on, 'display_name', who.display_name)
                       order by i.prayed_on desc)
      from public.intercessions i join public.profiles who on who.id = i.user_id
      where i.prayer_id = p.id
    ), '[]'::jsonb)
  from public.prayers p
  join public.profiles owner on owner.id = p.owner_id
  where p.group_id = gid and not p.deleted and p.status <> 'archived' and public.is_group_member(gid)
  order by p.updated_at desc;
$$;

revoke execute on function public.group_requests(uuid) from public, anon;
grant execute on function public.group_requests(uuid) to authenticated;

-- "Bob prayed for you" / "Bob is praising God with you"
create or replace function public.notify_intercession() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  select id, owner_id, title, kind into p from public.prayers where id = new.prayer_id;
  if p.owner_id is null or p.owner_id = new.user_id then
    return new;
  end if;
  perform public.queue_notification(
    p.owner_id, 'prayed_for_me',
    public.display_name_of(new.user_id) || case when p.kind = 'praise' then ' is praising God with you' else ' prayed for you' end,
    p.title,
    '/#/prayers/' || p.id
  );
  return new;
end;
$$;

-- New requests, new praise reports, and answered requests in your groups.
create or replace function public.notify_group_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  group_name text;
  owner_name text;
  member uuid;
  heading text;
  newly_shared boolean;
  newly_answered boolean;
begin
  if new.group_id is null or new.deleted then
    return new;
  end if;
  newly_shared := (tg_op = 'INSERT' or old.group_id is distinct from new.group_id)
    and (new.status = 'active' or (new.kind = 'praise' and new.status <> 'archived'));
  newly_answered := new.kind = 'request' and tg_op = 'UPDATE'
    and new.status = 'answered' and old.status is distinct from 'answered';
  if not (newly_shared or newly_answered) then
    return new;
  end if;

  select name into group_name from public.groups where id = new.group_id;
  owner_name := public.display_name_of(new.owner_id);
  heading := case
    when new.kind = 'praise' then 'New praise report in '
    when newly_answered then 'Answered prayer in '
    else 'New request in '
  end || group_name;

  for member in
    select user_id from public.group_members where group_id = new.group_id and user_id <> new.owner_id
  loop
    perform public.queue_notification(
      member, 'group_activity', heading,
      owner_name || ': ' || new.title,
      '/#/groups/' || new.group_id
    );
  end loop;
  return new;
end;
$$;
