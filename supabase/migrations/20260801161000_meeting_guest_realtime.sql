-- Les réponses des invités externes apparaissent immédiatement chez l'organisateur.
do $$ begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='meeting_guests'
  ) then
    alter publication supabase_realtime add table public.meeting_guests;
  end if;
end $$;
