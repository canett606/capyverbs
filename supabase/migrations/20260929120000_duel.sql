-- CapyVerbs: duelo de dos personas.
-- La service_role solo la usa la Edge Function. El navegador llama a duel_snapshot
-- con su sesión anónima y no puede escribir puntos ni leer soluciones.

create extension if not exists pgcrypto with schema extensions;

create table public.duel_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  status text not null check (status in ('lobby', 'countdown', 'playing', 'finished', 'expired')),
  host_id uuid not null,
  variant_mode text not null check (variant_mode in ('sheet', 'standard')),
  seconds integer not null check (seconds between 10 and 60),
  current_round integer not null default -1,
  deadline timestamptz,
  countdown_ends timestamptz,
  reveal_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  next_room_id uuid,
  rematch_votes uuid[] not null default '{}'
);

create table public.duel_members (
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  capybara text not null,
  ready boolean not null default false,
  score integer not null default 0 check (score >= 0 and score % 100 = 0),
  primary key (room_id, user_id)
);

create table public.duel_rounds (
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  round_index integer not null check (round_index >= 0),
  prompt jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'open', 'closed')),
  scored boolean not null default false,
  primary key (room_id, round_index)
);

create table public.duel_secrets (
  room_id uuid not null,
  round_index integer not null,
  accepted text[] not null,
  display text not null,
  primary key (room_id, round_index),
  foreign key (room_id, round_index) references public.duel_rounds(room_id, round_index) on delete cascade
);

create table public.duel_answers (
  room_id uuid not null,
  round_index integer not null,
  user_id uuid not null,
  raw_answer text not null,
  correct boolean not null,
  points integer not null check (points in (0, 100)),
  elapsed_ms integer not null check (elapsed_ms >= 0),
  submitted_at timestamptz not null default now(),
  primary key (room_id, round_index, user_id),
  foreign key (room_id, round_index) references public.duel_rounds(room_id, round_index) on delete cascade
);

