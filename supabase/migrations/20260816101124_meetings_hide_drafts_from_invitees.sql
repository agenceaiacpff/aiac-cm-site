create or replace function private.can_view_meeting(target_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path=''
as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.meetings m
    where m.id=target_id
      and (
        m.organizer_id=uid
        or (private.is_admin(uid) and private.has_aal2())
        or (
          m.status<>'draft'
          and (
            exists(select 1 from public.meeting_participants mp where mp.meeting_id=m.id and mp.user_id=uid)
            or m.access_level='all_members'
            or (m.access_level='body_members' and private.is_body_participant(m.body_id,uid))
            or (m.access_level='project_members' and private.is_project_member(m.project_id,uid))
          )
        )
      )
  );
$$;
revoke all on function private.can_view_meeting(uuid,uuid) from public, anon;
grant execute on function private.can_view_meeting(uuid,uuid) to authenticated;
