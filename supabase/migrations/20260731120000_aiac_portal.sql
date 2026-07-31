-- Portail sécurisé AIAC : identités, rôles, demandes, travail, messagerie et notifications.
create schema if not exists private;

create type public.aiac_role as enum ('member','beneficiary','volunteer','staff','manager','partner','admin','super_admin');
create type public.account_status as enum ('pending','active','suspended');
create type public.request_status as enum ('new','under_review','assigned','in_progress','waiting_user','resolved','closed','rejected');
create type public.task_status as enum ('todo','in_progress','blocked','done','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  organization text,
  avatar_url text,
  role public.aiac_role not null default 'member',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  request_type text not null check (request_type in ('support','partnership','volunteering','training','complaint','other')),
  subject text not null check (char_length(subject) between 3 and 180),
  description text not null check (char_length(description) between 5 and 10000),
  status public.request_status not null default 'new',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 180),
  created_by uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id,user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(message_id,user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  request_id uuid references public.requests(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.task_status not null default 'todo',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.requests(id) on delete cascade,
  title text not null,
  file_url text not null,
  visibility text not null default 'private' check (visibility in ('private','request','staff')),
  created_at timestamptz not null default now()
);

create index requests_created_by_idx on public.requests(created_by,created_at desc);
create index requests_assigned_to_idx on public.requests(assigned_to,status);
create index conversation_members_user_idx on public.conversation_members(user_id,conversation_id);
create index messages_conversation_idx on public.messages(conversation_id,created_at);
create index notifications_user_idx on public.notifications(user_id,read_at,created_at desc);
create index tasks_assigned_idx on public.tasks(assigned_to,status,due_at);

create or replace function private.is_staff(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=uid and p.status='active' and p.role in ('staff','manager','admin','super_admin'));
$$;
create or replace function private.is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=uid and p.status='active' and p.role in ('admin','super_admin'));
$$;
create or replace function private.is_conversation_member(cid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.conversation_members cm where cm.conversation_id=cid and cm.user_id=uid);
$$;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
revoke all on function private.is_staff(uuid),private.is_admin(uuid),private.is_conversation_member(uuid,uuid) from public,anon;
grant execute on function private.is_staff(uuid),private.is_admin(uuid),private.is_conversation_member(uuid,uuid) to authenticated;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name,phone,organization)
  values(new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'organization');
  return new;
end; $$;
revoke all on function private.handle_new_user() from public,anon,authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.protect_profile_privileges() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status) and not private.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut modifier une fonction ou un statut de compte';
  end if;
  return new;
end; $$;
revoke all on function private.protect_profile_privileges() from public,anon,authenticated;
create trigger profiles_protect_privileges before update on public.profiles for each row execute function private.protect_profile_privileges();

create or replace function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger requests_touch before update on public.requests for each row execute function private.touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function private.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function private.touch_updated_at();

create or replace function private.notify_new_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.conversations set updated_at=now() where id=new.conversation_id;
  insert into public.notifications(user_id,title,body,href)
  select cm.user_id,'Nouveau message',left(new.body,180),'/espace'
  from public.conversation_members cm where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
  return new;
end; $$;
revoke all on function private.notify_new_message() from public,anon,authenticated;
create trigger messages_notify after insert on public.messages for each row execute function private.notify_new_message();

alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.notifications enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;

create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid())=id or (select private.is_staff()));
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy profiles_update_admin on public.profiles for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy requests_select on public.requests for select to authenticated using (created_by=(select auth.uid()) or assigned_to=(select auth.uid()) or (select private.is_staff()));
create policy requests_insert on public.requests for insert to authenticated with check (created_by=(select auth.uid()));
create policy requests_staff_update on public.requests for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy conversations_select on public.conversations for select to authenticated using (created_by=(select auth.uid()) or (select private.is_conversation_member(id)) or (select private.is_staff()));
create policy conversations_insert on public.conversations for insert to authenticated with check (created_by=(select auth.uid()));
create policy conversations_update on public.conversations for update to authenticated using (created_by=(select auth.uid()) or (select private.is_staff())) with check (created_by=(select auth.uid()) or (select private.is_staff()));
create policy members_select on public.conversation_members for select to authenticated using (user_id=(select auth.uid()) or (select private.is_conversation_member(conversation_id)) or (select private.is_staff()));
create policy members_insert on public.conversation_members for insert to authenticated with check ((user_id=(select auth.uid()) and exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=(select auth.uid()))) or (select private.is_staff()));
create policy messages_select on public.messages for select to authenticated using ((select private.is_conversation_member(conversation_id)) or (select private.is_staff()));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id=(select auth.uid()) and ((select private.is_conversation_member(conversation_id)) or (select private.is_staff())));
create policy reads_select on public.message_reads for select to authenticated using (user_id=(select auth.uid()) or (select private.is_conversation_member((select m.conversation_id from public.messages m where m.id=message_id))));
create policy reads_insert on public.message_reads for insert to authenticated with check (user_id=(select auth.uid()));
create policy notifications_select on public.notifications for select to authenticated using (user_id=(select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy tasks_select on public.tasks for select to authenticated using (created_by=(select auth.uid()) or assigned_to=(select auth.uid()) or (select private.is_staff()));
create policy tasks_insert on public.tasks for insert to authenticated with check ((select private.is_staff()) and created_by=(select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated using (assigned_to=(select auth.uid()) or (select private.is_staff())) with check (assigned_to=(select auth.uid()) or (select private.is_staff()));
create policy documents_select on public.documents for select to authenticated using (owner_id=(select auth.uid()) or (select private.is_staff()) or (visibility='request' and exists(select 1 from public.requests r where r.id=request_id and r.created_by=(select auth.uid()))));
create policy documents_insert on public.documents for insert to authenticated with check (owner_id=(select auth.uid()));

grant usage on schema public to anon,authenticated;
grant select,insert,update,delete on public.profiles,public.requests,public.conversations,public.conversation_members,public.messages,public.message_reads,public.notifications,public.tasks,public.documents to authenticated;
revoke update on public.profiles from authenticated;
grant update(full_name,phone,organization,avatar_url) on public.profiles to authenticated;
grant update(role,status,full_name,phone,organization,avatar_url) on public.profiles to authenticated;

alter publication supabase_realtime add table public.messages,public.notifications;
