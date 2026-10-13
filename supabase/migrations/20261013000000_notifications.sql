-- Notifications (web push and native app push), daily reminders, and account deletion.
--
-- How it fits together
--   * Devices register a push subscription (register_push).
--   * Triggers queue notifications in public.notifications when someone prays
--     for your request or a group you're in gets a new or answered request.
--   * enqueue_reminders() queues each person's daily reminder at their local time.
--   * The "notify" edge function, run every minute by a cron job, queues the
--     reminders and delivers everything waiting.

-- ---------------------------------------------------------------- settings

create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  prayed_for_me boolean not null default true,
  group_activity boolean not null default true,
  daily_reminder boolean not null default false,
  reminder_time time not null default '07:30',
  timezone text not null default 'UTC',
  last_reminded_on date,
  updated_at timestamptz not null default now()
);

-- Validates the time zone and makes sure turning on (or moving) a reminder
-- doesn't fire one immediately for a time that has already passed today.
create function public.prepare_notification_settings() returns trigger
language plpgsql set search_path = '' as $$
declare
  local_now timestamp;
begin
  begin
    local_now := now() at time zone new.timezone;
  exception when others then
    raise exception 'Unknown time zone: %', new.timezone;
  end;
  if tg_op = 'INSERT'
     or new.reminder_time is distinct from old.reminder_time
     or new.timezone is distinct from old.timezone
     or (new.daily_reminder and not old.daily_reminder) then
    new.last_reminded_on := case
      when local_now::time >= new.reminder_time then local_now::date
      else local_now::date - 1
    end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_settings_prepare
  before insert or update on public.notification_settings
  for each row execute function public.prepare_notification_settings();

-- ---------------------------------------------------------------- devices

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('web', 'fcm', 'apns')),
  -- Web: the push service URL. Native: the device token.
  endpoint text not null unique check (char_length(endpoint) <= 2000),
  p256dh text check (char_length(p256dh) <= 200),
  auth_secret text check (char_length(auth_secret) <= 100),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- A device can only belong to whoever is signed in on it now.
create function public.register_push(kind text, endpoint text, p256dh text default null, auth_secret text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if kind = 'web' and (p256dh is null or auth_secret is null) then
    raise exception 'Web push subscriptions need keys';
  end if;
  delete from public.push_subscriptions s where s.endpoint = register_push.endpoint;
  insert into public.push_subscriptions (user_id, kind, endpoint, p256dh, auth_secret)
  values (auth.uid(), register_push.kind, register_push.endpoint, register_push.p256dh, register_push.auth_secret);
end;
$$;

-- ---------------------------------------------------------------- outbox

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz
);

create index notifications_pending_idx on public.notifications (id) where sent_at is null;

-- Only queue for people who have a device to receive it and want this kind.
create function public.queue_notification(recipient uuid, kind text, title text, body text, url text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.push_subscriptions where user_id = recipient) then
    return;
  end if;
  if exists (
    select 1 from public.notification_settings s
    where s.user_id = recipient
      and ((kind = 'prayed_for_me' and not s.prayed_for_me) or (kind = 'group_activity' and not s.group_activity))
  ) then
    return;
  end if;
  insert into public.notifications (user_id, title, body, url)
  values (recipient, left(title, 120), left(body, 240), url);
end;
$$;

create function public.display_name_of(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(display_name), ''), 'Someone') from public.profiles where id = uid;
$$;

-- "Bob prayed for your request"
create function public.notify_intercession() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  select id, owner_id, title into p from public.prayers where id = new.prayer_id;
  if p.owner_id is null or p.owner_id = new.user_id then
    return new;
  end if;
  perform public.queue_notification(
    p.owner_id, 'prayed_for_me',
    public.display_name_of(new.user_id) || ' prayed for you',
    p.title,
    '/#/prayers/' || p.id
  );
  return new;
end;
$$;

create trigger intercessions_notify
  after insert on public.intercessions
  for each row execute function public.notify_intercession();

