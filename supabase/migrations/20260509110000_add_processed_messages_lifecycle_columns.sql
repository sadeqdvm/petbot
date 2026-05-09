-- Forward migration for databases that already applied the initial Supabase schema
-- before processed_messages gained retry lifecycle state.

alter table public.processed_messages
  add column if not exists status text not null default 'succeeded',
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

update public.processed_messages
set status = 'succeeded'
where status is null;

update public.processed_messages
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table public.processed_messages
  alter column status set default 'succeeded',
  alter column status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.processed_messages'::regclass
      and conname = 'processed_messages_status_check'
  ) then
    alter table public.processed_messages
      add constraint processed_messages_status_check
      check (status in ('processing', 'succeeded', 'failed'));
  end if;
end $$;

create index if not exists processed_messages_status_updated_idx
on public.processed_messages(status, updated_at);

-- Keep updated_at fresh for retry staleness detection in environments upgraded
-- from the original migration.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists processed_messages_set_updated_at on public.processed_messages;
create trigger processed_messages_set_updated_at
before update on public.processed_messages
for each row execute function public.set_updated_at();