create table public.duel_signals (
  room_id uuid primary key references public.duel_rooms(id) on delete cascade,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.duel_rates (
  bucket text primary key,
  hits integer not null,
  window_start timestamptz not null
);

create index duel_members_user_idx on public.duel_members(user_id);
create index duel_rooms_expires_idx on public.duel_rooms(expires_at);

alter table public.duel_rooms enable row level security;
alter table public.duel_members enable row level security;
alter table public.duel_rounds enable row level security;
alter table public.duel_secrets enable row level security;
alter table public.duel_answers enable row level security;
alter table public.duel_signals enable row level security;
alter table public.duel_rates enable row level security;

create or replace function public.capy_norm(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(
    translate(coalesce(p_text, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'),
    '[[:space:]]+', ' ', 'g'
  )));
$$;

create or replace function public.capy_ms(p_time timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  select (extract(epoch from p_time) * 1000)::bigint;
$$;

create or replace function public.duel_assert_service()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
end;
$$;

create or replace function public.duel_rate(p_key text, p_limit integer, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hits integer;
begin
  perform public.duel_assert_service();
  insert into public.duel_rates as rates(bucket, hits, window_start)
  values (p_key, 1, now())
  on conflict (bucket) do update
    set hits = case
          when rates.window_start < now() - make_interval(secs => p_seconds) then 1
          else rates.hits + 1
        end,
        window_start = case
          when rates.window_start < now() - make_interval(secs => p_seconds) then now()
          else rates.window_start
        end
  returning hits into current_hits;
  if current_hits > p_limit then
    raise exception 'Demasiados intentos. Espera un poco.';
  end if;
end;
$$;

create or replace function public.duel_expire_some()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.duel_rooms as rooms
  set status = 'expired'
  from (
    select id
    from public.duel_rooms
    where status in ('lobby', 'countdown', 'playing')
      and expires_at < now()
    limit 30
  ) stale
  where rooms.id = stale.id;
end;
$$;

create or replace function public.duel_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  target := coalesce(new.room_id, old.room_id, new.id, old.id);
  insert into public.duel_signals(room_id, version, updated_at)
  values (target, 1, now())
  on conflict (room_id) do update
    set version = public.duel_signals.version + 1,
        updated_at = now();
  begin
    perform realtime.send(
      jsonb_build_object('room_id', target),
      'sync',
      'room:' || target::text,
      true
    );
  exception
    when undefined_function then
      null;
  end;
  return coalesce(new, old);
end;
$$;

create trigger duel_rooms_signal
after insert or update on public.duel_rooms
for each row execute function public.duel_signal();

create trigger duel_members_signal
after insert or update on public.duel_members
for each row execute function public.duel_signal();

create trigger duel_answers_signal
after insert or update on public.duel_answers
for each row execute function public.duel_signal();

create or replace function public.duel_store_rounds(p_room uuid, p_rounds jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  index integer;
  accepted text[];
begin
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) < 1 or jsonb_array_length(p_rounds) > 20 then
    raise exception 'Preguntas no válidas';
  end if;
  for index in 0 .. jsonb_array_length(p_rounds) - 1 loop
    item := p_rounds -> index;
    select coalesce(array_agg(value), '{}')
      into accepted
    from jsonb_array_elements_text(item -> 'accepted') as answers(value);
    if accepted is null or cardinality(accepted) < 1 or item -> 'prompt' is null then
      raise exception 'Preguntas no válidas';
    end if;
    insert into public.duel_rounds(room_id, round_index, prompt)
    values (p_room, index, (item -> 'prompt') - 'accepted');
    insert into public.duel_secrets(room_id, round_index, accepted, display)
    values (p_room, index, accepted, coalesce(item ->> 'display', ''));
  end loop;
end;
$$;

create or replace function public.duel_fresh_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  candidate text;
  attempt integer;
  pos integer;
begin
  for attempt in 1..5 loop
    bytes := extensions.gen_random_bytes(6);
    candidate := '';
    for pos in 0..5 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, pos) % 32) + 1, 1);
    end loop;
    if not exists (select 1 from public.duel_rooms where code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'No se pudo crear un código';
end;
$$;

create or replace function public.duel_create(
  p_user uuid,
  p_ip text,
  p_nickname text,
  p_capybara text,
  p_variant text,
  p_seconds integer,
  p_rounds jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  new_code text;
  clean_name text;
begin
  perform public.duel_assert_service();
  perform public.duel_expire_some();
  if p_ip is distinct from 'rematch' then
    perform public.duel_rate('create:user:' || p_user::text, 8, 3600);
    perform public.duel_rate('create:ip:' || left(coalesce(p_ip, 'unknown'), 64), 8, 3600);
  end if;
  if p_variant not in ('sheet', 'standard') then
    raise exception 'Modo no válido';
  end if;
  clean_name := left(btrim(regexp_replace(coalesce(p_nickname, ''), '[[:space:]]+', ' ', 'g')), 16);
  if clean_name = '' then
    clean_name := 'Capibara';
  end if;
  new_code := public.duel_fresh_code();
  insert into public.duel_rooms(
    id, code, status, host_id, variant_mode, seconds, expires_at
  ) values (
    new_id, new_code, 'lobby', p_user, p_variant,
    least(60, greatest(10, coalesce(p_seconds, 20))),
    now() + interval '2 hours'
  );
  insert into public.duel_members(room_id, user_id, nickname, capybara)
  values (new_id, p_user, clean_name, left(coalesce(p_capybara, 'cocoa'), 24));
  perform public.duel_store_rounds(new_id, p_rounds);
  return jsonb_build_object('roomId', new_id, 'code', new_code);
end;
$$;

create or replace function public.duel_join(
  p_user uuid,
  p_ip text,
  p_code text,
  p_nickname text,
  p_capybara text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
  clean text;
  members integer;
begin
  perform public.duel_assert_service();
  perform public.duel_rate('join:user:' || p_user::text, 12, 600);
  perform public.duel_rate('join:ip:' || left(coalesce(p_ip, 'unknown'), 64), 12, 600);
  if coalesce(p_code, '') !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'Código no válido';
  end if;
  select * into room from public.duel_rooms where code = p_code for update;
  if not found or room.expires_at < now() or room.status = 'expired' then
    raise exception 'Código no válido';
  end if;
  if exists (select 1 from public.duel_members where room_id = room.id and user_id = p_user) then
    return jsonb_build_object('roomId', room.id);
  end if;
  select count(*) into members from public.duel_members where room_id = room.id;
  if members >= 2 then
    raise exception 'Sala llena';
  end if;
  if room.status <> 'lobby' then
    raise exception 'La partida ya empezó';
  end if;
  clean := left(btrim(regexp_replace(coalesce(p_nickname, ''), '[[:space:]]+', ' ', 'g')), 16);
  if clean = '' then clean := 'Capibara'; end if;
  insert into public.duel_members(room_id, user_id, nickname, capybara)
  values (room.id, p_user, clean, left(coalesce(p_capybara, 'cocoa'), 24));
  update public.duel_rooms set updated_at = now(), expires_at = now() + interval '2 hours' where id = room.id;
  return jsonb_build_object('roomId', room.id);
end;
$$;

create or replace function public.duel_configure(
  p_user uuid,
  p_room uuid,
  p_seconds integer,
  p_variant text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
begin
  perform public.duel_assert_service();
  select * into room from public.duel_rooms where id = p_room for update;
  if not found or not exists (select 1 from public.duel_members where room_id = p_room and user_id = p_user) then
    raise exception 'No puedes ver esta sala';
  end if;
  if room.host_id <> p_user then
    raise exception 'Solo quien crea la sala puede cambiar los ajustes';
  end if;
  if room.status <> 'lobby' then
    raise exception 'La partida ya empezó';
  end if;
  if p_variant not in ('sheet', 'standard') then
    raise exception 'Modo no válido';
  end if;
  update public.duel_rooms
  set seconds = least(60, greatest(10, p_seconds)),
      variant_mode = p_variant,
      updated_at = now()
  where id = p_room;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.duel_ready(p_user uuid, p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
begin
  perform public.duel_assert_service();
  select * into room from public.duel_rooms where id = p_room for update;
  if not found or not exists (select 1 from public.duel_members where room_id = p_room and user_id = p_user) then
    raise exception 'No puedes ver esta sala';
  end if;
  if room.status = 'lobby' then
    update public.duel_members set ready = true where room_id = p_room and user_id = p_user;
    if (select count(*) from public.duel_members where room_id = p_room) = 2
       and not exists (select 1 from public.duel_members where room_id = p_room and ready = false) then
      update public.duel_rooms
      set status = 'countdown',
          countdown_ends = now() + interval '3 seconds',
          updated_at = now(),
          expires_at = now() + interval '2 hours'
      where id = p_room;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.duel_open_if_due(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
begin
  select * into room from public.duel_rooms where id = p_room;
  if room.status = 'countdown' and room.countdown_ends is not null and room.countdown_ends <= now() then
    update public.duel_rooms
    set status = 'playing', current_round = 0, deadline = now() + make_interval(secs => room.seconds)
    where id = p_room;
    update public.duel_rounds set status = 'open' where room_id = p_room and round_index = 0;
  end if;
end;
$$;

create or replace function public.duel_submit(p_user uuid, p_room uuid, p_round integer, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
  secret public.duel_secrets%rowtype;
  inserted integer;
  is_correct boolean;
begin
  perform public.duel_assert_service();
  select * into room from public.duel_rooms where id = p_room for update;
  if not found or not exists (select 1 from public.duel_members where room_id = p_room and user_id = p_user) then
    raise exception 'No puedes ver esta sala';
  end if;
  if room.expires_at < now() and room.status <> 'finished' then
    update public.duel_rooms set status = 'expired' where id = p_room;
    raise exception 'Código no válido';
  end if;
  perform public.duel_open_if_due(p_room);
  select * into room from public.duel_rooms where id = p_room;
  if room.status <> 'playing' then
    raise exception 'La ronda no está abierta';
  end if;
  if p_round is distinct from room.current_round then
    raise exception 'Esa ronda ya no está activa';
  end if;
  if room.deadline is null or now() > room.deadline then
    raise exception 'Envío tardío';
  end if;
  if exists (
    select 1 from public.duel_answers
    where room_id = p_room and round_index = p_round and user_id = p_user
  ) then
    return jsonb_build_object('duplicate', true);
  end if;
  select * into secret from public.duel_secrets where room_id = p_room and round_index = p_round;
  is_correct := public.capy_norm(left(coalesce(p_answer, ''), 80)) = any(secret.accepted);
  insert into public.duel_answers(room_id, round_index, user_id, raw_answer, correct, points, elapsed_ms)
  values (
    p_room,
    p_round,
    p_user,
    left(coalesce(p_answer, ''), 80),
    is_correct,
    case when is_correct then 100 else 0 end,
    greatest(0, (public.capy_ms(now()) - public.capy_ms(room.deadline - make_interval(secs => room.seconds)))::integer)
  )
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return jsonb_build_object('duplicate', true);
  end if;
  update public.duel_rooms
  set updated_at = now(), expires_at = now() + interval '2 hours'
  where id = p_room;
  return jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.duel_advance(p_user uuid, p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
  round public.duel_rounds%rowtype;
  member_count integer;
  answer_count integer;
  total integer;
begin
  perform public.duel_assert_service();
  select * into room from public.duel_rooms where id = p_room for update;
  if not found or not exists (select 1 from public.duel_members where room_id = p_room and user_id = p_user) then
    raise exception 'No puedes ver esta sala';
  end if;
  if room.expires_at < now() and room.status not in ('finished', 'expired') then
    update public.duel_rooms set status = 'expired' where id = p_room;
    return jsonb_build_object('ok', true);
  end if;
  perform public.duel_open_if_due(p_room);
  select * into room from public.duel_rooms where id = p_room;
  if room.status <> 'playing' then
    return jsonb_build_object('ok', true);
  end if;
  select * into round from public.duel_rounds where room_id = p_room and round_index = room.current_round for update;
  select count(*) into member_count from public.duel_members where room_id = p_room;
  select count(*) into answer_count from public.duel_answers where room_id = p_room and round_index = room.current_round;
  select count(*) into total from public.duel_rounds where room_id = p_room;
  if round.status = 'open' and (answer_count >= member_count or (room.deadline is not null and now() > room.deadline)) then
    if not round.scored then
      update public.duel_members as members
      set score = members.score + coalesce(answers.points, 0)
      from public.duel_answers as answers
      where answers.room_id = p_room
        and answers.round_index = room.current_round
        and answers.user_id = members.user_id
        and members.room_id = p_room;
      update public.duel_rounds
      set status = 'closed', scored = true
      where room_id = p_room and round_index = room.current_round;
    end if;
    if room.current_round + 1 >= total then
      update public.duel_rooms
      set status = 'finished', deadline = null, reveal_until = now() + interval '1.2 seconds', updated_at = now()
      where id = p_room;
    else
      update public.duel_rooms
      set deadline = null, reveal_until = now() + interval '1.2 seconds', updated_at = now()
      where id = p_room;
    end if;
    return jsonb_build_object('ok', true);
  end if;
  if round.status = 'closed' and room.reveal_until is not null and now() >= room.reveal_until and room.status = 'playing' then
    update public.duel_rooms
    set current_round = room.current_round + 1,
        deadline = now() + make_interval(secs => room.seconds),
        reveal_until = null,
        updated_at = now(),
        expires_at = now() + interval '2 hours'
    where id = p_room;
    update public.duel_rounds
    set status = 'open'
    where room_id = p_room and round_index = room.current_round + 1;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.duel_rematch(p_user uuid, p_room uuid, p_rounds jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.duel_rooms%rowtype;
  created jsonb;
  member_count integer;
begin
  perform public.duel_assert_service();
  select * into room from public.duel_rooms where id = p_room for update;
  if not found or not exists (select 1 from public.duel_members where room_id = p_room and user_id = p_user) then
    raise exception 'No puedes ver esta sala';
  end if;
  if room.status <> 'finished' then
    raise exception 'La partida todavía no ha terminado';
  end if;
  if room.next_room_id is not null then
    return jsonb_build_object('roomId', room.next_room_id);
  end if;
  if not p_user = any(room.rematch_votes) then
    update public.duel_rooms set rematch_votes = array_append(rematch_votes, p_user) where id = p_room;
  end if;
  select count(*) into member_count from public.duel_members where room_id = p_room;
  select * into room from public.duel_rooms where id = p_room;
  if cardinality(room.rematch_votes) < member_count then
    return jsonb_build_object('waiting', true);
  end if;
  created := public.duel_create(
    room.host_id,
    'rematch',
    (select nickname from public.duel_members where room_id = p_room and user_id = room.host_id),
    (select capybara from public.duel_members where room_id = p_room and user_id = room.host_id),
    room.variant_mode,
    room.seconds,
    p_rounds
  );
  insert into public.duel_members(room_id, user_id, nickname, capybara, ready)
  select (created ->> 'roomId')::uuid, user_id, nickname, capybara, true
  from public.duel_members
  where room_id = p_room and user_id <> room.host_id;
  update public.duel_members set ready = true where room_id = (created ->> 'roomId')::uuid;
  update public.duel_rooms
  set status = 'countdown', countdown_ends = now() + interval '3 seconds'
  where id = (created ->> 'roomId')::uuid;
  update public.duel_rooms set next_room_id = (created ->> 'roomId')::uuid where id = p_room;
  return jsonb_build_object('roomId', created ->> 'roomId');
end;
$$;

create or replace function public.duel_snapshot(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  room public.duel_rooms%rowtype;
  round public.duel_rounds%rowtype;
  secret_display text;
  you_answered boolean;
  opponent_answered boolean;
  members jsonb;
  revealed jsonb := null;
  winner text := null;
  scores integer[];
begin
  if uid is null then
    raise exception 'forbidden';
  end if;
  select * into room from public.duel_rooms where id = p_room;
  if not found or not exists (select 1 from public.duel_members where room_id = p_room and user_id = uid) then
    raise exception 'No puedes ver esta sala';
  end if;
  if room.expires_at < now() and room.status in ('lobby', 'countdown', 'playing') then
    update public.duel_rooms set status = 'expired' where id = p_room;
    room.status := 'expired';
  else
    update public.duel_rooms set expires_at = now() + interval '2 hours' where id = p_room and status <> 'expired';
  end if;
  select * into round from public.duel_rounds where room_id = p_room and round_index = room.current_round;
  you_answered := exists (
    select 1 from public.duel_answers where room_id = p_room and round_index = room.current_round and user_id = uid
  );
  opponent_answered := exists (
    select 1 from public.duel_answers where room_id = p_room and round_index = room.current_round and user_id <> uid
  );
  select jsonb_agg(jsonb_build_object(
    'userId', user_id,
    'nickname', nickname,
    'capybara', capybara,
    'ready', ready,
    'score', score,
    'isYou', user_id = uid
  ) order by joined_order)
  into members
  from (
    select user_id, nickname, capybara, ready, score, row_number() over (order by nickname) as joined_order
    from public.duel_members
    where room_id = p_room
  ) people;
  if round.status = 'closed' then
    select display into secret_display from public.duel_secrets where room_id = p_room and round_index = room.current_round;
    select jsonb_build_object(
      'display', secret_display,
      'results', jsonb_agg(jsonb_build_object(
        'userId', people.user_id,
        'correct', coalesce(answers.correct, false),
        'points', coalesce(answers.points, 0)
      ))
    )
    into revealed
    from public.duel_members people
    left join public.duel_answers answers
      on answers.room_id = p_room
     and answers.round_index = room.current_round
     and answers.user_id = people.user_id
    where people.room_id = p_room;
  end if;
  if room.status = 'finished' then
    select array_agg(score order by user_id) into scores from public.duel_members where room_id = p_room;
    if scores is not null and cardinality(scores) = 2 then
      if scores[1] = scores[2] then
        winner := 'tie';
      else
        select user_id::text into winner
        from public.duel_members
        where room_id = p_room
        order by score desc, user_id
        limit 1;
      end if;
    end if;
  end if;
  return jsonb_build_object(
    'roomId', room.id,
    'code', room.code,
    'status', room.status,
    'variantMode', room.variant_mode,
    'seconds', room.seconds,
    'serverNow', public.capy_ms(now()),
    'deadline', public.capy_ms(room.deadline),
    'countdownEnds', public.capy_ms(room.countdown_ends),
    'current', room.current_round,
    'members', coalesce(members, '[]'::jsonb),
    'youAnswered', you_answered,
    'opponentAnswered', opponent_answered,
    'prompt', case when room.status = 'playing' and round.status = 'open' then round.prompt else null end,
    'revealed', revealed,
    'winner', winner,
    'nextRoomId', room.next_room_id,
    'youAreHost', room.host_id = uid
  );
end;
$$;

revoke all on function public.duel_assert_service() from public;
revoke all on function public.duel_rate(text, integer, integer) from public;
revoke all on function public.duel_expire_some() from public;
revoke all on function public.duel_store_rounds(uuid, jsonb) from public;
revoke all on function public.duel_fresh_code() from public;
revoke all on function public.duel_create(uuid, text, text, text, text, integer, jsonb) from public;
revoke all on function public.duel_join(uuid, text, text, text, text) from public;
revoke all on function public.duel_configure(uuid, uuid, integer, text) from public;
revoke all on function public.duel_ready(uuid, uuid) from public;
revoke all on function public.duel_open_if_due(uuid) from public;
revoke all on function public.duel_submit(uuid, uuid, integer, text) from public;
revoke all on function public.duel_advance(uuid, uuid) from public;
revoke all on function public.duel_rematch(uuid, uuid, jsonb) from public;
revoke all on function public.duel_snapshot(uuid) from public;
revoke all on function public.capy_norm(text) from public;
revoke all on function public.capy_ms(timestamptz) from public;

grant execute on function public.duel_create(uuid, text, text, text, text, integer, jsonb) to service_role;
grant execute on function public.duel_join(uuid, text, text, text, text) to service_role;
grant execute on function public.duel_configure(uuid, uuid, integer, text) to service_role;
grant execute on function public.duel_ready(uuid, uuid) to service_role;
grant execute on function public.duel_submit(uuid, uuid, integer, text) to service_role;
grant execute on function public.duel_advance(uuid, uuid) to service_role;
grant execute on function public.duel_rematch(uuid, uuid, jsonb) to service_role;
grant execute on function public.duel_snapshot(uuid) to authenticated;

revoke all on table public.duel_rooms from anon, authenticated;
revoke all on table public.duel_members from anon, authenticated;
revoke all on table public.duel_rounds from anon, authenticated;
revoke all on table public.duel_secrets from anon, authenticated;
revoke all on table public.duel_answers from anon, authenticated;
revoke all on table public.duel_signals from anon, authenticated;
revoke all on table public.duel_rates from anon, authenticated;

grant select on public.duel_rooms to authenticated;
grant select on public.duel_members to authenticated;
grant select on public.duel_signals to authenticated;

create policy duel_rooms_member_read on public.duel_rooms
for select to authenticated
using (exists (
  select 1 from public.duel_members members
  where members.room_id = duel_rooms.id and members.user_id = (select auth.uid())
));

create policy duel_members_room_read on public.duel_members
for select to authenticated
using (exists (
  select 1 from public.duel_members mine
  where mine.room_id = duel_members.room_id and mine.user_id = (select auth.uid())
));

create policy duel_signals_member_read on public.duel_signals
for select to authenticated
using (exists (
  select 1 from public.duel_members members
  where members.room_id = duel_signals.room_id and members.user_id = (select auth.uid())
));

drop policy if exists capyverbs_room_read on realtime.messages;
create policy capyverbs_room_read on realtime.messages
for select to authenticated
using (
  realtime.topic() like 'room:%'
  and exists (
    select 1 from public.duel_members members
    where members.user_id = (select auth.uid())
      and members.room_id::text = split_part(realtime.topic(), ':', 2)
  )
);

do $$
begin
  alter publication supabase_realtime add table public.duel_signals;
exception
  when duplicate_object or undefined_object then
    null;
end $$;
