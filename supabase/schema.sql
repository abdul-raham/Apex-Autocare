-- ════════════════════════════════════════════════════════════════════════════
-- APEX AutoCare — Supabase schema
--
-- Run once in the Supabase SQL editor, then run supabase/seed.sql.
-- Safe to re-run: every object is created idempotently.
--
-- Design notes
--  • The browser only holds the anon key. Anon can read the public catalogue and
--    booking_events (no PII, needed for Realtime). Everything else goes through
--    SECURITY DEFINER functions below.
--  • Double-booking is impossible at the database level: an exclusion constraint
--    forbids two live bookings on one unit with overlapping occupied windows
--    (outbound travel → return + turnaround).
--  • Pricing and durations are recomputed here from catalogue tables; the client's
--    numbers are never trusted. Rules mirror src/lib/scheduling.ts + quote.ts.
--  • apex_reset_demo() only ever deletes rows with is_demo = true.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ─── Catalogue ──────────────────────────────────────────────────────────────

create table if not exists ops_settings (
  id                 boolean primary key default true check (id),
  setup_minutes      int not null,
  inspection_minutes int not null,
  turnaround_minutes int not null,
  dispatch_start     int not null,          -- minutes from Lagos midnight
  dispatch_end       int not null,
  min_lead_minutes   int not null,
  deposit_rate       numeric not null,
  price_rounding     int not null,
  travel_rounding    int not null,
  free_change_hours  int not null,
  peak_windows       int4range[] not null   -- weekday appointment-start windows, minutes
);

create table if not exists vehicle_classes (
  id               text primary key,
  label            text not null,
  base_minutes     int not null,
  price_multiplier numeric not null
);

create table if not exists services (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  description           text,
  base_price            int not null,
  -- minutes added on top of the vehicle class base_minutes
  base_duration_minutes int not null,
  active                boolean not null default true
);

create table if not exists service_addons (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  price_delta            int not null,
  duration_delta_minutes int not null,
  active                 boolean not null default true
);

create table if not exists service_zones (
  id             text primary key,
  name           text not null,
  travel_minutes int not null,
  peak_factor    numeric not null default 1,
  surcharge      int not null default 0,
  serviced       boolean not null default true
);

create table if not exists mobile_units (
  id        text primary key,
  name      text not null,
  crew      text not null default '',
  status    text not null default 'active',
  home_zone text references service_zones (id),
  active    boolean not null default true
);

-- ─── Bookings ───────────────────────────────────────────────────────────────

create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  phone      text,
  email      text,
  is_demo    boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers (id) on delete cascade,
  vehicle_class         text not null references vehicle_classes (id),
  make                  text,
  model                 text,
  registration_optional text,
  notes                 text
);

create table if not exists bookings (
  id                 uuid primary key default gen_random_uuid(),
  booking_code       text not null unique,
  customer_id        uuid not null references customers (id),
  vehicle_id         uuid not null references vehicles (id),
  mobile_unit_id     text not null references mobile_units (id),
  service_id         uuid not null references services (id),
  location_zone      text not null references service_zones (id),
  address_text       text,
  start_at           timestamptz not null,   -- crew arrives, setup begins
  end_at             timestamptz not null,   -- inspection done, crew leaves
  travel_minutes     int not null,
  setup_minutes      int not null,
  detail_minutes     int not null,
  inspection_minutes int not null,
  occupied_start     timestamptz not null,   -- unit leaves base
  occupied_end       timestamptz not null,   -- unit back and restocked
  subtotal           int not null,
  deposit_amount     int not null,
  payment_status     text not null default 'pending' check (payment_status in ('pending', 'deposit_paid', 'refunded')),
  booking_status     text not null default 'confirmed' check (booking_status in ('confirmed', 'pending_deposit', 'cancelled')),
  source             text not null default 'web' check (source in ('seed', 'web')),
  reschedule_count   int not null default 0,
  is_demo            boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bookings_window_order check (occupied_start < start_at and start_at < end_at and end_at < occupied_end),
  constraint bookings_no_unit_overlap exclude using gist (
    mobile_unit_id with =,
    tstzrange(occupied_start, occupied_end) with &&
  ) where (booking_status <> 'cancelled')
);

