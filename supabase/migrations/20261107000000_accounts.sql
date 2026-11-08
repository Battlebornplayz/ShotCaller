-- ShotCaller Phase 4: accounts and cloud sync.
-- Every table has row-level security on. Clients use the anon key plus the user's JWT;
-- anything only the server may write (Steam links, XP, the achievements cache) goes
-- through Edge Functions with the service role.

-- ---------------------------------------------------------------- helpers

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name     text not null check (char_length(display_name) between 1 and 32),
  bio              text not null default '' check (char_length(bio) <= 160),
  avatar_url       text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  banner_url       text check (banner_url is null or (banner_url ~ '^https://' and char_length(banner_url) <= 500)),
  -- public: anyone signed in can see it; friends: accepted friends only; private: only you.
  visibility       text not null default 'public' check (visibility in ('public', 'friends', 'private')),
  -- Written only by the steam-auth Edge Function after Steam OpenID proves ownership.
  steam_id         text unique check (steam_id is null or steam_id ~ '^[0-9]{17}$'),
  steam_name       text,
  steam_avatar_url text,
  -- Written only by the xp_events trigger.
  xp               bigint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Users may only change their own presentational fields; steam_id and xp stay server-side.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_url, banner_url, visibility) on public.profiles to authenticated;

-- ---------------------------------------------------------------- friends

create table public.friends (
  requester  uuid not null references public.profiles (id) on delete cascade,
  addressee  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friends_addressee on public.friends (addressee);

revoke all on public.friends from anon, authenticated;
grant select, insert, delete on public.friends to authenticated;
grant update (status) on public.friends to authenticated;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friends f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- Whether the signed-in user may see this user's profile and activity.
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = owner
          and (p.visibility = 'public' or (p.visibility = 'friends' and public.are_friends(owner, auth.uid())))
      );
$$;

-- ---------------------------------------------------------------- games and achievements cache
-- Filled by Edge Functions from the Steam Web API (Phase 5). Readable by everyone.

create table public.games (
  id           text primary key,              -- "steam:<appid>", "manual:<slug>", ...
  steam_app_id integer unique,
  name         text not null,
  icon_url     text,
  updated_at   timestamptz not null default now()
);

create table public.achievements (
  game_id        text not null references public.games (id) on delete cascade,
  api_name       text not null,
  name           text not null,
  description    text not null default '',
  icon_url       text,
  icon_gray_url  text,
  hidden         boolean not null default false,
  global_percent real,
  updated_at     timestamptz not null default now(),
  primary key (game_id, api_name)
);

revoke all on public.games, public.achievements from anon, authenticated;
grant select on public.games, public.achievements to anon, authenticated;

-- ---------------------------------------------------------------- unlocks and proofs

create table public.unlocks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null,
  api_name    text not null,
  unlocked_at timestamptz not null,
  -- steam: from Steam; proof: "mark as earned" with proof; manual: checklist; custom: ShotCaller achievement.
  source      text not null check (source in ('steam', 'proof', 'manual', 'custom', 'retro')),
  created_at  timestamptz not null default now(),
  primary key (user_id, game_id, api_name)
);
create index unlocks_user_time on public.unlocks (user_id, unlocked_at desc);

create table public.proofs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_id    text not null,
  api_name   text not null,
  media_path text check (media_path is null or char_length(media_path) <= 300),
  note       text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index proofs_user on public.proofs (user_id);

revoke all on public.unlocks, public.proofs from anon, authenticated;
grant select, insert, update, delete on public.unlocks, public.proofs to authenticated;

-- ---------------------------------------------------------------- xp

create table public.xp_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     integer not null,
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index xp_events_user on public.xp_events (user_id, created_at desc);

revoke all on public.xp_events from anon, authenticated;
grant select on public.xp_events to authenticated;

create or replace function public.apply_xp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set xp = greatest(0, xp + new.amount) where id = new.user_id;
  return new;
end $$;

create trigger xp_events_apply after insert on public.xp_events
  for each row execute function public.apply_xp();

