-- Enable UUID generation
create extension if not exists "pgcrypto";

create type draft_stage as enum ('group_stage', 'knockout');
create type draft_status as enum ('pending', 'active', 'completed');
create type match_stage as enum ('group', 'round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'final');
create type match_status as enum ('scheduled', 'live', 'completed');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  email text not null,
  is_commissioner boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table teams (
  id serial primary key,
  name text not null,
  code text not null unique,
  group_name text not null,
  fifa_ranking int,
  flag_emoji text
);

create table draft_sessions (
  id uuid primary key default gen_random_uuid(),
  stage draft_stage not null,
  status draft_status not null default 'pending',
  total_rounds int not null,
  current_round int not null default 1,
  current_pick_index int not null default 0,
  snake_order uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references draft_sessions on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  team_id int not null references teams on delete cascade,
  round int not null,
  pick_number int not null,
  picked_at timestamptz not null default now(),
  unique(session_id, team_id),
  unique(session_id, pick_number)
);

create table matches (
  id int primary key,
  stage match_stage not null,
  group_name text,
  home_team_id int references teams,
  away_team_id int references teams,
  home_score int,
  away_score int,
  home_score_pen int,
  away_score_pen int,
  winner_team_id int references teams,
  kickoff_utc timestamptz,
  status match_status not null default 'scheduled',
  venue text
);

create table contest_scores (
  user_id uuid not null references profiles on delete cascade,
  contest text not null,
  score numeric not null default 0,
  rank int,
  contest_points int,
  unique(user_id, contest)
);

create view group_stage_rosters as
select
  dp.user_id,
  p.display_name,
  t.id as team_id,
  t.name as team_name,
  t.code as team_code,
  t.group_name,
  t.flag_emoji,
  coalesce(sum(case when m.home_team_id = t.id and m.status = 'completed' then m.home_score
                    when m.away_team_id = t.id and m.status = 'completed' then m.away_score
                    else 0 end), 0) as goals_for,
  coalesce(sum(case when m.home_team_id = t.id and m.status = 'completed' then m.away_score
                    when m.away_team_id = t.id and m.status = 'completed' then m.home_score
                    else 0 end), 0) as goals_against
from draft_picks dp
join draft_sessions ds on dp.session_id = ds.id and ds.stage = 'group_stage'
join teams t on dp.team_id = t.id
join profiles p on dp.user_id = p.id
left join matches m on (m.home_team_id = t.id or m.away_team_id = t.id) and m.stage = 'group'
group by dp.user_id, p.display_name, t.id, t.name, t.code, t.group_name, t.flag_emoji;

create view overall_leaderboard as
select
  p.id as user_id,
  p.display_name,
  coalesce(sum(cs.contest_points), 0) as total_points,
  rank() over (order by coalesce(sum(cs.contest_points), 0) desc) as overall_rank
from profiles p
left join contest_scores cs on p.id = cs.user_id
group by p.id, p.display_name
order by total_points desc;

alter table profiles enable row level security;
alter table teams enable row level security;
alter table draft_sessions enable row level security;
alter table draft_picks enable row level security;
alter table matches enable row level security;
alter table contest_scores enable row level security;

create policy "public read teams" on teams for select using (true);
create policy "public read matches" on matches for select using (true);
create policy "public read draft_sessions" on draft_sessions for select using (true);
create policy "public read draft_picks" on draft_picks for select using (true);
create policy "public read contest_scores" on contest_scores for select using (true);
create policy "public read profiles" on profiles for select using (true);
create policy "users update own profile" on profiles for update using (auth.uid() = id);