create index if not exists bookings_start_idx on bookings (start_at);
create index if not exists bookings_demo_idx on bookings (is_demo);

create table if not exists booking_addons (
  booking_id               uuid not null references bookings (id) on delete cascade,
  addon_id                 uuid not null references service_addons (id),
  price_delta_snapshot     int not null,
  duration_delta_snapshot  int not null,
  primary key (booking_id, addon_id)
);

create table if not exists booking_events (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings (id) on delete cascade,
  event_type    text not null,
  label         text not null,
  status        text not null check (status in ('completed', 'scheduled', 'cancelled')),
  scheduled_for timestamptz,
  completed_at  timestamptz,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists booking_events_booking_idx on booking_events (booking_id);

-- Canonical demo week (generated from src/data/apex.ts into seed.sql).
create table if not exists demo_seed_templates (
  id              serial primary key,
  weekday         int not null check (weekday between 0 and 6),
  unit_id         text not null references mobile_units (id),
  start_time      time not null,
  vehicle_class   text not null references vehicle_classes (id),
  vehicle_label   text not null,
  service_slug    text not null,
  addon_slugs     text[] not null default '{}',
  zone_id         text not null references service_zones (id),
  customer_name   text not null,
  pending_deposit boolean not null default false
);

create table if not exists demo_settings (
  id              boolean primary key default true check (id),
  day_offset_from int not null,
  day_offset_to   int not null
);

-- ─── Row-level security ─────────────────────────────────────────────────────

alter table ops_settings        enable row level security;
alter table vehicle_classes     enable row level security;
alter table services            enable row level security;
alter table service_addons      enable row level security;
alter table service_zones       enable row level security;
alter table mobile_units        enable row level security;
alter table customers           enable row level security;
alter table vehicles            enable row level security;
alter table bookings            enable row level security;
alter table booking_addons      enable row level security;
alter table booking_events      enable row level security;
alter table demo_seed_templates enable row level security;
alter table demo_settings       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ops_settings', 'vehicle_classes', 'services', 'service_addons', 'service_zones', 'mobile_units', 'booking_events'] loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
-- customers, vehicles, bookings, booking_addons: no anon policies → only reachable via the functions below.

-- ─── Helpers (internal) ─────────────────────────────────────────────────────

create or replace function apex__naira(amount int) returns text
language sql immutable as $$ select '₦' || to_char(amount, 'FM999,999,999,990') $$;

create or replace function apex__hhmm(ts timestamptz) returns text
language sql stable as $$ select to_char(ts at time zone 'Africa/Lagos', 'HH24:MI') $$;

create or replace function apex__duration(minutes int) returns text
language sql immutable as $$
  select case
    when minutes < 60 then minutes || 'm'
    when minutes % 60 = 0 then (minutes / 60) || 'h'
    else (minutes / 60) || 'h ' || lpad((minutes % 60)::text, 2, '0') || 'm'
  end
$$;

create or replace function apex__minute_of_day(ts timestamptz) returns int
language sql stable as $$
  select (extract(hour from ts at time zone 'Africa/Lagos') * 60 + extract(minute from ts at time zone 'Africa/Lagos'))::int
$$;

create or replace function apex__new_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'APX-';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from bookings where booking_code = code);
  end loop;
  return code;
end $$;

-- Full costing of a job at a given start. Mirrors planJob() + computeQuote().
create or replace function apex__plan(
  p_class text, p_service text, p_addons text[], p_zone text, p_start timestamptz,
  out travel_minutes int, out setup_minutes int, out detail_minutes int, out inspection_minutes int,
  out end_at timestamptz, out occupied_start timestamptz, out occupied_end timestamptz,
  out subtotal int, out deposit int, out peak boolean
)
language plpgsql stable as $$
declare
  s  ops_settings;
  vc vehicle_classes;
  sv services;
  z  service_zones;
  addon_minutes int;
  addon_price int;
  local_min int := apex__minute_of_day(p_start);
  dow int := extract(dow from p_start at time zone 'Africa/Lagos')::int;