-- New and answered requests in your groups.
create function public.notify_group_activity() returns trigger
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
  newly_shared := new.status = 'active' and (tg_op = 'INSERT' or old.group_id is distinct from new.group_id);
  newly_answered := tg_op = 'UPDATE' and new.status = 'answered' and old.status is distinct from 'answered';
  if not (newly_shared or newly_answered) then
    return new;
  end if;

  select name into group_name from public.groups where id = new.group_id;
  owner_name := public.display_name_of(new.owner_id);
  heading := case when newly_answered then 'Answered prayer in ' else 'New request in ' end || group_name;

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

create trigger prayers_notify_group
  after insert or update of group_id, status, deleted on public.prayers
  for each row execute function public.notify_group_activity();

-- Queues today's reminder for everyone whose local reminder time has passed,
-- within a 3-hour window so a delayed run doesn't send reminders at midnight.
create function public.enqueue_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  queued integer := 0;
  s record;
  local_now timestamp;
begin
  for s in
    select * from public.notification_settings
    where daily_reminder
    for update skip locked
  loop
    local_now := now() at time zone s.timezone;
    if local_now::time >= s.reminder_time
       and local_now::time < s.reminder_time + interval '3 hours'
       and (s.last_reminded_on is null or s.last_reminded_on < local_now::date) then
      update public.notification_settings set last_reminded_on = local_now::date where user_id = s.user_id;
      if exists (select 1 from public.push_subscriptions where user_id = s.user_id) then
        insert into public.notifications (user_id, title, body, url)
        values (s.user_id, 'Time to pray', 'Your prayers for today are ready.', '/#/session');
        queued := queued + 1;
      end if;
    end if;
  end loop;
  return queued;
end;
$$;

-- Hands the sender a batch of waiting notifications. A batch claimed by a run
-- that crashed is retried after two minutes; each notification gets 5 tries.
create function public.claim_notifications(batch integer default 200)
returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications n
  set claimed_at = now(), attempts = n.attempts + 1
  where n.id in (
    select id from public.notifications
    where sent_at is null and attempts < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by id
    limit batch
    for update skip locked
  )
  returning n.*;
$$;

-- Clears out delivered notifications after a week.
create function public.prune_notifications() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications
  where (sent_at is not null and sent_at < now() - interval '7 days')
     or (sent_at is null and created_at < now() - interval '7 days');
$$;

-- ---------------------------------------------------------------- web push keys
-- Generated by the notify function on first use; readable only by the server.

create table public.push_keys (
  id integer primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- account deletion

-- Required by the app stores. Groups you lead pass to the longest-standing
-- member; groups with no one else in them are deleted.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g record;
  successor uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  for g in select group_id from public.group_members where user_id = me and role = 'owner' loop
    select user_id into successor from public.group_members
    where group_id = g.group_id and user_id <> me
    order by joined_at, user_id
    limit 1;
    if successor is null then
      delete from public.groups where id = g.group_id;
    else
      update public.group_members set role = 'owner' where group_id = g.group_id and user_id = successor;
      update public.groups set created_by = successor where id = g.group_id;
    end if;
  end loop;
  delete from auth.users where id = me;
end;
$$;

-- ---------------------------------------------------------------- security

alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.push_keys enable row level security;

create policy "own notification settings" on public.notification_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "see own devices" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "remove own devices" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
-- notifications and push_keys: no policies, so only the server (service role) can use them.

revoke all on public.notification_settings, public.push_subscriptions, public.notifications, public.push_keys from anon;
revoke all on public.notifications, public.push_keys from authenticated;
revoke execute on function
  public.register_push(text, text, text, text), public.queue_notification(uuid, text, text, text, text),
  public.display_name_of(uuid), public.enqueue_reminders(), public.claim_notifications(integer),
  public.prune_notifications(), public.delete_account()
  from public, anon, authenticated;
grant execute on function public.register_push(text, text, text, text), public.delete_account() to authenticated;
grant execute on function public.enqueue_reminders(), public.claim_notifications(integer), public.prune_notifications() to service_role;
