-- Fix: reminders set after 9 PM never fired, because the 3-hour sending window
-- was compared as times of day and wrapped past midnight. Now each person's most
-- recent reminder moment is worked out as a date and time, so the window can
-- run into the next day.

create or replace function public.enqueue_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  queued integer := 0;
  s record;
  local_now timestamp;
  due timestamp;
begin
  for s in
    select * from public.notification_settings
    where daily_reminder
    for update skip locked
  loop
    local_now := now() at time zone s.timezone;
    -- The latest reminder moment at or before now: today's, or yesterday's if today's is still ahead.
    due := local_now::date + s.reminder_time;
    if due > local_now then
      due := due - interval '1 day';
    end if;
    if local_now - due < interval '3 hours'
       and (s.last_reminded_on is null or s.last_reminded_on < due::date) then
      update public.notification_settings set last_reminded_on = due::date where user_id = s.user_id;
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

revoke execute on function public.enqueue_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_reminders() to service_role;