begin
  select * into s from ops_settings;
  select * into vc from vehicle_classes where id = p_class;
  select * into sv from services where slug = p_service and active;
  select * into z from service_zones where id = p_zone;
  if vc.id is null then raise exception 'INVALID: unknown vehicle class %', p_class; end if;
  if sv.id is null then raise exception 'INVALID: unknown service %', p_service; end if;
  if z.id is null or not z.serviced then raise exception 'OUT_OF_ZONE: % is outside the mobile run', coalesce(z.name, p_zone); end if;

  select coalesce(sum(duration_delta_minutes), 0), coalesce(sum(price_delta), 0)
    into addon_minutes, addon_price
    from service_addons where slug = any (coalesce(p_addons, '{}')) and active;
  if (select count(*) from service_addons where slug = any (coalesce(p_addons, '{}')) and active) <> coalesce(array_length(p_addons, 1), 0) then
    raise exception 'INVALID: unknown add-on';
  end if;

  peak := dow between 1 and 5 and exists (select 1 from unnest(s.peak_windows) w where w @> local_min);
  travel_minutes := case when peak
    then (ceil(z.travel_minutes * z.peak_factor / s.travel_rounding) * s.travel_rounding)::int
    else z.travel_minutes end;
  setup_minutes := s.setup_minutes;
  inspection_minutes := s.inspection_minutes;
  detail_minutes := vc.base_minutes + sv.base_duration_minutes + addon_minutes;
  end_at := p_start + make_interval(mins => setup_minutes + detail_minutes + inspection_minutes);
  occupied_start := p_start - make_interval(mins => travel_minutes);
  occupied_end := end_at + make_interval(mins => travel_minutes + s.turnaround_minutes);
  subtotal := (round(sv.base_price * vc.price_multiplier / s.price_rounding) * s.price_rounding)::int + addon_price + z.surcharge;
  deposit := (round(subtotal * s.deposit_rate / s.price_rounding) * s.price_rounding)::int;
end $$;

create or replace function apex__check_window(p_start timestamptz, p_occ_start timestamptz, p_occ_end timestamptz, p_enforce_lead boolean)
returns void language plpgsql stable as $$
declare s ops_settings;
begin
  select * into s from ops_settings;
  if p_enforce_lead and p_start < now() + make_interval(mins => s.min_lead_minutes) then
    raise exception 'SLOT_CONFLICT: units need % hours notice', s.min_lead_minutes / 60;
  end if;
  if apex__minute_of_day(p_occ_start) < s.dispatch_start
     or (p_occ_end at time zone 'Africa/Lagos')::date <> (p_occ_start at time zone 'Africa/Lagos')::date
     or apex__minute_of_day(p_occ_end) > s.dispatch_end then
    raise exception 'SLOT_CONFLICT: job falls outside dispatch hours';
  end if;
end $$;

create or replace function apex__log(p_booking uuid, p_type text, p_label text, p_at timestamptz,
                                     p_scheduled timestamptz default null, p_meta jsonb default '{}')
returns void language sql as $$
  insert into booking_events (booking_id, event_type, label, status, scheduled_for, completed_at, metadata, created_at)
  values (p_booking, p_type, p_label,
          case when p_scheduled is null then 'completed' else 'scheduled' end,
          p_scheduled,
          case when p_scheduled is null then p_at end,
          p_meta, p_at)
$$;

-- Reminders, crew brief and aftercare, scheduled against the appointment.
create or replace function apex__follow_through(p_booking uuid, p_at timestamptz)
returns void language plpgsql as $$
declare
  b bookings;
  u mobile_units;