-- ---------------------------------------------------------------- Steam link tickets
-- One-time nonces so the steam-auth function knows which signed-in user is linking Steam.
-- No client access at all.

create table public.steam_link_tickets (
  nonce      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
revoke all on public.steam_link_tickets from anon, authenticated;

-- ---------------------------------------------------------------- crash reports (opt-in)
-- Insert-only and anonymous: no user id, nobody can read them back through the API.

create table public.crash_reports (
  id          bigint generated always as identity primary key,
  app_version text not null check (char_length(app_version) <= 40),
  platform    text not null check (char_length(platform) <= 20),
  process     text not null check (process in ('main', 'renderer')),
  message     text not null check (char_length(message) <= 1000),
  stack       text check (char_length(stack) <= 8000),
  created_at  timestamptz not null default now()
);
revoke all on public.crash_reports from anon, authenticated;
grant insert (app_version, platform, process, message, stack) on public.crash_reports to anon, authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.profiles           enable row level security;
alter table public.friends            enable row level security;
alter table public.games              enable row level security;
alter table public.achievements       enable row level security;
alter table public.unlocks            enable row level security;
alter table public.proofs             enable row level security;
alter table public.xp_events          enable row level security;
alter table public.steam_link_tickets enable row level security;
alter table public.crash_reports      enable row level security;

create policy "profiles: visible per privacy setting" on public.profiles
  for select to authenticated using (public.can_view(id));
create policy "profiles: owner edits" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "friends: either side sees" on public.friends
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "friends: send a request" on public.friends
  for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy "friends: addressee accepts" on public.friends
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());
create policy "friends: either side removes" on public.friends
  for delete to authenticated using (auth.uid() in (requester, addressee));

create policy "games: public" on public.games for select to anon, authenticated using (true);
create policy "achievements: public" on public.achievements for select to anon, authenticated using (true);

create policy "unlocks: visible per privacy setting" on public.unlocks
  for select to authenticated using (public.can_view(user_id));
create policy "unlocks: owner writes" on public.unlocks
  for insert to authenticated with check (user_id = auth.uid());
create policy "unlocks: owner updates" on public.unlocks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "unlocks: owner deletes" on public.unlocks
  for delete to authenticated using (user_id = auth.uid());

create policy "proofs: visible per privacy setting" on public.proofs
  for select to authenticated using (public.can_view(user_id));
create policy "proofs: owner writes" on public.proofs
  for insert to authenticated with check (user_id = auth.uid());
create policy "proofs: owner updates" on public.proofs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "proofs: owner deletes" on public.proofs
  for delete to authenticated using (user_id = auth.uid());

create policy "xp: visible per privacy setting" on public.xp_events
  for select to authenticated using (public.can_view(user_id));

create policy "crash reports: anyone may submit" on public.crash_reports
  for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------- new users get a profile

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  steam     text  := new.raw_app_meta_data ->> 'steam_id';
  shown     text;
  base      text;
  candidate text;
begin
  shown := coalesce(
    nullif(meta ->> 'display_name', ''),
    nullif(meta ->> 'full_name', ''),
    nullif(meta ->> 'global_name', ''),
    nullif(meta ->> 'name', ''),
    nullif(meta ->> 'user_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );
  shown := left(shown, 32);

  base := lower(regexp_replace(coalesce(nullif(meta ->> 'user_name', ''), nullif(meta ->> 'preferred_username', ''), shown), '[^a-zA-Z0-9_]', '', 'g'));
  base := left(base, 15);
  if char_length(base) < 3 then base := 'player'; end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || '_' || lpad(floor(random() * 10000)::text, 4, '0');
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url, steam_id)
  values (
    new.id,
    candidate,
    shown,
    case when coalesce(meta ->> 'avatar_url', meta ->> 'picture', '') ~ '^https://'
         then left(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), 500) end,
    case when steam ~ '^[0-9]{17}$' then steam end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- realtime
-- Profile edits on one PC show up live on the others (realtime respects RLS).

alter publication supabase_realtime add table public.profiles;
