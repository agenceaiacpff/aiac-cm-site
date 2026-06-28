-- Schema de depart pour AIAC.
-- A executer plus tard dans Supabase SQL Editor.

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  summary text,
  content text,
  category text not null default 'actualite',
  status text not null default 'draft',
  cover_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  project_name text,
  domain text,
  report_date date,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_link text,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type text not null,
  full_name text,
  email text,
  phone text,
  subject text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  title text,
  asset_type text not null default 'image',
  url text not null,
  cloudinary_public_id text,
  folder text,
  created_at timestamptz not null default now()
);

alter table public.publications enable row level security;
alter table public.reports enable row level security;
alter table public.events enable row level security;
alter table public.form_submissions enable row level security;
alter table public.media_assets enable row level security;

create policy "Public can read published publications"
on public.publications for select
using (status = 'published');

create policy "Public can read public reports"
on public.reports for select
using (is_public = true);

create policy "Public can read planned events"
on public.events for select
using (status in ('planned', 'completed'));

create policy "Public can submit forms"
on public.form_submissions for insert
with check (true);

create policy "Public can read media"
on public.media_assets for select
using (true);