begin
  select * into b from bookings where id = p_booking;
  select * into u from mobile_units where id = b.mobile_unit_id;
  if b.start_at - interval '24 hours' > p_at then
    perform apex__log(b.id, 'reminder_24h', '24h reminder · arrival window + prep checklist', p_at, b.start_at - interval '24 hours');
  end if;
  if b.occupied_start - interval '30 minutes' > p_at then
    perform apex__log(b.id, 'crew_brief', 'Route + job brief pushed to ' || u.name, p_at, b.occupied_start - interval '30 minutes');
  end if;
  if b.start_at - interval '2 hours' > p_at then
    perform apex__log(b.id, 'reminder_2h', '"Crew en route" notice with live ETA', p_at, b.start_at - interval '2 hours');
  end if;
  if b.end_at + interval '3 hours' > p_at then
    perform apex__log(b.id, 'review_request', 'Aftercare tips + review request', p_at, b.end_at + interval '3 hours');
  end if;
end $$;

create or replace function apex__supersede(p_booking uuid, p_at timestamptz)
returns void language sql as $$
  update booking_events set status = 'cancelled', completed_at = p_at
  where booking_id = p_booking and status = 'scheduled' and scheduled_for > p_at
$$;

create or replace function apex__creation_events(p_booking uuid, p_at timestamptz)
returns void language plpgsql as $$
declare
  b bookings;
  u mobile_units;
begin
  select * into b from bookings where id = p_booking;
  select * into u from mobile_units where id = b.mobile_unit_id;
  perform apex__log(b.id, 'quote_calculated', 'Quote calculated · ' || apex__naira(b.subtotal) || ' · ' || apex__duration(b.detail_minutes) || ' on the car', p_at);
  perform apex__log(b.id, 'slot_validated', 'Slot validated against 3 units · zero overlap', p_at);
  perform apex__log(b.id, 'unit_assigned', u.name || ' assigned · crew ' || u.crew, p_at);
  if b.payment_status = 'deposit_paid' then
    perform apex__log(b.id, 'deposit_verified', 'Deposit verified · ' || apex__naira(b.deposit_amount) || ' (demo payment)', p_at);
  else
    perform apex__log(b.id, 'deposit_pending', 'Deposit of ' || apex__naira(b.deposit_amount) || ' awaiting payment · hold active', p_at);
  end if;
  perform apex__log(b.id, 'calendar_blocked', 'Calendar blocked · ' || u.name || ' ' || apex__hhmm(b.occupied_start) || '–' || apex__hhmm(b.occupied_end), p_at);
  perform apex__log(b.id, 'confirmation_sent', 'Confirmation sent · WhatsApp + email (simulated)', p_at);
  perform apex__follow_through(b.id, p_at);
end $$;

-- Insert a booking on the preferred unit, falling back to any other free unit.
create or replace function apex__insert_booking(
  p_class text, p_service text, p_addons text[], p_zone text, p_start timestamptz, p_unit text,
  p_customer_name text, p_phone text, p_email text, p_address text, p_vehicle_label text,
  p_source text, p_created_at timestamptz, p_paid boolean, p_enforce_lead boolean
) returns uuid language plpgsql as $$
declare
  plan record;
  cust_id uuid;
  veh_id uuid;
  booking_id uuid;
  svc_id uuid;
  unit_id text;
