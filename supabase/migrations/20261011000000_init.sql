-- Prayer List: accounts, synced personal prayers, and small groups.
--
-- Privacy model
--   * A prayer row is readable only by its owner. If the owner shares it with a
--     group they belong to, members can read its shared parts (title, details,
--     updates, answer) through group_requests(); personal fields such as
--     follow-up dates, schedules and prayer counts stay private.
--   * Only the owner can change or delete a prayer.
--   * Group members see each other's display names, never email addresses.
--   * Anonymous (signed-out) requests can read nothing.

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

-- Every new account gets a profile. The name starts blank (never derived from the
-- email, which stays private); the app asks for one before you use groups.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- groups

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------- prayers

create table public.prayers (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  title text not null check (char_length(title) <= 500),
  details text not null default '' check (char_length(details) <= 10000),
  person text not null default '' check (char_length(person) <= 200),
  tags text[] not null default '{}',
  scripture text not null default '' check (char_length(scripture) <= 1000),
  status text not null default 'active' check (status in ('active', 'answered', 'archived')),
  schedule jsonb not null default '{"kind":"auto"}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  -- Client clock of the latest change, including "I prayed" taps; newest wins when two devices disagree.
  changed_at timestamptz not null,
  answered_at timestamptz,
  answer_note text not null default '' check (char_length(answer_note) <= 10000),
  prayed_count integer not null default 0 check (prayed_count >= 0),
  last_prayed_at timestamptz,
  follow_up_on date,
  updates jsonb not null default '[]',
  -- Deleted prayers are kept as empty tombstones so other devices learn about the delete.
  deleted boolean not null default false,
  -- Server clock, used as the cursor for incremental pulls.
  server_updated_at timestamptz not null default now()
);

create index prayers_owner_sync_idx on public.prayers (owner_id, server_updated_at);
create index prayers_group_idx on public.prayers (group_id) where group_id is not null and not deleted;

create function public.touch_server_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger prayers_touch
  before insert or update on public.prayers
  for each row execute function public.touch_server_updated_at();

-- "I prayed" taps from group members, at most one per person per prayer per day.
create table public.intercessions (
  prayer_id uuid not null references public.prayers (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  prayed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (prayer_id, user_id, prayed_on)
);

create index intercessions_user_idx on public.intercessions (user_id);

-- ---------------------------------------------------------------- access helpers
-- security definer so policies can check membership without recursing into RLS.

create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create function public.is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'owner');
$$;

create function public.shares_group_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

create function public.can_see_prayer(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.prayers p
    where p.id = pid and not p.deleted
      and (p.owner_id = auth.uid() or (p.group_id is not null and public.is_group_member(p.group_id)))
  );
$$;

-- ---------------------------------------------------------------- group actions

create function public.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
$$;

create function public.create_group(group_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.groups (name, invite_code, created_by)
  values (btrim(group_name), public.new_invite_code(), auth.uid())
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'owner');
  return g;
end;
$$;

create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into gid from public.groups where invite_code = btrim(code);
  if gid is null then
    raise exception 'That invite link is not valid. Ask for a new one.';
  end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid())
  on conflict do nothing;
  return gid;
end;
$$;

-- Lets an owner invalidate an invite link that has been shared too widely.
create function public.reset_invite_code(gid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.is_group_owner(gid) then
    raise exception 'Only the group owner can do that';
  end if;
  update public.groups set invite_code = public.new_invite_code() where id = gid returning invite_code into code;
  return code;
end;
$$;

-- When someone leaves (or is removed from) a group, their requests stop being shared with it.
create function public.unshare_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.prayers set group_id = null where owner_id = old.user_id and group_id = old.group_id;
  return old;
end;
$$;

create trigger group_members_unshare
  after delete on public.group_members
  for each row execute function public.unshare_on_leave();

-- What group members see of each other's requests.
create function public.group_requests(gid uuid)
returns table (
  id uuid, owner_id uuid, owner_name text, title text, details text, person text, tags text[],
  status text, answered_at timestamptz, answer_note text, updates jsonb,
  created_at timestamptz, updated_at timestamptz, intercessions jsonb
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.owner_id, owner.display_name, p.title, p.details, p.person, p.tags,
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

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.prayers enable row level security;
alter table public.intercessions enable row level security;

create policy "see own and fellow members' profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group_with(id));
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members see their groups" on public.groups
  for select to authenticated using (public.is_group_member(id));
create policy "owners rename groups" on public.groups
  for update to authenticated using (public.is_group_owner(id)) with check (public.is_group_owner(id));
create policy "owners delete groups" on public.groups
  for delete to authenticated using (public.is_group_owner(id));

create policy "members see fellow members" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
-- Members may leave; owners may remove others. Owners can't leave (they delete the group instead).
create policy "leave or remove members" on public.group_members
  for delete to authenticated using (
    (user_id = auth.uid() and role <> 'owner') or (user_id <> auth.uid() and public.is_group_owner(group_id))
  );

create policy "see own prayers" on public.prayers
  for select to authenticated using (owner_id = auth.uid());
create policy "add own prayers" on public.prayers
  for insert to authenticated with check (
    owner_id = auth.uid() and (group_id is null or public.is_group_member(group_id))
  );
create policy "change own prayers" on public.prayers
  for update to authenticated using (owner_id = auth.uid()) with check (
    owner_id = auth.uid() and (group_id is null or public.is_group_member(group_id))
  );
create policy "delete own prayers" on public.prayers
  for delete to authenticated using (owner_id = auth.uid());

create policy "see who prayed for visible prayers" on public.intercessions
  for select to authenticated using (public.can_see_prayer(prayer_id));
create policy "record own prayers for visible prayers" on public.intercessions
  for insert to authenticated with check (user_id = auth.uid() and public.can_see_prayer(prayer_id));
create policy "remove own intercessions" on public.intercessions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- grants
-- Signed-out visitors get nothing; signed-in users only what the policies above allow.

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_group(text), public.join_group(text), public.reset_invite_code(uuid), public.group_requests(uuid),
  public.is_group_member(uuid), public.is_group_owner(uuid), public.shares_group_with(uuid), public.can_see_prayer(uuid)
  to authenticated;
