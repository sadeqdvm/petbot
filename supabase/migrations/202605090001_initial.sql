create extension if not exists "uuid-ossp";

create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  wa_id text not null unique,
  customer_name text,
  assigned_mode text default 'bot',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  meta_message_id text unique,
  wa_id text not null,
  body text,
  direction text not null,
  created_at timestamptz default now()
);

create table if not exists consultations (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id),
  doctor_id uuid,
  status text default 'open',
  notes text,
  created_at timestamptz default now()
);

alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table consultations;