begin
  select * into plan from apex__plan(p_class, p_service, p_addons, p_zone, p_start);
  perform apex__check_window(p_start, plan.occupied_start, plan.occupied_end, p_enforce_lead);
  select id into svc_id from services where slug = p_service;

  insert into customers (full_name, phone, email, is_demo, created_at)
    values (p_customer_name, nullif(p_phone, ''), nullif(p_email, ''), true, p_created_at) returning id into cust_id;
  insert into vehicles (customer_id, vehicle_class, make, model)
    values (cust_id, p_class, split_part(p_vehicle_label, ' ', 1), nullif(substr(p_vehicle_label, length(split_part(p_vehicle_label, ' ', 1)) + 2), ''))
    returning id into veh_id;

  for unit_id in
    select id from mobile_units where active order by (id = p_unit) desc, id
  loop
    begin
      insert into bookings (
        booking_code, customer_id, vehicle_id, mobile_unit_id, service_id, location_zone, address_text,
        start_at, end_at, travel_minutes, setup_minutes, detail_minutes, inspection_minutes,
        occupied_start, occupied_end, subtotal, deposit_amount, payment_status, booking_status,
        source, is_demo, created_at, updated_at
      ) values (
        apex__new_code(), cust_id, veh_id, unit_id, svc_id, p_zone, nullif(p_address, ''),
        p_start, plan.end_at, plan.travel_minutes, plan.setup_minutes, plan.detail_minutes, plan.inspection_minutes,
        plan.occupied_start, plan.occupied_end, plan.subtotal, plan.deposit,
        case when p_paid then 'deposit_paid' else 'pending' end,
        case when p_paid then 'confirmed' else 'pending_deposit' end,
        p_source, true, p_created_at, p_created_at
      ) returning id into booking_id;
      exit;
    exception when exclusion_violation then
      booking_id := null;
    end;
  end loop;

  if booking_id is null then
    raise exception 'SLOT_CONFLICT: all units are committed at that time';
  end if;

  insert into booking_addons (booking_id, addon_id, price_delta_snapshot, duration_delta_snapshot)
    select booking_id, a.id, a.price_delta, a.duration_delta_minutes from service_addons a where a.slug = any (coalesce(p_addons, '{}'));

  perform apex__creation_events(booking_id, p_created_at);
  return booking_id;
end $$;

-- Public-safe booking shape (first name + initial only), matching the TS Booking type.
create or replace function apex__booking_json(p_id uuid, p_private boolean default false) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.booking_code, 'isDemo', b.is_demo, 'source', b.source,
    'customerName', case when p_private or b.source = 'seed' then c.full_name
                         else split_part(c.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(c.full_name, ' ', 2), ''), 1) || '.', '') end,
    'customerPhone', case when p_private then c.phone end,
    'customerEmail', case when p_private then c.email end,
    'address', case when p_private then b.address_text end,
    'classId', v.vehicle_class,
    'vehicleLabel', trim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')),
    'serviceId', s.slug,
    'addonIds', coalesce((select jsonb_agg(a.slug order by a.slug) from booking_addons ba join service_addons a on a.id = ba.addon_id where ba.booking_id = b.id), '[]'::jsonb),
    'zoneId', b.location_zone, 'unitId', b.mobile_unit_id,
    'startAt', b.start_at, 'endAt', b.end_at,
    'travelMinutes', b.travel_minutes, 'setupMinutes', b.setup_minutes,
    'detailMinutes', b.detail_minutes, 'inspectionMinutes', b.inspection_minutes,
    'occupiedStart', b.occupied_start, 'occupiedEnd', b.occupied_end,
    'subtotal', b.subtotal, 'depositAmount', b.deposit_amount,
    'paymentStatus', b.payment_status, 'status', b.booking_status,
    'rescheduleCount', b.reschedule_count,
    'createdAt', b.created_at, 'updatedAt', b.updated_at
  )
  from bookings b
  join customers c on c.id = b.customer_id
  join vehicles v on v.id = b.vehicle_id
  join services s on s.id = b.service_id
  where b.id = p_id
$$;

create or replace function apex__events_json(p_booking uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'bookingId', e.booking_id, 'bookingCode', b.booking_code, 'type', e.event_type,
    'label', e.label, 'status', e.status, 'scheduledFor', e.scheduled_for,
    'completedAt', e.completed_at, 'createdAt', e.created_at, 'metadata', e.metadata
  ) order by e.created_at, e.scheduled_for nulls first), '[]'::jsonb)
  from booking_events e join bookings b on b.id = e.booking_id
  where e.booking_id = p_booking
$$;

