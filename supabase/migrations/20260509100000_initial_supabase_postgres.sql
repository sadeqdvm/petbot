-- Supabase PostgreSQL schema for the WhatsApp pet consultation bot.
-- This migration replaces in-memory/Mongoose-style persistence with relational tables,
-- Supabase Auth identities, Supabase Realtime-enabled tables, and Storage policies.

create extension if not exists pgcrypto;

-- Dashboard users are Supabase Auth users. A profile links a dashboard user to a
-- WhatsApp number and/or elevated dashboard role.
create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  phone_number text unique,
  role text not null default 'customer' check (role in ('customer', 'vet', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  whatsapp_user_id text not null unique,
  state text not null default 'ASK_PET',
  pet_type text not null default '',
  problem text not null default '',
  duration text not null default '',
  temperature text not null default '',
  paid boolean not null default false,
  payment_screenshot_url text,
  assigned_vet_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  whatsapp_message_id text unique,
  conversation_id uuid references public.bot_conversations(id) on delete set null,
  whatsapp_user_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text not null default '',
  media_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.processed_messages (
  whatsapp_message_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.uploaded_images (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.bot_conversations(id) on delete cascade,
  whatsapp_user_id text not null,
  whatsapp_message_id text references public.processed_messages(whatsapp_message_id) on delete set null,
  storage_bucket text not null default 'payment-screenshots',
  storage_url text not null,
  image_type text not null default 'payment_screenshot',
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_conversations_state_idx on public.bot_conversations(state);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists messages_whatsapp_user_created_idx on public.messages(whatsapp_user_id, created_at desc);
create index if not exists uploaded_images_conversation_idx on public.uploaded_images(conversation_id);
create index if not exists processed_messages_created_idx on public.processed_messages(created_at);

-- Keep updated_at fresh without application-specific triggers.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_profiles_set_updated_at on public.app_profiles;
create trigger app_profiles_set_updated_at
before update on public.app_profiles
for each row execute function public.set_updated_at();

drop trigger if exists bot_conversations_set_updated_at on public.bot_conversations;
create trigger bot_conversations_set_updated_at
before update on public.bot_conversations
for each row execute function public.set_updated_at();

-- Helper predicates for RLS policies.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_profiles where id = auth.uid()
$$;

create or replace function public.current_user_phone_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select phone_number from public.app_profiles where id = auth.uid()
$$;

create or replace function public.is_dashboard_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('vet', 'admin'), false)
$$;

alter table public.app_profiles enable row level security;
alter table public.bot_conversations enable row level security;
alter table public.messages enable row level security;
alter table public.processed_messages enable row level security;
alter table public.uploaded_images enable row level security;

-- Profiles: users can read/update themselves; admins can manage all dashboard profiles.
drop policy if exists "profiles_select_own_or_admin" on public.app_profiles;
create policy "profiles_select_own_or_admin"
on public.app_profiles for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "profiles_insert_own_customer" on public.app_profiles;
create policy "profiles_insert_own_customer"
on public.app_profiles for insert
to authenticated
with check (id = auth.uid() and role = 'customer');

drop policy if exists "profiles_update_own_without_role_escalation" on public.app_profiles;
create policy "profiles_update_own_without_role_escalation"
on public.app_profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());

drop policy if exists "profiles_update_admin" on public.app_profiles;
create policy "profiles_update_admin"
on public.app_profiles for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Conversations/messages/images: customers see their linked WhatsApp number; vets/admins see all.
drop policy if exists "conversations_select_customer_or_staff" on public.bot_conversations;
create policy "conversations_select_customer_or_staff"
on public.bot_conversations for select
to authenticated
using (whatsapp_user_id = public.current_user_phone_number() or public.is_dashboard_staff());

drop policy if exists "conversations_update_staff" on public.bot_conversations;
create policy "conversations_update_staff"
on public.bot_conversations for update
to authenticated
using (public.is_dashboard_staff())
with check (public.is_dashboard_staff());

drop policy if exists "messages_select_customer_or_staff" on public.messages;
create policy "messages_select_customer_or_staff"
on public.messages for select
to authenticated
using (whatsapp_user_id = public.current_user_phone_number() or public.is_dashboard_staff());

drop policy if exists "messages_insert_staff" on public.messages;
create policy "messages_insert_staff"
on public.messages for insert
to authenticated
with check (public.is_dashboard_staff());

drop policy if exists "uploaded_images_select_customer_or_staff" on public.uploaded_images;
create policy "uploaded_images_select_customer_or_staff"
on public.uploaded_images for select
to authenticated
using (whatsapp_user_id = public.current_user_phone_number() or public.is_dashboard_staff());

-- Webhook dedupe state is server-only. The service role bypasses RLS for inserts/selects.
drop policy if exists "processed_messages_no_client_access" on public.processed_messages;
create policy "processed_messages_no_client_access"
on public.processed_messages for all
to authenticated
using (false)
with check (false);

-- Storage bucket for payment screenshots. The webhook writes with service role; dashboard users
-- can read screenshots for their conversations through Storage policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-screenshots',
  'payment-screenshots',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "payment_screenshots_read_customer_or_staff" on storage.objects;
create policy "payment_screenshots_read_customer_or_staff"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-screenshots'
  and (
    public.is_dashboard_staff()
    or split_part(name, '/', 1) = public.current_user_phone_number()
  )
);

drop policy if exists "payment_screenshots_staff_upload" on storage.objects;
create policy "payment_screenshots_staff_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'payment-screenshots' and public.is_dashboard_staff());

-- Supabase Realtime publication for dashboard subscriptions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bot_conversations'
  ) then
    alter publication supabase_realtime add table public.bot_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'uploaded_images'
  ) then
    alter publication supabase_realtime add table public.uploaded_images;
  end if;
end $$;
