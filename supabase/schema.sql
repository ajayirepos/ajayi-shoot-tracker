-- Run this once in your Supabase project's SQL editor (Project > SQL Editor > New query).
-- Stores one row per signed-in user holding their shoot tracker data.

create table if not exists public.user_data (
  id uuid primary key references auth.users(id) on delete cascade,
  shoots jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "select own row" on public.user_data
  for select using (auth.uid() = id);

create policy "insert own row" on public.user_data
  for insert with check (auth.uid() = id);

create policy "update own row" on public.user_data
  for update using (auth.uid() = id);

-- Keep updated_at current on every write
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();

-- Enable realtime so other signed-in devices pick up changes live
alter publication supabase_realtime add table public.user_data;