create or replace function apex__record(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('booking', apex__booking_json(p_id, true), 'events', apex__events_json(p_id))
$$;

-- ─── Public API (anon) ──────────────────────────────────────────────────────

-- Everything the booking flow and /operations need: yesterday → +15 days.
create or replace function apex_board() returns jsonb
language sql stable security definer set search_path = public as $$
  with window_bookings as (
    select id from bookings
    where start_at >= date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' - interval '1 day'
      and start_at <  date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' + interval '16 days'
  )
  select jsonb_build_object(
    'bookings', coalesce((select jsonb_agg(apex__booking_json(id)) from window_bookings), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'bookingId', e.booking_id, 'bookingCode', b.booking_code, 'type', e.event_type,
        'label', e.label, 'status', e.status, 'scheduledFor', e.scheduled_for,
        'completedAt', e.completed_at, 'createdAt', e.created_at, 'metadata', e.metadata
      ))
      from booking_events e join bookings b on b.id = e.booking_id
      where e.booking_id in (select id from window_bookings)
    ), '[]'::jsonb)
  )
$$;

create or replace function apex_get_booking(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select apex__record(id) from bookings where booking_code = upper(p_code)
$$;

create or replace function apex_create_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  booking_id uuid;
begin
  if coalesce(trim(p->>'customerName'), '') = '' or coalesce(trim(p->>'customerPhone'), '') = '' then
    raise exception 'INVALID: name and phone are required';
  end if;
  booking_id := apex__insert_booking(
    p->>'classId', p->>'serviceId',
    array(select jsonb_array_elements_text(coalesce(p->'addonIds', '[]'::jsonb))),
    p->>'zoneId', (p->>'startAt')::timestamptz, p->>'unitId',
    left(trim(p->>'customerName'), 80), left(trim(p->>'customerPhone'), 32), left(trim(p->>'customerEmail'), 120),
    left(trim(p->>'address'), 240), left(trim(coalesce(nullif(p->>'vehicleLabel', ''), 'Vehicle')), 60),
    'web', now(), true, true
  );
  return apex__record(booking_id);
end $$;

create or replace function apex_reschedule_booking(p_code text, p_start_at timestamptz, p_unit_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v vehicles;
  plan record;
  addons text[];
  unit_id text;
  moved boolean := false;
  old_start timestamptz;
  old_unit text;
  u mobile_units;
begin
  select * into b from bookings where booking_code = upper(p_code) for update;
  if b.id is null then raise exception 'NOT_FOUND: booking not found'; end if;
  if b.booking_status = 'cancelled' then raise exception 'INVALID: booking was cancelled'; end if;
  select * into v from vehicles where id = b.vehicle_id;
  select coalesce(array_agg(a.slug), '{}') into addons from booking_addons ba join service_addons a on a.id = ba.addon_id where ba.booking_id = b.id;

  select * into plan from apex__plan(v.vehicle_class, (select slug from services where id = b.service_id), addons, b.location_zone, p_start_at);
  perform apex__check_window(p_start_at, plan.occupied_start, plan.occupied_end, true);
  old_start := b.start_at;
  old_unit := b.mobile_unit_id;

  for unit_id in select id from mobile_units where active order by (id = p_unit_id) desc, (id = b.mobile_unit_id) desc, id loop
    begin
      update bookings set
        mobile_unit_id = unit_id, start_at = p_start_at, end_at = plan.end_at,
        travel_minutes = plan.travel_minutes, occupied_start = plan.occupied_start, occupied_end = plan.occupied_end,
        reschedule_count = reschedule_count + 1, updated_at = now()
      where id = b.id;
      moved := true;
      exit;
    exception when exclusion_violation then
      moved := false;
    end;
  end loop;
  if not moved then raise exception 'SLOT_CONFLICT: all units are committed at that time'; end if;

  select * into b from bookings where id = b.id;
  select * into u from mobile_units where id = b.mobile_unit_id;
  perform apex__supersede(b.id, now());
  perform apex__log(b.id, 'rescheduled',
    'Rescheduled ' || upper(to_char(old_start at time zone 'Africa/Lagos', 'Dy')) || ' ' || apex__hhmm(old_start) || ' → '
      || upper(to_char(b.start_at at time zone 'Africa/Lagos', 'Dy')) || ' ' || apex__hhmm(b.start_at) || ' · feasibility re-run',
    now(), null, jsonb_build_object('from', old_start, 'to', b.start_at));
  if old_unit <> b.mobile_unit_id then
    perform apex__log(b.id, 'unit_assigned', 'Reassigned to ' || u.name, now());
  end if;
  perform apex__log(b.id, 'calendar_blocked', 'Calendar moved · ' || u.name || ' ' || apex__hhmm(b.occupied_start) || '–' || apex__hhmm(b.occupied_end), now());
  perform apex__log(b.id, 'confirmation_sent', 'Updated confirmation sent (simulated)', now());
  perform apex__follow_through(b.id, now());
  return apex__record(b.id);
end $$;

create or replace function apex_cancel_booking(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  late boolean;
begin
  select * into b from bookings where booking_code = upper(p_code) for update;
  if b.id is null then raise exception 'NOT_FOUND: booking not found'; end if;
  if b.booking_status = 'cancelled' then return apex__record(b.id); end if;
  late := b.start_at - now() < make_interval(hours => (select free_change_hours from ops_settings));
  update bookings set booking_status = 'cancelled',
    payment_status = case when late then payment_status else 'refunded' end,
    updated_at = now()
  where id = b.id;
  perform apex__supersede(b.id, now());
  perform apex__log(b.id, 'cancelled', case when late
    then 'Cancelled inside 12h · deposit retained, slot released to pool'
    else 'Cancelled · deposit refund queued, slot released to pool' end, now());
  return apex__record(b.id);
end $$;

create or replace function apex_log_event(p_code text, p_type text, p_label text, p_metadata jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare b_id uuid;
begin
  if p_type not in ('reminder_prefs_updated', 'deposit_nudge') then
    raise exception 'INVALID: event type not allowed';
  end if;
  select id into b_id from bookings where booking_code = upper(p_code);
  if b_id is null then raise exception 'NOT_FOUND: booking not found'; end if;
  perform apex__log(b_id, p_type, left(p_label, 160), now(), null, coalesce(p_metadata, '{}'));
end $$;

-- Deletes ONLY is_demo rows, then rebuilds the canonical week relative to today (Lagos).
create or replace function apex_reset_demo() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
  d date;
  t demo_seed_templates;
  cfg demo_settings;
  start_ts timestamptz;
begin
  select * into cfg from demo_settings;
  delete from bookings where is_demo;
  delete from customers c where c.is_demo and not exists (select 1 from bookings b where b.customer_id = c.id);

  for d in select generate_series(today + cfg.day_offset_from, today + cfg.day_offset_to, interval '1 day')::date loop
    for t in select * from demo_seed_templates where weekday = extract(dow from d)::int order by unit_id, start_time loop
      start_ts := (d + t.start_time) at time zone 'Africa/Lagos';
      perform apex__insert_booking(
        t.vehicle_class, t.service_slug, t.addon_slugs, t.zone_id, start_ts, t.unit_id,
        t.customer_name, '', '', '', t.vehicle_label,
        'seed',
        least(
          ((d - 3) + time '10:00' + make_interval(mins => (right(t.unit_id, 2)::int - 1) * 17 + (extract(epoch from t.start_time) / 1800)::int)) at time zone 'Africa/Lagos',
          (today + time '06:00' + make_interval(mins => (right(t.unit_id, 2)::int - 1) * 7)) at time zone 'Africa/Lagos'
        ),
        not t.pending_deposit, false
      );
    end loop;
  end loop;
end $$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'apex%' loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
  end loop;
end $$;
grant execute on function apex_board() to anon, authenticated;
grant execute on function apex_get_booking(text) to anon, authenticated;
grant execute on function apex_create_booking(jsonb) to anon, authenticated;
grant execute on function apex_reschedule_booking(text, timestamptz, text) to anon, authenticated;
grant execute on function apex_cancel_booking(text) to anon, authenticated;
grant execute on function apex_log_event(text, text, text, jsonb) to anon, authenticated;
grant execute on function apex_reset_demo() to anon, authenticated;

-- Realtime: /operations listens for booking_events changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'booking_events') then
    alter publication supabase_realtime add table booking_events;
  end if;
end $$;
