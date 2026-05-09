-- Supabase schema for the WhatsApp pet consultation bot.
-- Run this file in the Supabase SQL editor, or with:
-- psql "$DATABASE_URL" -f supabase/schema.sql

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  user_id text primary key,
  state text not null default 'ASK_PET',
  pet_type text,
  problem text,
  duration text,
  temperature text,
  paid boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_state_check check (
    state in ('ASK_PET', 'ASK_PROBLEM', 'ASK_DURATION', 'ASK_TEMP', 'WAIT_PAYMENT', 'DOCTOR', 'END')
  )
);

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  user_id text not null,
  message_type text not null,
  message_text text,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'processing',
  attempt_count integer not null default 0,
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbound_messages_processing_status_check check (
    processing_status in ('processing', 'processed', 'failed')
  )
);

alter table public.inbound_messages
  add column if not exists processing_status text not null default 'processed',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists processed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.inbound_messages
  drop constraint if exists inbound_messages_processing_status_check,
  add constraint inbound_messages_processing_status_check check (
    processing_status in ('processing', 'processed', 'failed')
  );

create table if not exists public.vet_cases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.conversations(user_id) on delete cascade,
  pet_type text,
  problem text,
  duration text,
  temperature text,
  payment_confirmed boolean not null default false,
  status text not null default 'sent_to_vet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vet_cases_status_check check (
    status in ('sent_to_vet', 'in_review', 'replied', 'closed')
  )
);

create index if not exists inbound_messages_user_id_created_at_idx
  on public.inbound_messages (user_id, created_at desc);

create index if not exists conversations_last_message_at_idx
  on public.conversations (last_message_at desc);

create index if not exists vet_cases_user_id_created_at_idx
  on public.vet_cases (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

drop trigger if exists set_inbound_messages_updated_at on public.inbound_messages;
create trigger set_inbound_messages_updated_at
before update on public.inbound_messages
for each row
execute function public.set_updated_at();

drop trigger if exists set_vet_cases_updated_at on public.vet_cases;
create trigger set_vet_cases_updated_at
before update on public.vet_cases
for each row
execute function public.set_updated_at();

create or replace function public.claim_inbound_message(
  p_message_id text,
  p_user_id text,
  p_message_type text,
  p_message_text text,
  p_payload jsonb,
  p_stale_after_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_claim boolean;
begin
  insert into public.inbound_messages (
    message_id,
    user_id,
    message_type,
    message_text,
    payload,
    processing_status,
    attempt_count,
    processed_at,
    failed_at,
    last_error
  ) values (
    p_message_id,
    p_user_id,
    p_message_type,
    p_message_text,
    coalesce(p_payload, '{}'::jsonb),
    'processing',
    1,
    null,
    null,
    null
  )
  on conflict (message_id) do update
    set user_id = excluded.user_id,
        message_type = excluded.message_type,
        message_text = excluded.message_text,
        payload = excluded.payload,
        processing_status = 'processing',
        attempt_count = public.inbound_messages.attempt_count + 1,
        processed_at = null,
        failed_at = null,
        last_error = null,
        updated_at = now()
    where public.inbound_messages.processing_status <> 'processed'
      and (
        public.inbound_messages.processing_status <> 'processing'
        or public.inbound_messages.updated_at < now() - make_interval(secs => p_stale_after_seconds)
      )
  returning true into did_claim;

  return coalesce(did_claim, false);
end;
$$;

create or replace function public.complete_inbound_message(p_message_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inbound_messages
    set processing_status = 'processed',
        processed_at = now(),
        failed_at = null,
        last_error = null,
        updated_at = now()
    where message_id = p_message_id;
end;
$$;

create or replace function public.fail_inbound_message(
  p_message_id text,
  p_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inbound_messages
    set processing_status = 'failed',
        failed_at = now(),
        last_error = p_last_error,
        updated_at = now()
    where message_id = p_message_id
      and processing_status = 'processing';
end;
$$;

alter table public.conversations enable row level security;
alter table public.inbound_messages enable row level security;
alter table public.vet_cases enable row level security;

-- The webhook uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS on the server.
-- These policies keep browser clients read-only/locked down unless you add Supabase Auth later.
drop policy if exists "No public conversation access" on public.conversations;
create policy "No public conversation access"
on public.conversations
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No public inbound message access" on public.inbound_messages;
create policy "No public inbound message access"
on public.inbound_messages
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No public vet case access" on public.vet_cases;
create policy "No public vet case access"
on public.vet_cases
for all
to anon, authenticated
using (false)
with check (false);
